# Security Policy

## Supported Version

Version 1.0.0 is the first public release candidate.

## Reporting

Report security issues privately to the project maintainer before public disclosure.

Do not include real ChatGPT conversation text, account identifiers, API keys, or attachment contents in reports. Use synthetic examples whenever possible.

## Security Boundaries

- No server component.
- No OpenAI API key.
- No cloud sync.
- No use of private OpenAI backend APIs.
- Extension host permission is limited to `https://chatgpt.com/*`.
- Persistent storage must not contain raw chat text, assistant response text, composer drafts, attachment text, names, emails, or API keys.
