# Chrome Web Store - en

## Name

LongChat Guard

## Short Description

Local ChatGPT long-conversation risk warnings and handoff help; no official quota, no chat upload.

## Long Description

LongChat Guard is a local-first Chrome extension for long ChatGPT conversations on `chatgpt.com`. It helps you judge when a working thread is getting long enough that it is worth organizing the current state and continuing in a fresh chat.

It is not an official OpenAI quota, token counter, or context-window meter. LongChat Guard uses only browser-local empirical evidence. Without a usable local failure reference it shows “Not calibrated” instead of pretending the conversation is low risk.

Calibration is one step: open a historical chat that you personally know reached the conversation-length limit and choose “Calibrate with this chat.” If the full history can be read reliably, the extension establishes a strong or conservative local empirical reference. If the scan is incomplete or unreliable, it fails closed and does not create a usable reference.

After calibration, the risk signal combines the current locally measurable conversation load, the unsent Composer draft, and a reserve learned from reliable whole-turn growth. The UI intentionally uses simple states — Lower risk / Long / Near risk / High risk — rather than exact tokens, percentages, remaining quota, or a claimed universal limit.

For handoff, “Copy continuation prompt” copies a meta-instruction for the current GPT. When you paste it into the current conversation, GPT is asked to use the actual conversation and visible project context to produce a self-contained continuation context: current goal, confirmed decisions, constraints, completed work, rejected approaches, unresolved issues, technical state, and the next concrete action. You then copy that generated handoff into a fresh chat. The extension does not auto-transfer chats or upload the conversation.

The “More” menu also provides “Read full current chat” at any time. This refreshes the local measurement for the current conversation without changing the empirical alert reference.

Key features:
- local empirical warning for long ChatGPT conversations;
- colored risk track only when measurement and calibration are reliable;
- pre-send risk changes from a very large Composer draft;
- whole-turn growth learning from reliable before/after observations;
- one-step calibration with a user-confirmed historical limit chat;
- full-read recovery for ordinary historical chats without changing calibration;
- continuation meta-prompt for generating a high-quality, self-contained handoff;
- per-conversation mute/restore controls;
- English, Simplified Chinese, and Traditional Chinese UI.

Privacy is local-first. Monitoring starts only after affirmative consent. Visible ChatGPT content and Composer text are processed transiently in the browser for the warning function. Raw user messages, assistant responses, Composer drafts, attachment/file bodies, and tool-result text are not persisted or uploaded to a LongChat Guard analysis server. Stored conversation identifiers are install-salted SHA-256 pseudonymous identifiers rather than raw ChatGPT conversation IDs. No OpenAI API key is required.

## Single Purpose

Provide local long-conversation risk warnings and handoff assistance for `chatgpt.com`.

## Permissions

- `storage`: stores local pseudonymous fingerprints, internal estimates, empirical calibration metadata, whole-turn growth samples, and reminder settings.
- `https://chatgpt.com/*`: runs only on the supported ChatGPT website.

## Unofficial Notice

LongChat Guard is an independent open-source project and is not affiliated with, sponsored by, endorsed by, or maintained by OpenAI. “ChatGPT” identifies the supported website and use case only.

## Listing Links

- Official website: https://luobo656.github.io/longchat-guard/
- Privacy policy: https://luobo656.github.io/longchat-guard/PRIVACY.md
- Source code: https://github.com/luobo656/longchat-guard
- Support / issues: https://github.com/luobo656/longchat-guard/issues
