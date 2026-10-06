# LongChat Guard 2.1.0 — Reliable local long-conversation warnings and cleaner handoff

LongChat Guard 2.1.0 is a major reliability and product-model update for long ChatGPT working conversations.

The release keeps the same core promise: **use browser-local evidence instead of pretending to know an official OpenAI quota.**

## Highlights

### A stricter risk model

A determinate risk state now requires a complete current measurement, healthy parsing, reliable message sequence, and a usable current empirical failure reference from a historical conversation the user confirms reached the conversation-length limit. Unknown, partial, stale, or uncalibrated states no longer masquerade as “Lower risk”.

### Stable new-chat tracking

Conversation identity and measurement authority were hardened across ordinary new chats, ChatGPT Project new chats with preassigned conversation routes, assistant streaming/renderer transitions, in-place conversation-ID rebinding, transient root/empty DOM frames, and reloads. Weak transient DOM observations can no longer overwrite a complete authoritative ledger.

### One-step calibration and full-read recovery

“Calibrate with this chat” performs one complete scan of a historical chat the user already knows reached the length limit. “Read full current chat” stays separate and always available from the overflow menu; it refreshes only the current conversation measurement and never changes the empirical failure reference or growth samples.

### Pre-send and whole-turn growth risk

The risk engine includes the unsent Composer draft in memory before send, while never persisting draft text. Growth learning uses reliable whole-turn `L_before -> L_after` samples rather than assistant-only reply length.

### Continuation meta-prompt

The continuation workflow is now dynamic instead of a fixed summary template. The copied meta-prompt tells the current GPT to use the real conversation and any project context it can actually see to generate a self-contained handoff. It prioritizes the latest goal, confirmed decisions, constraints, rejected paths, unresolved issues, technical state, uncertainty, and next action. The user then copies that generated handoff into a fresh chat.

The extension does not auto-transfer conversations or upload chat content.

### Three synchronized languages

Official localization is synchronized across:
- English — **LongChat Guard**
- 简体中文 — **LongChat Guard · 长会话预警**
- 繁體中文 — **LongChat Guard · 長對話預警**

Store descriptions, site copy, privacy/reviewer material, and discovery metadata were updated together.

### Privacy and permissions

No new browser permissions:
- `storage`
- `https://chatgpt.com/*`

Raw user messages, assistant replies, Composer drafts, attachment/file bodies, and tool/search result text are not persisted or uploaded. LongChat Guard has no conversation-analysis backend and does not require an OpenAI API key.

## Validation

Release gates include TypeScript typecheck, the full Vitest suite, production build + dist verification, localized site/sitemap verification, Edge browser E2E, manifest/permission review, and ZIP-content audit.

## Links

- Website: https://luobo656.github.io/longchat-guard/
- Methodology: https://luobo656.github.io/longchat-guard/methodology/
- Chrome Web Store: https://chromewebstore.google.com/detail/longchat-guard/njeoedopjhefbhgllpjadjkljpnfioop
- Source: https://github.com/luobo656/longchat-guard

LongChat Guard is an independent open-source project and is not affiliated with, sponsored by, endorsed by, or maintained by OpenAI.
