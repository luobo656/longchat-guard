# LongChat Guard

> ChatGPT 长会话本地风险预警器 · Local long-conversation warning for `chatgpt.com`

[![CI](https://github.com/luobo656/longchat-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/luobo656/longchat-guard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

LongChat Guard 是一个面向 Chrome / Edge 的 Manifest V3 浏览器扩展，用于 **ChatGPT 长会话预警、对话长度趋势监控、上下文风险提醒（context window warning）和长聊天整理/续接**。它不会读取 OpenAI 官方“剩余额度”，也不宣称知道精确会话上限；它只在浏览器本地判断当前 ChatGPT 会话的长度趋势，并结合本机历史校准，在会话逐渐接近风险区时给出低打扰提醒。

If you are looking for a **ChatGPT long conversation warning**, **conversation length monitor**, **context window warning**, **long chat guard**, **ChatGPT context monitor**, or a **privacy-first ChatGPT Chrome / Edge extension**, LongChat Guard is designed for that use case. It is **not** an official token-limit meter and does not claim exact OpenAI quotas.

![LongChat Guard icon](./public/icons/icon128.png)

## 核心功能

- 当前会话长度趋势：只显示“正常范围 / 偏长 / 建议整理 / 接近风险区”等模糊状态，不展示 token 数、百分比或所谓官方额度。
- 本地个体校准：根据本机历史使用情况学习风险边界。
- 长会话预警：接近已学习风险区域时提醒整理或续接。
- 续接提示词：一键复制固定的续接提示词。
- 重新学习：环境变化时开启新的本地学习代际。
- 本会话暂不提醒：避免重复打扰。
- 轻量交互：点击页面其他位置或按 `Esc` 即可收起面板。
- 首次隐私确认：用户主动同意之前，不读取或处理 ChatGPT 会话正文。

## 适合哪些搜索需求

LongChat Guard 覆盖的核心问题可以概括为：

- ChatGPT 长会话提醒 / ChatGPT 长对话预警
- ChatGPT 会话长度监控 / conversation length monitor
- ChatGPT 上下文窗口提醒 / context window warning
- ChatGPT 对话过长提醒 / long chat warning
- ChatGPT 上下文风险 / context risk warning
- Chrome ChatGPT extension / Edge ChatGPT extension
- local-first ChatGPT extension / privacy-first ChatGPT extension
- long conversation guard / chat context monitor / conversation guard

这些词描述的是同一类使用场景，不代表本项目能够读取 OpenAI 官方 token 额度或精确 context-window 上限。

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

V1 只面向 `chatgpt.com` 网页端，不包含：

- 下一轮 token 预测
- 精确 token / K 值 / 百分比 / 官方剩余额度
- Codex、CLI、API 或其他 AI 网站适配
- 云账号、云同步或服务端
- 自动代用户发送消息
- OpenAI / ChatGPT 官方 Logo 或任何暗示官方关系的品牌处理

## 品牌

公开品牌名为 **LongChat Guard**。图标使用原创高对比几何构图：深青绿底板、白色聊天气泡、橙色守护盾牌与白色对勾，专门针对浏览器工具栏 16px / 32px 小尺寸优化。

`ChatGPT` 仅用于说明本项目当前支持的网站。本项目与 OpenAI 没有隶属、赞助、认可或维护关系。

## 开源

MIT License。欢迎提交 Issue 和 Pull Request。提交代码前请运行：

```bash
npm run typecheck
npm test
npm run build
```

安全问题请先阅读 [SECURITY.md](./SECURITY.md)，不要在公开 Issue 中粘贴真实聊天内容、账号标识、API Key 或附件正文。
