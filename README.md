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

```bash
# 0. 让它先给你建议（能力缺口 + 冲突过滤 + 质量筛）
npx dsh-restock recommend

# 1. 看货架（读本地 catalog，不联网）
npx dsh-restock list

# 2. 看某个套餐里有什么
npx dsh-restock list --pack newbie

# 3. 装上，一次装多个
npx dsh-restock install dsh-image-gen dsh-better-sidebar

# 4. 只预览，不真装
npx dsh-restock install --pack creator --dry-run

# 5. 把现在这套导出，换机时 sync 回来
npx dsh-restock export > my-dsh.json
npx dsh-restock sync my-dsh.json

# 6. 体检：谁跟谁打架、有没有装到会拖垮 DSH 的插件
npx dsh-restock doctor
```

需要 DSH 正在运行（工具会自己找到它的本地 RPC 端口，也可 `--port 7551` 指定）。
装插件走的是 DSH 内置的 `pluginManager/installBundle`，和设置页里点「安装」是同一条路。

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

## 安全与边界

- 不代跑 npm 安装脚本以外的任何东西；不收集遥测；不往任何服务器上传你的 profile。
- 安装前会把「要装什么、从哪个包名装」打印出来，`--dry-run` 可先看。
- 目录里的 `cost` / `conflicts` 是人工维护的判断，会过时 —— 发现问题请提 PR 改 JSON。

## 路线图

- [x] 目录 + 套餐 + `list` / `install` / `export` / `sync` / `doctor`
- [x] 接入上游生态目录（`catalog`，6700+ 条、版本差距对比）
- [x] `recommend`：按 profile 的能力缺口推荐，精选层 + 上游自动筛层
- [ ] 技能（skills）与 MCP 连接的清单化安装
- [ ] `export` 生成带版本的 lockfile（现在只记包名）
- [ ] 网页版勾选界面（生成一条命令给你复制）
- [ ] 社区提交目录（一个 PR 一个插件）

## 贡献

1. Fork，改 `catalog/plugins.json`（或加套餐）。
2. `node bin/cli.mjs list` 自查格式没写错。
3. 提 PR，说明你**真的用它做了什么**。

License: MIT
