# Review Notes

## Single Purpose

The extension provides local long-conversation trend warnings on `https://chatgpt.com/*`.

On first use, before reading conversation content, the extension presents an in-product privacy disclosure. Monitoring begins only after the user affirmatively selects “Agree and start / 同意并开始”. Selecting “Not now / 暂不开启” leaves monitoring disabled.

## Permissions

The extension requests only:

- `storage`
- host permission for `https://chatgpt.com/*`

It does not request `<all_urls>`, cookies, history, webRequest, tabs, or scripting.

## No Remote Backend

There is no server, no fetch/XHR backend call, no OpenAI API integration, and no API key.

## Local User Data Handling

Visible ChatGPT conversation text is processed transiently in the user's browser only after affirmative consent. Raw conversation text, assistant text, composer drafts, and attachment text are not persisted. No conversation data is transmitted to the developer or a server. Locally stored anonymous fingerprints, learned boundary metadata, and assistant-growth estimates are used only for the extension's single purpose. Successful history scans leave no diagnostic record; a failed scan can retain a bounded local structural diagnostic for up to 7 days with no conversation URL or raw chat text.

## No Official Quota Claims

The UI does not display token counts, percentages, K values, remaining quota, or official limits. LongChat Guard learns empirical browser-side safe/failure boundaries and typical assistant-reply growth, then shows simple local risk states. These are not OpenAI-provided limits.

## Localization / Brand

The canonical brand is always `LongChat Guard`. Localized display names are `LongChat Guard` (English), `LongChat Guard · 长会话预警` (Simplified Chinese), and `LongChat Guard · 長對話預警` (Traditional Chinese). The brand itself is not translated. All three locales use Manifest V3 i18n resources.

## Trademark Notice

The icon is original and does not use OpenAI or ChatGPT logos. The extension is not affiliated with OpenAI.
