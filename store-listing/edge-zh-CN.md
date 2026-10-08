# Microsoft Edge Add-ons - zh-CN

## 名称

LongChat Guard · 长会话预警

## 简短说明

ChatGPT 长会话风险提醒与续接辅助；本地处理，不显示官方额度，不上传聊天正文。

## 详细说明

LongChat Guard 是面向 `chatgpt.com` 的本地优先 Microsoft Edge 扩展，用于判断一个长期工作的 ChatGPT 会话是否已经接近值得整理并续接到新会话的阶段。

它不是 OpenAI 官方额度、token 计数器或 context window 计量器。LongChat Guard 只使用浏览器本地经验数据。没有当前可用的本地经验失败参考时，插件会显示“未校准”，不会把未知状态伪装成“风险较低”。

校准只需一次操作：打开一个你自己明确知道曾达到会话长度上限的历史会话，点击“用此会话校准”。完整历史能可靠读取时，插件会建立 strong 或 conservative 本地经验参考；如果扫描不完整或不可靠，则 fail closed，不建立可用参考。

校准后，风险综合当前本地可测会话负载、尚未发送的 Composer 草稿，以及从可靠整轮增长中学习的缓冲。界面只显示“风险较低 / 偏长 / 接近风险 / 高风险”等简单状态，不显示精确 token、百分比、剩余额度或所谓统一的官方会话上限。

续接功能采用元提示词，而不是固定摘要模板。“复制续接提示词”会复制一条给当前 GPT 的指令。把它粘贴到当前会话后，GPT 会根据自己已经掌握的本会话内容和实际可见的项目上下文，自主生成一份可直接交给新会话的续接上下文，优先保留当前目标、已确认决定、约束、已完成工作、已排除方案、未解决问题、必要技术状态和下一步。用户再把 GPT 生成的续接内容复制到新会话即可。插件不会自动搬运聊天，也不会把会话上传到服务器。

“···”菜单始终提供“完整读取当前会话”，可随时刷新当前会话的本地测量，而且不会修改经验提醒基准。

主要功能：
- ChatGPT 长会话本地经验风险提醒；
- 只有测量与校准可靠时才展示完整彩色风险轨道；
- 超长 Composer 草稿在发送前即可改变风险；
- 从可靠的整轮前后状态学习会话增长；
- 用已达到长度上限的历史会话一次完成校准；
- 普通历史会话可“完整读取当前会话”，且不修改校准基准；
- 续接元提示词让当前 GPT 生成高质量、自包含的续接上下文；
- 当前会话可关闭/恢复提醒；
- English / 简体中文 / 繁體中文三种界面语言。

隐私处理全部在浏览器本地完成。只有用户主动同意后，插件才会瞬时读取当前 ChatGPT 页面可见内容和 Composer，用于风险判断。聊天正文、Assistant 回复正文、Composer 草稿、附件/文件正文和工具结果正文不会持久化，也不会上传到 LongChat Guard 分析服务器。持久化会话标识使用 install-salted SHA-256 pseudonymous identifier，而不是原始 ChatGPT conversation ID。无需 OpenAI API Key。

## 单一用途

为 `chatgpt.com` 长会话提供本地经验风险提醒与续接辅助。

## 权限解释

- `storage`：保存本地 pseudonymous 指纹、内部估算、经验校准元数据、整轮增长样本和提醒设置。
- `https://chatgpt.com/*`：只在支持的 ChatGPT 网页端运行。

## 非官方声明

LongChat Guard 是独立开源项目，与 OpenAI 不存在隶属、赞助、认可或维护关系。“ChatGPT”仅用于说明支持的网站和使用场景。

## 商店链接

- 官方网站：https://luobo656.github.io/longchat-guard/zh/
- 隐私政策：https://luobo656.github.io/longchat-guard/PRIVACY.md
- 开源代码：https://github.com/luobo656/longchat-guard
- 支持 / 问题反馈：https://github.com/luobo656/longchat-guard/issues

## 搜索词

ChatGPT 长会话；长会话预警；会话长度提醒；上下文风险提醒；ChatGPT 续接；长对话续接；ChatGPT 插件
