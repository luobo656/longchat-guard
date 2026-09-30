# Privacy Disclosure

## Data Collection

The extension processes conversation content locally in the user's browser after affirmative consent. No conversation data is collected by, or transmitted to, a developer-controlled server; the extension has no server component.

## Local Processing

Before any conversation text is read, the extension displays an in-product disclosure and requires the user to choose “Agree and start / 同意并开始”. If the user chooses “Not now / 暂不开启”, monitoring remains disabled. After consent, visible conversation text may be read transiently by the content script for local length estimation and anonymous fingerprinting. Raw text is not persisted.
A successful history scan leaves no diagnostic record. If a history scan fails, the extension may keep only the failure reason and a small bounded set of scrolling/structure metrics locally for up to 7 days; the diagnostic record does not include the conversation URL, raw chat text, or raw message fingerprints.

## Local Storage

Stored locally:

- Install salt
- Anonymous message fingerprints
- Internal token and character estimates
- Coverage/parser metadata
- Learned safe/failure boundary metadata and recent assistant-growth estimates
- Reminder controls
- On scan failure only: a bounded structural diagnostic summary that contains no URL or raw chat text and expires after 7 days

Not stored:

- Raw user messages
- Raw assistant responses
- Composer drafts
- Attachment contents
- Names, emails, or API keys

## Sharing

No chat content is uploaded, sold, shared, used for advertising, or made available for human review by the developer. Local processing is limited to the extension's single purpose: long-conversation trend warnings.

## User Control and Deletion

Users can decline the initial disclosure. Uninstalling the extension removes extension-local data from the browser; users can also clear the extension's local storage with browser extension/developer storage controls. There is no developer-side server copy.
