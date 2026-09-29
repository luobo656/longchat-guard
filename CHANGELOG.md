# Changelog

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
