# LongChat Guard 2.1.1 — Privacy-first ChatGPT long-conversation warning & handoff

**A stable local-first extension for long ChatGPT work sessions.** Use empirical local evidence to know when a conversation is worth organizing, and ask your current GPT for a self-contained handoff to a new chat.

## What it does

- **Empirical conversation-risk warning.** Compare reliable locally measurable conversation load with a historical length-limit chat *you personally confirm*.
- **Fail-closed honesty.** Without usable calibration or a complete current measurement, the extension says it cannot assess risk. It never invents an official OpenAI token quota.
- **Pre-send awareness.** Includes the unsent composer draft in an in-memory risk assessment.
- **Handoff workflow.** Copy a meta-prompt for the current GPT to generate a complete, actionable continuation context, then paste that result into a new chat.
- **Local privacy.** Raw chat messages, drafts and attachments are not uploaded to a LongChat Guard analysis service or persisted as raw text.
- **Three languages.** English, Simplified Chinese and Traditional Chinese.

## What's improved in v2.1.1

This release focuses on production readiness and efficiency, not new permissions or a changed risk model.

- Removed obsolete diagnostic-export persistence and related UI/export infrastructure.
- Reduced repeated full-page work during typing and irrelevant DOM mutations.
- Avoided redundant visual redraws during long conversations.
- Preserved one-step user-confirmed calibration, complete-read recovery, Project new-chat tracking and fail-closed checks.

Permissions remain `storage` and `https://chatgpt.com/*`. No backend or API key is required.

## Install and learn

- [Official website](https://luobo656.github.io/longchat-guard/)
- [Chrome Web Store](https://chromewebstore.google.com/detail/longchat-guard/njeoedopjhefbhgllpjadjkljpnfioop) (availability of this update is subject to store review)
- [Quick-start and methodology](https://luobo656.github.io/longchat-guard/methodology/)
- [Source code](https://github.com/luobo656/longchat-guard)
- [Privacy policy](https://luobo656.github.io/longchat-guard/PRIVACY.md)

The attached `longchat-guard-v2.1.1.zip` is the audited extension package, identical in content to `LongChat-Guard-2.1.1-store.zip`.

LongChat Guard is independently developed and not affiliated with, sponsored by, or endorsed by OpenAI.
