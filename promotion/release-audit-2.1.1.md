# LongChat Guard 2.1.1 — Stability / Performance Release Audit

Date: 2026-10-08

## Scope

This patch release does not change the LongChat Guard risk model, calibration model, permissions, or privacy contract. It removes obsolete diagnostic-export infrastructure and hardens runtime performance for long ChatGPT sessions.

## Diagnostic cleanup

- Removed the production runtime-diagnostics module and its persistence/export tests.
- Removed failure-scan diagnostic persistence and TTL cleanup from the content script.
- Removed all user-facing diagnostic-copy action references.
- Kept only history-scanner diagnostic stages that are needed transiently inside the current scan for fail-closed decisions; they are not persisted.
- Added one-time install/update cleanup for legacy keys:
  - longChatGuardRuntimeDiagnostics
  - longChatGuardLastScanDiagnostics

## Performance hardening

- Composer input no longer calls full readPageSnapshot() on every keystroke.
- New-chat birth arming uses only Composer text and a lightweight message-root presence check.
- Composer draft-risk redraw is trailing-debounced at 160 ms and uses the current authoritative ledger; typing no longer creates a full conversation observation per keypress.
- MutationObserver still watches the document root to survive renderer replacement, but only schedules work for conversation/main, alert/toast, model-label, or renderer-replacement mutations.
- Composer-only DOM churn is ignored by MutationObserver because the input path owns draft-risk updates.
- General mutation processing is coalesced with a 180 ms trailing debounce.
- GuardUi skips DOM writes when the complete render model plus busy state has not changed.
- Unchanged UI refreshes no longer iterate/rewrite the 16-segment track.

## Validation

- TypeScript typecheck: PASS.
- Vitest: 26 files / 191 tests: PASS.
- Production build: PASS.
- dist verification: PASS.
- Edge required browser E2E: PASS.
- Real scenarios verified in E2E: explicit calibration, historical full-read recovery, ordinary new chat, Project new chat, pre-send Composer risk, sequence/parser fail-closed, reload, multi-tab feedback prevention, recalibration, conservative calibration.
- GEO/site verification: 24 localized pages / 24 sitemap URLs: PASS.
- git diff --check: PASS.
- Source network scan: no fetch/XMLHttpRequest/WebSocket in src.
- Final permissions unchanged: storage + https://chatgpt.com/*.

## Bundle

2.1.1 production content.js: approximately 115.26 kB (gzip approximately 36.47 kB), down from the previous 2.1.0 build of approximately 118.8 kB.

## Store package

release/LongChat-Guard-2.1.1-store.zip

SHA-256:
45daec7fb888aa4a87f417b44b5a0ce3329dfc7d895200286821c1c7367c6039

## Screenshot evidence

English, Simplified Chinese, and Traditional Chinese screenshots were captured from the real https://chatgpt.com/ site with the actual 2.1.1 dist extension in a clean signed-out Edge profile.

All store screenshots are PNG at 1280 x 800.
