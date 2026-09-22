# Microsoft Edge Add-ons - en

## Name

LongChat Guard for ChatGPT

## Short Description

Local trend warning for long chatgpt.com conversations without exact quota claims.

## Description

LongChat Guard helps users notice when a ChatGPT web conversation is getting long and may be worth organizing or continuing elsewhere. It uses local trend judgment and local calibration only.

It does not show exact token counts, percentages, K values, remaining quota, or official limits. It does not require an OpenAI API key and does not upload chat content.

Before monitoring starts, the extension explains its data handling and requires affirmative consent. After consent, visible ChatGPT conversation content is processed transiently in the browser for local trend estimation and anonymous local fingerprinting. Raw conversation text is not persisted or transmitted. Choosing “Not now” keeps monitoring disabled.

## Single Purpose

Provide local long-conversation trend warnings on `chatgpt.com`.

## Permissions

- `storage`: local anonymous calibration data and reminder controls.
- `https://chatgpt.com/*`: content script for the supported website only.

## Unofficial Notice

This is not an official OpenAI or ChatGPT product. `ChatGPT` identifies the supported website only.
