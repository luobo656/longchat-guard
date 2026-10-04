# LongChat Guard 产品基线（Unreleased）

## 1. 产品定位

LongChat Guard 是面向 Chrome / Microsoft Edge、仅运行于 `chatgpt.com` 的 Manifest V3 浏览器扩展。

它的目标不是显示 OpenAI 官方 context window、token 额度或剩余容量，而是根据浏览器本地可观测证据，尽量在用户下一轮交互真正撞到 conversation-length limit 之前给出经验风险预警。

因此产品必须坚持两条底线：

- 不知道时显示“未知 / 未校准 / 暂时无法判断”，绝不把未知包装成“正常”。
- 无法证明失败参考时，不显示看起来像总容量百分比的完整绿→黄→橙→红风险轨道。

## 2. 用户可见产品模型

普通用户只需要理解三个维度的最终结果，不需要理解 S/F/B/Generation 等内部术语。

### MeasurementState

- `unavailable`：当前页面没有足够测量信息。
- `partial`：能读取部分当前会话，但不能证明完整。
- `complete`：当前活动序列可可靠完整测量。
- `uncertain`：parser、sequence 或 DOM 特征不可靠。

### CalibrationState

- `uncalibrated`：没有当前环境可用的经验失败参考。
- `calibrating`：正在执行一次完整历史校准扫描。
- `calibrated`：存在 strong empirical failure reference。
- `calibrated_conservative`：失败样本确定，但存在附件/工具等不可精确计量上下文。
- `environment_unknown`：校准时模型可识别，但当前暂时无法读取同一环境信息；在重新确认前保持风险未知。
- `stale`：只有旧 generation prior，或当前环境无法证明仍与校准环境一致。

### RiskState

- `unknown`
- `normal`
- `long`
- `organize`
- `high`

硬 invariant：

```text
MeasurementState != complete
OR CalibrationState not in {calibrated, calibrated_conservative}
=> RiskState = unknown
```

完整风险轨道要求 Measurement complete 且当前 calibration 可用。通常 `RiskState=unknown` 时隐藏轨道；唯一例外是 EnvironmentConfidence=unverified 且仍有 usable R，此时允许显示 `referencePositionScore` 驱动的本地历史参考位置，但不能把它解释为“正常”或官方额度。

## 3. 核心经验量

内部保留四类经验量，但职责重新划分：

- `L`：当前活动会话的本地可测负载。它不是 OpenAI 服务端真实上下文使用量。
- `S`：成功证据，仅用于一致性检查、环境漂移和 change-point 证据；S 不解锁风险轨道，不让 UI 进入“正常”。
- `R`：EmpiricalFailureReference。它表示某个用户确认达到 conversation-length limit 的历史会话，在本地可测维度上的经验失败参考，不表示真实官方上限。
- `G`：TurnGrowthReserve，由完整可观察的一轮 `L_before -> L_after` 增长样本学习，而不是 Assistant 单条回答长度。

`R` 质量：

- strong：完整可靠扫描、healthy parser、没有已识别的不可测上下文来源。
- conservative：样本确定达到上限、扫描可靠，但存在附件/工具/搜索等不可精确计量上下文。
- provisional：完整性或 parser 不足。只能作为内部弱证据，不得输出确定风险。

## 4. 校准 UX

普通使用无需扫描。扩展后台持续观察当前 L、整轮增长和测量质量。

首次建立经验失败参考时：

1. 用户打开一个自己明确知道以前达到过 ChatGPT 会话长度上限的历史会话。
2. 点击唯一动作“用此会话校准”。
3. 该点击本身就是用户声明“这个会话确实达到过长度上限”。
4. 扩展执行一次完整历史扫描。
5. 扫描可靠则直接形成 strong 或 conservative R；扫描不可靠则不写有效 R，并在面板内说明原因。

显式校准不再经过“扫描当前会话 → 扫描上限会话 → Yes/No”双扫描流程，也不做第二次确认。

Passive path 仍可在页面自行出现可能的 conversation-length-limit 时创建 pending confirmation；这条确认路径只服务于扩展被动发现，不和显式校准混用。

普通旧历史会话的“当前长度测量恢复”与校准完全分离：当已有可用 R、但某个旧会话因未从开头持续观察而只有 partial/uncertain measurement 时，面板提供“完整读取当前会话”。它只执行一次完整历史读取并替换该会话自己的 ledger/L，然后使用现有 R 重新计算当前风险；不得新增或修改 failure reference、calibration sample、generation 或 pending confirmation。

## 5. 发送前风险

风险判断使用：

```text
baseLoad = CurrentLoad + ComposerDraftLoad
projectedLoad = baseLoad + learned TurnGrowthReserve
```

当 G 已学习：

- `baseLoad + G >= R` → high
- `baseLoad + 2G >= R` → organize
- `baseLoad + 3G >= R` → long
- 其他 → normal

当 R 可用但 G 样本不足时，不发明 1/2/3-turn 风险带；只有 `baseLoad >= R` 才进入 high，否则保持 normal，同时 UI 说明“正在学习整轮增长”。

Composer 草稿正文只在内存中估算，不持久化。

## 6. EnvironmentSignature

只记录能可靠观察的环境维度：

- parser schema version
- measurement schema version
- 可可靠读取时的 model hint

不声称知道用户套餐、OpenAI 服务端 context window、Memory 或隐藏系统上下文。

旧 generation 的 R 只能作为 stale prior。重新学习后，直到当前 generation 重新建立有效 R 之前，不输出确定性的正常/高风险结论。

## 7. 不确定上下文

会话 ledger 记录当前活动序列可识别的 `uncertaintySources`，例如：

- attachment
- tool_result
- web_search
- code_execution
- voice
- generated_image
- unknown_context

它不是永久粘性的会话级附件布尔值。附件或工具上下文被 branch 掉后，新活动序列可以恢复为干净状态。

扩展不编造这些来源对应的隐藏 token 数；它们只用于降低校准证据质量或让整轮增长样本退出 G 分布。

## 8. UI 规则

未校准：

- 显示“未校准”。
- 说明“当前会话长度已识别。要获得提前预警，请用一个曾达到会话长度上限的历史会话完成一次校准。”
- 不显示完整风险轨道。
- “用此会话校准”明确提示：仅用于用户确认曾达到上限的历史会话。

parser/sequence 不可靠：

- 显示“暂时无法判断”。
- 不显示风险轨道。
- 若已有可用提醒基准且当前是普通旧历史会话，显示“完整读取当前会话”，说明“用于确定这个旧会话的当前风险，不会修改提醒基准”。

stale：

- 显示“基准可能失效”。
- 不显示风险轨道。

strong/conservative 校准且 measurement complete：

- 恢复原 16 段绿色→黄色→橙色→红色风险轨道，轨道表示当前会话相对本地历史失败参考的位置，不表示 OpenAI 官方额度、token 百分比或官方 context window。
- EnvironmentConfidence=verified 时，主状态正常显示“正常 / 偏长 / 接近风险 / 高风险”。
- EnvironmentConfidence=unverified 时仍显示同一条本地历史参考轨道：低负载不得因此认证为“正常”，主状态保留“模型环境未确认”；进入偏长/接近风险/高风险区间时使用正常风险名称，不再追加“（保守）”后缀，并用一句辅助说明注明“当前模型未确认，进度按本地历史参考计算”。
- environment_unknown、stale、uncalibrated 或 measurement 非 complete 时继续隐藏风险轨道。

右上角 overflow menu 只保留低频操作：重新校准提醒基准、本会话不提醒/恢复提醒。菜单锚定触发按钮并做 viewport clamp，优先放在风险卡上方，避免遮挡主要信息。

## 9. Coverage 与 parser

Coverage、parser health 与 sequence reliability 是风险资格 gate，不再只是内部 reason。

- parser unreliable/degraded → MeasurementState uncertain。
- sequence unreliable → MeasurementState uncertain。
- coverage incomplete/mostly_complete → MeasurementState partial。
- 只有 complete + healthy + reliable 才允许风险结论。

完整历史扫描继续 fail closed：无法证明连续、稳定、完整时，不提交 calibration。

## 10. 数据一致性

每个 ledger 有：

- `ledgerRevision`
- `observationEpoch`
- `generationId`

旧 observation 不得覆盖新 observation。Background coordinator 串行 mutation，同时用 revision guard 拒绝 stale tab 写入。

merge 规则明确区分：

- latest-only：current load、coverage、parser、sequence、active branch、uncertainty、environment。
- union：匿名消息记录、completion/failure/dismissed evidence。
- max：revision、observation epoch、updatedAt。
- generation guard：扫描提交和 generation 必须一致。

完整历史校准带 scan session identity；会话、generation 或 ledger 在扫描期间变化则 fail closed，不提交半成品。

## 11. 隐私

- 首次同意前不读取 ChatGPT 正文，不估算、不 fingerprint、不注册监测。
- 不上传聊天正文。
- 不持久化用户/Assistant/Composer/附件正文。
- 不保存姓名、邮箱、API key。
- 原始 ChatGPT conversation ID 不持久化。
- 持久化的是 install-salted SHA-256 pseudonymous conversation identifier、匿名消息 fingerprint、本地负载估算、measurement/calibration 元数据和提醒设置。
- 失败扫描仅可保存不含 URL/正文/原始 fingerprint 的最小结构诊断，最多 7 天。
- 无服务端、无云同步、无 OpenAI API integration。

## 12. 范围外

LongChat Guard 不做：

- 官方额度或 context-window meter
- 精确 token/K/百分比展示
- 其他 AI 网站适配
- 自动代用户发送消息或新建会话
- OpenAI 未公开后端 API 依赖
- 云账号、云同步或远程聊天分析

Canonical brand 始终为 **LongChat Guard**。简体中文展示名为 **LongChat Guard · 长会话预警**，繁体中文为 **LongChat Guard · 長對話預警**。
