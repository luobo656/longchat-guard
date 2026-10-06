# Changelog

## 2.1.0 - 2026-10-06

- Finalized the continuation meta-prompt so the current GPT directly produces a self-contained handoff context from the real conversation/project state instead of emitting a second prompt or forcing a fixed summary template.
- Final release alignment: synchronized English, Simplified Chinese, and Traditional Chinese product/store/site copy; refreshed SEO/GEO discovery metadata; kept permissions unchanged.
- Development build version advanced to 2.0.15. The v2.0.14 real-site diagnostic confirmed RS-01 was still failing because new-chat birth evidence could disappear before the first Project turn was bound: the same content-script instance first observed a genuinely blank root surface, but the later healthy six-message conversation still had `sessionObservedFromStart=false`, `coverageEvidence=none`, and an incomplete authoritative snapshot. New-chat birth is now armed from the earliest stable user action we control — actual input in a zero-message Composer with no persisted ledger — rather than depending on catching a particular send button, submit event, or route transition. This state evidence is recorded before ChatGPT can rearrange/assign the Project conversation route, and the existing identity-rebind logic then carries it forward. The targeted regression uses Composer input followed by fixture `sendWithoutClick()` to prove the lifecycle no longer depends on click/submit/key capture.
- Development build version advanced to 2.0.14. Real-site diagnostics from ChatGPT Projects confirmed a third new-chat lifecycle shape: the content script can start directly on a conversation route with zero messages and no prior blank-route signal. The first send was therefore rejected as new-chat start evidence solely because a conversation ID already existed, leaving `sessionObservedFromStart=false` and every later healthy observation incomplete. Send-intent handling now treats a user send from a zero-message, no-ledger conversation surface as authoritative new-chat-start evidence regardless of whether ChatGPT preassigned the route ID; click capture was also simplified to structural composer containment instead of brittle send-button labels. Added `PROJECT_NEW_CHAT_EMPTY_ROUTE_PASS`, which starts the content script on an empty project conversation route with a non-semantic arrow send button and verifies complete measurement plus exactly one TurnGrowth sample. Localization was also hardened: runtime strings are cached and, if a development extension reload invalidates `chrome.i18n`, the UI falls back to the packaged locale catalogs using browser/page locale instead of visibly switching to English.

- Development build version advanced to 2.0.13. Real-site diagnostics exposed a separate new-chat start-tracking failure: the page had previously observed a blank root, but the active conversation later showed `sessionObservedFromStart=false`, `coverageEvidence=none`, healthy parsing, and a repeatedly committed incomplete ledger. The new-chat navigation path now arms start evidence immediately when the user activates an explicit New chat control or a blank-chat link, and the send-intent path keeps that evidence valid even if ChatGPT assigns a conversation route ID before the first message appears. This preserves complete measurement and the first whole-turn growth sample. Added browser E2E `NEW_CHAT_PREASSIGNED_ID_PASS` to simulate a route ID appearing before the first message.

- Development build version advanced to 2.0.12. Real-site diagnostics confirmed the post-response rollback was caused by an in-place ChatGPT conversation identity rebind: the first user-only frame was committed under one conversation ID, then the same visible chat appeared under a different route/DOM conversation ID when the Assistant response arrived. The session therefore dropped `observed_from_start`, created an incomplete ledger for the new ID, and the UI fell from Lower risk to Unable to assess. The content layer now treats an ID change as the same conversation only when the previously bound observed-from-start ledger and the new page share an existing message fingerprint; in that bounded case coverage continuity and the pending whole-turn intent move to the canonical ID. Explicit navigation resets remain isolated. Added a browser E2E regression that rotates the conversation ID between the user frame and Assistant completion and verifies complete measurement, Lower risk, and exactly one TurnGrowth sample.

- Development build version advanced to 2.0.11. Added bounded privacy-safe runtime transition diagnostics for the unresolved real-site post-response rollback. The trace records only state metadata (route class, identity-presence booleans, parser/coverage states, ledger revision, UI transition source, storage refresh, session reset, and content-script lifecycle) and never records chat text, raw conversation IDs, or full URLs. A temporary "Copy diagnostic info" overflow action exports the latest four snapshots so the exact real-site transition can be identified instead of applying another speculative fix.
- Development build version advanced to 2.0.10. Root cause of the post-response "Lower risk -> Unable to assess" rollback was narrowed to conversation-identity invalidation: a transient root-route + empty DOM frame could explicitly reset the bound session, and page-global `[data-conversation-id]` hints could let unrelated sidebar rows steal the active identity when the route was temporarily non-canonical. The content layer now keeps the bound session identity across transient root/empty frames, ignores conflicting non-route hints while a session is bound, scopes DOM conversation-id hints to the active message tree, and resets only on positive navigation/new-chat signals.
- Development build version advanced to 2.0.9. Conversation identity is now a first-class page-session state independent of transient DOM parser health: once a blank ChatGPT surface binds to its new conversation ID, observed-from-start identity remains monotonic for that conversation until positive navigation resets it. Temporary route/DOM identity loss therefore cannot orphan an existing authoritative ledger or flash the UI back to unable-to-assess.
- Development build version advanced to 2.0.8. Passive DOM observations are now explicitly separated from the authoritative conversation ledger: only complete + healthy + reliable passive measurements can replace an existing authoritative ledger, while weaker transient observations never mutate it. Turn-send intent remains transient until an authoritative observation commits, eliminating parser-churn rollback logic and the previous new-user downgrade heuristic.
- Development build version advanced to 2.0.7. Passive DOM/parser churn can no longer downgrade a same-generation complete/healthy/reliable ledger unless the weaker window contains a genuinely new user turn; this prevents post-response flicker while still failing closed when the conversation actually changes under weak parsing.
- Development build version advanced to 2.0.6. A trusted complete measurement from the current page session is now preserved across post-response parser churn instead of immediately falling back to unable-to-assess; retries continue in the background and navigation to another chat clears this continuity bridge.
- Development build version advanced to 2.0.5. Stabilized new-chat parsing across assistant streaming and renderer transitions so a newly measurable chat does not fall back to unknown after the response settles.
- Development build version advanced to 2.0.4. New-chat coverage no longer depends on legacy Composer labels/ids; current ProseMirror/chat-input surfaces are recognized explicitly.
- Development build version advanced to 2.0.3 so unpacked-extension reloads are visibly distinguishable in browser extension settings.
- Risk-track segments now fill only completed 1/16 intervals instead of rounding upward, preventing low-position chats from looking farther along than their measured L/R position.
- Blank new-chat detection now follows the actual empty Composer surface rather than relying on only root URL paths, including routed ChatGPT surfaces.

- Rebuilt product state around `MeasurementState`, `CalibrationState`, and `RiskState`; unknown, partial, stale, or uncalibrated conditions can no longer be presented as the calibrated “Lower risk” state.
- Replaced the old safe-boundary-driven UI contract with an empirical failure-reference contract. Safe evidence is now internal consistency/change-point evidence only and never unlocks the full risk track.
- Removed the user-facing `scan_baseline -> scan_limit -> confirmation` calibration flow. A user who opens a historical chat they know reached the conversation-length limit now clicks “Calibrate with this chat” once; one complete reliable scan directly establishes a strong or conservative empirical failure reference.
- Made “Read full current chat” an always-available overflow-menu action. Users can explicitly refresh any conversation's full local measurement without changing the empirical failure reference, calibration evidence, generation, or growth samples.
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
- Restored the compact green-to-red 16-segment risk track as the primary visual feedback for any complete measurement with a usable current calibration. The track explicitly represents position against the local historical failure reference, not official ChatGPT capacity. User-facing states are Lower risk / Long / Near risk / High risk; an optional model label is diagnostic metadata only and does not affect R quality, risk level, generation changes, or calibration validity.
- Updated the overflow menu to remain trigger-anchored, viewport-clamped, keyboard accessible, and preferentially positioned away from the primary risk card.
- Storage still uses install-salted SHA-256 pseudonymous conversation identifiers; documentation no longer describes them as absolute anonymity. Raw chat, Composer, attachment, and tool-result text remain unpersisted and unuploaded.
- Added product-state and end-to-end state-transition integration coverage for first run, safe-only evidence, explicit/conservative calibration, ordinary historical-chat measurement recovery, stale environment/generation, reload, scan transaction failure, Composer risk, whole-turn growth, and multi-tab stale writes.
- No new browser permissions were added.

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