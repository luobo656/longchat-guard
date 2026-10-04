# Microsoft Edge Add-ons - en

## Name

LongChat Guard

## Short Description

Local, privacy-first warnings when a ChatGPT conversation is getting long.

## Description

LongChat Guard is a local-first Microsoft Edge extension for long ChatGPT conversations on `chatgpt.com`. It gives empirical risk warnings so you can organize, summarize, or continue in a fresh chat before a long thread reaches a locally observed failure area.

It is not an official OpenAI quota or context-window meter. Without a usable local empirical failure reference, the extension says “Not calibrated” rather than “Normal” and hides the full risk track.

Calibration is one explicit action: open a historical chat that you personally know reached the conversation-length limit and click “Calibrate with this chat”. One reliable full-history scan establishes a strong local reference, or a conservative reference when attachments/tool context cannot be measured precisely. Unreliable scans do not create a usable reference.

After calibration, risk combines the current locally measurable conversation load, the unsent Composer draft, and whole-turn growth learned from reliable before/after conversation-load changes. The UI shows simple states such as Normal, Long, Near risk, and High risk without exact token counts, percentages, remaining quota, or an official limit.

Monitoring starts only after affirmative consent. Visible ChatGPT text and Composer drafts are processed transiently in the browser. Raw chat, draft, attachment/file, and tool-result text is not persisted or transmitted. Stored conversation identifiers are install-salted SHA-256 pseudonymous identifiers. No OpenAI API key is required.

## Single Purpose

Provide local long-conversation risk warnings on `chatgpt.com`.

## Permissions

- `storage`: pseudonymous local fingerprints, internal estimates, empirical calibration metadata, whole-turn growth samples, and reminder controls.
- `https://chatgpt.com/*`: runs only on the supported ChatGPT website.

## Unofficial Notice

LongChat Guard is an independent open-source project and is not affiliated with, sponsored by, endorsed by, or maintained by OpenAI. “ChatGPT” identifies the supported website and use case only.

## Listing Links

- Official website: https://luobo656.github.io/longchat-guard/
- Privacy policy: https://luobo656.github.io/longchat-guard/PRIVACY.md
- Source code: https://github.com/luobo656/longchat-guard
- Support / issues: https://github.com/luobo656/longchat-guard/issues
