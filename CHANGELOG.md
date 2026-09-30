# Changelog

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
