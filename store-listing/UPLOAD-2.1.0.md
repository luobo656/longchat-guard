# LongChat Guard 2.1.0 — Store Update Checklist

This is an update to the existing Chrome Web Store and Microsoft Edge Add-ons listings. Do not create a new extension listing.

## Upload package

Use the same Manifest V3 ZIP for both stores:

`release/LongChat-Guard-2.1.0-store.zip`

SHA-256:

`62f1faa538bda54684717c6a09785387ac42efcaef49de20a3abdf43887721ae`

The ZIP root directly contains `manifest.json`, `background.js`, `content.js`, `_locales/`, and `icons/`.

## Version

`2.1.0`

The currently published store version is 2.0.2, so 2.1.0 is a valid higher update version.

## Languages to maintain

### English

Display name: **LongChat Guard**

Use:
- Chrome: `store-listing/chrome-en.md`
- Edge: `store-listing/edge-en.md`

### Simplified Chinese

Display name: **LongChat Guard · 长会话预警**

Use:
- Chrome: `store-listing/chrome-zh-CN.md`
- Edge: `store-listing/edge-zh-CN.md`

### Traditional Chinese

Display name: **LongChat Guard · 長對話預警**

Use:
- Chrome: `store-listing/chrome-zh-TW.md`
- Edge: `store-listing/edge-zh-TW.md`

The canonical brand **LongChat Guard** is never translated. The Chinese text after the middle dot is a functional subtitle.

## Suggested update notes

### English

LongChat Guard 2.1.0 rebuilds long-conversation risk around complete/reliable local measurement and a user-confirmed historical length-limit reference. It stabilizes ordinary and Project new-chat tracking, adds pre-send Composer risk and reliable whole-turn growth learning, simplifies one-step calibration and full-chat measurement recovery, and finalizes a continuation meta-prompt that lets the current GPT generate a self-contained handoff for a fresh chat. English, Simplified Chinese, and Traditional Chinese copy are synchronized. No new permissions were added.

### 简体中文

LongChat Guard 2.1.0 重新收敛长会话风险模型：只有完整、可靠的本地测量和用户亲自确认的历史长度上限参考才能输出确定风险；普通新会话和 Project 新会话的连续跟踪更加稳定，并加入发送前 Composer 草稿风险、可靠整轮增长学习、一次点击校准和“完整读取当前会话”恢复。续接功能升级为元提示词，由当前 GPT 根据真实会话/项目状态直接生成自包含的续接内容。英文、简体中文、繁体中文已同步更新，没有新增权限。

### 繁體中文

LongChat Guard 2.1.0 重新收斂長對話風險模型：只有完整、可靠的本機測量和使用者親自確認的歷史長度上限參考才能輸出確定風險；一般新對話和 Project 新對話的連續追蹤更加穩定，並加入送出前 Composer 草稿風險、可靠整輪增長學習、一次點擊校準和「完整讀取目前對話」恢復。續接功能升級為元提示詞，由目前 GPT 根據真實對話/專案狀態直接產生自包含的續接內容。英文、簡體中文、繁體中文已同步更新，沒有新增權限。

## Permissions

Unchanged:
- `storage`
- `https://chatgpt.com/*`

No API key, backend, remote code, analytics, advertising, or additional host permission is introduced.

## Reviewer references

- Privacy disclosure: `store-listing/privacy-disclosure.md`
- Review notes: `store-listing/review-notes.md`
- Source: https://github.com/luobo656/longchat-guard
- Website: https://luobo656.github.io/longchat-guard/
- Privacy policy: https://luobo656.github.io/longchat-guard/PRIVACY.md

## Screenshot note

The 2026-10-01 screenshots are historical and predate the frozen 2.1.0 UI. Keep the existing store screenshots only if they still accurately represent the current UI. Otherwise capture a fresh real-browser set in English, Simplified Chinese, and Traditional Chinese following `store-listing/screenshot-plan.md` and `promotion/screenshots.md`.

## Chrome Web Store

1. Open the existing LongChat Guard item.
2. Upload `release/LongChat-Guard-2.1.0-store.zip`.
3. Keep the existing item identity; do not create a new listing.
4. Update English / 简体中文 / 繁體中文 listing text from the three Chrome source files.
5. Review privacy/data-use answers against `store-listing/privacy-disclosure.md`.
6. Replace screenshots if the current gallery still shows the pre-2.1.0 UI.
7. Submit the update for review.

## Microsoft Edge Add-ons

1. Open the existing LongChat Guard submission.
2. Upload the same `release/LongChat-Guard-2.1.0-store.zip`.
3. Update English / 简体中文 / 繁體中文 descriptions and search terms from the three Edge source files.
4. Confirm the same privacy/permission disclosures.
5. Replace screenshots if necessary.
6. Submit the update for certification.
