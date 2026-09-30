# Microsoft Edge Add-ons - zh-TW

## 名稱

LongChat Guard · 長對話預警

## 簡短說明

ChatGPT 長對話風險提醒與本機趨勢監測；不顯示官方額度，不上傳聊天原文。

## 詳細說明

LongChat Guard 是一個面向 `chatgpt.com` 的本機優先 Microsoft Edge 擴充功能，用來提醒 ChatGPT 長對話風險。它根據本機實際使用學習安全邊界、長度上限失敗邊界和典型單輪回覆增長，並以「正常 / 偏長 / 接近風險 / 高風險」等簡單狀態呈現。

它能協助你判斷什麼時候適合整理、總結或開啟新的 ChatGPT 對話，並提供一鍵續接提示詞，方便保留重要工作上下文。

LongChat Guard 不是官方額度計量器：不顯示精確 token、百分比、剩餘額度或 OpenAI 官方對話上限，也不需要 OpenAI API Key。

監測只會在使用者主動同意後開始。可見的 ChatGPT 對話內容只在瀏覽器本機暫時處理，用於本機估算與匿名指紋計算；聊天原文不持久化，也不會傳送給開發者、LongChat Guard 伺服器或第三方。

## 單一用途

為 `chatgpt.com` 長對話提供本機風險提醒。

## 權限說明

- `storage`：儲存本機匿名指紋、內部估算、學習邊界中繼資料和提醒設定。
- `https://chatgpt.com/*`：只在支援的 ChatGPT 網頁端執行。

## 非官方聲明

LongChat Guard 是獨立開源專案，與 OpenAI 不存在隸屬、贊助、認可或維護關係。「ChatGPT」僅用於說明支援的網站和使用情境。

## 商店連結

- 官方網站：https://luobo656.github.io/longchat-guard/zh/
- 隱私政策：https://luobo656.github.io/longchat-guard/PRIVACY.md
- 原始碼：https://github.com/luobo656/longchat-guard
- 支援 / 問題回報：https://github.com/luobo656/longchat-guard/issues
