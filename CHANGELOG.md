# Changelog

## Unreleased

- Rebuilt product state around `MeasurementState`, `CalibrationState`, and `RiskState`; unknown, partial, stale, or uncalibrated conditions can no longer be presented as “Normal”.
- Replaced the old safe-boundary-driven UI contract with an empirical failure-reference contract. Safe evidence is now internal consistency/change-point evidence only and never unlocks the full risk track.
- Removed the user-facing `scan_baseline -> scan_limit -> confirmation` calibration flow. A user who opens a historical chat they know reached the conversation-length limit now clicks “Calibrate with this chat” once; one complete reliable scan directly establishes a strong or conservative empirical failure reference.
- Restored old-chat usability without reintroducing the old two-step calibration flow: when a normal historical chat cannot be measured from its currently loaded DOM, “Read full current chat” performs a separate full-history measurement transaction that refreshes only that chat's ledger/load and leaves the existing empirical failure reference and calibration evidence unchanged.
- Kept pending confirmation only for passively detected possible conversation-length-limit events; explicit calibration never asks the user to confirm the same intent twice.
- Added true pre-send risk input from the unsent Composer draft. Draft text remains transient and is not persisted.
- Replaced Assistant-only growth learning with whole-turn `L_before -> L_after` samples. Uncertain attachment/tool/search turns are excluded from the usable turn-growth reserve distribution, and legacy Assistant-only samples are not migrated as new evidence.
- Added observable `EnvironmentSignature` metadata and stale-prior semantics. Recalibration creates a fresh generation with no inherited current failure reference or growth distribution; old evidence remains guidance only.
- Added schema 10 ledger revisions and observation epochs plus generation/revision guards. Stale same-conversation tabs cannot overwrite newer load, coverage, parser, sequence, active-branch, completion, or failure state.
- Real Edge validation exposed and fixed a cross-tab storage feedback loop: storage-change listeners now refresh state/UI without creating a new observation write.
- Rewrote ledger merge semantics: current measurement fields are latest-only, durable completion/failure/dismissal evidence is unioned, and revision/timestamps are monotonic.
- Added scan-session transactions. Conversation changes, generation changes, or ledger changes during a history scan fail closed and cannot commit partial calibration.
- Replaced the sticky attachment boolean with current uncertainty-source evidence including attachments and identifiable tool/search/code/voice/image context. Branching away from an attachment no longer permanently contaminates the conversation.
- Tightened parser/sequence fail-closed behavior: degraded/unreliable parsing or uncertain sequence produces `RiskState=unknown` and hides the full risk track.
- Restored the compact green-to-red 16-segment risk track as the primary visual feedback for any complete measurement with a usable current calibration. The track now explicitly represents position against the local historical failure reference, not official ChatGPT capacity. Model-unverified low-load chats remain non-Normal while still showing reference position; elevated warnings use the normal Long/Near risk/High risk labels instead of adding “(conservative)” to the primary status.
- Updated the overflow menu to remain trigger-anchored, viewport-clamped, keyboard accessible, and preferentially positioned away from the primary risk card.
- Storage still uses install-salted SHA-256 pseudonymous conversation identifiers; documentation no longer describes them as absolute anonymity. Raw chat, Composer, attachment, and tool-result text remain unpersisted and unuploaded.
- Added product-state and end-to-end state-transition integration coverage for first run, safe-only evidence, explicit/conservative calibration, ordinary historical-chat measurement recovery, stale environment/generation, reload, scan transaction failure, Composer risk, whole-turn growth, and multi-tab stale writes.
- No new browser permissions were added; package/manifest version remains 2.0.2 while this work stays Unreleased.

## 2.0.2 - 2026-10-01

- Finalized the LongChat Guard icon: transparent background, green chat-bubble main shape, white conversation lines, and an orange shield accent.
- Removed the old external rounded-square backplate and shield checkmark for better 16px/32px recognition and a cleaner browser-toolbar silhouette.
- Updated website icon presentation so the transparent icon is not clipped by rounded-image masks.
- Regenerated Chrome/Edge icon assets at 16, 32, 48, and 128 px and refreshed release documentation.
- No new permissions and no risk-algorithm changes.

## 2.0.1 - 2026-09-30

- Added official Manifest V3 localization for English, Simplified Chinese, and Traditional Chinese.
- Fixed brand identity across locales: canonical brand stays `LongChat Guard`; Chinese display names use `LongChat Guard · 长会话预警` and `LongChat Guard · 長對話預警` instead of machine-translated brand names.
- Localized the in-product risk panel, consent flow, actions, continuation prompt, scan messages, and status copy.
- Updated Chrome/Edge store listing copy in all three languages and added a ready-to-use update checklist.
- Refreshed README, FAQ, llms/AI-discovery files, structured product facts, and public-site GEO content.
- No new permissions.

## 2.0.0 - 2026-09-30

- Replaced additive risk heuristics with the first-principles local L/S/F/B model: current load, confirmed safe boundary, robust confirmed failure boundary, and dynamic assistant-reply growth buffer.
- Added robust failure-boundary learning, automatic reply-growth learning, old-ledger migration, and bidirectional environment-change detection.
- Hid manual history scanning after a confirmed failure boundary is learned; relearning restores the action for a fresh generation.
- Reduced scan diagnostics to failure-only bounded local metadata with 7-day expiry; successful scans leave no diagnostic record.
- Kept the finalized compact gradient risk track UI and minimal MV3 permissions.

## 1.0.1 - 2026-09-29

- Reframed first-run uncertainty as a friendly local learning state instead of an error-like "unreliable" message.
- Added a short plain-language explanation that monitoring improves automatically while the user continues normal conversations.
- Separated cold-start learning from temporary page-detection recovery so learned calibration is not presented as lost.
- Added a user-triggered full-history scan for old conversations. The scan walks from the verified head to the verified tail, stitches virtualized message windows, rechecks the head, and refuses strong calibration when completeness cannot be proven.
- Old conversations containing attachments or ambiguous message roles are downgraded instead of being treated as strong calibration samples.

## 1.0.0 - 2026-09-22

- Public release candidate.
- Local-only long-conversation trend warning for `chatgpt.com`.
- Simplified status pill and panel.
- Fuzzy risk trend only; no token counts, percentages, K values, quotas, or exact limits in the UI.
- Background personal calibration with conservative coverage/parser handling.
- Click-away and Escape close behavior.
- Original non-OpenAI brand icon and store-ready manifest icons.
- Public brand renamed to LongChat Guard.
- Brand icon simplified to a high-contrast chat bubble with an orange guard badge for better small-size recognition.
- MV3 minimal permissions: `storage` and `https://chatgpt.com/*`.
