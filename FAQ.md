# LongChat Guard FAQ

## What is LongChat Guard?

LongChat Guard is an open-source Chrome and Microsoft Edge browser extension for **ChatGPT long-conversation warnings**. It compares the current locally measurable chat load with a user-confirmed historical conversation-length failure reference, learns reliable whole-turn growth, and warns when the current chat approaches that local risk area.

## LongChat Guard 是什么？

LongChat Guard 是一个开源的 Chrome / Edge 浏览器扩展，用于 **ChatGPT 长会话预警、长对话风险提醒和续接**。它把当前本地可测会话负载与用户亲自确认曾达到长度上限的历史会话参考进行比较，并学习可靠的整轮增长，帮助用户在长对话变得难以继续之前及时整理或开启新会话。

## What is the official product name?

The canonical brand is **LongChat Guard** in every language. The localized store display names are **LongChat Guard · 长会话预警** in Simplified Chinese and **LongChat Guard · 長對話預警** in Traditional Chinese. “LongChat Guard” itself is never translated.

## Where can I install LongChat Guard?

The Chrome version is available from the [Chrome Web Store](https://chromewebstore.google.com/detail/longchat-guard/njeoedopjhefbhgllpjadjkljpnfioop). Source code and release packages are available from the [GitHub repository](https://github.com/luobo656/longchat-guard).

## Is LongChat Guard a ChatGPT token counter?

No. LongChat Guard is not an exact ChatGPT token counter and does not claim to know an official OpenAI token limit.

## LongChat Guard 能查看 ChatGPT 官方 token 上限吗？

不能。LongChat Guard 不读取 OpenAI 官方剩余额度，也不会展示精确 token 数、百分比、K 值或所谓官方会话上限。

## Does LongChat Guard monitor the ChatGPT context window?

It monitors **conversation-length and context-risk trends locally**. It can be useful to people searching for a "ChatGPT context window warning" or "context monitor", but it does not claim direct access to OpenAI's official context-window accounting.

## How does LongChat Guard decide that a chat is risky?

It does not use an official OpenAI quota. The core local signals are current measurable load (L), a user-confirmed empirical failure reference (R), and reliable whole-turn growth reserve (G). The current chat, including an unsent Composer draft, is compared with those local signals to produce Lower risk, Long, Near risk, and High risk. A readable model label is diagnostic metadata only and does not determine risk or calibration validity.

## Does LongChat Guard upload my ChatGPT conversations?

No. After affirmative consent, visible conversation text is processed transiently in the browser for local trend estimation. Raw chat content is not uploaded to a LongChat Guard server and is not persisted by the extension.

## Is LongChat Guard privacy friendly?

The project is designed as a local-first, privacy-first browser extension. It has no developer-operated analysis server, requires no OpenAI API key, and keeps its learning/calibration data in browser extension storage.

## Which browsers does LongChat Guard support?

The current project targets Chromium browsers, especially Google Chrome and Microsoft Edge, using Manifest V3.

## Does LongChat Guard work on the ChatGPT website?

Yes. The current supported site is `https://chatgpt.com/*`.

## Is LongChat Guard an official OpenAI or ChatGPT extension?

No. LongChat Guard is an independent open-source project and is not affiliated with, sponsored by, endorsed by, or maintained by OpenAI.

## What problem does LongChat Guard solve?

Long ChatGPT conversations can become difficult to manage. LongChat Guard provides a low-distraction local warning when a conversation is getting long and gives the user a continuation prompt for moving important context into a fresh chat.

## How is LongChat Guard different from chat search, bookmark, export, or page-trimming extensions?

Those tools solve different long-conversation problems. Search and bookmarks help find old messages; export tools create durable copies; page-trimming tools reduce visible clutter. LongChat Guard focuses on the risk-warning and handoff decision: whether the current working thread is still comfortable to continue or is worth summarizing into a fresh conversation.

## What terms describe LongChat Guard?

Accurate search terms include: ChatGPT long conversation warning, ChatGPT long chat warning, conversation length monitor, context window warning, context risk warning, chat context monitor, conversation guard, long chat guard, ChatGPT Chrome extension, ChatGPT Edge extension, local-first ChatGPT extension, privacy-first ChatGPT extension, ChatGPT 长会话预警, ChatGPT 长对话提醒, ChatGPT 会话长度监控, and ChatGPT 上下文窗口提醒.

