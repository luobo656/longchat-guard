# LongChat Guard 4.3.0 — 商店更新说明（可直接复制）

> 版本：4.3.0。用于更新**原有** Chrome Web Store 和 Microsoft Edge Add-ons 条目，而不是新建一个扩展。与本次更新相关的新增权限为 `debugger`；它会在用户主动执行完整读取或历史校准时临时用于模拟鼠标滚轮。正常实时监测不使用调试器。部分浏览器会显示调试权限提示。

## 简体中文：本次更新

**LongChat Guard 4.3.0**

- **一键自动读取**：完整读取当前会话、学习历史长度上限参考时，不再需要手动上下滚动。
- **全新读取界面**：重新设计自动读取提示，清晰显示加载历史、返回最新消息和完整性检查三个阶段，随时可取消。
- **可靠性改进**：优化 ChatGPT 项目中新建会话的状态识别，以及会话长度限制提示的识别和归属。
- **正式版精简**：移除人工滚动引导、测试日志复制、界面版本号等开发功能。
- **保守结果保护**：无法确认完整的历史不会作为有效校准结果保存，已有本地提醒基准保留。

**权限变更说明**：增加浏览器 `debugger` 权限，仅在用户主动执行自动读取/校准时临时模拟滚轮，操作结束后解除连接；不会上传聊天正文。浏览器可能显示较明显的权限或调试提示。

## 繁體中文：本次更新

**LongChat Guard 4.3.0**

- **一鍵自動讀取**：完整讀取目前對話、學習歷史長度上限參考時，不再需要手動上下捲動。
- **全新讀取介面**：重新設計自動讀取提示，清楚顯示載入歷史、返回最新訊息及完整性檢查三個階段，並可隨時取消。
- **可靠性改進**：改善 ChatGPT 專案中新建對話的狀態識別，以及對話長度限制提示的辨識與歸屬。
- **正式版精簡**：移除人工捲動引導、測試日誌複製、介面版本號等開發功能。
- **保守結果保護**：無法確認完整的歷史不會作為有效校準結果儲存，已有本機提醒基準保留。

**權限變更說明**：新增瀏覽器 `debugger` 權限，僅在使用者主動執行自動讀取／校準時暫時模擬滾輪，操作結束後解除連線；不會上傳聊天原文。瀏覽器可能顯示較明顯的權限或偵錯提示。

## English: What's new

**LongChat Guard 4.3.0**

- **One-click automatic reading:** Load older conversation history for full-chat measurement and historical-limit calibration without manually scrolling.
- **Redesigned reading overlay:** Clearly shows loading, returning to the latest messages, and completeness verification, with a Cancel control.
- **Improved reliability:** Better state handling for newly created chats inside ChatGPT Projects and better attribution of conversation-length-limit notices.
- **Cleaner production interface:** Removed the manual-scrolling guide, developer test-log export, and on-screen version label.
- **Conservative evidence rules:** Incomplete reads cannot establish a usable calibration reference; existing local calibration data is retained.

**Permission change:** Adds the browser `debugger` permission for temporary mouse-wheel simulation only when a user explicitly requests full reading or calibration. It detaches after use. Chat text is not uploaded. The browser may display debugging or permission warnings.

## 审核备注（英文，可用于 Chrome 审核说明和 Edge 认证备注）

This submission upgrades the existing LongChat Guard extension to version 4.3.0, based on the earlier published 2.1.1 product.

The primary change is one-click automatic loading of historical ChatGPT conversation messages for user-initiated full-chat measurement and empirical length-limit calibration. To load older messages in the existing website's scrolling interface, the extension temporarily attaches the Chrome/Edge debugger to the **currently active chatgpt.com tab** and sends only `Input.dispatchMouseEvent` events of type `mouseWheel`. It detaches after operation, cancellation, navigation, or error. Normal passive risk monitoring never attaches the debugger. The browser's debugger permission is inherently powerful and may produce a broad warning; actual commands are deliberately restricted in the implementation. No chat content is extracted using CDP, sent to a server, or shared with the developer.

To test: sign in to ChatGPT; accept the first-run in-product privacy disclosure; open a sufficiently long chat; open the LongChat Guard status panel; choose “Read full current chat” from the More menu; observe three reading stages and the Cancel option. A complete scan updates the current local measurement; an incomplete scan fails conservatively. For calibration, a chat personally known to have reached a conversation-length limit is required; choose “Calibrate with this chat”. The extension cannot supply a public private-account limit-reached chat for reviewers. Regular monitoring, handoff prompt copy, and per-chat alert muting do not use debugging.

Changes also include a more accessible reading overlay, improved ChatGPT Projects new-chat state handling, and removal of experimental manual scrolling and read-test logs. No OpenAI API key, off-browser backend, remote code, chat export, or auto-navigation is used. Privacy policy: https://luobo656.github.io/longchat-guard/PRIVACY.md

## 如何使用

Chrome 通常把更新内容放在详细描述末尾的「4.3.0 本次更新」，若后台另有更新说明框，则粘贴对应语言的更新说明。Microsoft Edge Add-ons 的**认证备注（Notes for certification）**应粘贴上面的审核备注，明确这是现有扩展的更新、说明新增权限及测试操作。不要把完整的内部技术说明放进面向用户的短描述。

上传 ZIP：`release/LongChat-Guard-4.3.0-store-candidate.zip`。Chrome、Edge 可以提交相同 Manifest V3 构建包，均须上传到**原条目**并重新审核。不要重复创建新商店扩展。
