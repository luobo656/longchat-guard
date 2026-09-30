# Chrome Web Store - zh-CN

## 名称

LongChat Guard · 长会话预警

## 短描述

ChatGPT 长会话风险提醒与本地趋势监测；不显示官方额度，不上传聊天正文。

## 长描述

LongChat Guard 是一个面向 `chatgpt.com` 的本地优先 Chrome 扩展，用来提醒 ChatGPT 长会话风险。当对话越来越长、逐渐接近本机学习到的风险区域时，它会用简单状态提醒你及时整理、总结或续接到新会话。

它不会伪装成 OpenAI 官方额度计量器。插件根据本机证据学习：哪些会话长度曾正常完成、哪些会话曾确认达到长度上限，以及你平时一次 Assistant 回复大约增长多少。最终只显示“正常 / 偏长 / 接近风险 / 高风险”等易懂状态，不展示精确 token、百分比、剩余额度或所谓官方会话上限。

主要功能：
- 彩色风险轨道与当前位置指示；
- 一键复制续接提示词，把重要工作状态带到新 ChatGPT 会话；
- 在尚未学到本地失败边界时，可手动扫描一个旧长会话辅助学习；
- 环境变化时可重新学习；
- 可对当前会话关闭或恢复提醒。

隐私处理全部在浏览器本地完成。只有用户主动同意后，插件才会瞬时读取当前 ChatGPT 页面可见对话内容，用于本地估算和匿名指纹计算。聊天原文不会持久化，也不会上传给开发者、LongChat Guard 服务器或第三方；插件没有对话分析服务器，也不需要 OpenAI API Key。

如果你在寻找 ChatGPT 长会话预警、长对话提醒、会话长度监控、上下文风险提醒、长聊天保护或隐私优先的 ChatGPT 浏览器插件，LongChat Guard 面向的就是这一类使用场景。

## 单一用途

为 `chatgpt.com` 长会话提供本地风险提醒，帮助用户在合适的时机整理和续接。

## 权限说明

- `storage`：保存本地匿名指纹、内部估算、学习边界元数据和提醒设置。
- `https://chatgpt.com/*`：只在支持的 ChatGPT 网页端运行。

## 非官方声明

LongChat Guard 是独立开源项目，与 OpenAI 不存在隶属、赞助、认可或维护关系。“ChatGPT”仅用于说明支持的网站和使用场景。

## 商店链接

- 官方网站：https://luobo656.github.io/longchat-guard/zh/
- 隐私政策：https://luobo656.github.io/longchat-guard/PRIVACY.md
- 开源代码：https://github.com/luobo656/longchat-guard
- 支持 / 问题反馈：https://github.com/luobo656/longchat-guard/issues
