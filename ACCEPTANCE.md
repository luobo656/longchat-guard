# LongChat Guard Unreleased 验收基线

## A. 构建与权限

- [ ] `npm run typecheck` 通过。
- [ ] `npm test` 全绿。
- [ ] `npm run build` 通过。
- [ ] `npm run verify:dist` 通过。
- [ ] `git diff --check` 通过。
- [ ] Manifest 仍为 MV3，版本保持 2.0.2。
- [ ] permissions 仅包含 `storage`；host permission 仅 `https://chatgpt.com/*`。
- [ ] `release/` 未被修改或加入本轮提交。

## B. 产品 invariants

- [ ] 没有 usable empirical failure reference 时 RiskState 不是 normal。
- [ ] 没有 usable empirical failure reference 时不渲染完整风险轨道。
- [ ] MeasurementState unavailable/partial/uncertain 时 RiskState=unknown。
- [ ] S-only 仍是 uncalibrated。
- [ ] provisional failure reference 不产生确定性风险。
- [ ] stale prior 不产生确定性风险。
- [ ] conservative failure reference 可用于风险，但 UI 明确“提醒会更保守”。
- [ ] RiskState 与 referencePositionScore 分离：environment unverified + 低负载仍不得 Normal，但可以显示相对本地历史参考的位置。

## C. 校准流程

- [ ] 普通新会话无需任何扫描动作。
- [ ] 显式“用此会话校准”只需一次用户动作 + 一次完整扫描。
- [ ] 显式校准不再二次询问“是否到过上限”。
- [ ] complete+healthy+reliable+无 uncertainty → strong R。
- [ ] complete+healthy+reliable+有 uncertainty → conservative R。
- [ ] incomplete / parser 不可靠 / scan 不完整 → 不写 usable R。
- [ ] Passive length-limit detection 只创建 pending confirmation。
- [ ] Passive confirmation 使用检测时的 measurement metadata，不因后续页面状态更好而升级。

## D. 发送前风险与整轮增长

- [ ] Composer draft 被实时估算并进入 risk input。
- [ ] 超长 draft 能在发送前提高 projected risk。
- [ ] G 来自 `L_before -> L_after` 的 whole-turn delta。
- [ ] 有附件/工具/搜索等 uncertainty 的 turn growth 不进入 usable G 分布。
- [ ] 旧 Assistant-only B 不迁移成新 G。

## E. Storage / Multi-tab

- [ ] ledgerRevision / observationEpoch 持久化。
- [ ] stale baseRevision observation 不写 storage。
- [ ] stale completion/failure event 不写证据。
- [ ] storage.onChanged 只能只读刷新 UI，不能再次触发 observation 写入风暴。
- [ ] current load / coverage / parser / sequence / active branch 采用 latest-only。
- [ ] completion/failure/dismissed evidence union，不被 full scan 或另一个 tab 覆盖丢失。
- [ ] Scan commit 有 generation + ledger revision guard。
- [ ] Storage migration 幂等。

## F. Parser / Coverage / Uncertainty

- [ ] parser degraded/unreliable → MeasurementState uncertain。
- [ ] sequence unreliable → MeasurementState uncertain。
- [ ] coverage incomplete/mostly_complete → MeasurementState partial。
- [ ] attachment uncertainty 不永久粘住被 branch 掉后的新活动序列。
- [ ] tool/search/code/voice/generated-image 只在可识别实际上下文时记录，不因工具栏按钮误判。

## G. UI

- [ ] 未校准显示“未校准”，不能显示“正常”。
- [ ] 未校准说明当前长度已识别但需要历史上限会话校准。
- [ ] “用此会话校准”明确仅用于用户确认到过长度上限的历史会话。
- [ ] 正在校准有持续状态。
- [ ] 校准失败有持续 inline notice。
- [ ] parser/sequence 失败显示“暂时无法判断”。
- [ ] 已有可用提醒基准时，普通旧历史会话若 measurement 为 partial/uncertain，应提供唯一恢复动作“完整读取当前会话”；帮助文案明确“用于确定这个旧会话的当前风险，不会修改提醒基准”。
- [ ] 旧会话测量恢复成功后，只更新该 conversation ledger/L；empirical failure reference、calibration samples、generation、growth samples 和 pending confirmations 必须保持不变。
- [ ] stale 显示“基准可能失效”。
- [ ] strong calibration 显示“基准已建立”语义并可显示风险轨道。
- [ ] conservative calibration 明确说明“提醒会更保守”。
- [ ] 可用 calibration + complete measurement 恢复原 16 段绿色→黄色→橙色→红色轨道；轨道只表示本地历史参考位置，不显示百分比/token/官方额度。
- [ ] environment unverified + low load：主状态“模型环境未确认”，16 段轨道仍显示当前位置，但绝不能显示“正常”。
- [ ] environment unverified + long/organize/high：主状态使用“偏长 / 接近风险 / 高风险”，不追加“（保守）”后缀；辅助说明简短注明当前模型未确认、进度按本地历史参考计算。
- [ ] Overflow menu 不改变 panel height，优先不遮挡风险卡，键盘导航和 focus restoration 可用。
- [ ] Overflow menu 的“本会话不提醒 / 恢复提醒”只更新该 pseudonymous conversation control，操作后菜单文案同步切换，不改变 calibration / R / G。
- [ ] UI 不显示 token、K 值、百分比或“官方额度”式精度。

## H. Privacy

- [ ] 同意前不读 ChatGPT 正文、不 fingerprint、不估算、不启动 MutationObserver。
- [ ] 不持久化用户/Assistant/Composer/附件正文。
- [ ] 不上传聊天正文。
- [ ] 不存姓名/邮箱/API key。
- [ ] raw conversation ID 不持久化。
- [ ] 文档使用“install-salted pseudonymous identifier”，不把它描述为不可关联的绝对匿名标识。
- [ ] failed scan diagnostics 最多 7 天且不含 URL/正文/raw fingerprint。

## I. Real Browser E2E

真实 Edge/Chrome 开发扩展必须至少验证：

- [ ] A 无校准：未校准、无完整风险轨道、无 Normal。
- [ ] B 普通新会话：自动监测，不需要扫描建立 S。
- [ ] C 已知历史上限会话：一次“用此会话校准”直接完成 strong/conservative calibration。
- [ ] C2 普通旧历史会话：在已有 R 的前提下，若初始为 partial/uncertain，点击“完整读取当前会话”后 measurement 变 complete/reliable，并使用原 R 重新计算该会话风险；不得改变 R。
- [ ] D attachment calibration：显示保守基准且风险轨道可用。
- [ ] E 当前 L==R：高风险。
- [ ] E2 model-unverified：低负载仍非 Normal 但显示中间参考位置；L==R 时显示高风险且 16 段轨道满格。
- [ ] F 超长 composer：发送前风险变化。
- [ ] G 页面/扩展 reload：状态一致。
- [ ] H 同会话双 tab：旧 revision 不覆盖新状态。
- [ ] I parser/sequence unreliable：暂时无法判断，绝不 Normal。
- [ ] J 重新校准：旧参考变 stale prior，风险轨道隐藏。
- [ ] K Overflow menu：原生鼠标点击可见菜单并执行“本会话不提醒 / 恢复提醒”，状态持久化且可恢复。
