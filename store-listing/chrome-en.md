# Chrome Web Store - en

## Name

LongChat Guard

## Short Description

Local, privacy-first warnings when a ChatGPT conversation is getting long.

## Long Description

LongChat Guard is a local-first Chrome extension for long ChatGPT conversations on `chatgpt.com`. It helps you notice when a conversation is getting long and approaching a risk area learned from your own browser-side usage, so you can organize, summarize, or continue in a fresh chat before the thread becomes difficult to manage.

The extension learns from local evidence rather than pretending to know an official quota. It uses confirmed safe conversations, confirmed conversation-length failures, and your typical assistant-reply growth to make simple states such as Normal, Long, Near risk, and High risk. It does not show exact token counts, percentages, remaining quota, or an official OpenAI conversation limit.

Useful actions are kept simple:
- a color risk track with a current-position marker;
- a continuation prompt for moving important working context into a fresh ChatGPT conversation;
- optional one-time scanning of an older conversation while the local boundary is still being learned;
- relearning when the environment changes;
- mute/restore alerts for the current conversation.

Privacy is local by design. Monitoring starts only after affirmative consent. Visible ChatGPT conversation content is processed transiently in the browser for local estimation and anonymous local fingerprinting. Raw chat text is not persisted or uploaded to the developer, a LongChat Guard server, or a third party. No OpenAI API key is required.

LongChat Guard is useful for people searching for a ChatGPT long-conversation warning, conversation-length monitor, context-window risk reminder, long-chat guard, or a privacy-first ChatGPT browser extension.

## Single Purpose

Provide local long-conversation risk warnings on `chatgpt.com` so users can organize and continue long chats at the right time.

## Permission Rationale

- `storage`: stores anonymous local fingerprints, internal estimates, learned boundary metadata, and reminder controls.
- `https://chatgpt.com/*`: runs the extension only on the supported ChatGPT website.

## Unofficial Notice

LongChat Guard is an independent open-source project. It is not affiliated with, sponsored by, endorsed by, or maintained by OpenAI. “ChatGPT” is used only to identify the supported website and use case.

## Listing Links

- Official website: https://luobo656.github.io/longchat-guard/
- Privacy policy: https://luobo656.github.io/longchat-guard/PRIVACY.md
- Source code: https://github.com/luobo656/longchat-guard
- Support / issues: https://github.com/luobo656/longchat-guard/issues
