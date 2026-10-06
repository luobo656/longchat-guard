# Chrome Web Store - zh-TW

## 名稱

LongChat Guard · 長對話預警

## 簡短說明

ChatGPT 長對話風險提醒與續接輔助；本機處理，不顯示官方額度，不上傳聊天原文。

## 詳細說明

LongChat Guard 是面向 `chatgpt.com` 的本機優先 Chrome 擴充功能，用來判斷一個長期工作的 ChatGPT 對話是否已經接近值得整理並續接到新對話的階段。

它不是 OpenAI 官方額度、token 計數器或 context window 計量器。LongChat Guard 只使用瀏覽器本機經驗資料。沒有目前可用的本機經驗失敗參考時，擴充功能會顯示「未校準」，不會把未知狀態偽裝成「風險較低」。

校準只需一次操作：開啟一個你自己明確知道曾達到對話長度上限的歷史對話，點擊「用此對話校準」。完整歷史能可靠讀取時，擴充功能會建立 strong 或 conservative 本機經驗參考；如果掃描不完整或不可靠，則 fail closed，不建立可用參考。

校準後，風險綜合目前本機可測對話負載、尚未送出的 Composer 草稿，以及從可靠整輪增長中學習的緩衝。介面只顯示「風險較低 / 偏長 / 接近風險 / 高風險」等簡單狀態，不顯示精確 token、百分比、剩餘額度或所謂統一的官方對話上限。

續接功能採用元提示詞，而不是固定摘要模板。「複製續接提示詞」會複製一條給目前 GPT 的指令。把它貼到目前對話後，GPT 會根據自己已經掌握的本對話內容和實際可見的專案上下文，自主產生一份可直接交給新對話的續接上下文，優先保留目前目標、已確認決策、約束、已完成工作、已排除方案、未解決問題、必要技術狀態和下一步。使用者再把 GPT 產生的續接內容複製到新對話即可。擴充功能不會自動搬移聊天，也不會把對話上傳到伺服器。

「···」選單始終提供「完整讀取目前對話」，可隨時更新目前對話的本機測量，而且不會修改經驗提醒基準。

主要功能：
- ChatGPT 長對話本機經驗風險提醒；
- 只有測量與校準可靠時才顯示完整彩色風險軌道；
- 超長 Composer 草稿在送出前即可改變風險；
- 從可靠的整輪前後狀態學習對話增長；
- 用已達到長度上限的歷史對話一次完成校準；
- 一般歷史對話可「完整讀取目前對話」，且不修改校準基準；
- 續接元提示詞讓目前 GPT 產生高品質、自包含的續接上下文；
- 目前對話可關閉/恢復提醒；
- English / 簡體中文 / 繁體中文三種介面語言。

隱私處理全部在瀏覽器本機完成。只有使用者主動同意後，擴充功能才會暫時讀取目前 ChatGPT 頁面可見內容和 Composer，用於風險判斷。聊天原文、Assistant 回覆原文、Composer 草稿、附件/檔案正文和工具結果正文不會持久化，也不會上傳到 LongChat Guard 分析伺服器。持久化對話標識使用 install-salted SHA-256 pseudonymous identifier，而不是原始 ChatGPT conversation ID。不需要 OpenAI API Key。

## 單一用途

為 `chatgpt.com` 長對話提供本機經驗風險提醒與續接輔助。

## 權限說明

- `storage`：儲存本機 pseudonymous 指紋、內部估算、經驗校準中繼資料、整輪增長樣本和提醒設定。
- `https://chatgpt.com/*`：只在支援的 ChatGPT 網頁端執行。

## 非官方聲明

LongChat Guard 是獨立開源專案，與 OpenAI 不存在隸屬、贊助、認可或維護關係。「ChatGPT」僅用於說明支援的網站和使用情境。

## 商店連結

- 官方網站：https://luobo656.github.io/longchat-guard/zh-tw/
- 隱私政策：https://luobo656.github.io/longchat-guard/PRIVACY.md
- 原始碼：https://github.com/luobo656/longchat-guard
- 支援 / 問題回報：https://github.com/luobo656/longchat-guard/issues
