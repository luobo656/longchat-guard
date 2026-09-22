# Microsoft Edge Add-ons - en

## Name

LongChat Guard for ChatGPT

## Short Description

ChatGPT long-conversation warning and context-risk monitor that runs locally in Edge.

## Description

LongChat Guard is a privacy-first Microsoft Edge extension for ChatGPT long-conversation warnings, conversation-length monitoring, context-risk reminders, and long-chat continuation on `chatgpt.com`.

It helps users notice when a ChatGPT web conversation is getting long and may be worth organizing, summarizing, or continuing in a fresh conversation. It uses local trend judgment and local calibration only.

It does not show exact token counts, percentages, K values, remaining quota, or official limits. It does not require an OpenAI API key and does not upload chat content.

Before monitoring starts, the extension explains its data handling and requires affirmative consent. After consent, visible ChatGPT conversation content is processed transiently in the browser for local trend estimation and anonymous local fingerprinting. Raw conversation text is not persisted or transmitted. Choosing “Not now” keeps monitoring disabled.

## Single Purpose

Provide local long-conversation trend warnings on `chatgpt.com`.

## Permissions

- `storage`: local anonymous calibration data and reminder controls.
- `https://chatgpt.com/*`: content script for the supported website only.

## Unofficial Notice

This is not an official OpenAI or ChatGPT product. `ChatGPT` identifies the supported website only.

## Listing Links

- Official website: https://luobo656.github.io/longchat-guard/
- Privacy policy: https://luobo656.github.io/longchat-guard/PRIVACY.md
- Source code: https://github.com/luobo656/longchat-guard
- Support / issues: https://github.com/luobo656/longchat-guard/issues
