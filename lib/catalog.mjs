// Upstream ecosystem catalog: the same index DSH's own plugin market reads.
// Package: dsh-plugin-catalog (github.com/awesome-dsh-plugin/awesome-dsh-plugin)
// Format: { format: 1, title, description, metadata, plugins: [{ name, title,
//   description: {en, zh}, homepage, repository, metadata: { category }, versions: [{ version, publishTimestamp, source, engines }] }] }

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const CDN_URLS = [
  "https://cdn.jsdelivr.net/npm/dsh-plugin-catalog@latest/index.json",
  "https://unpkg.com/dsh-plugin-catalog@latest/index.json",
];
const TTL_MS = 12 * 3600 * 1000;

export function cacheFile(root) {
  return join(root, "cache", "catalog.json");
}

export function readCache(root) {
  const file = cacheFile(root);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

export async function fetchCatalog({ root, force = false, timeoutMs = 45000 } = {}) {
  const cached = readCache(root);
  if (!force && cached && Date.now() - (cached.fetchedAt ?? 0) < TTL_MS) return { catalog: cached, fromCache: true };

  let lastError = null;
  for (const url of CDN_URLS) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "dsh-restock" } });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      const catalog = { ...raw, fetchedAt: Date.now(), source: url };
      mkdirSync(join(root, "cache"), { recursive: true });
      writeFileSync(cacheFile(root), JSON.stringify(catalog));
      return { catalog, fromCache: false };
    } catch (err) {
      lastError = err;
    }
  }

  if (cached) return { catalog: cached, fromCache: true, stale: true, error: lastError?.message };
  throw new Error(`拉取插件目录失败（${lastError?.message ?? "未知错误"}）。设置 HTTPS_PROXY 或先联网再试。`);
}

/** name -> newest version entry */
export function indexByName(catalog) {
  const map = new Map();
  for (const p of catalog?.plugins ?? []) {
    const versions = [...(p.versions ?? [])].sort((a, b) => (a.publishTimestamp ?? 0) - (b.publishTimestamp ?? 0));
    map.set(p.name, { ...p, latest: versions.at(-1) ?? null });
  }
  return map;
}

/** Does this engines.dsh range accept the running version? Only handles the common forms; unknown -> null. */
export function engineAllows(range, dshVersion) {
  if (!range || !dshVersion) return null;
  const v = dshVersion.replace(/^v/, "");
  // treat rc/alpha as the base semver for comparison purposes
  const base = v.split("-")[0];
  const [maj, min, pat] = base.split(".").map((n) => Number(n));
  const clauses = String(range)
    .split("||")
    .map((s) => s.trim())
    .filter(Boolean);
  const cmp = (a, op, b) => {
    const pa = a.split(".").map((n) => Number(n));
    const pb = b.split(".").map((n) => Number(n));
    for (let i = 0; i < 3; i++) {
      const x = pa[i] ?? 0;
      const y = pb[i] ?? 0;
      if (x !== y) return op.startsWith(">") ? x > y : op.startsWith("<") ? x < y : false;
    }
    return op === ">=" || op === "<=" || op === "=";
  };
  const okOne = (clause) => {
    const tokens = clause.split(/\s+/).filter(Boolean);
    if (tokens.length === 1) {
      const t = tokens[0];
      if (t.startsWith("^")) return cmp(base, ">=", t.slice(1)) && base.split(".")[0] === t.slice(1).split(".")[0];
      if (t.startsWith("~")) return cmp(base, ">=", t.slice(1));
      if (/^[<>]=?/.test(t)) return cmp(base, t.match(/^[<>]=?/)[0], t.replace(/^[<>]=?/, "").replace(/-.*$/, ""));
      return cmp(base, "=", t.replace(/-.*$/, ""));
    }
    return tokens.every((t) => {
      const m = /^(>=|<=|>|<|=)?(.+)$/.exec(t);
      const op = m[1] ?? "=";
      return cmp(base, op, m[2].replace(/-.*$/, ""));
    });
  };
  return clauses.some(okOne);
}

/** Extract a plain installed version out of a dependency range like "^0.11.1". */
export function versionFromRange(range) {
  if (!range) return null;
  const m = /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(String(range));
  return m ? m[1] : null;
}

export function compareVersions(a, b) {
  if (!a || !b) return 0;
  const pa = a.split("-")[0].split(".").map(Number);
  const pb = b.split("-")[0].split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}
