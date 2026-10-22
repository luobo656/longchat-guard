# LongChat Guard 2.1.1 产品基线

## 4.2.22 实验分支（不替代 4.2.21 正式本地稳定版）

用户主动发起的「历史基准学习」和「完整读取当前会话」可以在额外引导窗中选择 CDP 浏览器内部滚轮模拟或现有人工中键滚动；默认保留人工途径，普通实时监测绝不启动 CDP。实验功能需要必选 `debugger` 权限，只限 chatgpt.com 的当前激活标签页，用户可取消；它是浏览器内部注入事件，不是真实物理硬件输入。模拟向上、向下完成页面预加载后，仍由冻结的 2.1.1 `scanConversationHistory()` 完成正式扫描、完整性判定和校准提交。不能将「到达边界」直接当作消息完整性的证明；失败或证据不足时必须拒绝提交，可明确提供人工重试选择。4.2.21 保留独立 Git 标签与旧权限，不自动发布商店。

## 4.2.23 实验版匿名测试日志（仅本地手动复制）

为比较同一历史会话的人工与 CDP 自动完整读取，在既有「···」菜单里临时增加「复制测试日志」操作。对比记录仅存储在当前内容脚本运行内存中，最多保留最近四次用户主动读取，刷新/切换页面或扩展重载会丢失；不写 local/session storage，不自动上传，不包含会话网址、会话 ID、聊天正文、草稿、附件内容、原始指纹或日志中的任意未经白名单校验的错误文本。用户明确点击复制才写入系统剪贴板。报告包括操作方式（含自动失败转人工）、滚动进度与几何计数、原版扫描器的精简事件统计、消息数量/角色/内部估算单位和脱敏序列校验摘要，以及最终提交成功与否。4.2.21 稳定版与正式商业界面继续冻结，此菜单项仅实验版可见。报告用于比较而非证明 ChatGPT 官方额度或绝对读取完整。

## 4.2.24 可靠性验证：自动运行提示蒙版

延续已在一条 58 消息真实会话上通过正反顺序与刷新对照的 4.2.23 读取方法（仍非对全部长会话的完整性证明）。仅当用户主动选择 CDP 自动滚动时，显示页面级半透明蒙版与固定阶段提示，依次区分加载较早消息、返回最新消息、原版完整性验证和保存结果，不显示缺少可靠基数的百分比进度；保留清晰可用的「取消自动读取」按钮，Esc 亦可取消。蒙版须避免遮挡 CDP wheel 的命中点，通过样式只绘制蒙层、捕获/阻止人为点击和键盘输入，不能给整页设置捕获滚轮的透明实体层；物理滚轮/浏览器级快捷键等不可保证绝对锁定，需提示用户操作期间不要触摸。取消应中断 CDP、阻止未提交结果写入；原版扫描器不可随意修改，扫描中取消只承诺拒绝提交，不保证瞬时停止读窗。失败可解除蒙版并人工回退；人工模式不启用蒙版。三语言一致，不增权限、不改变冻结的计量/风险/校准模型。

## 4.2.25 项目新会话实时监测与错误归属修复（实验）

对 Projects 新建会话，显式空白路由 `/g/<项目>/project`、项目首页及普通新聊天页是高于前一会话 ID、旧 canonical、残留消息 DOM 的**新会话起点**证据。前一会话 ledger、风险及 pending confirmation 不得借由路由 fallback 在新页面复用；项目空白起点 + 首次实际 Composer 输入/发送 + 新 `/c/<id>` 路由必须允许完整认证。相反，直接打开已有历史 `/c/<id>` 时不准凭消息很少或短暂 DOM 空白自行补出从头观察证据。改进 SPA 路由调度，确保不依赖仅有的 popstate；保留没有证据时 fail closed。

被动检测长度上限需要真实的 ChatGPT 页面错误区域、明确且高置信的长度错误，以及与当前会话绑定的最新真实提交发送动作或已接受的用户轮次；不允许把普通消息正文、旧会话遗留的 toast、低置信泛化文字或切换中的错误误归属到新聊天。不修改用户主动「用此会话校准」流程，也不清空既存存储，历史参考继续可用。4.2.24 与之前的冻结回滚标签保留。

## 1. 产品定位

LongChat Guard 是面向 Chrome / Microsoft Edge、仅运行于 `chatgpt.com` 的 Manifest V3 浏览器扩展。

它的目标不是显示 OpenAI 官方 context window、token 额度或剩余容量，而是根据浏览器本地可观测证据，尽量在用户下一轮交互真正撞到 conversation-length limit 之前给出经验风险预警。

因此产品必须坚持两条底线：

- 不知道时显示“未知 / 未校准 / 暂无法判断”，绝不把未知包装成“风险较低”。
- 无法证明失败参考时，不显示看起来像总容量百分比的完整绿→黄→橙→红风险轨道。

## 2. 用户可见产品模型

普通用户只需要理解三个维度的最终结果，不需要理解 S/R/G/Generation 等内部术语。

### MeasurementState

- `unavailable`：当前页面没有足够测量信息。
- `partial`：能读取部分当前会话，但不能证明完整。
- `complete`：当前活动序列可可靠完整测量。
- `uncertain`：parser、sequence 或 DOM 特征不可靠。

### CalibrationState

- `uncalibrated`：没有当前测量环境可用的经验失败参考。
- `calibrating`：正在执行一次完整历史校准扫描。
- `calibrated`：存在 strong empirical failure reference。
- `calibrated_conservative`：失败样本确定，但存在附件/工具等不可精确计量上下文。
- `environment_unknown`：当前 parser / measurement 环境信息不足，无法确认现有校准是否适用。
- `stale`：只有旧 generation prior，或当前 parser / measurement 环境已与校准环境明确不一致。

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

完整风险轨道要求 Measurement complete、当前 calibration 可用且存在 usable R。轨道由 `referencePositionScore` 驱动，表示当前会话相对本地历史失败参考的位置；model hint 不参与轨道可用性或风险分级。

## 3. 核心经验量

内部保留四类经验量，但职责明确分离：

- `L`：当前活动会话的本地可测负载。它不是 OpenAI 服务端真实上下文使用量。
- `S`：成功证据，只用于一致性检查、环境漂移和 change-point 证据；S 不解锁风险轨道，也不让 UI 进入“风险较低”。
- `R`：EmpiricalFailureReference。它表示某个用户确认达到 conversation-length limit 的历史会话，在本地可测维度上的经验失败参考，不表示真实官方上限。
- `G`：TurnGrowthReserve，由完整可观察的一轮 `L_before -> L_after` 增长样本学习，而不是 Assistant 单条回答长度。

`R` 质量：

- strong：完整可靠扫描、healthy parser、没有已识别的不可测上下文来源。
- conservative：样本确定达到上限、扫描可靠，但存在附件/工具/搜索等不可精确计量上下文。
- provisional：完整性或 parser 不足。只能作为内部弱证据，不得输出确定风险。

## 4. 校准与完整读取 UX

普通使用无需扫描。扩展后台持续观察当前 L、整轮增长和测量质量。

首次建立经验失败参考时：

1. 用户打开一个自己明确知道以前达到过 ChatGPT 会话长度上限的历史会话。
2. 点击唯一动作“用此会话校准”。
3. 该点击本身就是用户声明“这个会话确实达到过长度上限”。
4. 扩展执行一次完整历史扫描。
5. 扫描可靠则直接形成 strong 或 conservative R；扫描不可靠则不写有效 R，并在面板内说明原因。

显式校准不再经过“扫描当前会话 → 扫描上限会话 → Yes/No”双扫描流程，也不做第二次确认。

Passive path 仍可在页面自行出现可能的 conversation-length-limit 时创建 pending confirmation；这条确认路径只服务于扩展被动发现，不和显式校准混用。

“完整读取当前会话”与校准完全分离，并固定放在右上角“···”菜单中。用户可在任意具体会话中主动执行一次完整历史读取，用于刷新该会话自己的 ledger/L 和当前风险；它不得新增或修改 failure reference、calibration sample、generation、growth sample 或 pending confirmation。

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

当 R 可用但 G 样本不足时，不发明 1/2/3-turn 风险带；只有 `baseLoad >= R` 才进入 high，否则保持 normal，同时 UI 说明仍在学习整轮增长。

Composer 草稿正文只在内存中估算，不持久化。

视觉轨道与风险状态分开：

```text
referencePositionScore = clamp((L + ComposerDraftLoad) / R, 0, 1)
```

G 只参与提前风险判断，不参与进度条缩放。16 段轨道只点亮已经跨过的完整分段，避免低位显示虚高。

## 6. EnvironmentSignature

只记录能可靠观察的环境维度：

- parser schema version
- measurement schema version
- 可可靠读取时的 model hint（仅诊断记录，不参与 R 质量、风险分级、generation 切换或 calibration 有效性判断）

环境兼容性只比较 parserSchemaVersion 与 measurementSchemaVersion。model hint 缺失、出现或变化都不能单独触发 stale，也不能改变风险状态。

不声称知道用户套餐、OpenAI 服务端 context window、Memory 或隐藏系统上下文。

旧 generation 的 R 只能作为 stale prior。重新学习后，直到当前 generation 重新建立有效 R 之前，不输出确定性的风险结论。

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
- 说明“要启用风险提醒，请用一个已达到长度上限的历史会话完成校准。”
- 不显示完整风险轨道。
- “用此会话校准”明确提示：仅用于用户确认曾达到上限的历史会话。

parser/sequence 当前无法可靠判断：

- 显示“暂无法判断”。
- 不显示风险轨道。
- 提示用户可从“···”菜单主动执行“完整读取当前会话”。

stale：

- 显示“需要重新校准”。
- 不显示风险轨道。

strong/conservative 校准且 measurement complete：

- 恢复 16 段绿色→黄色→橙色→红色风险轨道。
- 轨道表示当前会话相对本地历史失败参考的位置，不表示 OpenAI 官方额度、token 百分比或官方 context window。
- 主状态只表达会话风险：风险较低 / 偏长 / 接近风险 / 高风险。
- model hint 的缺失或变化不改变上述风险状态，也不要求重新校准；它只作为可选诊断信息保存。
- parser/measurement schema 不一致、environment_unknown、stale、uncalibrated 或 measurement 非 complete 时继续隐藏风险轨道。

右上角 overflow menu 固定提供三个低频操作：

- 完整读取当前会话
- 重新校准提醒基准
- 本会话不提醒 / 恢复提醒

“完整读取当前会话”由用户主动决定是否执行，不再根据 measurement 状态动态出现或消失。菜单锚定触发按钮并做 viewport clamp，优先放在风险卡上方，避免遮挡主要信息。

## 9. Coverage、parser 与被动状态单调性

Coverage、parser health 与 sequence reliability 是风险资格 gate，不再只是内部 reason。

- parser unreliable/degraded → MeasurementState uncertain。
- sequence unreliable → MeasurementState uncertain。
- coverage incomplete/mostly_complete → MeasurementState partial。
- 只有 complete + healthy + reliable 才允许新的风险结论。

完整历史扫描继续 fail closed：无法证明连续、稳定、完整时，不提交 calibration。

被动监测明确分成两层：DOM 读取结果只是 transient observation；只有 complete + healthy + reliable 的被动测量才有资格成为 authoritative ledger。只要当前 generation 与 measurement environment 仍一致，任何 partial / degraded / uncertain 的弱观测都不得覆盖已经存在的 authoritative ledger，也不得增加 ledgerRevision。

用户发送动作只创建内存中的 PendingTurnIntent，表示当前会话正在等待新的权威测量；它不会把弱 DOM 快照写进 storage。新的 complete + healthy + reliable 观测提交后，才正式推进 authoritative ledger，并据此确认整轮增长。显式“完整读取当前会话”和校准扫描属于独立的 authoritative transaction，可在扫描完整可靠时直接替换 ledger。generation 或 measurement schema 变化会使旧 ledger 失去当前环境下的 authoritative 资格。

当前 conversation identity 另由页面级 ConversationSessionState 维护，不依赖某一次 parser 是否刚好能读出 URL/DOM identity hint。空白会话一旦绑定到新 conversation ID，`observed_from_start` 对该 conversation 单调保持；renderer settle、URL 临时变化或 identity hint 暂时消失不能把它清掉。明确切换历史会话、browser back/forward 或新的文档会话才重置页面 Session。这样 measurement authority 与 conversation identity 各自只有一个职责。

身份解析不得用“全页面第一个 `data-conversation-id`”作为当前会话，因为侧边栏/历史列表可以同时包含其他会话 ID。当前实现只接受 URL `/c/<id>` 作为强切换证据；没有强路由 ID 时，已经绑定的 Session identity 优先；DOM hint 只从当前消息树祖先范围补充。根路径 + 短暂空 DOM frame 不再触发 reset。

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

被动 observation 只有在取得新的 authoritative measurement，或当前根本不存在可用 authoritative ledger 时才允许写入；已有 authoritative ledger 时，弱观测只存在于当前页面生命周期中，不进入持久化状态。

完整历史扫描带 scan session identity；会话、generation 或 ledger 在扫描期间变化则 fail closed，不提交半成品。

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