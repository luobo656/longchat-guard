# Chrome Web Store - en

## Name

LongChat Guard

## Short Description

Local, privacy-first warnings when a ChatGPT conversation is getting long.

## Long Description

LongChat Guard is a local-first Chrome extension for long ChatGPT conversations on `chatgpt.com`. It provides empirical risk warnings so you can organize, summarize, or continue in a fresh chat before a long thread reaches a locally observed failure area.

It is not an official OpenAI quota or context-window meter. Without a usable local empirical failure reference the extension says “Not calibrated” rather than “Normal” and hides the full green-to-red risk track.

To calibrate, open a historical chat that you personally know reached the conversation-length limit and click “Calibrate with this chat” once. One reliable full-history scan establishes either a strong local reference or a conservative reference when attachments/tool context cannot be measured precisely. Unreliable scans do not create a usable reference.

Once calibrated, LongChat Guard combines the current locally measurable chat load, the unsent Composer draft, and whole-turn growth learned from reliable before/after conversation-load changes. It shows simple states such as Normal, Long, Near risk, and High risk without displaying exact token counts, percentages, remaining quota, or an official OpenAI limit.

Useful actions include:
- a calibrated color risk track;
- pre-send risk updates while typing a long Composer draft;
- a continuation prompt for moving important working context into a fresh ChatGPT conversation;
- one-step calibration with a user-confirmed historical limit chat;
- recalibration when a reference may no longer apply;
- mute/restore alerts for the current conversation.

Privacy is local by design. Monitoring starts only after affirmative consent. Visible ChatGPT content and Composer drafts are processed transiently in the browser. Raw chat, draft, attachment, file, and tool-result text is not persisted or uploaded. Stored conversation identifiers are install-salted SHA-256 pseudonymous identifiers. No OpenAI API key is required.

## Single Purpose

Provide local long-conversation risk warnings on `chatgpt.com` so users can organize and continue long chats at the right time.

## Permission Rationale

- `storage`: stores pseudonymous local fingerprints, internal estimates, empirical calibration metadata, whole-turn growth samples, and reminder controls.
- `https://chatgpt.com/*`: runs the extension only on the supported ChatGPT website.

## Unofficial Notice

LongChat Guard is an independent open-source project. It is not affiliated with, sponsored by, endorsed by, or maintained by OpenAI. “ChatGPT” is used only to identify the supported website and use case.

## Listing Links

- Official website: https://luobo656.github.io/longchat-guard/
- Privacy policy: https://luobo656.github.io/longchat-guard/PRIVACY.md
- Source code: https://github.com/luobo656/longchat-guard
- Support / issues: https://github.com/luobo656/longchat-guard/issues
