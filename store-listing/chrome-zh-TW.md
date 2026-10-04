# Chrome Web Store - zh-TW

## 名稱

LongChat Guard · 長對話預警

## 簡短說明

ChatGPT 長對話風險提醒與本機趨勢監測；不顯示官方額度，不上傳聊天原文。

## 詳細說明

LongChat Guard 是面向 `chatgpt.com` 的本機優先 Chrome 擴充功能，用來在長對話真正撞到長度上限前提供經驗風險提醒，協助你適時整理、總結或續接到新對話。

它不是 OpenAI 官方額度或 context window 計量器。沒有目前可用的本機經驗失敗參考時，擴充功能會誠實顯示「未校準」，不會顯示「正常」，也不會展示完整綠色到紅色風險軌道。

校準只需一次操作：開啟一個你自己明確知道過去達到過對話長度上限的歷史對話，點擊「用此對話校準」。完整歷史能可靠讀取時，擴充功能會直接建立 strong 本機參考；若樣本包含附件、工具等無法精確計量的上下文，則建立 conservative 參考並讓後續提醒更保守；掃描不可靠時不建立可用參考。

校準後，LongChat Guard 會綜合目前本機可測對話負載、尚未送出的輸入框草稿，以及從可靠整輪 `L_before -> L_after` 增長中學習的緩衝，顯示「正常 / 偏長 / 接近風險 / 高風險」等簡單狀態。不顯示精確 token、百分比、剩餘額度或所謂官方對話上限。

主要功能：
- 僅在可靠校準後出現的彩色風險軌道；
- 超長 Composer 草稿送出前即可改變風險；
- 一鍵複製續接提示詞，把重要工作上下文帶到新的 ChatGPT 對話；
- 一次操作完成歷史上限對話校準；
- 環境變化或基準可能失效時重新校準；
- 目前對話關閉/恢復提醒。

隱私處理全部在瀏覽器本機完成。只有使用者主動同意後，擴充功能才會暫時讀取目前 ChatGPT 可見內容和輸入框草稿。聊天原文、草稿、附件/檔案內容和工具結果正文不會持久化，也不會上傳。儲存的對話標識是 install-salted SHA-256 pseudonymous identifier，而不是原始 ChatGPT conversation ID。不需要 OpenAI API Key。

## 單一用途

為 `chatgpt.com` 長對話提供本機經驗風險提醒，協助使用者在合適時機整理和續接。

## 權限說明

- `storage`：儲存本機 pseudonymous 指紋、內部估算、經驗校準中繼資料、整輪增長樣本和提醒設定。
- `https://chatgpt.com/*`：只在支援的 ChatGPT 網頁端執行。

## 非官方聲明

LongChat Guard 是獨立開源專案，與 OpenAI 不存在隸屬、贊助、認可或維護關係。「ChatGPT」僅用於說明支援的網站和使用情境。

## 商店連結

- 官方網站：https://luobo656.github.io/longchat-guard/zh/
- 隱私政策：https://luobo656.github.io/longchat-guard/PRIVACY.md
- 原始碼：https://github.com/luobo656/longchat-guard
- 支援 / 問題回報：https://github.com/luobo656/longchat-guard/issues
