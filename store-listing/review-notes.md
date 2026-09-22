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

Visible ChatGPT conversation text is processed transiently in the user's browser only after affirmative consent. Raw conversation text, assistant text, composer drafts, and attachment text are not persisted. No conversation data is transmitted to the developer or a server. Locally stored anonymous fingerprints and calibration metadata are used only for the extension's single purpose.

## No Official Quota Claims

The UI does not display token counts, percentages, K values, remaining quota, or official limits. It only shows fuzzy local trend states.

## Trademark Notice

The icon is original and does not use OpenAI or ChatGPT logos. The extension is not affiliated with OpenAI.
