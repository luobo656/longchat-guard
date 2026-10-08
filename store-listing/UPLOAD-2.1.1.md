# LongChat Guard 2.1.1 — Store Update Checklist

## Upload package

Use the same Manifest V3 ZIP for Chrome Web Store and Microsoft Edge Add-ons:

`release/LongChat-Guard-2.1.1-store.zip`

SHA-256:

`45daec7fb888aa4a87f417b44b5a0ce3329dfc7d895200286821c1c7367c6039`

## Version

`2.1.1`

## Update notes

### English

LongChat Guard 2.1.1 is a stability and performance hardening release. It removes obsolete diagnostic-export persistence from the production extension, reduces unnecessary DOM scanning while typing and during unrelated page changes, and skips redundant UI redraws. The risk model, calibration behavior, privacy boundaries, permissions, and three-language user experience are unchanged.

### 简体中文

LongChat Guard 2.1.1 是一次稳定性与性能加固更新。正式版彻底移除了已废弃的诊断导出持久化链路，减少输入过程和无关页面变化触发的重复 DOM 扫描，并跳过没有实际变化的 UI 重绘。风险模型、校准逻辑、隐私边界、权限和三语言用户体验均未改变。

### 繁體中文

LongChat Guard 2.1.1 是一次穩定性與效能加固更新。正式版徹底移除了已廢棄的診斷匯出持久化流程，減少輸入過程和無關頁面變化觸發的重複 DOM 掃描，並略過沒有實際變化的 UI 重繪。風險模型、校準邏輯、隱私邊界、權限和三語使用體驗均未改變。

## Listing copy

- Chrome EN: `store-listing/chrome-en.md`
- Chrome zh-CN: `store-listing/chrome-zh-CN.md`
- Chrome zh-TW: `store-listing/chrome-zh-TW.md`
- Edge EN: `store-listing/edge-en.md`
- Edge zh-CN: `store-listing/edge-zh-CN.md`
- Edge zh-TW: `store-listing/edge-zh-TW.md`

## Screenshots

Use the real-site 2.1.1 screenshots from:

`release/real-chatgpt-screenshots-2.1.1/`

Each locale contains:
- `00-collapsed.png`
- `01-panel.png`
- `02-menu.png`

All are real chatgpt.com captures, PNG, 1280 x 800.

## Permissions

Unchanged:
- `storage`
- `https://chatgpt.com/*`

No new API, backend, analytics, remote-code, or host permission is introduced.
