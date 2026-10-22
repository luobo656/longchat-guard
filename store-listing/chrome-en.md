# Chrome Web Store - en

## Name

LongChat Guard

## Short Description

Local ChatGPT long-chat alerts and handoff: one-click history reading, empirical risk estimates, no official quota or chat upload.

## Long Description

LongChat Guard helps you recognize when a ChatGPT conversation may be getting too long, so you can organize important context before moving to a fresh chat. It uses local observations and a conversation-length reference that you establish from your own history. It does not claim to know an official OpenAI quota.

ONE-CLICK AUTOMATIC READING
Choose “Read full current chat” to automatically scroll through and load older messages without manual navigation. Open a historical chat you personally know reached its conversation-length limit and choose “Calibrate with this chat” to establish a local empirical reference. The original reader checks message continuity and completeness before accepting a result. Incomplete reads are not saved; you can cancel at any time.

CLEAR RISK WARNINGS
After reliable calibration and measurement, LongChat Guard displays simple states such as Lower risk, Long, Near risk, and High risk, with a segmented color track. Without enough evidence, it shows Not calibrated or Unable to assess instead of inventing a safe-looking score.

A PRACTICAL HANDOFF
“Copy continuation prompt” copies an instruction you can paste into your current ChatGPT conversation. The current model can then prepare a self-contained handoff using the conversation and project context it can actually access. The extension does not automatically transfer your conversations or open chats on your behalf.

LOCAL-FIRST PRIVACY
Monitoring begins only after your consent. Raw messages, unsent drafts, attachment contents, and tool outputs are not stored as raw text or uploaded to the extension developer. Local storage retains pseudonymous identifiers, measurements, and empirical reference data. No OpenAI API key is required.

Only when you explicitly start a full read or historical calibration does the extension temporarily use the browser's powerful debugger permission to send simulated mouse-wheel input to the active ChatGPT tab. It detaches when the operation ends or is cancelled. The browser may display a debugging warning. Ordinary risk monitoring does not use the debugger.

WHAT'S NEW IN 4.3.0
One-click automatic full-history reading and calibration; a redesigned reading overlay; improved handling of newly created chats in ChatGPT Projects and length-limit notices; removal of the manual scrolling guide, developer test-log controls, and on-screen version label.

LongChat Guard is independent and is not affiliated with, endorsed by, or sponsored by OpenAI. Warnings are empirical estimates, not official token counts, remaining capacity, or a universal conversation limit.

## Single Purpose

Provide local long-conversation risk warnings and handoff assistance for `chatgpt.com`.

## Permissions

- `storage`: stores local pseudonymous fingerprints, internal estimates, empirical calibration metadata, whole-turn growth samples, and reminder settings.
- `https://chatgpt.com/*`: runs only on the supported ChatGPT website.

- `debugger`: required only for a user-initiated full read or calibration. Sends Chrome DevTools Protocol `Input.dispatchMouseEvent` mouse-wheel events to the active `chatgpt.com` tab; never reads raw messages through the debugger, and detaches promptly. This is a powerful permission and its installation warning may mention all websites even though our implementation operates only on the user-selected ChatGPT tab.

## Unofficial Notice

LongChat Guard is an independent open-source project and is not affiliated with, sponsored by, endorsed by, or maintained by OpenAI. “ChatGPT” identifies the supported website and use case only.

## Listing Links

- Official website: https://luobo656.github.io/longchat-guard/
- Privacy policy: https://luobo656.github.io/longchat-guard/PRIVACY.md
- Source code: https://github.com/luobo656/longchat-guard
- Support / issues: https://github.com/luobo656/longchat-guard/issues
