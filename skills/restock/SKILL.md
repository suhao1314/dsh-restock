---
name: restock
description: 当用户问「DSH 还该装什么插件」「换机后怎么一次补回来」「哪些插件会打架」时使用。用 dsh-restock 读取本机 profile、热门榜和生态目录，给出带理由的推荐和可一键执行的安装命令。
---

# Restock 补货助手

你手上有一台跑着 DeepSeek Harness 的机器，用户想知道「还缺什么」「哪些值得装」「换机怎么补回来」。不要靠记忆猜插件名，直接用 restock 的只读命令拿事实。

## 1. 先看这台机器的现状

```bash
node bin/cli.mjs recommend            # 能力缺口 + 冲突过滤 + 版本兼容
node bin/cli.mjs doctor               # 冲突、未知插件、可更新版本
```

`recommend` 的输出分两层：
- **精选层**：人工核过的条目，带「适合谁 / 成本 / 冲突」，可信度最高；
- **上游层**：从 6,700+ 条生态目录自动筛的，只有机器判断，结论要说清是机器筛的。

## 2. 想要「最近火什么」

```bash
node bin/cli.mjs hot                  # GitHub topic:dsh-plugin 按 stars 排的热门榜
node bin/cli.mjs hot --npm --limit 10 # 只看能直接 npm 装的
node bin/cli.mjs hot --search 生图     # 按关键词找
```

`installed_via: npm` 的可以直接 `install`；`manual` 的要去仓库按 README 装，别硬装。

## 3. 精确搜索

```bash
node bin/cli.mjs catalog --search 记忆
node bin/cli.mjs catalog --refresh    # 强制更新生态目录缓存（12 小时 TTL）
```

## 4. 装的时候

- 一次装多个：`node bin/cli.mjs install dsh-image-gen dsh-better-sidebar`
- 先预览：加 `--dry-run`
- 装完要重启 DSH 才会生效（`pluginManager/installBundle` 会返回 `restart-required`）
- 如果 `doctor` 报冲突，优先保留用户已在用的那个，另一个别装

## 5. 交付原则

- 只说命令实际输出里有的东西；插件名、版本、冲突都来自命令结果，不要编。
- 推荐时给「为什么是你这台机器需要它」，不是泛泛的「这个插件很火」。
- 装之前把「装完要重启」说清楚。
