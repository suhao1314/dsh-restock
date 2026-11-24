#!/usr/bin/env node
// DSH Restock - catalogue + one-shot installer for DeepSeek Harness plugins.
// Zero dependencies. Talks to the running DSH desktop host over its local web RPC.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  fetchCatalog,
  readCache,
  indexByName,
  versionFromRange,
  compareVersions,
  engineAllows,
} from "../lib/catalog.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOME = process.env.DSH_HOME || join(homedir(), ".dsh");
const PROFILE = process.env.DSH_PROFILE_DIR || join(HOME, "profiles", "desktop");

// ---------- catalog ----------

function loadCatalog() {
  return JSON.parse(readFileSync(join(ROOT, "catalog", "plugins.json"), "utf8"));
}

function byId(catalog) {
  const map = new Map();
  for (const p of catalog.plugins) map.set(p.id, p);
  return map;
}

// ---------- local profile ----------

function readProfile() {
  const file = join(PROFILE, "package.json");
  if (!existsSync(file)) return { bundles: [], dependencies: {}, file, found: false };
  const pkg = JSON.parse(readFileSync(file, "utf8"));
  const bundles = pkg?.dsh?.profile?.bundles ?? [];
  const dependencies = pkg?.dependencies ?? {};
  return { bundles, dependencies, file, found: true };
}

// ---------- DSH local RPC ----------

function browserSecret() {
  const file = join(HOME, ".credentials.yaml");
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8");
  const m = /client-connection\/browser-session[\s\S]*?secret:\s*(\S+)/u.exec(text);
  return m ? Buffer.from(m[1], "base64url") : null;
}

function authCookie(port, secret) {
  const b64url = (b) => Buffer.from(b).toString("base64url");
  const authority = `127.0.0.1:${port}`;
  const name = `dsh-auth-${b64url(createHash("sha256").update(authority).digest())}`;
  const now = Date.now();
  const payload = JSON.stringify({ version: 1, authority, issuedAt: now, expiresAt: now + 29 * 24 * 3600 * 1000 });
  const body = b64url(Buffer.from(payload, "utf8"));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${name}=v1.${body}.${sig}`;
}

async function rpc(port, method, args, timeoutMs = 120000) {
  const secret = browserSecret();
  if (!secret) throw new Error(`找不到 DSH 凭据：${join(HOME, ".credentials.yaml")} 里没有 browser-session secret`);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: authCookie(port, secret) },
      body: JSON.stringify({ type: "client-request", rpcId: randomUUID(), method, payload: { args } }),
      signal: ctl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* keep raw */ }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

function hostPids() {
  try {
    const out = execFileSync("tasklist", ["/FI", "IMAGENAME eq DeepSeek Harness.exe", "/FO", "CSV", "/NH"], {
      encoding: "utf8",
      windowsHide: true,
    });
    const pids = new Set();
    for (const m of out.matchAll(/"DeepSeek Harness\.exe","(\d+)"/g)) pids.add(Number(m[1]));
    return pids;
  } catch {
    return new Set();
  }
}

function candidatePorts() {
  const pids = hostPids();
  if (!pids.size) return [];
  let out = "";
  try {
    out = execFileSync("netstat", ["-ano"], { encoding: "utf8", windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  } catch {
    return [];
  }
  const ports = new Set();
  for (const line of out.split(/\r?\n/)) {
    const m = /^\s*TCP\s+127\.0\.0\.1:(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/.exec(line);
    if (m && pids.has(Number(m[2]))) ports.add(Number(m[1]));
  }
  return [...ports];
}

async function findPort(explicit) {
  if (explicit) return Number(explicit);
  const ports = candidatePorts();
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const port of ports) {
      try {
        const r = await rpc(port, "pluginManager/listBundles", {}, 12000);
        if (process.env.DSH_RESTOCK_DEBUG) console.error(`[debug] port ${port} -> HTTP ${r.status}`);
        if (r.status === 200) return port;
      } catch (err) {
        if (process.env.DSH_RESTOCK_DEBUG) console.error(`[debug] port ${port} -> ${err.message}`);
      }
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

async function listBundles(port) {
  const r = await rpc(port, "pluginManager/listBundles", {}, 60000);
  if (r.status !== 200) throw new Error(`listBundles 失败：HTTP ${r.status} ${(r.text || "").slice(0, 200)}`);
  return r.json?.result?.value ?? [];
}

// ---------- helpers ----------

function installedSet(profile) {
  return new Set(profile.bundles || []);
}

/** Installed versions come from the profile's dependency ranges — that's all a profile records. */
function installedVersions(profile) {
  const map = new Map();
  for (const [name, range] of Object.entries(profile.dependencies ?? {})) {
    const v = versionFromRange(range);
    if (v) map.set(name, v);
  }
  return map;
}

function isBuiltin(id) {
  return /^@deepseek-ai\/dsh(-experimental)?-/.test(id) || id === "@deepseek-ai/dsh-base" || id === "@deepseek-ai/dsh-web-app";
}

/** Package-name fingerprint used to spot the same plugin published under a couple of names. */
function normName(name) {
  return String(name)
    .replace(/^@[^/]+\//, "")
    .replace(/^dsh[-_]/, "")
    .replace(/[-_]plugin$/, "")
    .replace(/[-_]/g, "")
    .toLowerCase();
}

/** Installed desktop version, used to drop catalogue entries that cannot run here. */
function hostDshVersion() {
  if (process.env.DSH_VERSION) return process.env.DSH_VERSION.trim();
  if (process.platform !== "win32") return null;
  try {
    const out = execFileSync(
      "reg",
      ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\1bf39983-50d0-5fe0-9ef4-cece76f67c5e", "/v", "DisplayVersion"],
      { encoding: "utf8", windowsHide: true, timeout: 8000 },
    );
    const m = out.match(/DisplayVersion\s+REG_SZ\s+(\S+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function specFor(entry) {
  return entry.npm || entry.id;
}

function printPlugin(entry, installed) {
  const mark = installed.has(entry.id) || installed.has(entry.npm) ? "已装" : "    ";
  const star = entry.hot ? "*" : " ";
  console.log(`${star} ${mark} ${entry.id}`);
  console.log(`     ${entry.title} — ${entry.what}`);
  console.log(`     适合：${entry.goodFor}`);
  console.log(`     成本：${entry.cost}${entry.requires?.length ? `　需要：${entry.requires.join("、")}` : ""}`);
  if (entry.conflicts?.length) console.log(`     ⚠️ 冲突：${entry.conflicts.join("、")}`);
  if (entry.notes) console.log(`     注：${entry.notes}`);
  console.log("");
}

function parseFlags(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=");
      if (v !== undefined && v !== "") flags[k] = v;
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) flags[k] = argv[++i];
      else flags[k] = true;
    } else {
      flags._.push(a);
    }
  }
  return flags;
}

// ---------- commands ----------

function cmdList(flags) {
  const catalog = loadCatalog();
  const installed = installedSet(readProfile());
  const packId = flags.pack;
  if (packId) {
    const pack = catalog.packs.find((p) => p.id === packId);
    if (!pack) throw new Error(`没有这个套餐：${packId}（可选：${catalog.packs.map((p) => p.id).join(", ")}）`);
    console.log(`\n【${pack.name}】${pack.desc}\n`);
    const map = byId(catalog);
    for (const id of pack.plugins) {
      const entry = map.get(id);
      if (!entry) console.log(`  ? 目录里没有 ${id}`);
      else printPlugin(entry, installed);
    }
    return;
  }
  console.log(`\nDSH Restock · 目录 ${catalog.updated}（* = 新人优先，已装 = 当前 profile 里有）\n`);
  console.log("套餐：");
  for (const p of catalog.packs) console.log(`  ${p.id.padEnd(10)} ${p.name} — ${p.desc}`);
  console.log("\n插件：\n");
  for (const entry of catalog.plugins) printPlugin(entry, installed);
}

async function cmdInstall(flags) {
  const catalog = loadCatalog();
  const map = byId(catalog);
  let ids = [...flags._];
  if (flags.pack) {
    const pack = catalog.packs.find((p) => p.id === flags.pack);
    if (!pack) throw new Error(`没有这个套餐：${flags.pack}`);
    ids = ids.concat(pack.plugins);
  }
  ids = [...new Set(ids)];
  if (!ids.length) throw new Error("要装什么？例如：dsh-restock install dsh-image-gen dsh-pet  或  install --pack newbie");

  const profile = readProfile();
  const installed = installedSet(profile);
  const targets = [];
  for (const id of ids) {
    const entry = map.get(id) || { id, npm: id, title: "（目录里没有，按原包名装）" };
    if (installed.has(entry.id) || installed.has(entry.npm)) {
      console.log(`跳过（已装）：${entry.id}`);
      continue;
    }
    targets.push(entry);
  }
  if (!targets.length) return console.log("\n没有需要新装的插件。");

  // conflict check against currently installed bundles
  const problems = [];
  for (const t of targets) {
    for (const c of t.conflicts || []) {
      if (installed.has(c)) problems.push(`${t.id} 与已装的 ${c} 冲突`);
    }
  }
  console.log(`\n将要安装 ${targets.length} 个：`);
  for (const t of targets) console.log(`  + ${t.id}  (${specFor(t)})  ${t.title ?? ""}`);
  if (problems.length) {
    console.log("\n⚠️ 检测到冲突：");
    for (const p of problems) console.log(`  - ${p}`);
  }
  if (flags["dry-run"]) {
    console.log("\n（--dry-run，什么都没装）");
    return;
  }

  const port = await findPort(flags.port);
  if (!port) throw new Error("找不到正在运行的 DSH（也可以 --port 指定 Web GUI 端口）");
  console.log(`\n连接 DSH：127.0.0.1:${port}\n`);

  let ok = 0;
  const failed = [];
  const notes = [];
  let states = new Map();
  try {
    states = new Map((await listBundles(port)).map((b) => [b.name, b]));
  } catch (err) {
    notes.push(`读不到插件清单，装完没法核对状态：${err.message}`);
  }

  for (const t of targets) {
    const spec = specFor(t);
    const known = states.get(spec) || states.get(t.id);

    // Already installed but disabled: this is exactly the "restock" case - just switch it back on.
    if (known && known.installed && known.enabled === false) {
      process.stdout.write(`启用 ${spec}（已安装但被关掉）... `);
      const er = await rpc(port, "pluginManager/setBundleEnabled", { name: spec, enabled: true });
      if (er.status === 200) { ok++; console.log("ok"); } else { failed.push({ spec, why: `启用失败 HTTP ${er.status}` }); console.log("失败"); }
      continue;
    }
    if (known && known.installed && known.enabled !== false) {
      console.log(`跳过（已装并启用）：${spec}`);
      continue;
    }

    process.stdout.write(`安装 ${spec} ... `);
    try {
      const r = await rpc(port, "pluginManager/installBundle", {
        spec,
        options: { enabled: true, requestId: randomUUID() },
      });
      if (r.status !== 200) {
        failed.push({ spec, why: `HTTP ${r.status}: ${(r.text || "").slice(0, 300)}` });
        console.log("失败");
        continue;
      }
      const change = r.json?.result?.value;
      ok++;
      console.log("ok");

      // pnpm wrote the package; check the bundle actually became a live layer.
      let after = null;
      try {
        after = (await listBundles(port)).find((b) => b.name === spec) ?? null;
      } catch {
        /* ignore */
      }
      if (after && after.installed && after.enabled === false) {
        const er = await rpc(port, "pluginManager/setBundleEnabled", { name: spec, enabled: true });
        notes.push(er.status === 200 ? `${spec}：装好后自动启用` : `${spec}：装好了但启用失败（HTTP ${er.status}）`);
      }
      if (change?.application === "restart-required") {
        notes.push(`${spec}：需要重启 DSH 才生效（${change.restartReason ?? "restart-required"}）`);
      }
    } catch (err) {
      failed.push({ spec, why: err.message });
      console.log("失败");
    }
  }
  console.log(`\n完成：成功 ${ok}，失败 ${failed.length}`);
  for (const f of failed) console.log(`  ✗ ${f.spec}\n    ${f.why}`);
  for (const n of notes) console.log(`  · ${n}`);
  if (ok > 0) console.log("\n提示：新装的插件要重启 DSH 才会全部生效。");
}

function cmdExport(flags) {
  const catalog = loadCatalog();
  const map = byId(catalog);
  const profile = readProfile();
  if (!profile.found) throw new Error(`找不到 profile：${profile.file}`);
  const out = {
    schema: 1,
    exportedAt: new Date().toISOString(),
    note: "DSH Restock export file - pass to `dsh-restock sync` on another machine",
    bundles: profile.bundles.map((id) => {
      const entry = map.get(id);
      return {
        id,
        npm: entry?.npm ?? id,
        title: entry?.title ?? null,
        category: entry?.category ?? null,
      };
    }),
    notInCatalog: profile.bundles.filter((id) => !map.has(id)),
  };
  const text = JSON.stringify(out, null, 2);
  if (flags.out) {
    writeFileSync(flags.out, text + "\n", "utf8");
    console.log(`已导出 ${out.bundles.length} 个插件到 ${flags.out}`);
  } else {
    console.log(text);
  }
}

async function cmdSync(flags) {
  const file = flags._[0];
  if (!file) throw new Error("用法：dsh-restock sync <你导出的 json>  [--dry-run]");
  const data = JSON.parse(readFileSync(file, "utf8"));
  const wanted = (data.bundles || []).map((b) => b.npm || b.id);
  const installed = installedSet(readProfile());
  const missing = wanted.filter((id) => !installed.has(id));
  console.log(`清单里 ${wanted.length} 个，已装 ${wanted.length - missing.length} 个，缺 ${missing.length} 个。`);
  if (!missing.length) return console.log("什么都不用补。");
  console.log(missing.map((m) => `  + ${m}`).join("\n"));
  if (flags["dry-run"]) return console.log("（--dry-run，什么都没装）");
  await cmdInstall({ _: missing, port: flags.port });
}

function cmdDoctor(flags) {
  const catalog = loadCatalog();
  const map = byId(catalog);
  const profile = readProfile();
  const installed = installedSet(profile);
  console.log(`\nprofile：${profile.file}`);
  console.log(`插件数：${profile.bundles.length}\n`);
  let issues = 0;
  for (const id of profile.bundles) {
    const entry = map.get(id);
    if (!entry) continue;
    for (const c of entry.conflicts || []) {
      if (installed.has(c) && String(id) < String(c)) {
        issues++;
        console.log(`⚠️ 冲突：${id} ↔ ${c}`);
        if (entry.notes) console.log(`   ${entry.notes}`);
      }
    }
    if (entry.id === "@txc2768651338/dsh-plugin-manager") {
      issues++;
      console.log(`⚠️ 服务名抢占：${id}（会让内置 plugin_manager 工具失效）`);
    }
  }
  const unknown = profile.bundles.filter((id) => !map.has(id));
  const builtin = unknown.filter((id) => isBuiltin(id));
  const external = unknown.filter((id) => !builtin.includes(id));
  if (builtin.length) console.log(`\n官方内置 bundle（随 DSH 一起发，不收录进目录）：\n${builtin.map((u) => `  · ${u}`).join("\n")}`);
  if (external.length) {
    issues += external.length;
    console.log(`\n目录里没有记录的第三方插件（没法判断冲突）：\n${external.map((u) => `  ? ${u}`).join("\n")}`);
  }
  const cached = readCache(ROOT);
  if (cached) {
    const idx = indexByName(cached);
    const have = installedVersions(profile);
    const behind = [];
    for (const id of profile.bundles) {
      if (isBuiltin(id)) continue;
      const hit = idx.get(id);
      const mine = have.get(id);
      if (hit?.latest?.version && mine && compareVersions(mine, hit.latest.version) < 0) behind.push(`${id}  ${mine} → ${hit.latest.version}`);
    }
    if (behind.length) {
      issues += behind.length;
      console.log(`\n有新版本（目录缓存于 ${new Date(cached.fetchedAt).toLocaleDateString("zh-CN")}）：\n${behind.map((b) => `  ↑ ${b}`).join("\n")}`);
    }
  } else {
    console.log("\n（还没有目录缓存：跑一次 dsh-restock catalog 之后，这里会报哪些插件有新版本）");
  }
  console.log(issues ? `\n发现 ${issues} 个问题。` : "\n没发现已知冲突。");
}

async function cmdCatalog(flags) {
  const { catalog, fromCache, stale, error } = await fetchCatalog({ root: ROOT, force: Boolean(flags.refresh) });
  const idx = indexByName(catalog);
  const when = catalog.fetchedAt ? new Date(catalog.fetchedAt).toLocaleString("zh-CN", { hour12: false }) : "未知";
  const title = typeof catalog.title === "object" ? (catalog.title?.zh ?? catalog.title?.en ?? "DSH 插件目录") : (catalog.title ?? "DSH 插件目录");
  console.log(`\n${title}`);
  console.log(`条目：${idx.size}　来源：${stale ? `本地缓存（本次拉取失败：${error ?? "未知"}）` : fromCache ? "本地缓存" : "刚拉取"}`);
  console.log(`缓存时间：${when}\n`);

  const cats = new Map();
  for (const p of idx.values()) cats.set(p.metadata?.category ?? "other", (cats.get(p.metadata?.category ?? "other") ?? 0) + 1);
  const top = [...cats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`分类：${top.map(([c, n]) => `${c} ${n}`).join(" · ")}\n`);

  const q = flags.search ?? flags.q;
  if (q) {
    const needle = String(q).toLowerCase();
    const hits = [...idx.values()]
      .filter((p) => p.name.toLowerCase().includes(needle) || (p.description?.zh ?? "").includes(q) || (p.description?.en ?? "").toLowerCase().includes(needle))
      .slice(0, 20);
    console.log(`搜索「${q}」命中 ${hits.length} 条：`);
    for (const h of hits) console.log(`  ${h.name.padEnd(40)} ${(h.latest?.version ?? "?").padEnd(12)} [${h.metadata?.category ?? "-"}] ${(h.description?.zh ?? h.description?.en ?? "").slice(0, 60)}`);
    return;
  }

  const profile = readProfile();
  const have = installedVersions(profile);
  const rows = [];
  for (const id of profile.bundles) {
    if (isBuiltin(id)) continue;
    const raw = profile.dependencies?.[id] ?? "";
    const local = /^(file:|link:|workspace:|\.{0,2}[\\/])/.test(String(raw));
    const hit = idx.get(id);
    const mine = have.get(id) ?? null;
    const latest = hit?.latest?.version ?? null;
    const state = local ? "本地路径包" : !hit ? "目录未收录" : !mine ? "版本未知" : compareVersions(mine, latest) < 0 ? `可更新 →${latest}` : "已最新";
    rows.push({ id, mine, latest, state });
  }
  const behind = rows.filter((r) => r.state.startsWith("可更新"));
  const unknownCnt = rows.filter((r) => r.state === "目录未收录").length;
  const localCnt = rows.filter((r) => r.state === "本地路径包").length;
  console.log(`你的 ${rows.length} 个第三方插件：已最新 ${rows.filter((r) => r.state === "已最新").length}　可更新 ${behind.length}　目录未收录 ${unknownCnt}　本地包 ${localCnt}\n`);
  for (const r of rows) {
    const mark = r.state.startsWith("可更新") ? "↑" : r.state === "目录未收录" ? "?" : r.state === "本地路径包" ? "⌂" : " ";
    console.log(`  ${mark} ${r.id.padEnd(40)} ${(r.mine ?? "-").padEnd(14)} ${r.state}`);
  }
  if (behind.length) console.log("\n（restock 只负责报告差距；升级走 DSH 插件页或 dsh-restock install <插件名>，装完重启 DSH 生效。）");
}

const CATEGORY_ZH = {
  ui: "界面增强",
  power: "能力增强",
  media: "生图 / 媒体",
  fun: "趣味 / 桌面挂件",
  agent: "Agent / 自动化",
  qq: "QQ 机器人",
  dev: "开发调试",
  tools: "工具",
  skill: "技能包",
  market: "插件市场",
  vision: "视觉识别",
  model: "模型通道",
  memory: "记忆",
  session: "会话管理",
  workflow: "工作流",
  usage: "用量统计",
  theme: "主题外观",
  notify: "消息通知",
  remote: "远程访问",
  context: "上下文",
};

async function cmdRecommend(flags) {
  const curated = loadCatalog();
  const profile = readProfile();
  if (!profile.found) console.log(`⚠️ 没找到 DSH profile：${PROFILE}\n   （这台机器还没装 DSH，或 profile 在别处 —— 用 DSH_PROFILE_DIR=... 指定；下面只看目录，不看你已装什么）`);
  const installed = installedSet(profile);
  const isInstalled = (e) => installed.has(e.id) || installed.has(e.npm);
  const zh = (c) => CATEGORY_ZH[c] || c;

  const covered = new Map();
  for (const e of curated.plugins) if (isInstalled(e)) covered.set(e.category, (covered.get(e.category) || 0) + 1);
  const allCats = [...new Set(curated.plugins.map((e) => e.category))];
  const missingCats = allCats.filter((c) => !covered.has(c));

  const conflictWith = (e) => {
    const hits = new Set((e.conflicts || []).filter((c) => installed.has(c)));
    for (const o of curated.plugins) if (isInstalled(o) && (o.conflicts || []).includes(e.id)) hits.add(o.id);
    return [...hits];
  };

  const thirdParty = [...installed].filter((x) => !isBuiltin(x)).length;
  console.log(`\n体检对象：${PROFILE}`);
  console.log(`已装 ${installed.size} 个 bundle，其中第三方 ${thirdParty} 个、官方内置 ${installed.size - thirdParty} 个\n`);

  console.log("你现在覆盖的能力：");
  for (const [c, n] of [...covered].sort((a, b) => b[1] - a[1])) console.log(`  · ${zh(c)}（${c}）×${n}`);
  console.log(missingCats.length ? `\n完全没覆盖：${missingCats.map(zh).join("、")}` : "\n精选目录里的每类能力你都有覆盖。");

  const cands = curated.plugins
    .filter((e) => !isInstalled(e))
    .map((e) => ({ e, cf: conflictWith(e) }))
    .filter((x) => x.cf.length === 0 && !x.e.avoid);
  const blocked = curated.plugins
    .filter((e) => !isInstalled(e))
    .map((e) => ({ e, cf: conflictWith(e) }))
    .filter((x) => x.cf.length > 0 && !x.e.avoid);
  const avoided = curated.plugins.filter((e) => e.avoid && !isInstalled(e));

  const rank = (e) => (missingCats.includes(e.category) ? 100 : 0) + (e.hot ? 10 : 0);
  cands.sort((a, b) => rank(b.e) - rank(a.e) || String(a.e.id).localeCompare(String(b.e.id)));

  const limit = Number(flags.limit || 8);
  console.log(`\n建议补的（从精选目录按「能力缺口 + 热门」排序，取前 ${Math.min(limit, cands.length)} 条）：`);
  for (const { e } of cands.slice(0, limit)) {
    const why = missingCats.includes(e.category)
      ? `补上「${zh(e.category)}」这块空白`
      : `${zh(e.category)}里更常用的一件，你已经装了同类`;
    console.log(`\n  + ${e.id}　${e.title}`);
    console.log(`     ${e.what}`);
    console.log(`     为什么推荐：${why}`);
    console.log(`     适合：${e.goodFor}`);
    console.log(`     成本：${e.cost}${e.requires?.length ? `　需要：${e.requires.join("、")}` : ""}`);
  }

  if (blocked.length) {
    console.log(`\n被冲突拦下的 ${blocked.length} 个（装了会跟现有插件抢工具名或服务名）：`);
    for (const { e, cf } of blocked) console.log(`  × ${e.id}　← 冲突：${cf.join("、")}`);
  }

  if (avoided.length) {
    console.log(`\n踩过坑、默认不推荐的 ${avoided.length} 个：`);
    for (const e of avoided) console.log(`  ✗ ${e.id}　${e.title}　原因：${e.notes || "已知会破坏内置能力"}`);
  }

  // 精选目录不够用时，从上游全量目录自动筛：说明写得清、仓库不重复、版本能跑。
  if (cands.length < limit) {
    let cache = readCache(ROOT);
    if (!cache && !flags.offline) {
      console.log("\n（本地没有生态目录缓存，联网拉一次……）");
      try {
        const got = await fetchCatalog({ root: ROOT });
        cache = got.catalog;
        if (got.stale) console.log("（拉取失败，用了旧缓存）");
      } catch (err) {
        console.log(`（拉取失败：${err.message}；可先跑 dsh-restock catalog）`);
      }
    }
    if (!cache && flags.offline) console.log("\n（--offline：跳过上游目录，只给精选层建议）");
    const upstream = cache?.plugins;
    if (Array.isArray(upstream)) {
      const ver = hostDshVersion();
      const normInstalled = new Set([...installed].map(normName));
      const seenRepos = new Set();
      const skip = { installed: 0, vague: 0, dupRepo: 0, engine: 0 };
      const picks = [];
      for (const p of upstream) {
        const name = String(p.name ?? "");
        if (!name) continue;
        if (installed.has(name) || normInstalled.has(normName(name))) { skip.installed++; continue; }
        const desc = String(p.description?.zh ?? "").trim();
        if (desc.length < 25) { skip.vague++; continue; }
        const repoRaw = p.repository;
        const repo = String(typeof repoRaw === "string" ? repoRaw : (repoRaw?.url ?? "")).toLowerCase().replace(/\/+$/, "");
        if (repo && seenRepos.has(repo)) { skip.dupRepo++; continue; }
        const versions = [...(p.versions ?? [])].sort((a, b) => (b.publishTimestamp ?? 0) - (a.publishTimestamp ?? 0));
        const latest = versions[0];
        if (!latest) continue;
        if (ver && latest.engines?.dsh && !engineAllows(latest.engines.dsh, ver)) { skip.engine++; continue; }
        if (repo) seenRepos.add(repo);
        const rawAt = latest.publishTimestamp ?? 0;
        const at = rawAt > 0 && rawAt < 1e12 ? rawAt * 1000 : rawAt;
        picks.push({ name, desc, version: latest.version, at, category: p.metadata?.category });
      }
      picks.sort((a, b) => (missingCats.includes(b.category) ? 1 : 0) - (missingCats.includes(a.category) ? 1 : 0) || (b.at ?? 0) - (a.at ?? 0));
      const extra = picks.slice(0, Math.max(0, limit - cands.length));
      if (extra.length) {
        console.log(`\n精选目录之外，从上游 ${upstream.length} 条里自动筛出来的（说明完整、同仓库只留一个、版本能跑）：`);
        console.log(`  过滤掉：已装/同名 ${skip.installed} 条　说明太短 ${skip.vague} 条　同仓库重复 ${skip.dupRepo} 条　版本不兼容 ${skip.engine} 条${ver ? "" : "（DSH 版本未读到，兼容性未校验）"}`);
        for (const x of extra) {
          const when = x.at ? new Date(x.at).toISOString().slice(0, 10) : "未知";
          const cat = CATEGORY_ZH[x.category] ?? x.category ?? "未分类";
          console.log(`\n  · ${x.name}${x.version ? ` ${x.version}` : ""}　[${cat}]　更新于 ${when}`);
          console.log(`     ${x.desc.length > 110 ? `${x.desc.slice(0, 110)}…` : x.desc}`);
        }
        console.log("\n  （这一档没有人工写「适合谁 / 成本」，装之前自己掂量；精选目录那 19 条是核过的。）");
      }
    }
  }

  console.log("\n（两层：上一层是人工核过的精选 19 条，带「适合谁 / 成本」；下一层是从上游全量目录自动筛的，只有机器判断。要装：dsh-restock install <id>）");
}

async function cmdProbe(flags) {
  const cands = candidatePorts();
  console.log(`DSH 进程端口候选：${cands.length ? cands.join(", ") : "（没找到，DSH 没在跑？）"}`);
  const port = await findPort(flags.port);
  if (!port) return console.log("没有端口响应 pluginManager/listBundles。");
  console.log(`可用端口：${port}`);
  const r = await rpc(port, "pluginManager/listBundles", {});
  console.log(`listBundles -> HTTP ${r.status}`);
  console.log(r.text.slice(0, 800));
}

function help() {
  console.log(`DSH Restock - 给 DeepSeek Harness 补插件

用法：
  dsh-restock list [--pack <id>]                 看精选目录 / 看某个套餐
  dsh-restock install <id...> [--pack <id>]      安装（--dry-run 只预览，--port 指定端口）
  dsh-restock export [--out my-dsh.json]         导出当前 profile 的插件清单
  dsh-restock sync <file.json> [--dry-run]       按清单补齐缺失插件
  dsh-restock catalog [--refresh] [--search 词]  生态目录（6k+ 条）＋ 你的版本差距
  dsh-restock recommend [--offline] [--limit N]  按你的 profile 推荐该补什么（能力缺口 + 冲突过滤）
  dsh-restock doctor                             体检：冲突、未知插件、可更新版本

示例：
  dsh-restock catalog
  dsh-restock catalog --search 生图
  dsh-restock list --pack newbie
  dsh-restock install --pack creator
  dsh-restock export --out my-dsh.json
  dsh-restock sync my-dsh.json`);
}

// ---------- main ----------

const argv = process.argv.slice(2);
const command = argv[0] || "help";
const flags = parseFlags(argv.slice(1));

try {
  switch (command) {
    case "list": cmdList(flags); break;
    case "install": await cmdInstall(flags); break;
    case "export": cmdExport(flags); break;
    case "sync": await cmdSync(flags); break;
    case "recommend": await cmdRecommend(flags); break;
    case "doctor": cmdDoctor(flags); break;
    case "catalog": await cmdCatalog(flags); break;
    case "probe": await cmdProbe(flags); break;
    case "help": case "--help": case "-h": help(); break;
    default:
      console.error(`未知命令：${command}\n`);
      help();
      process.exitCode = 1;
  }
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  process.exitCode = 1;
}
