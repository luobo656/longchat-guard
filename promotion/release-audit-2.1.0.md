# LongChat Guard 2.1.0 — Final Release Audit

Date: 2026-10-06

## Release decision

**Code/package status: READY**

Public version: **2.1.0**

Published store baseline before this update: **2.0.2**

The same Manifest V3 ZIP is prepared for Chrome Web Store and Microsoft Edge Add-ons:

`release/LongChat-Guard-2.1.0-store.zip`

SHA-256:

`62f1faa538bda54684717c6a09785387ac42efcaef49de20a3abdf43887721ae`

## Automated validation

- TypeScript typecheck: PASS.
- Vitest: PASS — 28 test files, 196/196 tests.
- Production build: PASS.
- Dist verification: PASS.
- GEO/site verification: PASS — 24 localized pages and 24 sitemap URLs.
- Edge browser E2E: REQUIRED_BROWSER_E2E_PASS.
- Git diff whitespace/error check: PASS.

Browser E2E covered first run, explicit calibration, mute/restore, page reload, extension reload, ordinary historical-chat full-read recovery, model-hint diagnostic-only behavior, sequence fail-closed behavior, ordinary new-chat send, Project new-chat composer arming, pre-send Composer risk, multi-tab feedback-loop prevention, parser fail-closed behavior, recalibration/stale generation, and conservative calibration.

The full Edge-process restart harness confirmed extension-storage bytes persisted unchanged, but Edge did not automatically reload the command-line unpacked extension after process restart. The harness reports this as automation partial rather than a product failure. Page reload and extension reload are separately verified.

## Manifest / package audit

Final dist manifest:
- Manifest V3.
- Version 2.1.0.
- Permissions: `storage` only.
- Host permission: `https://chatgpt.com/*` only.
- Default locale: `en`.

ZIP entries:
- `manifest.json`
- `background.js`
- `content.js`
- `_locales/en/messages.json`
- `_locales/zh_CN/messages.json`
- `_locales/zh_TW/messages.json`
- `icons/icon.svg`
- `icons/icon16.png`
- `icons/icon32.png`
- `icons/icon48.png`
- `icons/icon128.png`

No source tree, tests, source maps, package manager files, or development diagnostics UI are included in the store ZIP.

## Privacy / network audit

Source scan found no `fetch(`, `XMLHttpRequest`, `WebSocket`, or `sendBeacon` calls under `src/`.

The product contract and tests continue to enforce:
- raw user messages are not persisted;
- raw assistant replies are not persisted;
- Composer draft text is not persisted;
- attachment/file bodies are not persisted;
- tool/search result raw text is not persisted;
- raw ChatGPT conversation IDs are not persisted;
- stored conversation identity is install-salted SHA-256 pseudonymous state.

Bounded privacy-safe runtime/scan diagnostics remain local. The temporary user-facing “Copy diagnostic info” development action was removed from the final store UI.

## Localization audit

English, Simplified Chinese, and Traditional Chinese locale key sets are structurally aligned by automated test.

The 2.1.0 continuation prompt is synchronized semantically across all three languages and now implements the approved meta-prompt contract:
- current GPT generates the final handoff directly;
- no second-level prompt;
- latest valid state wins over obsolete history;
- facts/decisions/hypotheses/pending verification remain distinct;
- output is self-contained and ends with a concrete next step when one exists.

Store descriptions, update notes, website copy, privacy/reviewer material, and discovery files were synchronized in all three languages.

## SEO / GEO audit

- 24 canonical localized URLs verified against the sitemap.
- Canonical/hreflang localization structure retained.
- `dateModified` and sitemap `lastmod` refreshed to 2026-10-06 for current pages.
- SoftwareApplication structured data updated to 2.1.0.
- `AI_DISCOVERY.md`, `llms.txt`, and `site/llms-full.txt` synchronized with the real product model.
- Active launch copy updated to 2.1.0; dated 2.0.2 execution reports/releases remain historical records.
- Continuation pages now describe the real meta-prompt handoff rather than the obsolete fixed-template flow.

## Store screenshot gate

The 2026-10-01 screenshots show the pre-2.1.0 UI (including the old continuous gradient/progress presentation and old control layout). They must not be presented as current 2.1.0 screenshots.

Before submitting the store update, capture a fresh real ChatGPT-page screenshot set for:
- English;
- 简体中文;
- 繁體中文.

Use `store-listing/screenshot-plan.md` and `promotion/screenshots.md`. This is a presentation/manual store-listing task and does not change the release ZIP.

## Real-site evidence note

A real Edge retest of the previously failing ChatGPT Project new-chat flow passed and remained stable after the first completed turn.

The final Edge fixture E2E additionally passes the ordinary new-chat and Project-new-chat lifecycle, historical recovery, reload, risk, calibration, and multi-tab scenarios. Not every P1 scenario was manually re-run against the live logged-in ChatGPT site during this final release pass; this audit does not claim otherwise.

## Release materials

- Store upload checklist: `store-listing/UPLOAD-2.1.0.md`
- Chrome EN: `store-listing/chrome-en.md`
- Chrome zh-CN: `store-listing/chrome-zh-CN.md`
- Chrome zh-TW: `store-listing/chrome-zh-TW.md`
- Edge EN: `store-listing/edge-en.md`
- Edge zh-CN: `store-listing/edge-zh-CN.md`
- Edge zh-TW: `store-listing/edge-zh-TW.md`
- Privacy disclosure: `store-listing/privacy-disclosure.md`
- Reviewer notes: `store-listing/review-notes.md`
- GitHub release notes: `promotion/github-release-2.1.0.md`
- SEO/GEO release notes: `promotion/seo-geo-2.1.0.md`
