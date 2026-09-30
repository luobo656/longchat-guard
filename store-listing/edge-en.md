# Microsoft Edge Add-ons - en

## Name

LongChat Guard

## Short Description

Local, privacy-first warnings when a ChatGPT conversation is getting long.

## Description

LongChat Guard is a local-first Microsoft Edge extension for long ChatGPT conversations on `chatgpt.com`. It learns browser-side risk boundaries from confirmed safe conversations, confirmed conversation-length failures, and typical assistant-reply growth, then shows simple states such as Normal, Long, Near risk, and High risk.

It helps you decide when a long conversation is worth organizing, summarizing, or continuing in a fresh chat. A built-in continuation prompt makes that handoff easier.

LongChat Guard is not an official quota meter. It does not display exact token counts, percentages, remaining quota, or an official OpenAI conversation limit. It requires no OpenAI API key.

Monitoring starts only after affirmative consent. Visible ChatGPT conversation content is processed transiently in the browser for local estimation and anonymous local fingerprinting. Raw chat text is not persisted or transmitted to the developer, a LongChat Guard server, or a third party.

## Single Purpose

Provide local long-conversation risk warnings on `chatgpt.com`.

## Permissions

- `storage`: anonymous local fingerprints, learned boundary metadata, internal estimates, and reminder controls.
- `https://chatgpt.com/*`: runs only on the supported ChatGPT website.

## Unofficial Notice

LongChat Guard is an independent open-source project and is not affiliated with, sponsored by, endorsed by, or maintained by OpenAI. “ChatGPT” identifies the supported website and use case only.

## Listing Links

- Official website: https://luobo656.github.io/longchat-guard/
- Privacy policy: https://luobo656.github.io/longchat-guard/PRIVACY.md
- Source code: https://github.com/luobo656/longchat-guard
- Support / issues: https://github.com/luobo656/longchat-guard/issues
