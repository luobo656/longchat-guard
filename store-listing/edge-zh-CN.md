# Microsoft Edge Add-ons - zh-CN

## 名称

LongChat Guard · 长会话预警

## 简短说明

ChatGPT 长会话风险提醒与本地趋势监测；不显示官方额度，不上传聊天正文。

## 详细说明

LongChat Guard 是面向 `chatgpt.com` 的本地优先 Microsoft Edge 扩展，用来在长会话真正撞到长度上限前提供经验风险提醒。

它不是 OpenAI 官方额度或 context window 计量器。没有当前可用的本地经验失败参考时，插件会显示“未校准”，不会显示“正常”，也不会展示完整风险轨道。

校准只需一次操作：打开一个你自己明确知道过去达到过会话长度上限的历史会话，点击“用此会话校准”。完整历史可靠读取后直接建立 strong 或 conservative 本地参考；不可靠时不建立可用参考。

校准后，风险综合当前本地可测会话负载、尚未发送的输入框草稿，以及可靠整轮 `L_before -> L_after` 增长。最终显示“正常 / 偏长 / 接近风险 / 高风险”等简单状态，不展示精确 token、百分比、剩余额度或 OpenAI 官方上限。

首次启用前会先说明数据处理方式。只有用户主动同意后，插件才会在本机瞬时读取可见 ChatGPT 内容和输入框草稿。聊天原文、草稿、附件/文件和工具结果正文不会持久化或上传。会话标识使用 install-salted SHA-256 pseudonymous identifier，不保存原始 ChatGPT conversation ID。无需 OpenAI API Key。

## 单一用途

为 `chatgpt.com` 长会话提供本地经验风险提醒。

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
