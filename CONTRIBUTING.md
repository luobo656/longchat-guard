# Contributing

## Product Boundary

Keep LongChat Guard 2.x focused on `chatgpt.com` long-conversation warning:

- No other websites.
- No servers.
- No OpenAI API key.
- No cloud sync.
- No automatic user message sending.
- No precise quota, token, K-value, percentage, or official-limit claims in user-visible UI.

## Development

Run before submitting changes:

```text
npm run typecheck
npm test
npm run build
```

## Privacy Rules

Do not add persistent storage fields for raw user text, assistant responses, composer drafts, attachment text, names, emails, or API keys.

## Brand Rules

Do not use OpenAI or ChatGPT logos, the six-knot mark, or any official-looking brand treatment. `ChatGPT` may be used only to identify the supported website.

The canonical brand is always `LongChat Guard`. Do not translate the brand itself. User-visible copy must stay aligned across `en`, `zh_CN`, and `zh_TW` locale files.
