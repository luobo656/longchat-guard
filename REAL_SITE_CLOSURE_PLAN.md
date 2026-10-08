# LongChat Guard Real-Site Closure Plan

> Purpose: close the release by testing one real ChatGPT behavior at a time. Synthetic fixtures are supporting evidence only; they do not mark a real-site item as passed.

## Freeze rules

- Final release target: v2.1.1.
- Do not change production code while a real-site case is being reproduced.
- Every code change increments the development version before the next user test.
- One user test per round. Do not ask the user to rerun the whole matrix.
- A case is PASS only after the exact real ChatGPT flow passes on Edge. Chrome is a second-browser confirmation after Edge is stable.
- The temporary user-facing diagnostic export was removed from the final store build; bounded privacy-safe runtime diagnostics remain internal only.
- Release proceeds only after the final automated/privacy/package audit passes and the user explicitly approves release.

## Ordered real-site matrix

| ID | Priority | Area | Exact real-site case | PASS condition | Current status |
| --- | --- | --- | --- | --- | --- |
| RS-01 | P0 | Projects new chat | Create a new chat inside a ChatGPT Project, send first prompt, wait for response | First completed turn becomes measurement=complete; UI shows 风险较低; later turns continue growing automatically; no manual full read | PASS on real Edge retest with v2.0.15 candidate; state remained stable after the first completed Project turn |
| RS-02 | P0 | Ordinary new chat | Create normal blank chat outside Projects and send 2-3 turns | Automatic tracking from first turn; no 暂无法判断; progress grows monotonically | Required Edge fixture E2E PASS for ordinary new-chat lifecycle; separate final live-site manual retest not repeated |
| RS-03 | P0 | Post-response stability | In RS-01/RS-02, watch 5-10 seconds after Assistant finishes | Never falls from 风险较低/other determinate risk back to 暂无法判断 | PASS for the retested Project new-chat flow; no fallback after response settle |
| RS-04 | P1 | Locale stability | Chinese ChatGPT page; reload unpacked extension without refreshing page, then continue interacting | Existing and newly rendered LongChat Guard UI remains Chinese; no English fallback flash | Latest screenshot is Chinese; explicit reload test pending |
| RS-05 | P1 | Historical ordinary chat | Open an old chat not observed from its first message | It may show 暂无法判断; menu always contains 完整读取当前会话; full read makes measurement complete without changing R | Required Edge fixture E2E PASS for historical full-read recovery; final live-site smoke not separately repeated |
| RS-06 | P1 | Calibration | Open a historical chat user knows hit conversation-length limit; click 用此会话校准 once | One scan only; reliable result creates strong/conservative R; no second confirmation | Required Edge fixture E2E PASS for explicit strong/conservative calibration; final live-site smoke not separately repeated |
| RS-07 | P1 | Progress-track accuracy | Compare short, medium, near-reference and reference-limit chats | 16-segment track scales with L/R; short chats stay around first segment(s), no artificial 3-segment floor, L>=R fills high-risk end | Automated risk tests + Edge fixture E2E PASS; final live-site visual smoke not separately repeated |
| RS-08 | P1 | Composer pre-send risk | In a measurable low-risk chat paste a very large draft without sending, then clear it | Risk rises before send and returns after clearing; draft text is not persisted | Required Edge fixture E2E PASS; live-site smoke not separately repeated |
| RS-09 | P1 | Reload/persistence | Reload ChatGPT page, then reload extension | Calibration, mute state and authoritative ledger survive correctly; no language regression; no fake complete state | Page + extension reload E2E PASS; full browser-restart storage bytes persist, unpacked-extension restart automation is partial |
| RS-10 | P1 | Overflow controls | Open ···; use mute/restore and full read | Menu positioning stable; mute persists; restore works; full read always visible; no layout regression | Required Edge fixture E2E PASS for menu positioning and mute/restore/full-read controls |
| RS-11 | P2 | Multi-tab | Same conversation in two tabs; interact in one, leave the other stale | Old tab cannot overwrite newer ledger; no UI/storage feedback loop | Required Edge fixture E2E PASS for stale-tab/storage feedback prevention; live-site multi-tab remains optional |
| RS-12 | P2 | Privacy/release audit | Inspect final dist/storage/permissions after functional closure | No chat body/Composer body/raw conversation ID persisted; permissions remain storage + chatgpt.com; fresh store ZIP only | PASS: final 2.1.1 manifest/privacy/package audit complete; no new permissions; fresh store ZIP audited; no new permissions; store ZIP audited |

## Evidence format for each user test

For each case, collect only:
1. build version shown by LongChat Guard;
2. one screenshot after the expected stable state;
3. if a regression appears after release, preserve the page state and capture the visible state/screenshot before refresh; internal runtime diagnostics can be inspected in development builds.

No extra test is requested until the current case is classified PASS or FAIL and, if FAIL, its root cause is identified.