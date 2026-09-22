# Chrome Web Store - zh-CN

## 名称

LongChat Guard - ChatGPT 长会话预警

## 短描述

ChatGPT 长会话预警、会话长度趋势监控与上下文风险提醒，全部在浏览器本地完成。

## 长描述

LongChat Guard 是一个面向 `chatgpt.com` 的隐私优先 Chrome 扩展，适合需要 ChatGPT 长会话预警、会话长度趋势监控、上下文窗口风险提醒和长对话续接的用户。它不会读取 OpenAI 官方额度，也不会显示精确 token、百分比、K 值或会话上限。

扩展会在本地观察当前网页会话的长度趋势，并结合本机历史学习到的边界，在会话偏长或接近风险区时给出低打扰提醒。用户可以复制固定续接提示词、重新学习当前环境，或对当前会话暂不提醒。

它特别适合长 ChatGPT 对话场景：当用户想更早知道什么时候值得整理、总结或切换到新会话时，提供本地趋势信号，而不是伪装成官方额度计量器。

首次启用监测前，扩展会明确说明其数据处理方式：仅在用户同意后，于本机瞬时读取当前 ChatGPT 页面可见对话内容，用于长度趋势估算和匿名本地指纹；聊天原文不持久化，也不会上传给开发者或第三方。选择“暂不开启”时不会启动监测。

## 单一用途

在 `chatgpt.com` 长会话中提供本地风险趋势提醒，帮助用户提前整理和续接。

## 权限说明

- `storage`：保存本地匿名指纹、内部估算、校准状态和提醒设置。
- `https://chatgpt.com/*`：仅在 ChatGPT 网页端运行内容脚本。

## 非官方声明

本扩展不是 OpenAI 官方产品，也不由 OpenAI 赞助、认可或维护。`ChatGPT` 仅用于说明支持的网站。

## 商店链接

- 官方网站：https://luobo656.github.io/longchat-guard/
- 隐私政策：https://luobo656.github.io/longchat-guard/PRIVACY.md
- 开源代码：https://github.com/luobo656/longchat-guard
- 支持 / 问题反馈：https://github.com/luobo656/longchat-guard/issues
