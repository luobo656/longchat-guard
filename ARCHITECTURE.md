# LongChat Guard 架构基线（Unreleased）

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

产品不再由 BaselineState / ReferenceAction / RiskLevel 三套状态分别控制 UI。统一领域维度为 MeasurementState、CalibrationState、RiskState。

## 3. Page Adapter 与 MeasurementState

`dom-reader.ts` 负责读取当前 DOM 可见消息、Composer、可见错误、生成状态和 tail evidence；不持久化原始文字。

`page-adapter.ts` 输出 coverage/parser health。随后 `product-state.ts` 将 coverage、parser、sequence 和 DOM support 归约为：

- unavailable
- partial
- complete
- uncertain

只有 complete 可进入风险计算。degraded parser 不再允许“正常”。

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

风险结论与视觉位置分开：`RiskState` 回答是否有资格给出 normal/long/organize/high；`referencePositionScore` 只表示当前本地负载相对 empirical failure reference 的位置，并驱动 16 段视觉轨道。环境无法验证时，低负载仍可保持 RiskState=unknown，但只要 measurement complete 且当前 calibration 可用，referencePositionScore 仍可显示本地历史参考位置；这不会被解释成官方额度或安全认证。

## 6. Generation 与 EnvironmentSignature

Generation 用于隔离校准环境。EnvironmentSignature 只包含：

- parserSchemaVersion
- measurementSchemaVersion
- 可可靠读取时的 modelHint

modelHint 的缺失与明确冲突分开处理：校准时 modelHint 已知、当前暂时不可读 → environment_unknown；校准时 modelHint 本来就不可读 → EnvironmentConfidence=unverified，历史 R 只能用于参考位置和提前预警，不能认证 Normal；双方 modelHint 已知且不同，或 parser/measurement schema 不同 → mismatch/stale。

`startNewGeneration(recalibrate/environment_change)` 创建空 samples + 空 turnGrowthSamples。旧 R/S 仅写入 warmStartPrior，属于 stale prior；旧 Assistant-only growth 不迁入新 G。

环境 signature 明确冲突、change-point 建议或只有 prior 时，CalibrationState=stale。

## 7. Storage schema 10

Schema 10 的 ledger 新增：

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

Completion/Failure event 也携带 expectedLedgerRevision，避免旧标签页追加旧证据。

跨标签页的 `chrome.storage.onChanged` 只用于重新读取状态并本地重绘 UI，绝不触发新的 observation 写入。这样既能同步 mute/calibration，又不会形成 “storage change → observe → write → storage change” 的反馈回路。

## 8. Migration

Schema 9 及更旧状态升级为 10：

- conversation references 继续统一转换为 install-salted SHA-256 pseudonymous key。
- `firstConfirmedFailureLoad` 迁移为 `empiricalFailureLoad`。
- legacy strong/conservative 质量可保留；无法映射的质量降为 provisional。
- 旧环境信息缺失，因此旧有效 R 迁移后在当前产品状态中表现为 stale，而不是自动视为当前 calibration。
- 旧 `recentAssistantTokenCounts` 不迁移为 TurnGrowthSample。
- 旧 `hasUnmeasuredAttachments` 只在 migration 时转换为 uncertaintySources；新 schema 不再让 attachment 永久粘住整个会话。
- migration 可重复运行，结果幂等。

## 9. History Scan Transactions

完整历史扫描有两个明确分开的用途，共用同一套 head/tail、虚拟窗口拼接和 fail-closed scanner，但提交语义不同。

**Calibration scan**：显式“用此会话校准”创建 ActiveCalibrationScan，并在可靠完整读取后同时更新当前会话 ledger 与 empirical failure reference。

- scanSessionId
- raw/pseudonymous conversation key
- expectedGenerationId
- expectedLedgerRevision

扫描结束前会再次验证 conversation identity；Background commit 再验证 generation/revision。任一改变则拒绝提交。刷新/extension reload 会销毁 content script 内的 scan session，因此没有可提交的半成品。

**Measurement recovery scan**：用于已经存在可用提醒基准、但当前普通旧历史会话只有 partial/uncertain measurement 的情况。它同样记录 conversation identity、expectedGenerationId、expectedLedgerRevision，并在完整读取后只提交该会话的 authoritative complete/reliable ledger；不得写 empirical failure reference、不得增加 calibration sample、不得创建 pending confirmation。这样旧会话可以恢复自己的 L，而不会被误当作上限样本。

Scanner 继续使用稳定 head/tail、虚拟窗口重叠、有限恢复和 fail-closed 策略。

## 10. UI

`GuardUiModel` 直接携带三维领域状态。

`shouldRenderRiskTrack()` 在 UI 层再次 hard gate，基础资格为：

```text
measurement=complete
and calibration in {calibrated, calibrated_conservative}
and trackAvailable=true
```

在此基础上，`risk != unknown` 时正常渲染轨道；唯一例外是 `EnvironmentConfidence=unverified`，此时即使低负载仍为 `RiskState=unknown`，也可以渲染 `referencePositionScore` 表示本地历史参考位置，但不得认证为 Normal。environment_unknown / stale / uncalibrated 或 measurement 非 complete 时仍隐藏轨道。

Overflow menu 使用 fixed positioning、trigger anchoring、viewport clamp；键盘 ArrowUp/ArrowDown/Home/End/Escape 与 focus restoration 保留。

## 11. 隐私

Raw conversation text、Composer text 和附件内容只在内存瞬时处理。Storage 只保存 pseudonymous key、匿名 fingerprints、本地估算和状态元数据。扫描诊断不含 URL、正文或原始 fingerprint。

Manifest 权限仍为 `storage` + `https://chatgpt.com/*`。
