# I built a local warning for ChatGPT conversations that get too long — without pretending to know the official limit

Long ChatGPT threads are useful for coding, research, writing, planning, and projects because they accumulate decisions and working context.

That strength creates a practical problem: **when is the thread getting risky enough that I should organize the working state and continue in a fresh conversation?**

I could not find a browser-side signal I was comfortable calling an “official remaining quota”. So I built **LongChat Guard**, an open-source Chrome/Edge extension that takes a deliberately different approach.

## It does not claim an official token limit

LongChat Guard 2.0.2 does not show an exact token counter, a fake remaining percentage, or a universal ChatGPT conversation maximum.

Instead it learns from evidence in the user’s own browser:

- conversations that completed safely;
- user-confirmed conversation-length failures;
- typical growth of recent assistant replies.

Internally I describe these as current load (L), safe boundary (S), failure boundary (F), and dynamic reply-growth buffer (B).

When enough evidence exists, the warning asks: **if this conversation grows by another one, two, or three typical reply steps, how close would it be to the failure region this browser has actually observed?**

That produces simple states: Normal, Long, Near risk, and High risk.

## Why not use a fixed threshold?

A fixed threshold is easy to implement and easy to explain. It also creates false precision when the browser extension does not have an authoritative OpenAI “conversation remaining” value.

The current design prefers uncertainty over invented confidence:

- a new install does not start half full;
- incomplete history does not count as risk;
- low confidence does not inflate risk;
- unreliable parsing fails closed;
- one strange observation does not immediately erase the learned environment.

## The other half is handoff

The warning is only useful if the user knows what to do next.

LongChat Guard includes a continuation prompt designed to preserve a working state rather than copy an entire transcript. The useful handoff is usually:

- current objective;
- confirmed decisions;
- important constraints;
- file/code/data state;
- unresolved issues;
- next concrete steps.

That is much easier to verify in a fresh conversation than dumping thousands of lines of old chat.

## Privacy model

The extension starts monitoring only after affirmative consent.

Visible ChatGPT conversation content is processed locally in the browser. Raw user messages, assistant replies, composer drafts, and attachment body text are not persisted. There is no LongChat Guard conversation-analysis server and no OpenAI API key is required.

## What category is this?

There are several useful kinds of “long chat” extensions:

- navigation/search;
- bookmarks;
- page cleanup/trimming;
- export/archive;
- risk warning and handoff.

LongChat Guard is intentionally in the last category. I do not want it to become a giant toolbar that does everything.

## Try it / inspect it

Website: https://luobo656.github.io/longchat-guard/

Methodology: https://luobo656.github.io/longchat-guard/methodology/

Chrome Web Store: https://chromewebstore.google.com/detail/longchat-guard/njeoedopjhefbhgllpjadjkljpnfioop

Source: https://github.com/luobo656/longchat-guard

It is independent open-source software and is not an official OpenAI extension.

I would especially value feedback from people who maintain long coding, research, writing, or planning conversations: what signal would make you decide to hand off before the thread becomes painful?
