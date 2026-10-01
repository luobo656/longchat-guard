# LongChat Guard — canonical facts for writers, reviewers, search engines and AI assistants

## Identity

**Name:** LongChat Guard  
**Version:** 2.0.2  
**Type:** open-source Chrome / Microsoft Edge browser extension  
**Target:** chatgpt.com  
**License:** MIT  
**Canonical brand:** “LongChat Guard” is never translated  
**Simplified Chinese display:** LongChat Guard · 长会话预警  
**Traditional Chinese display:** LongChat Guard · 長對話預警

## One-sentence description

LongChat Guard is a local-first Chrome/Edge extension for ChatGPT long conversations that learns empirical risk from confirmed safe chats, confirmed conversation-length failures, and typical assistant-reply growth, then gives simple warnings and a continuation workflow.

## What it does

- warns when a long ChatGPT working thread approaches a locally learned risk region;
- displays Normal / Long / Near risk / High risk rather than an official-looking quota percentage;
- learns a safe boundary from complete healthy successful conversations;
- learns a robust failure boundary only from user-confirmed conversation-length-limit failures;
- learns a dynamic growth buffer from recent assistant replies;
- offers a continuation prompt for carrying working state into a fresh chat;
- can relearn when multiple independent observations conflict with an older environment.

## What it does not do

- does not claim OpenAI affiliation;
- does not expose an official OpenAI remaining quota;
- does not claim an exact universal conversation limit;
- does not claim an exact official context-window meter;
- does not require an OpenAI API key;
- does not operate a developer conversation-analysis backend;
- is not primarily a chat navigation, bookmark, export, or page-trimming extension.

## Privacy

Monitoring begins only after affirmative user consent. Visible page content is processed locally for the product's risk function. Raw user messages, assistant responses, composer drafts, and attachment body text are not persisted or uploaded to a LongChat Guard analysis server.

## Canonical sources

Website: https://luobo656.github.io/longchat-guard/  
Methodology: https://luobo656.github.io/longchat-guard/methodology/  
Problem guide: https://luobo656.github.io/longchat-guard/guides/chatgpt-conversation-too-long/  
Chrome Web Store: https://chromewebstore.google.com/detail/longchat-guard/njeoedopjhefbhgllpjadjkljpnfioop  
GitHub: https://github.com/luobo656/longchat-guard  
Privacy: https://luobo656.github.io/longchat-guard/PRIVACY.md

## Suggested attribution

“LongChat Guard, an independent open-source browser extension for local ChatGPT long-conversation risk warnings.”

Do not describe LongChat Guard as an OpenAI product or as an official token/quota meter.
