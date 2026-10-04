# Chrome Web Store - zh-CN

## 名称

LongChat Guard · 长会话预警

## 短描述

ChatGPT 长会话风险提醒与本地趋势监测；不显示官方额度，不上传聊天正文。

## 长描述

LongChat Guard 是面向 `chatgpt.com` 的本地优先 Chrome 扩展，用来在长会话真正撞到长度上限前提供经验风险提醒，帮助你及时整理、总结或续接到新会话。

它不是 OpenAI 官方额度或 context window 计量器。没有当前可用的本地经验失败参考时，插件会诚实显示“未校准”，不会显示“正常”，也不会展示完整绿色到红色风险轨道。

校准只需一次操作：打开一个你自己明确知道过去达到过会话长度上限的历史会话，点击“用此会话校准”。完整历史能够可靠读取时，插件会直接建立 strong 本地参考；如果样本包含附件、工具等无法精确计量的上下文，则建立 conservative 参考并让后续提醒更保守；扫描不可靠时不建立可用参考。

校准后，LongChat Guard 会综合当前本地可测会话负载、尚未发送的输入框草稿，以及从可靠整轮 `L_before -> L_after` 增长中学习的缓冲，显示“正常 / 偏长 / 接近风险 / 高风险”等简单状态。不会展示精确 token、百分比、剩余额度或所谓官方会话上限。

主要功能：
- 仅在可靠校准后出现的彩色风险轨道；
- 超长 Composer 草稿发送前即可改变风险；
- 一键复制续接提示词，把重要工作上下文带到新 ChatGPT 会话；
- 一次操作完成历史上限会话校准；
- 环境变化或基准可能失效时重新校准；
- 当前会话关闭/恢复提醒。

隐私处理全部在浏览器本地完成。只有用户主动同意后，插件才会瞬时读取当前 ChatGPT 可见内容和输入框草稿。聊天原文、草稿、附件/文件内容和工具结果正文不会持久化，也不会上传。保存的会话标识是 install-salted SHA-256 pseudonymous identifier，而不是原始 ChatGPT conversation ID。无需 OpenAI API Key。

## 单一用途

为 `chatgpt.com` 长会话提供本地经验风险提醒，帮助用户在合适时机整理和续接。

## 权限说明

- `storage`：保存本地 pseudonymous 指纹、内部估算、经验校准元数据、整轮增长样本和提醒设置。
- `https://chatgpt.com/*`：只在支持的 ChatGPT 网页端运行。

## 非官方声明

LongChat Guard 是独立开源项目，与 OpenAI 不存在隶属、赞助、认可或维护关系。“ChatGPT”仅用于说明支持的网站和使用场景。

## 商店链接

- 官方网站：https://luobo656.github.io/longchat-guard/zh/
- 隐私政策：https://luobo656.github.io/longchat-guard/PRIVACY.md
- 开源代码：https://github.com/luobo656/longchat-guard
- 支持 / 问题反馈：https://github.com/luobo656/longchat-guard/issues
