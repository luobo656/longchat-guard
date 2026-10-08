# Privacy Policy

LongChat Guard is a local browser extension for `chatgpt.com`.

Before the extension reads or processes visible ChatGPT conversation content for the first time, it presents a localized disclosure and requires affirmative consent. Choosing “Not now / 暂不开启 / 暫不啟用” keeps monitoring disabled.

## Data Processing

After affirmative consent, the content script may read visible ChatGPT conversation text, the unsent composer draft, visible error messages, and structural DOM metadata in order to estimate local conversation load, detect measurement quality, learn whole-turn growth, and calculate local empirical risk.

Raw chat text and composer text are processed transiently in memory. They are not persisted as raw text and are not transmitted to LongChat Guard or to the developer.

Runtime and history-scan diagnostics are not persisted or exported in the production extension. Structural scan information needed for fail-closed decisions exists only transiently during the current scan.

## Data Stored Locally

The extension may store:

- A local install salt.
- An install-salted SHA-256 **pseudonymous** per-conversation identifier. The raw ChatGPT conversation ID is not stored.
- Pseudonymous message fingerprints and local load estimates.
- Coverage, parser health, sequence reliability, ledger revision, and observation metadata.
- Current uncertainty-source categories such as attachment/tool/search context; attachment names, file contents, tool-result text, and file data are not stored.
- Internal successful-observation evidence, empirical failure-reference metadata, and whole-turn growth samples.
- Environment metadata limited to measurement/parser schema versions and an optional model hint only when it can be reliably observed from the page. The model hint is diagnostic metadata only; it does not determine the risk level or calibration validity.
- Per-conversation reminder controls.

The pseudonymous identifier reduces direct exposure of the raw conversation ID, but it is not described as absolute anonymity against an attacker who has access to the same browser profile and local install salt.

## Data Not Stored

LongChat Guard must not persist:

- User chat text.
- Assistant response text.
- Composer draft text.
- Attachment or file contents.
- Tool-result/search-result raw text.
- Names or email addresses.
- API keys.
- Raw ChatGPT conversation IDs.

## Data Sharing

Conversation content and locally derived extension data are not transmitted to the developer or to a LongChat Guard server. The extension has no server component, cloud sync, advertising pipeline, or OpenAI API integration.

## Browser Permissions

The Manifest V3 extension uses:

- `storage` for local pseudonymous state, calibration evidence, and settings.
- `https://chatgpt.com/*` so the content script can provide its single user-facing purpose on ChatGPT web pages.

No additional permission is required for LongChat Guard 2.1.1.

## User Control and Deletion

Users may decline the initial disclosure and keep monitoring disabled. Uninstalling the extension removes extension-local data from the browser. Users may also clear the extension's local storage with browser extension/developer controls.

There is no server-side copy held by the developer.

## Browser Store Data Disclosure and Limited Use

For store-disclosure purposes, LongChat Guard accesses **personal communications** and **website content** visibly present on `chatgpt.com` after affirmative consent. Access is local and transient for the extension's long-conversation warning purpose.

Conversation data is not used for advertising, profiling, creditworthiness, data brokerage, or unrelated purposes, and is not made available for human review by the developer.

## Official Relationship

LongChat Guard is not affiliated with, endorsed by, or sponsored by OpenAI. `ChatGPT` is used only to identify the supported website.
