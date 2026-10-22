# Privacy Disclosure

## Data Collection

LongChat Guard processes supported ChatGPT page content locally in the user's browser after affirmative consent. No conversation data is collected by, or transmitted to, a developer-controlled server. The extension has no server component.

## Local Processing

Before any conversation text is read, the extension displays an in-product disclosure and requires “Agree and start / 同意并开始 / 同意並開始”. Choosing “Not now / 暂不开启 / 暫不啟用” leaves monitoring disabled.

After consent, the content script may read visible conversation text, visible error messages, the unsent Composer draft, and structural DOM metadata transiently for local load estimation, measurement-quality checks, whole-turn growth learning, and empirical risk calculation. Raw text is not persisted.

Runtime and history-scan diagnostics are not persisted or exported in the production extension. Structural scan information needed for fail-closed decisions exists only transiently during the current scan.

## Local Storage

Stored locally:

- Install salt.
- Install-salted SHA-256 pseudonymous per-conversation identifiers; raw ChatGPT conversation IDs are not stored.
- Pseudonymous message fingerprints and internal load estimates.
- Coverage, parser-health, sequence-reliability, ledger-revision, and observation metadata.
- Current uncertainty-source categories such as attachment/tool/search context, without attachment names, file contents, or tool-result text.
- Internal successful-observation evidence, empirical failure-reference metadata, and whole-turn growth samples.
- Observable measurement-environment metadata such as parser/measurement schema versions and, when reliable, a model hint.
- Per-conversation reminder controls.

Not stored:

- Raw user messages.
- Raw assistant responses.
- Composer draft text.
- Attachment or file contents.
- Tool/search result raw text.
- Names, emails, API keys, or raw ChatGPT conversation IDs.

The locally salted conversation identifier is pseudonymous rather than a claim of absolute anonymity against an attacker with access to the same browser profile and install salt.

## Sharing

No chat content is uploaded, sold, shared, used for advertising, or made available for human review by the developer. Local processing is limited to LongChat Guard's single purpose: local long-conversation risk warnings and user-initiated handoff assistance.

## Permissions

- `storage` for pseudonymous local data and settings;
- `https://chatgpt.com/*` for on-page monitoring;
- `debugger` only for temporary, user-initiated browser-internal wheel input during full reads and historical calibration. This broad permission can display an all-websites warning, although the extension restricts its own operations to the active ChatGPT tab, uses only wheel-input commands and detaches promptly. No conversation text is read through the debugger.

## User Control and Deletion

Users can decline the initial disclosure. Uninstalling the extension removes extension-local data; users can also clear local storage using browser extension/developer controls. There is no developer-side server copy.
