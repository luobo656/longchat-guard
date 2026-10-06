# LongChat Guard

> **LongChat Guard · 长会话预警** — local, privacy-first long-conversation risk warnings for `chatgpt.com`

[![CI](https://github.com/luobo656/longchat-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/luobo656/longchat-guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Website](https://img.shields.io/badge/Website-LongChat_Guard-23b69d)](https://luobo656.github.io/longchat-guard/)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4)](https://chromewebstore.google.com/detail/longchat-guard/njeoedopjhefbhgllpjadjkljpnfioop)

**Official project site:** https://luobo656.github.io/longchat-guard/ · [简体中文](https://luobo656.github.io/longchat-guard/zh/) · [繁體中文](https://luobo656.github.io/longchat-guard/zh-tw/)
**Install:** [Chrome Web Store](https://chromewebstore.google.com/detail/longchat-guard/njeoedopjhefbhgllpjadjkljpnfioop) · **Source:** https://github.com/luobo656/longchat-guard

LongChat Guard 是一个面向 Chrome / Microsoft Edge 的开源 Manifest V3 扩展。它根据浏览器本地可观测的 ChatGPT 长会话证据，提供**经验风险预警**和续接辅助。它不是 OpenAI 官方 context-limit、token-limit 或剩余额度仪表盘，也不会声称知道服务端真实上下文容量。

LongChat Guard is an open-source, local-first Chrome/Edge extension for empirical ChatGPT long-conversation warnings. It is **not** an official OpenAI quota, token-limit, or context-window meter.

![LongChat Guard icon](./public/icons/icon128.png)

## 当前 2.1.0 产品模型

LongChat Guard 将“能不能判断”和“风险是什么”分开：

- **MeasurementState**：`unavailable / partial / complete / uncertain`
- **CalibrationState**：`uncalibrated / calibrating / calibrated_conservative / calibrated / stale`
- **RiskState**：`unknown / normal / long / organize / high`

核心 invariant：

> 没有完整可靠的测量，或没有当前测量口径可用的经验失败参考，就只能是 `unknown`，绝不能显示“风险较低”。

因此完整绿色→黄色→橙色→红色风险轨道只会在 measurement complete 且 strong/conservative calibration 可用时出现。

## 核心功能

- **信息诚实的风险状态**：未校准时显示“未校准”，当前会话未完成可靠读取时显示“暂无法判断”，测量方式变化后显示“需要重新校准”。
- **一次校准**：打开一个你明确知道曾达到 ChatGPT 会话长度上限的历史会话，点击一次“用此会话校准”。该点击本身就是用户确认，不再执行“扫描当前会话 → 再扫描上限会话 → 再 Yes/No”的旧流程。
- **随时完整读取**：右上角“···”菜单始终提供“完整读取当前会话”。它只刷新当前会话的本地测量，不修改提醒基准 R；是否重读由用户自行决定。
- **经验失败参考**：完整可靠、无已识别不可测上下文的样本形成 strong reference；含附件/工具等不可精确计量上下文的确定上限样本形成 conservative reference；不完整证据只保留为 provisional，不产生确定性风险。
- **模型标签仅作诊断**：页面能可靠读取到 model hint 时可以作为本地诊断元数据保留；模型标签缺失或变化不会改变 R 质量、风险等级、generation 或校准有效性。真正影响测量兼容性的是 parser / measurement schema。
- **发送前预警**：尚未发送的 Composer 草稿进入 projected risk；输入足够长时可以在按发送之前升级风险。
- **整轮增长学习**：增长缓冲来自 `L_before -> L_after` 的 whole-turn delta，而不是只学习 Assistant 单条回复长度。
- **多标签页一致性**：ledgerRevision / observationEpoch + background revision guard 阻止旧标签页把新状态写回旧值。
- **扫描事务**：完整历史校准绑定 scan session、conversation、generation 与 ledger revision；中途变化就 fail closed，不提交半成品。
- **本地续接**：可复制续接元指令，让当前 GPT 根据本会话/项目真实状态直接生成自包含的续接上下文，再由用户复制到新会话继续。
- **三语 UI**：English / 简体中文 / 繁體中文；canonical brand 始终是 **LongChat Guard**。

## 校准是怎么工作的？

普通聊天无需用户操作。扩展会在后台观察当前本地可测负载、测量完整度和整轮增长。

第一次需要建立经验失败参考时：

1. 打开一个你自己确认过去真正达到过 conversation-length limit 的历史会话。
2. 点击 **“用此会话校准”**。
3. 扩展只扫描一次完整历史。
4. 扫描可靠则直接建立 strong 或 conservative 的本地经验失败参考。
5. 如果完整性、parser 或序列不可靠，则明确告诉你本次样本不可用，不会伪造参考。

扩展被动看到“可能的 conversation-length-limit”时仍可以单独询问是否用该事件校准；这条 pending-confirmation 路径不属于显式校准流程。

## 风险方法

内部主要使用：

- `L`：当前本地可测会话负载。
- `S`：成功证据，只用于内部一致性/测量漂移检查，不让未校准 UI 进入“风险较低”。
- `R`：EmpiricalFailureReference，本地经验失败参考，不等于 OpenAI 官方上限。
- `G`：TurnGrowthReserve，由可靠 whole-turn delta 学习。

发送前：

```text
baseLoad = CurrentLoad + ComposerDraftLoad
projectedLoad = baseLoad + TurnGrowthReserve
```

当 R 和 G 都可用时，风险按距离 R 还剩大约 3 / 2 / 1 个本地典型整轮增长缓冲进入偏长 / 接近风险 / 高风险。G 尚未学够时，不人为制造预警带；只在达到本地 R 时进入高风险。

UI 不显示 token 数、K 值、百分比或任何会被理解成 OpenAI 官方额度的数值。

## 隐私与权限

LongChat Guard 没有服务器、账号系统、云同步或 OpenAI API Key。

首次启用前会明确请求同意。只有用户点击“同意并开始”后，内容脚本才会在本机瞬时读取当前 ChatGPT 页面可见内容和 Composer，用于：

- 本地负载估算
- 本地 fingerprint
- measurement/parser 判断
- whole-turn growth
- empirical calibration/risk

不会持久化：

- 用户聊天正文
- Assistant 回答正文
- Composer 草稿正文
- 附件/文件正文
- 工具/搜索结果正文
- 姓名、邮箱或 API Key
- raw ChatGPT conversation ID

持久化会话标识是由本安装 salt 派生的 SHA-256 **pseudonymous identifier**。它降低 raw conversation ID 的直接暴露，但不被描述为对拥有同一浏览器 profile 与 install salt 的本机攻击者“绝对匿名”。

Manifest V3 权限：

- `storage`：保存本地 pseudonymous 状态、校准证据与提醒设置。
- `https://chatgpt.com/*`：仅在 ChatGPT 网页端运行。

完整说明见 [PRIVACY.md](./PRIVACY.md)。

## 安装与开发

### 从源码构建

```bash
npm install
npm run typecheck
npm test
npm run build
```

构建产物位于 `dist/`。

### Chrome / Edge 本地加载

1. 打开浏览器扩展管理页。
2. 开启开发人员模式。
3. 选择“加载已解压的扩展”。
4. 选择项目的 `dist/`。
5. 打开 `https://chatgpt.com/`，完成首次隐私确认。

推荐 Node.js 20+。

构建还会验证：

- content script 是浏览器可直接加载的 classic bundle
- Manifest V3 权限未意外扩大
- 必需图标与构建产物完整

开发约束：

- [PRODUCT_BASELINE.md](./PRODUCT_BASELINE.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [ACCEPTANCE.md](./ACCEPTANCE.md)
- [MANUAL_QA.md](./MANUAL_QA.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)

面向搜索引擎和 AI 检索的项目说明：

- [llms.txt](./llms.txt)
- [AI_DISCOVERY.md](./AI_DISCOVERY.md)
- [FAQ.md](./FAQ.md)
- [CITATION.cff](./CITATION.cff)

## 项目边界

LongChat Guard 2.x 只面向 `chatgpt.com` 网页端，不包含：

- 官方 context-window / quota meter
- 精确 token / K 值 / 百分比 / 官方剩余额度
- Codex、CLI、API 或其他 AI 网站适配
- 云账号、云同步或服务端聊天分析
- 自动代用户发送消息或自动创建新对话
- OpenAI / ChatGPT 官方 Logo 或任何暗示官方关系的品牌处理

## 品牌

Canonical brand 始终是 **LongChat Guard**。英文展示名为 **LongChat Guard**，简体中文为 **LongChat Guard · 长会话预警**，繁体中文为 **LongChat Guard · 長對話預警**。

`ChatGPT` 仅用于说明当前支持的网站和使用场景。本项目与 OpenAI 没有隶属、赞助、认可或维护关系。

## 开源

MIT License。提交代码前请运行：

```bash
npm run typecheck
npm test
npm run build
```

安全问题请先阅读 [SECURITY.md](./SECURITY.md)，不要在公开 Issue 中粘贴真实聊天内容、账号标识、API Key 或附件正文。
