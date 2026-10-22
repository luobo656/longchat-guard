# LongChat Guard 4.3.0 商店更新提交指南（功能已由用户验收，待商店上架）

**注意：用户已确认 4.3.0 全部功能完成真实浏览器测试，本文件是最终上架准备材料，不代表 Chrome Web Store / Microsoft Edge Add-ons 已经审核或批准。** 4.3.0 保留远端已冻结的 4.2.26 回滚基线。商店更新须使用原有扩展条目，不能新建扩展。还需确认 4.3.0 实际截图、公开隐私政策和新增 debugger 权限解释。

## 已冻结回滚基线

- GitHub Release: https://github.com/luobo656/longchat-guard/releases/tag/v4.2.26-auto-shield-window-focus-fix
- 归档分支: `archive/v4.2.26-working-auto-baseline`
- 基准提交: `a824f8480b41c5b7b874ec809d04e5aafdf093b4`

## 两个商店填写的信息

- 名称、简短说明、详细说明：`store-listing/chrome-{en,zh-CN,zh-TW}.md` 和 `store-listing/edge-{en,zh-CN,zh-TW}.md`。
- 隐私处理说明：`PRIVACY.md` 和 `store-listing/privacy-disclosure.md`。
- 审核测试说明：`store-listing/review-notes.md`。
- 三语言更新内容（可复制进审核备注或详情说明）：`store-listing/whats-new-4.3.0.md`。
- 4.3.0 实际截图标准：`store-listing/screenshot-plan.md`。
- 代码包：`release/LongChat-Guard-4.3.0-store-candidate.zip`（从验证的 `dist/` 文件创建，ZIP 根目录应直接是 `manifest.json`）。
- 包校验值：`release/LongChat-Guard-4.3.0-store-candidate.zip.sha256`，提交前与上传文件核对。
- 网站：`https://luobo656.github.io/longchat-guard/`
- 支持：`https://github.com/luobo656/longchat-guard/issues`
- **隐私政策正式地址（沿用原网站链接）**：`https://luobo656.github.io/longchat-guard/PRIVACY.md`。该 URL 已检查 HTTP 200，主分支发布新版后再次确认内容包含 debugger 权限描述；不要只检查状态码而忽略内容。

## 单一用途与权限理由（审核表可直接参考）

**单一用途**：LongChat Guard 在用户同意后，利用本地可见 ChatGPT 内容估算当前会话负载，结合已确认达到长度上限的历史对话经验参考，提前显示风险并帮助用户准备续接。不展示 OpenAI 官方 token 数或官方额度。

**storage**：保存安装内加盐的伪匿名会话与消息指纹、内部负载估算、可靠性证据、历史经验参考、提醒控制。不会持久化原始聊天正文、草稿或附件内容。

**https://chatgpt.com/*（仅此站点的 host 权限）**：在用户明确同意后，读取页面可见消息、输入草稿和结构性标识，用于本地风险判断和质量验证；不在其他 AI 网站运行。

**debugger（需要重点说明）**：仅当用户点击“完整读取当前会话”或对确认触顶的历史对话发起校准时，插件暂时连接当前前台 `chatgpt.com` 标签页，经 CDP `Input.dispatchMouseEvent` 发送 `mouseWheel` 事件，使页面加载被虚拟化的旧消息。操作结束、取消、离开/导航或失败时解除连接；不允许任意 CDP 指令，也不利用 CDP 读取聊天正文。普通实时风险监测**不使用**此权限。**debugger 是浏览器级强权限，其安装提示可能提及所有网站；不能声称 Manifest host 限制了 debugger API 的底层能力，只能如实说明代码中的运行约束。** 审核通过与否由商店判断。

## Chrome Web Store / Microsoft Edge Add-ons 隐私披露

- 网站内容与个人通信：用户同意后**本地临时处理**用于会话风险测量。请在数据类型披露中如实勾选商店适用项，不要仅因“不上传”就宣称从未访问用户通信。
- 不使用广告/出售数据/遥测服务器；不会把聊天内容提供给扩展开发者。
- 曾有的“复制读取测试日志”及人工滚动实验入口已从正式候选版删除。
- 用户仍可以取消自动读取、关闭单个会话的提醒、拒绝首次隐私同意；卸载可以清除扩展本地数据。

## 正式上架最后核对（用户已完成全部功能测试）

1. **真实浏览器**：重新加载 4.3.0，现有安装/存储/浏览器扩展 ID 不变。检查 3 种语言默认 UI，菜单无版本标签或“复制读取测试日志”。
2. **完整读取当前会话**：选较长、存在懒加载的会话（优先超过 100 条），点击一次直接自动上下滚动，最后成功执行完整性扫描，没有人工引导；未完成则明确提示失败且不改写账本。
3. **历史校准**：打开确实达到长度上限的历史会话，主动“用此会话校准”；成功才写经验参考。普通历史会话不应错误建立 R。
4. **中止/异常**：上翻时取消、正式完整性扫描中取消、Esc、切标签页、浏览器失焦、关闭页面/导航、调试附加失败；核对遮罩消失、debugger 断开、未完成数据未提交。
5. **实时监测**：从 ChatGPT 普通首页与项目首页创建新会话，不需先人工完整读取；旧会话未认证仍显示未知，旧触顶提示不错误归属。
6. **视觉/无障碍**：新版遮罩在深浅色和窄屏均清晰；取消按钮可键盘操作；纯绘制遮罩不挡 CDP 滚轮。三段进度属于“当前阶段”，不是百分比或进度精度保证。
7. **上传截图**：从真实 4.3.0 获取 Chrome 和 Edge 商店截图（三语言本地化如需）；**不要复用 2.1.1 菜单旧截图或拿效果示意图冒充运行截图**。
8. **政策/链接**：打开隐私政策 URL，核对 4.3.0 权限条目；查看最新 Chrome/Edge 权限政策。若商店认为 debugger 不符合最低权限原则，需要调整产品或提供技术必要性说明，不能伪装权限。
9. **打包**：`npm run typecheck`、`npm test`、`npm run build`、`npm run verify:dist`、`git diff --check`。检查 ZIP 根目录 `manifest.json`、语言文件、图标、背景/内容脚本、SHA256。
10. **商店发布**：经用户确认再在 Chrome Web Store Dashboard 和 Microsoft Partner Center 上传并提交审核；审核未通过前旧上架版继续保持，不宣称已经发布。

## 4.2.26 回滚

回滚必须同时考虑 Git 源码、扩展安装文件和用户已形成的本地测量状态。仅覆盖同一扩展目录下的文件、保持扩展 ID，不卸载扩展、不删除 `chrome.storage.local`、不重置校准数据。可从上述 GitHub Release 下载 4.2.26 安装包恢复。
