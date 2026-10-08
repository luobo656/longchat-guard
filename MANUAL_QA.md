# LongChat Guard 2.1.1 真实浏览器 QA

自动测试和 production build 不能替代此清单。使用 Edge / Chrome 开发扩展加载项目 `dist/`，在真实 `chatgpt.com` 页面执行。

## 0. 前置命令

```bash
npm run typecheck
npm test
npm run build
npm run verify:dist
git diff --check
```

确认 Manifest version 为正式发布候选 2.1.1；只有全部发布门禁通过后才提交商店与 GitHub Release。

## A. 无校准

1. 使用没有当前有效 R 的状态打开任意 ChatGPT 会话。
2. 打开 LongChat Guard 面板。

预期：

- 无 authoritative ledger 时，胶囊/面板显示“未校准”或测量不可靠时“暂无法判断”。
- 不能出现“正常”。
- 完整绿色→红色风险轨道不可见。
- 说明当前长度已识别、需要一个用户确认到过长度上限的历史会话校准。

## B. 普通新会话

1. 打开真正空白的新聊天。
2. 正常发送消息并等待 Assistant 完成。

预期：

- 插件自动观察 L。
- 用户不需要执行“扫描当前会话”或任何 S 操作。
- 未校准时仍不显示确定风险。
- whole-turn growth 只在用户 send intent 已被新的 authoritative observation 确认、且整轮完整可靠无 uncertainty 后加入当前 generation。
- 点击“新建聊天”后，即使 ChatGPT 在第一条消息出现前就先分配 `/c/<id>`，该会话仍必须保留 new-chat start evidence；第一轮完成后 measurement=complete，并记录恰好一个 TurnGrowth。
- 项目（Projects）内如果页面一开始就处于带 conversation ID 的空会话路由，用户从这个 0 消息 Composer 发送第一条消息也必须被视为新会话起点；不能因为 URL 已有 ID 而按历史会话处理。
- Projects/普通新会话的“出生证明”以 **0 消息 Composer 的首次实际输入** 为主状态证据：只要用户已经在无持久 ledger 的 0 消息 Composer 中输入正文，就先建立 new-chat start evidence；后续无论发送按钮结构、submit 事件、路由 ID 分配先后如何，都不得再把该会话误判成历史会话。
- 回答生成和 DOM settle 期间即使出现 transient parser churn，也不能把已经建立的 authoritative ledger 降级或写坏。

## C. 显式历史上限校准

1. 打开一个用户明确知道曾达到 conversation-length limit 的历史会话。
2. 点击“用此会话校准”一次。

预期：

- 按钮进入“正在校准”。
- 只执行一次 full-history scan。
- 不再出现“扫描达到上限的会话”或“这个会话到过上限吗？”二次确认。
- 扫描完整后直接形成 strong 或 conservative R。
- 扫描不完整时持续显示失败原因，storage 中无 usable R。

## D. 附件/不可测上下文样本

对已知上限且包含附件/可识别工具上下文的历史会话执行显式校准。

预期：

- CalibrationState=calibrated_conservative。
- UI 显示“基准已建立 · 提醒会更保守”语义。
- Measurement complete 时风险轨道可以使用。
- 该参考不作为 strong environment-conflict 证据。

## E. L == R / L > R

在校准样本本身或测试状态中令当前本地可测负载达到/超过 R。

预期：

- RiskState=high。
- 风险轨道进入最右侧高风险区。
- 不声称 R 是 OpenAI 官方 context limit。

## F. 超长 Composer

1. 在低于 R 的完整会话中输入较长草稿但不要发送。
2. 观察面板。

预期：

- 草稿输入时 Mutation/input path 触发重新判断。
- Draft 不写入 storage 正文。
- 当 `L + Draft + G` 进入对应区间时，发送前风险升级。

## G. Reload

分别执行：

- ChatGPT page reload。
- 扩展管理页“重新加载”。

预期：

- schema 10 state 可恢复。
- 当前有效 calibration 不凭空丢失或升级。
- stale prior 仍 stale。
- raw conversation ID/正文没有进入 storage。

## G1. 原分段风险轨道

前置：已有可用提醒基准，当前会话 measurement=complete。

预期：

- 黑色风险卡显示 16 段绿色→黄色→橙色→红色轨道，视觉与重构前用户确认过的分段版本一致。
- 会话增长时激活段数连续增加；不显示百分比、token、K 值或官方额度。
- calibration 可用且 measurement complete 时按风险较低 / 偏长 / 接近风险 / 高风险显示主状态。
- modelHint 缺失或变化不改变主状态、R 质量、generation 或轨道显示；模型标签只作为诊断信息。
- parser/measurement schema 不一致、environment_unknown / stale / measurement 非 complete 时不显示轨道。

## G2. 普通旧历史会话恢复当前风险

前置：已经用一个真正达到长度上限的历史会话完成提醒基准校准。

1. 打开另一个普通旧历史会话；这个会话在安装扩展前已存在，LongChat Guard 没有从第一条消息开始持续观察。
2. 如果当前 measurement 不完整，面板应显示“暂无法判断”。
3. 打开右上角“···”，确认菜单始终包含“完整读取当前会话”。
4. 点击一次并保持当前会话打开直到读取完成。

预期：

- 只完整读取当前这个旧会话，不询问“是否达到过上限”。
- 不修改已有提醒基准 R，不创建新 calibration sample，不切 generation。
- 成功后该会话 measurement 为 complete/reliable，并基于原 R 计算风险。
- 模型标签不可读不影响风险判断；完整读取成功后直接按原 R 显示风险较低 / 偏长 / 接近风险 / 高风险。
- 再次打开同一会话时插件不会主动要求重复读取；“完整读取当前会话”仍常驻菜单，是否重读由用户决定。

## H. 同会话双标签页

1. 两个标签页打开同一个会话。
2. 让 Tab A 先产生新 observation。
3. 再触发 Tab B 的旧页面 observation。

预期：

- Background 拒绝 baseRevision 已过期的写入。
- 旧 tab 不把 current load / coverage / parser / sequence / active branch 回写。
- completion/failure evidence 不丢失。
- content 收到 staleObservation 后重新基于最新 revision 观察。

## I. Parser / Sequence 与 Authoritative Ledger

分别验证两类场景。

### I1. 尚无 authoritative ledger

在首次打开的旧历史会话或尚未取得 complete + healthy + reliable 测量时，让 DOM 未完整加载、虚拟窗口无法对齐或 parser canary 失败。

预期：

- 当前 transient observation 为 uncertain/partial。
- 没有可用 authoritative ledger，因此 RiskState=unknown。
- UI 显示“暂无法判断”，不显示完整风险轨道。

### I2. 已有 authoritative ledger 后出现 transient parser churn

1. 在一个已显示“风险较低 / 偏长 / 接近风险 / 高风险”的完整可靠会话中记录当前 ledgerRevision。
2. 让 Assistant streaming/settle 或 DOM renderer 切换暂时产生 partial/degraded/uncertain 观测。
3. 等待该 transient 状态经过 debounce/后台 observation 流程。

预期：

- transient observation 不写 storage。
- authoritative ledger 的 coverage/parser/sequence/currentLoad/revision 保持不变。
- UI 继续使用最后一次 authoritative 风险与轨道，不闪回“暂无法判断”。
- 后续重新取得 complete + healthy + reliable 测量时，才允许提交新的 authoritative ledger。
- 用户刚发送的新一轮只保存在内存 PendingTurnIntent 中；弱观测不能确认该 turn，新的 authoritative observation committed 后才能进入 completion / TurnGrowth。

### I3. Authority 失效

当 generation 或 parser/measurement schema 真正变化时：

- 旧 ledger 不再具有当前环境的 authoritative 资格。
- 不得因为“保留最后结果”而跨环境继续显示确定风险。
- 按 stale / fail-closed 规则重新建立当前环境的可信状态。

### I4. Conversation identity continuity

1. 新建空白会话并发送一条短消息，等待第一次显示“风险较低”。
2. 模拟 Assistant 完成后的 renderer settle：先让 URL 临时回到根路径、消息区短暂变空，同时移除 canonical / 当前 conversation-id hint。
3. 再在侧边栏放入另一个合法格式的 `data-conversation-id`，等待多次 MutationObserver / passive observation 周期。

预期：

- ConversationSessionState 仍绑定原 conversation ID，根路径 + 空 DOM frame 不得触发身份 reset。
- 页面全局/侧边栏的 `data-conversation-id` 不得抢占当前会话。
- 如果 ChatGPT 在同一个新会话里把初始 conversation ID 替换成新的 canonical ID，只有当前页面消息与旧 authoritative ledger 存在内容指纹重合时，才允许把 `observed_from_start` 连续性转移到新 ID；同时保留该轮 PendingTurnIntent / TurnGrowth。
- 真正的历史会话导航、新建聊天或 browser back/forward 必须先显式 reset Session，不能把 `observed_from_start` 转移过去。
- `observed_from_start` 在同一会话的可信 identity rebind 中不回退。
- UI 保持最后可信风险与轨道，不闪回“暂无法判断”。
- authoritative ledger revision 不因 identity hint 丢失或侧边栏 hint 出现而变化。
- 真正点击另一个历史会话、新建聊天控件或 browser back/forward 时必须重置 session，不得把原会话身份带过去。


## J. 重新校准

1. 在已有有效 R 时打开 overflow menu。
2. 选择“重新校准提醒基准”。

预期：

- 创建新 generation。
- 旧 R 只保存在 warmStartPrior。
- 新 generation 无 current R / whole-turn G 样本。
- UI 显示“需要重新校准”。
- 完整风险轨道隐藏，直到显式校准重新完成。

## K. Passive Length Limit

当页面自行出现明确或可能的 conversation-length-limit 时：

- 扩展只显示“检测到可能的会话长度上限，是否用此会话校准？”。
- 未经用户接受不写 usable R。
- 用户接受后使用错误出现当时保存的 coverage/parser/uncertainty/environment 质量，不用后续页面状态把弱证据升级为 strong。
- usage limit / rate limit / network error 绝不写 length-limit calibration。

## L. UI / Accessibility

- 点击页面外或 Escape 收起 panel。
- menu ArrowUp/ArrowDown/Home/End 有效。
- Escape 关闭 menu 并恢复 trigger focus。
- menu 锚定 `···`，viewport 内夹取，优先位于风险卡上方。
- “完整读取当前会话”常驻菜单。
- “本会话不提醒”点击后菜单切换为“恢复提醒”；再次点击恢复。该控制只作用于当前 pseudonymous conversation，不改变提醒基准或整轮增长样本。
- 开发态扩展重新加载导致旧 content-script 的 `chrome.i18n` 上下文失效时，已显示的中文/繁中文案不得退回英文；若扩展 API 暂不可用，使用同一套打包 locale catalog 保持原语言。
- 正常用户路径最多一个主要操作。
- 三语 UI 不混杂旧“扫描当前会话 / 扫描达到上限会话 / 重新学习会话长度基准”文案。