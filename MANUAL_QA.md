# LongChat Guard Unreleased 真实浏览器 QA

自动测试和 production build 不能替代此清单。使用 Edge / Chrome 开发扩展加载项目 `dist/`，在真实 `chatgpt.com` 页面执行。

## 0. 前置命令

```bash
npm run typecheck
npm test
npm run build
npm run verify:dist
git diff --check
```

确认 Manifest version 仍为 2.0.2，本轮不发布商店、不创建 GitHub Release。

## A. 无校准

1. 使用没有当前有效 R 的状态打开任意 ChatGPT 会话。
2. 打开 LongChat Guard 面板。

预期：

- 胶囊/面板显示“未校准”或测量不可靠时“暂时无法判断”。
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
- whole-turn growth 只在完整、可靠且无 uncertainty 的整轮完成后加入当前 generation。

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
- environment verified 时按正常 / 偏长 / 接近风险 / 高风险显示主状态。
- environment unverified 且位置较低时，主状态为“模型环境未确认”，但轨道仍显示本地历史参考位置，不得显示“正常”。
- environment unverified 进入偏长/接近风险/高风险时，使用普通风险名称，不出现“（保守）”后缀；辅助文案只说明当前模型未确认、进度按本地历史参考计算。
- environment_unknown / stale / measurement 非 complete 时不显示轨道。

## G2. 普通旧历史会话恢复当前风险

前置：已经用一个真正达到长度上限的历史会话完成提醒基准校准。

1. 打开另一个普通旧历史会话；这个会话在安装扩展前已存在，LongChat Guard 没有从第一条消息开始持续观察。
2. 等待面板显示“暂时无法判断”。
3. 展开面板，确认出现“完整读取当前会话”，副说明为“用于确定这个旧会话的当前风险，不会修改提醒基准”。
4. 点击一次并保持当前会话打开直到读取完成。

预期：

- 只完整读取当前这个旧会话，不询问“是否达到过上限”。
- 不修改已有提醒基准 R，不创建新 calibration sample，不切 generation。
- 成功后该会话 measurement 为 complete/reliable，并基于原 R 计算风险。
- 若模型环境不可验证，低负载仍显示“模型环境未确认”而不是“正常”；接近/达到 R 时仍可给保守警告。
- 再次打开同一会话时不要求重复完整读取，除非其 measurement 后续真实失效。

## H. 同会话双标签页

1. 两个标签页打开同一个会话。
2. 让 Tab A 先产生新 observation。
3. 再触发 Tab B 的旧页面 observation。

预期：

- Background 拒绝 baseRevision 已过期的写入。
- 旧 tab 不把 current load / coverage / parser / sequence / active branch 回写。
- completion/failure evidence 不丢失。
- content 收到 staleObservation 后重新基于最新 revision 观察。

## I. Parser / Sequence Fail-Closed

在 DOM 未完整加载、虚拟窗口无法对齐或 selector canary 失败时观察。

预期：

- MeasurementState=uncertain/partial。
- RiskState=unknown。
- UI 显示“暂时无法判断”。
- 不显示 Normal，不显示完整风险轨道。

## J. 重新校准

1. 在已有有效 R 时打开 overflow menu。
2. 选择“重新校准提醒基准”。

预期：

- 创建新 generation。
- 旧 R 只保存在 warmStartPrior。
- 新 generation 无 current R / whole-turn G 样本。
- UI 显示“基准可能失效”。
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
- “本会话不提醒”点击后菜单切换为“恢复提醒”；再次点击恢复。该控制只作用于当前 pseudonymous conversation，不改变提醒基准或整轮增长样本。
- 正常用户路径最多一个主要操作。
- 三语 UI 不混杂旧“扫描当前会话 / 扫描达到上限会话 / 重新学习会话长度基准”文案。
