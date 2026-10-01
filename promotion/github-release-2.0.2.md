# LongChat Guard 2.0.2 — Local long-conversation risk warnings for ChatGPT

LongChat Guard 2.0.2 is the first release where the product, risk model, localization, and public documentation are aligned around one principle:

**warn from local evidence instead of pretending to know an official OpenAI quota.**

## What changed

### Local L / S / F / B risk model
The 2.x engine separates four concepts:

- **L — current load:** an internal estimate of the current conversation load.
- **S — confirmed safe boundary:** established only by complete, healthy successful conversations.
- **F — confirmed failure boundary:** established only from user-confirmed conversation-length failures and made robust across multiple observations.
- **B — dynamic reply-growth buffer:** learned from recent assistant-reply growth.

When enough evidence exists, LongChat Guard asks a practical question: how many typical reply-growth steps remain before the locally observed failure region?

It does not expose these internal values as an official token quota.

### No fake cold-start risk
A new install, incomplete page history, or low-confidence observation does not artificially push a short chat toward “high risk”. If the page parser is unreliable, LongChat Guard fails closed instead of inventing confidence.

### Environment-change learning
Independent evidence that materially conflicts with an older learned environment can start a new learning generation, while previous evidence remains only weak guidance.

### Three-language product
Official extension localization:
- English: **LongChat Guard**
- 简体中文: **LongChat Guard · 长会话预警**
- 繁體中文: **LongChat Guard · 長對話預警**

The canonical brand “LongChat Guard” is never translated.

### Finalized icon
Transparent background, green chat-bubble main shape, white conversation lines, and orange shield.

### Privacy
Monitoring starts only after affirmative consent. Raw chat text, assistant reply text, composer drafts, and attachment body text are not persisted. LongChat Guard does not operate a conversation-analysis backend and does not require an OpenAI API key.

## Links

- Website: https://luobo656.github.io/longchat-guard/
- Methodology: https://luobo656.github.io/longchat-guard/methodology/
- Chrome Web Store: https://chromewebstore.google.com/detail/longchat-guard/njeoedopjhefbhgllpjadjkljpnfioop
- Source: https://github.com/luobo656/longchat-guard

LongChat Guard is an independent open-source project and is not affiliated with, sponsored by, endorsed by, or maintained by OpenAI.
