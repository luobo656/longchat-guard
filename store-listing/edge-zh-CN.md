# Microsoft Edge Add-ons - zh-CN

## 名称

LongChat Guard - ChatGPT 长会话预警

## 简短说明

ChatGPT 长会话预警、会话长度监控与上下文风险提醒，全部在 Edge 浏览器本地完成。

## 详细说明

LongChat Guard 是一个隐私优先的 Microsoft Edge 扩展，用于 ChatGPT 长会话预警、会话长度趋势监控、上下文风险提醒和长对话续接。它帮助用户在 ChatGPT 网页端长对话中提前整理、总结或切换到新会话。

它只做本地趋势判断，不读取官方剩余额度，不显示精确 token 数、百分比、K 值或会话上限。

所有学习和提醒逻辑都在浏览器本地完成。扩展没有服务器、没有云同步，也不需要 OpenAI API Key。

首次启用前会先说明数据处理方式，并仅在用户主动同意后读取当前 ChatGPT 页面可见对话内容进行本地趋势估算与匿名指纹计算；聊天原文不保存、不上传。选择“暂不开启”则不会启动监测。

## 单一用途

为 `chatgpt.com` 长会话提供本地趋势提醒。

## 权限解释

- `storage`：保存本地匿名学习数据和提醒设置。
- `https://chatgpt.com/*`：只在 ChatGPT 网页端注入内容脚本。

## 非官方声明

本扩展不是 OpenAI 或 ChatGPT 官方产品。名称中的 ChatGPT 仅用于说明适用网站。

## 商店链接

- 官方网站：https://luobo656.github.io/longchat-guard/
- 隐私政策：https://luobo656.github.io/longchat-guard/PRIVACY.md
- 开源代码：https://github.com/luobo656/longchat-guard
- 支持 / 问题反馈：https://github.com/luobo656/longchat-guard/issues
