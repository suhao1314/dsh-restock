# DSH Restock · DSH 补货站

> 换电脑、重装、手滑清了 profile —— 一次把该装的插件和技能补回来。
> 不知道装什么？照单勾选，一键装好，每个都告诉你**有什么用、适合谁、要花多少钱、会不会打架**。

## 这个项目解决什么

玩 DeepSeek Harness（DSH）的人基本都遇到过这三件事：

1. **重装/换机之后，忘了自己装过什么。** profile 一重置，插件全没了，只能翻聊天记录、翻浏览器收藏。
2. **不知道装什么。** 抖音、B站、QQ 群里天天有人推新插件，一个个手动 `pnpm`、改 `cordis.patch.yml`，还容易装崩。
3. **装完才发现打架。** 两个插件抢同一个工具名、抢同一个服务名，DSH 直接起不来，报错还看不懂。

DSH Restock 干四件事：

- **清单化**：一个 JSON 目录，写清每个插件/技能「干什么、适合谁、免费还是烧钱、跟谁冲突」。
- **按你的情况推荐**：`dsh-restock recommend` 先看你已经有什么能力、缺哪块，再从目录里挑不冲突的；精选层带人工写的「适合谁 / 成本」，不够时从上游 6700+ 条里自动筛（去掉说明太短的、同仓库重复的、版本跑不起来的）。
- **勾选装机**：`dsh-restock install dsh-image-gen dsh-pet`，走 DSH 自己的插件管理器装，不用手改配置。
- **一键复刻**：`dsh-restock export` 导出你现在这套，`dsh-restock sync my-dsh.json` 在新机器上还原。

## 名字为什么叫 Restock

「补货」是唯一同时命中「忘记装了什么」和「想装点新的」两个场景的词：

- 老玩家视角 = 把上次那批货补回来（`export` / `sync`）
- 新玩家视角 = 先看看货架上有什么，挑几件（`list` / `install`）

同义候选（已查重，2026-11）：

| 名字 | npm | GitHub 同名 | 判断 |
| --- | --- | --- | --- |
| `dsh-restock` | 空闲 | 0 个 | ✅ 采用 |
| `dsh-suitcase` | 空闲 | 0 个 | 备选，「行李箱」偏重迁移场景 |
| `dsh-pantry` | 空闲 | 0 个 | 备选，英文社区更顺口 |
| `dsh-flightdeck` | 空闲 | **已被占用** | ❌ `Zeno2019/dsh-flightdeck` 已做「固定运行时 + 精选插件」启动器 |
| `dsh-bento` | 空闲 | 已被占用 | ❌ `uckkk/dsh-bento` |
| `dsh-loadout` / `dsh-combo` / `dsh-recipe` | 已占用 | 有同名 | ❌ |

顺带一提：DSH 内部把插件包叫 `bundle`，所以**不要**用 `bundle` 做项目名，会跟框架术语打架。

## 快速开始

还没发 npm，直接 clone 下来跑（零依赖，不需要 `npm install`）：

```bash
git clone https://github.com/suhao1314/dsh-restock.git
cd dsh-restock

# 0. 让它先给你建议（能力缺口 + 冲突过滤 + 质量筛）
node bin/cli.mjs recommend

# 0b. 最近火什么（GitHub `topic:dsh-plugin` 按 stars 排，标出能不能直接 npm 装）
node bin/cli.mjs hot --npm --limit 15

# 0c. 技能：仓库自带一个「补货助手」，另外给技能发现器的来源
node bin/cli.mjs skills
node bin/cli.mjs skill-install restock --to "~/.workbuddy/skills"

# 1. 看货架（读本地 catalog，不联网）
node bin/cli.mjs list

# 2. 看某个套餐里有什么
node bin/cli.mjs list --pack newbie

# 3. 装上，一次装多个
node bin/cli.mjs install dsh-image-gen dsh-better-sidebar

# 4. 只预览，不真装
node bin/cli.mjs install --pack creator --dry-run

# 5. 把现在这套导出，换机时 sync 回来
node bin/cli.mjs export > my-dsh.json
node bin/cli.mjs sync my-dsh.json

# 6. 体检：谁跟谁打架、有没有装到会拖垮 DSH 的插件
node bin/cli.mjs doctor
```

需要 Node 20+、DSH 正在运行（工具会自己找到它的本地 RPC 端口，也可 `--port 7551` 指定）。
装插件走的是 DSH 内置的 `pluginManager/installBundle`，和设置页里点「安装」是同一条路。

## 在另一台电脑上试（3 分钟）

1. 那台机器上先装好 DSH 并**启动一次**（哪怕什么都没配，也要有 profile 目录）。
2. `git clone https://github.com/suhao1314/dsh-restock.git && cd dsh-restock`
3. `node bin/cli.mjs recommend` —— 没缓存会自动从上游拉一次生态目录（6,700+ 条，约 5MB）。
4. 想连远程/容器里的 DSH，用环境变量指路：
   - `DSH_HOME`：DSH 家目录，默认 `~/.dsh`
   - `DSH_PROFILE_DIR`：直接指定 profile 目录（默认 `$DSH_HOME/profiles/desktop`）
   - `HTTPS_PROXY` + `NODE_USE_ENV_PROXY=1`：需要走代理才能连 GitHub/CDN 时用
5. 离线看货架：`node bin/cli.mjs catalog --search 生图`（`--refresh` 强制更新；`--offline` 只用缓存）。

**只读的**：`list`、`catalog`、`recommend`、`doctor`、`export` 都只读本地 profile 和缓存，不改任何东西；
只有 `install` / `sync` 会通过 DSH 的 RPC 真装插件（加 `--dry-run` 只看计划）。

## 目录格式（`catalog/plugins.json`）

加一个插件 = 加一个 JSON 对象，不需要写代码：

```json
{
  "id": "dsh-image-gen",
  "npm": "dsh-image-gen",
  "repo": "https://github.com/shanliuling/dsh-image-gen",
  "category": "media",
  "title": "生图 / 改图工作台",
  "what": "聊天里直接出图、改图；接 OpenAI、Gemini、即梦、ComfyUI 等通道，带无限画布。",
  "goodFor": "要配图、做封面、画头像、做表情包的人。",
  "cost": "自带 API Key 按量计费；也可用订阅账号登录（非官方通道，有封号风险）。",
  "hot": true,
  "requires": ["OpenAI / Gemini / 即梦等任一通道的 Key 或订阅"],
  "conflicts": []
}
```

字段约定：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | ✅ | 目录内唯一；默认等于 npm 包名 |
| `npm` | ✅ | 实际安装的包名 |
| `title` / `what` / `goodFor` | ✅ | 给人类看的「是什么 / 有什么好处 / 适合谁」 |
| `cost` | ✅ | 免费、一次性、还是持续烧钱；没有明确答案就写「未确认」 |
| `requires` | | 需要的 Key、账号、系统组件 |
| `conflicts` | | 已知互斥或抢资源的插件 id（`doctor` 会用它报警） |
| `hot` | | 新人优先看 |
| `notes` | | 坑、限制、已知问题 |

## 内置套餐

| 套餐 | 给谁 | 内容 |
| --- | --- | --- |
| `newbie` 新手急救包 | 刚装 DSH，先要好用 | 侧边栏增强、技能管理、生图、桌面宠物 |
| `creator` 自媒体出片 | 做号、剪片、配图 | 生图、壁纸、桌面挂件、技能管理 |
| `dev` 开发调试 | 自己写插件、跑 Agent | 子代理、远程访问、上下文压缩、终端 |
| `qqbot` QQ 机器人 | 要把 DSH 接到 QQ 群 | QQ 控制台、Agent 预设、生活插件 |

## 和另外几个项目的区别

生态里已经有一批项目覆盖了「发现 / 市场 / 体检 / 卸载」这几层，Restock 不重复造它们，而是**消费**这些数据：

| 项目 | 定位 | Restock 怎么用它 / 差异 |
| --- | --- | --- |
| [`awesome-dsh-plugin/awesome-dsh-plugin`](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)（★2.5w，`dsh-plugin-catalog`，6700+ 条，每日更新） | 生态目录（DSH 自带插件市场的索引源） | **直接读它的 `index.json`**（`dsh-restock catalog`），不自己维护几千条元数据；Restock 只额外维护「套餐 + 冲突踩坑库」 |
| [`AdamPlatin123/dsh-plugin-radar`](https://github.com/AdamPlatin123/dsh-plugin-radar)（★1.5k） | 生态雷达：持续发现新插件 | 我们管「装到你机器上之后」的事：快照、补货、冲突 |
| [`LivXue/dsh-plugin-shop`](https://github.com/LivXue/dsh-plugin-shop) / [`dshplugin/dsh-plugin-hub`](https://github.com/dshplugin/dsh-plugin-hub) | 插件市场 / 商城 | 它们是商店；我们是「你的购物记录 + 常买组合 + 到货提醒」 |
| [`lili-luo/dsh-plugin-bundle`](https://github.com/lili-luo/dsh-plugin-bundle)（★351） | 插件组合包（`path:` 子目录安装） | 它是「打包成一个仓库」；我们是「装进任意机器、可 `export`/`sync` 的个人快照 + 套餐」 |
| [`wbb316/dsh-profile-sync`](https://github.com/wbb316/dsh-profile-sync) / [`2NF/dsh-profile-bridge`](https://github.com/2NF/dsh-profile-bridge) | profile 之间的插件迁移 / 让桌面版复用已有 profile | 它们做跨 profile 搬运；我们做「当前 profile 的快照、体检、补货」，并有冲突库 |
| [`zoahdev/dsh-unplug`](https://github.com/zoahdev/dsh-unplug) / [`zoahdev/dsh-quality-score`](https://github.com/zoahdev/dsh-quality-score) / [`zuoyunlai/dsh-healthkit`](https://github.com/zuoyunlai/dsh-healthkit) | 干净卸载 / 质量评分 / 安装体检 | 互补：`doctor` 报冲突和版本差距，体检评分交给 healthkit |
| [`Zeno2019/dsh-flightdeck`](https://github.com/Zeno2019/dsh-flightdeck) | Electron 启动器：固定 DSH 运行时 + 精选插件 | 我们**不重打包 DSH**，装进你现有 profile，跟着官方版本走 |
| `dshmarket` | 应用内插件市场图形界面 | 我们是**可 commit、可 review、可 `sync` 的清单与命令** |

一句话分工：**目录数据 → awesome-dsh-plugin；商店界面 → dshmarket；卸载/评分 → unplug/quality-score；补货与快照 → Restock。**

## 这类东西该叫什么（术语）

- 数据层：**catalog / registry index**（插件目录、生态索引）
- 组合层：**pack / bundle / metapackage**（套餐、组合包、元包）
- 状态层：**manifest / lockfile / profile snapshot**（清单、锁文件、profile 快照）
- 操作层：**provisioning / bootstrap / restore**（环境重建、一键还原）

对应到别的生态：VS Code 的 **Profiles**、Homebrew 的 **Brewfile + `brew bundle`**、Windows 的 **`winget export/import`**、Nix 的 **home-manager**、dotfiles 界的 **chezmoi**。Restock 就是 DSH 版的「Brewfile + `brew bundle` + `brew doctor`」。

## 数据从哪来

- 精选/套餐/冲突：本仓库 `catalog/plugins.json`（人工维护，目前 19 条，每条都写清「有什么用、适合谁、要不要花钱、会不会打架」）
- 全量生态目录：`dsh-plugin-catalog`（6700+ 条，每日更新，走 jsDelivr/unpkg 拉取，缓存 12 小时）

```bash
npx dsh-restock catalog                 # 全量目录概览 + 你的插件版本差距
npx dsh-restock catalog --refresh       # 强制刷新缓存
npx dsh-restock catalog --search 生图    # 按名字/中英文描述搜索
```

## 最近火什么（热门榜 `hot`）

上游目录有 6,700+ 条，但「谁在用」是另一回事。`catalog/hot.json` 是 GitHub 上 `topic:dsh-plugin` 按 **真实 stars** 排出来的榜单：

```bash
node bin/cli.mjs hot                    # 默认前 20
node bin/cli.mjs hot --npm              # 只看能直接 npm 装的
node bin/cli.mjs hot --search 记忆       # 按名字/描述/标签搜
node bin/cli.mjs hot --npm --limit 50
```

每条都标了安装方式：

- **可装**（`installed_via: npm`）：生态目录里有同名包，`node bin/cli.mjs install <name>` 就行；
- **手动**（`manual`）：不是 npm 包（可能是套壳/清单仓库/工具），得去仓库按 README 装，别硬塞。

榜单不替你判断好坏：stars 高的也可能是通用工具（比如整个 harness 自己的仓库就会排在前面）。装上之前用 `doctor` 看有没有冲突，用 `recommend` 看你这台机器到底缺不缺。

## 顺手装个技能：技能发现

插件解决「工具不够」，技能解决「agent 不会干」。仓库自带一个技能：

```bash
node bin/cli.mjs skills                                   # 看清单
node bin/cli.mjs skill-install restock --to "~/.workbuddy/skills"
```

装完新开会话，agent 就会自己去跑 `recommend` / `hot` / `doctor`，而不是凭记忆编插件名。

`catalog/skills.json` 里还列了几个值得装的技能（`find-skills` 技能发现、`skill-scanner` 安装前安全扫描、`openviking-skills` 跨机器同步、`darwin-skill` 优化技能、`handoff` 交接文档）。**这些不是仓库自带的**——只给来源和装法，不复制别人的正文，授权跟各自来源走。其中 `find-skills` 是六层联合搜索（官方内置 / 本地已装 / SkillHub / 虾评 / GitHub / ClawHub）的技能发现器，在 SkillHub 里搜名字装即可。

## 数据怎么保持新鲜

| 数据 | 来源 | 更新方式 |
| --- | --- | --- |
| `catalog/plugins.json` | 人工精选（19 条，带成本/冲突/踩坑） | 改文件 + PR |
| `catalog/hot.json` | GitHub `topic:dsh-plugin` 搜索，top 300 by stars | 重新生成后提交（下面有命令） |
| 生态目录缓存 `cache/catalog.json` | `dsh-plugin-catalog`（npm/CDN，6,700+ 条） | `node bin/cli.mjs catalog --refresh`，12 小时 TTL |
| 你的 profile 状态 | `~/.dsh/profiles/desktop/package.json` | 实时读 |

重新生成热门榜（需要 `gh` 已登录）：

```bash
gh api "search/repositories?q=topic:dsh-plugin&sort=stars&order=desc&per_page=100&page=1" > /tmp/h1.json
# page=2、3 同理，然后合并去重、按 stars 排序，与目录里的 npm 包名对齐，
# 输出 catalog/hot.json（字段见该文件顶部 schema）
```

`install` 会先查状态：已经装了但被关掉的，走 `setBundleEnabled` 直接启用，不会重复拉包——这就是「补货」和「重装」的区别。

## 安全与边界

- 不代跑 npm 安装脚本以外的任何东西；不收集遥测；不往任何服务器上传你的 profile。
- 安装前会把「要装什么、从哪个包名装」打印出来，`--dry-run` 可先看。
- 目录里的 `cost` / `conflicts` 是人工维护的判断，会过时 —— 发现问题请提 PR 改 JSON。

## 路线图

- [x] 目录 + 套餐 + `list` / `install` / `export` / `sync` / `doctor`
- [x] 接入上游生态目录（`catalog`，6700+ 条、版本差距对比）
- [x] `recommend`：按 profile 的能力缺口推荐，精选层 + 上游自动筛层
- [x] 热门榜 `hot`（GitHub stars，标注可装/手动）+ 仓库自带补货技能 + `skills` / `skill-install`
- [ ] 技能（skills）与 MCP 连接的清单化安装
- [ ] `export` 生成带版本的 lockfile（现在只记包名）
- [ ] 网页版勾选界面（生成一条命令给你复制）
- [ ] 社区提交目录（一个 PR 一个插件）

## 贡献

1. Fork，改 `catalog/plugins.json`（或加套餐）。
2. `node bin/cli.mjs list` 自查格式没写错。
3. 提 PR，说明你**真的用它做了什么**。

License: MIT
