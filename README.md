# LongChat Guard

> **LongChat Guard · 长会话预警** — local, privacy-first long-conversation risk warnings for `chatgpt.com`

[![CI](https://github.com/luobo656/longchat-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/luobo656/longchat-guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Website](https://img.shields.io/badge/Website-LongChat_Guard-23b69d)](https://luobo656.github.io/longchat-guard/)
[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4)](https://chromewebstore.google.com/detail/longchat-guard/njeoedopjhefbhgllpjadjkljpnfioop)

**Official project site:** https://luobo656.github.io/longchat-guard/ · [中文页面](https://luobo656.github.io/longchat-guard/zh/)
**Install:** [Chrome Web Store](https://chromewebstore.google.com/detail/longchat-guard/njeoedopjhefbhgllpjadjkljpnfioop) · **Source:** https://github.com/luobo656/longchat-guard

LongChat Guard 是一个面向 Chrome / Edge 的开源 Manifest V3 扩展，用于 **ChatGPT 长会话预警、长对话风险提醒和续接**。2.0 采用本地经验模型：根据已确认安全的会话、已确认达到长度上限的会话，以及你平时 Assistant 单轮回复的增长情况，判断当前长会话离本机经验风险区域还有多远。它不会读取 OpenAI 官方“剩余额度”，也不宣称知道精确会话上限。

LongChat Guard is an open-source, local-first Chrome/Edge extension for **ChatGPT long-conversation warnings**. It learns empirical browser-side safe/failure boundaries and typical assistant-reply growth, then gives simple risk states and a continuation workflow. It is **not** an official OpenAI quota or token-limit meter.

![LongChat Guard icon](./public/icons/icon128.png)

## 核心功能

- **一眼看懂的风险位置**：完整彩色风险轨道 + 当前位置圆点，只显示正常、偏长、接近风险、高风险等简短状态。
- **本地自动学习**：从已确认安全边界、已确认失败边界和典型回复增长中持续校准，不依赖固定“魔法阈值”。
- **长会话续接**：一键复制结构化续接提示词，把目标、决定、约束、代码/文件状态和待办带到新会话。
- **旧会话辅助学习**：尚未建立失败边界时，可完整扫描一个已达到上限的历史会话并由用户确认。
- **自动适应环境变化**：出现多个独立矛盾证据时开启新的学习代际，而不是永久相信旧边界。
- **低打扰控制**：支持重新学习和本会话静音。
- **三语本地化**：English / 简体中文 / 繁體中文；canonical brand 始终是 **LongChat Guard**。
- **明确隐私同意**：用户主动同意前，不读取或处理 ChatGPT 会话正文。

## 方法与指南

- [LongChat Guard 2.0.2 风险判断方法](https://luobo656.github.io/longchat-guard/zh/methodology/)
- [ChatGPT 会话太长了怎么办？](https://luobo656.github.io/longchat-guard/zh/guides/chatgpt-conversation-too-long/)
- [English methodology](https://luobo656.github.io/longchat-guard/methodology/)

## 它解决什么问题？

当 ChatGPT 对话持续很久时，用户通常真正想知道的不是一个未经证实的 token 数，而是：**现在是否值得整理、总结或开启新会话？** LongChat Guard 给这个决策提供本地经验信号。

常见表达包括 ChatGPT 长会话预警、长对话提醒、conversation length monitor、context window warning、long chat guard 和 privacy-first ChatGPT extension。这些都是使用场景描述，不代表本项目能够读取 OpenAI 官方 token 额度或精确 context-window 上限。

## 隐私与权限

LongChat Guard 没有服务器、账号系统、云同步或 OpenAI API Key。

首次启用监测前，扩展会明确说明数据处理方式。只有用户点击“同意并开始”后，内容脚本才会在浏览器内瞬时读取当前 ChatGPT 页面可见内容，用于本地趋势估算与本地加盐指纹计算。

不会持久化：

- 用户聊天正文
- Assistant 回答正文
- Composer 草稿正文
- 附件正文
- 姓名、邮箱或 API Key

不会把聊天内容上传给开发者、第三方或扩展服务器。

Manifest V3 权限保持最小化：

- `storage`：保存本地匿名学习数据、校准信息和提醒设置。
- `https://chatgpt.com/*`：仅在 ChatGPT 网页端运行。

完整说明见 [PRIVACY.md](./PRIVACY.md)。

## 安装

### 从源码构建

```bash
npm install
npm run typecheck
npm test
npm run build
```

构建产物位于 `dist/`。

### Chrome / Edge 本地加载

1. 打开扩展管理页。
2. 开启“开发人员模式”。
3. 选择“加载已解压的扩展”。
4. 选择项目的 `dist/` 目录。
5. 打开 `https://chatgpt.com/`，完成首次隐私确认后开始使用。

## 开发

推荐 Node.js 20+。

```bash
npm install
npm run typecheck
npm test
npm run build
```

构建流程会额外检查：

- content script 为可直接加载的 classic bundle
- Manifest V3 权限没有意外扩大
- 必需图标与构建产物完整

更多开发约束：

- [PRODUCT_BASELINE.md](./PRODUCT_BASELINE.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [ACCEPTANCE.md](./ACCEPTANCE.md)
- [CONTRIBUTING.md](./CONTRIBUTING.md)

面向搜索引擎、AI 助手和检索系统的项目说明：

- [llms.txt](./llms.txt)
- [AI_DISCOVERY.md](./AI_DISCOVERY.md)
- [FAQ.md](./FAQ.md)
- [CITATION.cff](./CITATION.cff)

## 项目边界

LongChat Guard 2.x 只面向 `chatgpt.com` 网页端，不包含：

- 下一轮 token 预测
- 精确 token / K 值 / 百分比 / 官方剩余额度
- Codex、CLI、API 或其他 AI 网站适配
- 云账号、云同步或服务端
- 自动代用户发送消息
- OpenAI / ChatGPT 官方 Logo 或任何暗示官方关系的品牌处理

## 品牌

canonical brand 始终是 **LongChat Guard**，品牌本身不翻译。英文展示名为 **LongChat Guard**，简体中文为 **LongChat Guard · 长会话预警**，繁体中文为 **LongChat Guard · 長對話預警**。图标使用最终原创构图：透明背景、绿色聊天气泡作为主体、三条白色对话线、右下橙色守护盾牌；不使用外部方形底板或盾牌对勾。

`ChatGPT` 仅用于说明本项目当前支持的网站和使用场景。本项目与 OpenAI 没有隶属、赞助、认可或维护关系。

## 开源

MIT License。欢迎提交 Issue 和 Pull Request。提交代码前请运行：

```bash
npm run typecheck
npm test
npm run build
```

安全问题请先阅读 [SECURITY.md](./SECURITY.md)，不要在公开 Issue 中粘贴真实聊天内容、账号标识、API Key 或附件正文。
