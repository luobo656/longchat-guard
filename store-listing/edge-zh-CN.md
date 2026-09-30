# Microsoft Edge Add-ons - zh-CN

## 名称

LongChat Guard · 长会话预警

## 简短说明

ChatGPT 长会话风险提醒与本地趋势监测；不显示官方额度，不上传聊天正文。

## 详细说明

LongChat Guard 是一个面向 `chatgpt.com` 的本地优先 Microsoft Edge 扩展，用来提醒 ChatGPT 长会话风险。它根据本机实际使用学习安全边界、长度上限失败边界和典型单轮回复增长，在对话逐渐变长时显示“正常 / 偏长 / 接近风险 / 高风险”等简单状态。

它适合希望更早知道什么时候该整理、总结或开启新会话的用户，并提供一键续接提示词，帮助把真正重要的工作上下文带到新 ChatGPT 对话。

LongChat Guard 不是官方额度计量器：不显示精确 token、百分比、剩余额度或 OpenAI 官方会话上限，也不需要 OpenAI API Key。

首次启用前会先说明数据处理方式。只有用户主动同意后，插件才会在本机瞬时读取当前 ChatGPT 页面可见对话内容，用于本地估算和匿名指纹计算。聊天原文不会持久化，也不会上传给开发者、LongChat Guard 服务器或第三方。

## 单一用途

为 `chatgpt.com` 长会话提供本地风险提醒。

## 权限解释

- `storage`：保存本地匿名指纹、内部估算、学习边界元数据和提醒设置。
- `https://chatgpt.com/*`：只在支持的 ChatGPT 网页端运行。

## 非官方声明

LongChat Guard 是独立开源项目，与 OpenAI 不存在隶属、赞助、认可或维护关系。“ChatGPT”仅用于说明支持的网站和使用场景。

## 商店链接

- 官方网站：https://luobo656.github.io/longchat-guard/zh/
- 隐私政策：https://luobo656.github.io/longchat-guard/PRIVACY.md
- 开源代码：https://github.com/luobo656/longchat-guard
- 支持 / 问题反馈：https://github.com/luobo656/longchat-guard/issues
