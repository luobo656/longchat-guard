# Chrome Web Store - en

## Name

ChatGPT Conversation Guard

## Short Description

Local long-conversation trend warning for chatgpt.com, with no exact quota claims.

## Long Description

ChatGPT Conversation Guard is a local-only browser extension for `chatgpt.com`. It does not read official OpenAI quotas and does not show exact token counts, percentages, K values, remaining limits, or official conversation limits.

The extension estimates conversation length trends locally and uses local calibration signals to warn when a conversation appears long or near a learned risk area. The panel offers a continuation prompt, relearning for the current environment, and per-conversation mute.

Before monitoring starts, the extension discloses its data handling and requires affirmative consent. After consent, visible ChatGPT conversation content is read transiently in the browser only for local length estimation and anonymous local fingerprinting. Raw conversation text is not persisted and is never transmitted to the developer or a third party. Choosing “Not now” keeps monitoring disabled.

## Single Purpose

Provide local long-conversation trend warnings on `chatgpt.com` so users can organize and continue before a conversation becomes too long.

## Permission Rationale

- `storage`: stores anonymous local fingerprints, internal estimates, calibration metadata, and reminder controls.
- `https://chatgpt.com/*`: runs the content script only on ChatGPT web pages.

## Unofficial Notice

This extension is not an official OpenAI product and is not sponsored, endorsed, or maintained by OpenAI. `ChatGPT` is used only to identify the supported website.
