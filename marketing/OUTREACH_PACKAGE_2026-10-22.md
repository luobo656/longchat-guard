# LongChat Guard 4.3.0 — 可验证的站外传播素材（2026-10-22）

**状态说明：GitHub 仓库 About、README、官网和 GitHub Release 属于项目方可自行发布的官方渠道。下述 Dev.to、Hacker News、Product Hunt、Reddit、Bilibili、V2EX 为审核规范各异的第三方平台；此文件提供原创且如实披露开发者身份的稿件，**不是**宣称它们已被发布。只有真实发帖取得公开链接，才可计入外部引用。**

## 核心事实（所有帖子都不可改写的边界）

- LongChat Guard：MIT 开源、Chrome / Microsoft Edge、只对 `chatgpt.com` 网页进行本地经验性长会话风险估计。
- **不是官方 Token 计数器**，不知道 OpenAI 精确上下文窗口、官方剩余额度或全部会话统一上限。
- 用户确认真正遇到长度上限的历史会话，经完整读取后才可作为经验校准参考；用户发起自动完整读取，会临时调用浏览器强权限 `debugger` 模拟滚轮，完成后卸载。
- 不上传聊天原文到开发者分析服务器；现有历史资料和输入框草稿不以原文保存。
- 提供续接提示词，但**不会自动转移**历史、保证新项目会话知道全部以前内容，或绕过服务端长度限制。
- 4.3.0 已提交浏览器商店审核（截至本文件时间），不要写「Chrome 和 Edge 均已通过 4.3.0 审核」。
- 最新仓库：https://github.com/luobo656/longchat-guard
- 官网：https://luobo656.github.io/longchat-guard/
- 操作指南：https://luobo656.github.io/longchat-guard/guides/how-to-calibrate-longchat-guard/
- 排障指南：https://luobo656.github.io/longchat-guard/guides/longchat-guard-unable-to-assess/

## 1. GitHub / Show HN 英文稿（开发者身份透明）

**Suggested title:** Show HN: LongChat Guard – a local warning for long ChatGPT conversations

I built LongChat Guard after repeatedly running long working conversations into situations where a clean continuation was difficult. It is an open-source, local-first Chrome/Edge extension that estimates *empirical* conversation-length risk from the current visible chat and a history sample the user knows genuinely reached its length limit.

Version 4.3.0 offers one-click automatic history loading before the original completeness check, plus a continuation prompt that helps prepare a handoff. It refuses to show a precise-looking risk estimate if the relevant evidence is incomplete. It does **not** know OpenAI's official token ceiling, and cannot transfer history automatically.

Privacy: no developer backend for chat content. The optional user-initiated read temporarily uses the browser's broad `debugger` permission to simulate scrolling; normal monitoring does not. Source, method and limitations are public.

Website: https://luobo656.github.io/longchat-guard/
Source: https://github.com/luobo656/longchat-guard

I would appreciate feedback on the conservative evidence model and the tradeoff of browser-internal scrolling versus a manual scan.

**Posting rule:** this is a candidate Show HN submission; it has **not** been posted. Use an account authorized by the user, respect HN guidelines and choose a timing appropriate for community participation. Don't imply an official OpenAI connection.

## 2. Dev.to / technical blog outline (distinct from product listing)

**Title:** Why a ChatGPT conversation-length warning should sometimes say “Unable to assess”

Start with the user problem: a very long working thread may become difficult to continue, but the browser rarely exposes a simple trustworthy remaining-capacity number. Distinguish (1) how much of the *current* chat can be measured, (2) whether a *historical* reference truly failed due to length, and (3) the next-turn growth reserve. Explain the two failure cases—virtualized history and unsent last summary after a hard limit—with one invented, clearly labelled example.

Describe the fail-closed rule: absent credible completeness, show unknown; do not manufacture a percentage. Explain the browser debugger permission's scope and why normal risk monitoring should not use it. Link to the open-source measurement method, privacy disclosure and illustrated troubleshooting guide. Invite bug reports *without* private chat text.

**Publishing rule:** draft only, no Dev.to account has been authorized or used, and no page URL is claimed.

## 3. 简体中文社区说明（原创短稿）

**标题：** 做了一个 ChatGPT 长会话提前预警的开源浏览器扩展

我在长期使用 ChatGPT 处理项目时遇到过对话太长、上下文难以顺利续接的问题，所以做了 LongChat Guard。它在本机估算当前会话负载，并结合我亲自确认达到过长度上限的历史会话建立经验参考。它不会声称知道官方 Token 剩余额度：证据不完整时就老老实实显示「暂无法判断」。

4.3.0 加入一键自动读取历史，省去手动上下滚动，并在校验完整后才接受结果；还可以复制续接提示词，让当前模型整理有效工作状态。完全开源，不上传聊天原文。要注意：主动读取时会临时使用浏览器调试权限发送滚轮事件，平时监测不需要调试器。

源码：https://github.com/luobo656/longchat-guard
官网与教程：https://luobo656.github.io/longchat-guard/zh/

如果社区允许分享独立项目，我想听听大家觉得「不知道就显示未知」是不是比伪精准的风险百分比更有帮助。

**发布限制：** 未经管理员或社区规则允许，不刷屏、不诱导 Star、不给已有相关讨论批量贴推广链接。本稿尚未在第三方社区发布。

## 4. 繁體中文分享稿

**標題：** 開源 ChatGPT 長對話預警工具：不猜官方 Token 額度

LongChat Guard 是我為長期 ChatGPT 專案工作設計的 Chrome / Edge 擴充功能。它在本機估算目前對話負載，並利用使用者已確認真正達到長度上限的歷史對話建立經驗參考；證據不完整就顯示「暫無法判斷」，不假裝擁有精確的官方 Token 剩餘數字。

4.3.0 加入一鍵自動讀取及續接提示詞。內容不會上傳開發者伺服器；主動完整讀取時會暫時使用瀏覽器偵錯權限送出模擬滾輪操作，一般即時監測則不使用。

原始碼：https://github.com/luobo656/longchat-guard
介紹與教學：https://luobo656.github.io/longchat-guard/zh-tw/

歡迎以實際使用與隱私權角度提出意見，不會要求社群為此背書。本稿並未宣稱已在第三方平台發布。

## 5. 真实渠道状态

| 渠道 | 本轮能执行的动作 | 可验证发布状态 |
|---|---|---|
| GitHub 仓库 About/Topics/README | 由项目所有者直接维护，附上可信官网、源码与教程 | 以 GitHub 实际公开页面为准 |
| GitHub v4.3.0 Release | 更新发布页正文，链接正式教程和隐私说明 | 以 GitHub Releases URL 为准 |
| GitHub Pages 官网 | 三语言新增教程、排障及站内链接 | HTTP 实测可用后记录 |
| Metricool | 检查已连接渠道；截至当前只有 YouTube 频道 | 没有对应视频内容，不应生成假视频传播 |
| Dev.to / Hacker News / Reddit / V2EX / Product Hunt | 原创稿件和规则说明可准备 | 尚未实际第三方发布；需要账号、社区允许及最终审核 |
| Chrome / Edge 商店 | 4.3.0 已提交审批；可在审核通过后使用新版介绍引流 | 以真实审核结果为准，不冒充已通过 |

## 6. 可信引用和外链判断

只记录第三方页面**真的公开并可访问**的来源 URL，不把 GitHub 自己的重复页面或 `site:` 查询结果计算成有效外链。杜绝购买无关链接、自动评论灌水、AI 伪装的用户评价、假星标和伪造性能验证数据。
