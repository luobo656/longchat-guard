# Chrome Web Store - zh-TW

## 名稱

LongChat Guard · 長對話預警

## 簡短說明

ChatGPT 長對話風險提醒與本機趨勢監測；不顯示官方額度，不上傳聊天原文。

## 詳細說明

LongChat Guard 是一個面向 `chatgpt.com` 的本機優先 Chrome 擴充功能，用來提醒 ChatGPT 長對話風險。當對話逐漸變長、接近本機學到的風險區域時，它會用簡單狀態提醒你適時整理、總結或續接到新的對話。

它不會假裝是 OpenAI 官方額度計量器。擴充功能根據本機證據學習：哪些對話長度曾正常完成、哪些對話曾確認達到長度上限，以及你平時一次 Assistant 回覆大約增長多少。畫面只顯示「正常 / 偏長 / 接近風險 / 高風險」等易懂狀態，不顯示精確 token、百分比、剩餘額度或所謂官方對話上限。

主要功能：
- 彩色風險軌道與目前位置指示；
- 一鍵複製續接提示詞，把重要工作狀態帶到新的 ChatGPT 對話；
- 尚未學到本機失敗邊界時，可手動掃描一個舊長對話輔助學習；
- 環境變化時可重新學習；
- 可針對目前對話關閉或恢復提醒。

隱私處理都在瀏覽器本機完成。只有使用者主動同意後，擴充功能才會暫時讀取目前 ChatGPT 頁面可見對話內容，用於本機估算和匿名指紋計算。聊天原文不會持久化，也不會上傳給開發者、LongChat Guard 伺服器或第三方；不需要 OpenAI API Key。

## 單一用途

為 `chatgpt.com` 長對話提供本機風險提醒，協助使用者在合適的時機整理和續接。

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
