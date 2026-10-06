# Channel-specific launch copy

Do not cross-post one identical block everywhere. Each version below is written for that community's normal discussion style.

## Hacker News

**Title**

Show HN: LongChat Guard – local warnings for ChatGPT conversations getting too long

**Post**

I built LongChat Guard, an open-source Chrome/Edge extension for a narrow problem I kept hitting in long coding and research chats: when should I stop extending the same thread and hand off the working state to a fresh conversation?

I deliberately did not make an “official remaining token %” meter. The browser extension doesn't have an authoritative OpenAI quota to expose.

LongChat Guard uses three core local signals instead: current load L, a user-confirmed empirical failure reference R, and reliable whole-turn growth G. The UI reduces that to Lower risk / Long / Near risk / High risk.

A cold install doesn't start half full; incomplete history or low confidence doesn't inflate risk. Raw chat text isn't persisted or sent to a LongChat Guard backend.

Methodology: https://luobo656.github.io/longchat-guard/methodology/

Source: https://github.com/luobo656/longchat-guard

I'd be interested in criticism of the evidence model in particular: what would you use instead if an official remaining-context value isn't available?

---

## Reddit — ChatGPT / productivity / browser-extension communities

**Title**

I made a local-first warning for long ChatGPT threads because I kept realizing too late that I should have started a fresh chat

**Post**

I use long ChatGPT threads for coding/planning, and the annoying moment isn't usually “I need a token counter.” It's realizing that decisions, constraints and file state are spread across a huge thread and I should have prepared a clean handoff earlier.

I built an open-source Chrome/Edge extension called LongChat Guard.

It doesn't claim to know OpenAI's official remaining quota. It compares current local load with a user-confirmed historical length-limit reference and learns whole-turn growth, then shows a coarse Lower risk / Long / Near risk / High risk signal.

It also creates a continuation prompt focused on goal + decisions + constraints + current file/code state + unresolved issues + next steps, instead of copying the whole transcript.

Everything runs locally after consent; raw chat text isn't persisted or uploaded to a LongChat Guard analysis server.

Methodology: https://luobo656.github.io/longchat-guard/methodology/

Code: https://github.com/luobo656/longchat-guard

I'm mainly looking for feedback from people who keep long research/coding/writing threads. What actually tells you it is time to move?

---

## Product Hunt

**Tagline**

Know when a long ChatGPT thread is worth handing off.

**Description**

LongChat Guard is an open-source, local-first Chrome and Edge extension for long ChatGPT conversations. It compares current local load with a user-confirmed historical length-limit reference, learns reliable whole-turn growth, then shows a simple risk state and helps carry the important working context into a fresh conversation.

No OpenAI API key. No developer-operated chat-analysis backend. No claim of an official token quota.

**First comment**

I built LongChat Guard around a very specific problem: long ChatGPT threads are valuable until the cost of carrying the thread becomes larger than the cost of a clean handoff.

The first version used more heuristic signals. In 2.0 I rebuilt the engine around explicit local evidence: current load, confirmed safe history, confirmed length failures, and dynamic reply growth.

The most important design decision was what *not* to show. If the extension cannot know an official OpenAI remaining quota, it should not draw a precise “63% used” meter and imply that it can.

I'd appreciate feedback on whether the warning/handoff workflow feels useful in real long-running work.

---

## V2EX

**标题**

做了一个本地运行的 ChatGPT 长会话预警插件 LongChat Guard，2.0 把“假精确阈值”全部删了

**正文**

平时用 ChatGPT 做长期编程/分析时，我遇到的问题不是找不到聊天记录，而是经常等到会话已经很难继续时，才意识到应该更早整理状态开新会话。

所以做了 LongChat Guard。

2.1.0 继续坚持“不伪造官方额度”：风险判断只依赖浏览器本地可验证的状态，包括当前可测会话负载、用户亲自确认达到长度上限的历史参考，以及可靠整轮对话的增长。

界面只给风险较低 / 偏长 / 接近风险 / 高风险。没有可用历史参考、历史读取不完整或测量不可靠时，会明确显示未知/未校准，而不是硬算成低风险。

另一个重点是续接：插件复制的是一条元提示词，让当前 GPT 根据本会话和实际可见的项目上下文，自主生成一份自包含的续接内容；用户再把生成结果复制到新会话。这样保留的是最新目标、已确认决定、约束、已排除方案、技术状态、未解决问题和下一步，而不是机械搬运全部聊天记录。

本地处理，不需要 OpenAI API Key，聊天原文不上传到 LongChat Guard 分析服务器。

判断方法：
https://luobo656.github.io/longchat-guard/zh/methodology/

源码：
https://github.com/luobo656/longchat-guard

Chrome：
https://chromewebstore.google.com/detail/longchat-guard/njeoedopjhefbhgllpjadjkljpnfioop

欢迎挑逻辑问题，尤其是长期用一个 ChatGPT 会话做项目的人，你们一般什么时候决定换新线程？

---

## X / Twitter

Long ChatGPT threads are useful — until you realize too late that the working state should have been handed off.

I built LongChat Guard 2.1.0: local empirical risk warnings, no fake “official quota”, and a continuation meta-prompt that lets the current GPT generate a self-contained handoff.

Method: https://luobo656.github.io/longchat-guard/methodology/
Source: https://github.com/luobo656/longchat-guard

---

## LinkedIn

Long-running AI conversations create a new workflow problem: not just context capacity, but deciding when the working state has become expensive to carry.

LongChat Guard is an open-source Chrome/Edge extension that uses local empirical evidence—current load, a user-confirmed historical length-limit reference, and whole-turn growth—to provide a simple risk signal and a structured handoff workflow.

The design intentionally avoids presenting a browser-side estimate as an official OpenAI quota.

Methodology: https://luobo656.github.io/longchat-guard/methodology/
Project: https://github.com/luobo656/longchat-guard
