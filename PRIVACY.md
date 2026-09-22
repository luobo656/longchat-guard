# Privacy Policy

ChatGPT Conversation Guard is a local browser extension for `chatgpt.com`.

Before the extension reads or processes visible ChatGPT conversation content for the first time, it presents an in-product privacy disclosure and requires the user to choose **“同意并开始 / Agree and start.”** Choosing “暂不开启 / Not now” keeps monitoring disabled.

## Data Processing

After affirmative consent, the extension reads visible page text only inside the content script so it can estimate local conversation length trends and create anonymous local fingerprints. Raw text is processed transiently in memory. Before consent, conversation text is not read, fingerprinted, token-estimated, or added to the local conversation ledger.

## Data Stored Locally

The extension may store:

- Local install salt
- Anonymous message fingerprints
- Internal token and character estimates
- Branch, coverage, and parser health metadata
- Local calibration metadata
- Per-conversation reminder controls

## Data Not Stored

The extension must not persist:

- User chat text
- Assistant response text
- Composer draft text
- Attachment text
- Names or email addresses
- API keys

## Data Sharing

Conversation content and locally derived extension data are never transmitted to the developer or to an extension server. The extension has no server component, no cloud sync, no advertising data pipeline, and no OpenAI API integration. Local data is used only to provide the extension's single purpose: local long-conversation trend warnings.

## User Control and Deletion

Users can decline the initial disclosure and leave monitoring disabled. Uninstalling the extension removes its extension-local data from the browser. Users may also clear the extension's local storage using browser extension/developer storage controls. The developer does not hold a server-side copy because the extension sends no conversation data to the developer.

## Chrome Web Store Limited Use

Data access is limited to providing and improving the extension's single user-facing purpose. Conversation data is not used for advertising, profiling, creditworthiness, data brokerage, or unrelated purposes, and is not made available for human review by the developer.

## Official Relationship

This project is not affiliated with, endorsed by, or sponsored by OpenAI. `ChatGPT` is used only to identify the supported website.
