# LongChat Guard 2.1.1 架构基线

## 1. 技术栈与边界

- Chrome / Microsoft Edge
- Manifest V3
- TypeScript + Vite
- Vitest
- `storage` permission
- `https://chatgpt.com/*` host permission
- 无服务端、无 OpenAI API Key、无云同步

## 2. 数据流

```text
ChatGPT DOM
  -> dom-reader
  -> page-adapter
  -> Environment / Uncertainty reader
  -> content/app
  -> background StorageMutationCoordinator
        -> sequence-reconciler
        -> calibration
        -> product-state
        -> risk-engine
        -> storage
  -> unified GuardUiModel
  -> Shadow DOM pill/panel
```

产品统一领域维度为 MeasurementState、CalibrationState、RiskState。

## 3. Page Adapter 与 MeasurementState

`dom-reader.ts` 负责读取当前 DOM 可见消息、Composer、可见错误、生成状态和 tail evidence；不持久化原始文字。

当前 ChatGPT renderer 可能在一轮回答前后切换结构。dom-reader 会同时评估 grouped `[data-turn-key]` 表示和 generic author-role 表示，优先选择 user/assistant 配对更完整的表示，而不是固定偏好某一套 selector。

`page-adapter.ts` 输出 coverage/parser health。随后 `product-state.ts` 将 coverage、parser、sequence 和 DOM support 归约为：

- unavailable
- partial
- complete
- uncertain

只有 complete + healthy + reliable 可进入新的风险计算。degraded parser 不允许把未知包装成“风险较低”。

## 4. Calibration

`calibration.ts` 管理三类证据：

- Safe evidence S：内部一致性证据。
- EmpiricalFailureReference R：strong / conservative / provisional。
- TurnGrowthSample：完整可观察一轮的 before/after/delta。

显式校准通过 `guard.commitCalibration` 原子提交，不创建 pending confirmation。

被动检测长度上限通过 `recordFailureObservation` 只创建 pending。用户接受后才调用 `recordConfirmedFailureReference`；pending 保存检测时的 coverage/parser/uncertainty/environment，避免用户确认时把后续更好的页面状态错误升级为 strong。

provisional R 不进入有效 CalibrationState。

## 5. Risk Engine

`assessRisk()` 的第一层是资格 gate：

```text
measurement != complete
or calibration not calibrated/calibrated_conservative
or no usable failure reference
=> unknown
```

可用后：

```text
baseLoad = L + composerDraftLoad
projectedLoad = baseLoad + G
```

G 来自非 uncertain 的 whole-turn delta p80。少于最小样本数时 reserve 不 ready，不构造人为的三段预警带。

S 不参与 normal/long/organize/high 判定。

风险结论与视觉位置分开：

```text
referencePositionScore = clamp((L + composerDraftLoad) / R, 0, 1)
```

G 不参与轨道缩放。16 段轨道使用已跨过的完整分段显示，避免低位向上取整造成视觉虚高。

## 6. Generation 与 EnvironmentSignature

Generation 用于隔离校准环境。EnvironmentSignature 只包含：

- parserSchemaVersion
- measurementSchemaVersion
- 可可靠读取时的 modelHint（optional diagnostics only）

Environment compatibility 只比较 parserSchemaVersion 与 measurementSchemaVersion。modelHint 不参与 equality、R 质量、RiskState、generation 切换或 stale 判定；即使 modelHint 缺失或与历史标签不同，只要测量口径一致，当前 calibration 仍可正常使用。

`startNewGeneration(recalibrate/environment_change)` 创建空 samples + 空 turnGrowthSamples。旧 R/S 仅写入 warmStartPrior，属于 stale prior；旧 Assistant-only growth 不迁入新 G。

parser/measurement signature 明确冲突、change-point 建议或只有 prior 时，CalibrationState=stale。

## 7. Storage schema 10 与 authoritative ledger

Schema 10 的 ledger 包含：

- ledgerRevision
- observationEpoch
- sequenceReliability
- uncertaintySources
- environmentSignature
- durable completion/failure/dismissed evidence

`mergeLedgerSnapshots()`：

- latest-only：currentEstimatedLoad、coverageState、parserHealth、activeFingerprints、sequence、uncertaintySources、environmentSignature、generationId。
- union：messages、completedAssistantFingerprints、confirmedFailureFingerprints、dismissedFailureKeys。
- max：ledgerRevision、observationEpoch、updatedAt。

`observeWindow` 需要调用方携带 `baseRevision`。baseRevision 与当前 ledgerRevision 不同即返回 `staleObservation`，不写旧测量。

Passive observation 与 authoritative ledger 明确分层。`measurement-authority.ts` 负责唯一的写入资格判断：complete + healthy + reliable 的被动候选才是 authoritative measurement；partial / degraded / uncertain 都只是 transient observation。

当 existing ledger 在当前 generation + measurement environment 下已经 authoritative 时，任何 weaker passive observation 都直接返回 `retained_authoritative`，不写 storage、不增加 ledgerRevision，也不根据该弱窗口里“看起来像新 user”的 DOM 片段推断状态迁移。用户真实发送由 content script 的 `PendingTurnIntent` 记录；只有后续 authoritative observation 成功 `committed` 后，才接受该 turn intent 并继续 completion / TurnGrowth 流程。

如果 generation 或 measurement environment 已改变，旧 ledger 不再具有当前环境下的 authoritative 资格；此时新观测按正常 fail-closed 规则建立当前状态。显式 full-read / calibration commit 是独立 authoritative transaction，不受 passive observation 写入门控限制。

Completion/Failure event 也携带 expectedLedgerRevision，避免旧标签页追加旧证据。

跨标签页的 `chrome.storage.onChanged` 只用于重新读取状态并本地重绘 UI，绝不触发新的 observation 写入。这样既能同步 mute/calibration，又不会形成 storage-change 反馈回路。

2.1.1 将高频 UI 事件与完整测量进一步分层：Composer `input` 只做轻量的新会话出生判定，并以 160ms trailing debounce 用当前 authoritative ledger + 内存草稿重算发送前风险，不再逐键调用完整 `readPageSnapshot()`。MutationObserver 继续覆盖 document root 以承受 renderer replacement，但只对 conversation/main surface、可见 alert/toast 与 model label 等相关 mutation 触发 180ms 合并测量；Composer 自身 DOM churn 由 input 路径单独处理。

## 8. Migration

Schema 9 及更旧状态升级为 10：

- conversation references 继续统一转换为 install-salted SHA-256 pseudonymous key。
- `firstConfirmedFailureLoad` 迁移为 `empiricalFailureLoad`。
- legacy strong/conservative 质量可保留；无法映射的质量降为 provisional。
- 旧环境信息缺失，因此旧有效 R 迁移后表现为 stale，而不是自动视为当前 calibration。
- 旧 `recentAssistantTokenCounts` 不迁移为 TurnGrowthSample。
- 旧 `hasUnmeasuredAttachments` 只在 migration 时转换为 uncertaintySources。
- migration 可重复运行，结果幂等。

## 9. History Scan Transactions

完整历史扫描有两个明确分开的用途，共用同一套 head/tail、虚拟窗口拼接和 fail-closed scanner，但提交语义不同。

**Calibration scan**：显式“用此会话校准”创建 ActiveCalibrationScan，并在可靠完整读取后同时更新当前会话 ledger 与 empirical failure reference。

- scanSessionId
- raw/pseudonymous conversation key
- expectedGenerationId
- expectedLedgerRevision

扫描结束前会再次验证 conversation identity；Background commit 再验证 generation/revision。任一改变则拒绝提交。刷新/extension reload 会销毁 content script 内的 scan session，因此没有可提交的半成品。

**User-initiated full-read scan**：overflow menu 始终提供“完整读取当前会话”。用户可在任意具体会话中主动重新完整读取；扫描同样记录 conversation identity、expectedGenerationId、expectedLedgerRevision，并在完整读取后只提交该会话的 authoritative complete/reliable ledger。它不得写 empirical failure reference、不得增加 calibration sample、不得增加 growth sample、不得切换 generation、不得创建 pending confirmation。

Scanner 继续使用稳定 head/tail、虚拟窗口重叠、有限恢复和 fail-closed 策略。

## 10. Conversation Session 与新会话生命周期

当前会话身份由 content script 的 `ConversationSessionState` 独立维护，不再由某一次 DOM parser 结果反推。它只保存页面生命周期所需的最小状态：当前 conversation ID、该 ID 是否从空白会话开始被连续观察，以及同标签页 document navigation 所需的短期 start evidence；不保存草稿正文。

空白 ChatGPT 会话面被观察到后，首次出现 user message + conversation ID 时会把该 ID 绑定为 `observed_from_start`。这个事实对同一个 conversation 是单调的：Assistant streaming、renderer settle、URL 临时变化、canonical/data-conversation-id 暂时消失或 parser 瞬时降级，都不能清除当前 conversation identity，也不能把 coverage 从 observed-from-start 改回 none。

Conversation identity 与 Measurement authority 是两层独立状态：Session 决定“当前是哪一个会话、是否从开始观察”，authoritative ledger 决定“哪一次测量可持久化”。如果瞬时 DOM 无法再次给出 conversation ID，Session 仍可把页面映射回当前 authoritative ledger；弱观测本身仍不能写 storage。

Identity source 有明确优先级：URL 中的 `/c/<id>` 是可切换 Session 的强证据；已经绑定的 `ConversationSessionState.activeConversationId` 在 URL 暂时没有 `/c/<id>` 时优先于任何新的 DOM hint；DOM 的 `data-conversation-id` 只允许从当前消息树的祖先范围读取，不能从整个 document/侧边栏枚举。根路径 + 空消息 DOM 只是 transient observation，不能自行调用 reset。这样 renderer settle 期间既不会因 identity 暂时消失而丢会话，也不会被另一个侧边栏会话 ID 抢占。

只有明确导航到另一个历史会话、浏览器 back/forward 等正向导航事件才重置 ConversationSessionState。页面/内容脚本重载后则依靠已持久化 authoritative ledger；新会话发生同标签页 document navigation 时用 30 秒 sessionStorage start evidence 做一次性桥接。

Assistant streaming / settle 期间，DOM stable hint、renderer grouping 或正文可变化；sequence-reconciler 允许在有可靠锚点时使用 ordinal + role 桥接同一逻辑消息，但完全不相干的窗口仍保持 uncertain。

## 11. UI

`GuardUiModel` 直接携带三维领域状态。UI 对完整 model + calibration/measurement busy 状态生成 render signature；签名未变化时直接跳过 Shadow DOM 重写和 16 段轨道遍历，避免 streaming / storage refresh 期间重复绘制。

`shouldRenderRiskTrack()` 在 UI 层再次 hard gate：

```text
measurement=complete
and calibration in {calibrated, calibrated_conservative}
and trackAvailable=true
and risk != unknown
```

低位状态对用户显示为“风险较低”；modelHint 不参与 UI 主状态。environment_unknown / stale / uncalibrated 或 measurement 非 complete 时隐藏轨道。

Overflow menu 固定包含完整读取当前会话、重新校准提醒基准、本会话不提醒/恢复提醒；使用 fixed positioning、trigger anchoring、viewport clamp，键盘 ArrowUp/ArrowDown/Home/End/Escape 与 focus restoration 保留。菜单底部显示当前开发构建版本，便于确认本地 unpacked extension 是否真正更新。

## 12. 隐私

Raw conversation text、Composer text 和附件内容只在内存瞬时处理。Storage 只保存 pseudonymous key、匿名 fingerprints、本地估算和状态元数据。正式版不再持久化运行时/扫描诊断导出数据；history scanner 为 fail-closed 判定保留的结构化阶段信息只存在于当前扫描内存中。升级安装时会一次性清理旧版遗留的诊断 storage key。

Manifest 权限仍为 `storage` + `https://chatgpt.com/*`。
