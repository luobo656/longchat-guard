# Review Notes

## Single Purpose

LongChat Guard provides local long-conversation risk warnings and user-controlled handoff assistance on `https://chatgpt.com/*`.

On first use, before reading conversation content, the extension presents an in-product privacy disclosure. Monitoring begins only after the user affirmatively chooses “Agree and start / 同意并开始 / 同意並開始”. Choosing “Not now / 暂不开启 / 暫不啟用” leaves monitoring disabled.

## Permissions

The extension requests only:

- `storage`
- host permission for `https://chatgpt.com/*`

It does not request `<all_urls>`, cookies, history, webRequest, tabs, or scripting.

## No Remote Backend

There is no server, fetch/XHR analytics backend, OpenAI API integration, or API key.

## Local User Data Handling

After consent, visible ChatGPT text and the unsent Composer draft may be processed transiently in the browser for local estimates and empirical risk. Raw conversation text, assistant text, Composer text, attachment/file contents, and tool/search result text are not persisted and are not transmitted.

Stored identifiers are install-salted SHA-256 **pseudonymous** conversation identifiers and pseudonymous message fingerprints. The extension also stores local measurement/calibration metadata, whole-turn growth samples, and reminder controls. The production extension does not persist or export runtime/history-scan diagnostics.

## No Official Quota Claims

LongChat Guard does not display token counts, percentages, K values, remaining quota, or an official OpenAI context limit.

Risk becomes determinate only after the current chat is measured reliably and the user has a usable local empirical failure reference. Without that reference the UI says “Not calibrated / 未校准 / 未校準” rather than “Lower risk / 风险较低 / 風險較低”, and the full green-to-red risk track is hidden. Any readable model label is retained only as optional diagnostic metadata and does not determine risk or calibration validity.

A user can establish the local empirical reference by opening a historical chat they personally know reached the conversation-length limit and clicking “Calibrate with this chat / 用此会话校准 / 用此對話校準” once. The extension scans the full history once and either stores a strong/conservative local reference or reports that the sample could not be measured reliably.

The overflow menu always exposes “Read full current chat / 完整读取当前会话 / 完整讀取目前對話”. This user-initiated measurement action updates only the current conversation ledger/load; it does not create or modify the empirical failure reference, calibration samples, generation, or growth samples.

Whole-turn growth is learned from reliable before/after conversation-load deltas. It is not an OpenAI-provided quota or official limit. The continuation action only copies a local meta-prompt: after the user pastes it into the current ChatGPT conversation, the current GPT generates a self-contained handoff from the conversation/project context it can actually see; the extension does not auto-transfer or upload conversation content.

## Localization / Brand

The canonical brand is always `LongChat Guard`. Localized display names are `LongChat Guard` (English), `LongChat Guard · 长会话预警` (Simplified Chinese), and `LongChat Guard · 長對話預警` (Traditional Chinese).

## Trademark Notice

The icon is original and does not use OpenAI or ChatGPT logos. LongChat Guard is not affiliated with OpenAI.
