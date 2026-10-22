# LongChat Guard 2.1.1 发布验收基线

## 4.2.22 实验版增量验收（不用于改变 2.1.1 原版发布清单）

- [ ] 4.2.21 标签、提交、原安装数据均保留；实验分支可回滚。
- [ ] 4.2.22 Manifest 唯一新增必选权限 `debugger`；站点 host 和 content 匹配范围不扩大；三语言全量匹配。
- [ ] 人工上翻/下翻与原版扫描器仍然工作；实时监测绝不挂载 debugger。
- [ ] 自动滚动只在用户主动点击时附加 debugger，仅对主框架前台 chatgpt.com 当前标签发送 `Input.dispatchMouseEvent/mouseWheel`；永不执行任意 CDP 或网页脚本滚动。
- [ ] 上行/下行根据实际滚动变化与足够稳定的边界退出，不依据固定时长直接宣布成功。
- [ ] 取消、Esc、离开窗口、页面导航、附加失败、通信异常、超时均停止模拟并释放 debugger，不写入基准，也不能误报完整；自动失败有显式人工重试选择。
- [ ] 原 `scanConversationHistory()` 负责最终完整性与正文计量，历史 R / 当前 L 规则没有改变。
- [ ] 单元/集成测试与 typecheck、build、dist 检查通过；真实 Edge 长会话人工/自动对比尚需用户亲自验收。

## 4.2.23 复制测试日志增量验收

- [ ] 额外「··· → 复制测试日志」仅在有已完成的用户主动读取记录时可用，包含成功、读取不完整、被取消和后台提交失败。
- [ ] 最近四次记录保留于当前网页脚本运行内存，切换页面/刷新后清空，不往扩展存储、后台或服务器发送，用户操作前不触碰剪贴板。
- [ ] 同一会话的人工与自动记录能明确区分（自动失败转人工单独标注）；包含扫描数量、角色分布、内部估算单位、边界与扫描器事件摘要、聚合一致性摘要、耗时以及是否真正写入账本。
- [ ] 报告不包含原始内容、附件、网址、原始会话 ID、fingerprint 字段值、持久盐或任意错误字符串；仅允许代码白名单和有限枚举。报告不宣称官方 Token 计数，也不能把扫描失败报告为成功。
- [ ] 新入口的三语言文案、剪贴板成功/失败提示和操作测试覆盖齐全，不影响人工模式及现有风险 UI。

## 4.2.24 自动读取蒙版与可靠性验收

- [ ] 仅自动选择显示蒙版；人工模式、默认实时监测和重新加载后正常界面不受影响。
- [ ] 视觉遮罩固定覆盖可视页面，状态和「取消」清晰可见，适配窄屏/深色模式、Esc、减少动画偏好；任何阶段都不显示未经证明的完成百分比。
- [ ] 运行中阻止页面点击、表单/键盘操作；保留且说明物理滚轮与浏览器快捷键不能完全锁定。
- [ ] 蒙版不占据 CDP wheel 正在作用的聊天区域命中点，不触发 `auto_scroll_target_obstructed`，可实测真实长会话的上下滚动进度。
- [ ] 点击取消/Esc/失焦/关闭页面时及时中止自动输入，确保 detach；扫描开始后取消也不可提交账本，自动失败回退人工时蒙版完整卸载。
- [ ] 蒙版全生命周期（成功、失败、取消）清理 DOM、window 捕获监听和 AbortController，三语言文案齐备，不泄漏正文。
- [ ] 原版 scanConversationHistory、核心计量、风险与校准规则、浏览器权限不变；测试日志仍能记录自动前后数值和错误。
- [ ] 进入 ≥100 条消息且存在懒加载的真实会话，刷新后先自动再人工，另测反向顺序，复制匿名日志评估有序摘要/前后段/角色/单位/读窗状态。

## A. 构建与权限

- [ ] `npm run typecheck` 通过。
- [ ] `npm test` 全绿。
- [ ] `npm run build` 通过。
- [ ] `npm run verify:dist` 通过。
- [ ] `git diff --check` 通过。
- [ ] Manifest 仍为 MV3；正式发布版本与 package 一致（2.1.1）。
- [ ] permissions 仅包含 `storage`；host permission 仅 `https://chatgpt.com/*`。
- [ ] 最终发布 ZIP 仅来自 fresh build 的 `dist/`，ZIP 根目录直接包含 `manifest.json`。

## B. 产品 invariants

- [ ] 没有 usable empirical failure reference 时 RiskState 不是 normal。
- [ ] 没有 usable empirical failure reference 时不渲染完整风险轨道。
- [ ] MeasurementState unavailable/partial/uncertain 时 RiskState=unknown。
- [ ] S-only 仍是 uncalibrated。
- [ ] provisional failure reference 不产生确定性风险。
- [ ] stale prior 不产生确定性风险。
- [ ] conservative failure reference 可用于风险，但 UI 明确“提醒会更保守”。
- [ ] RiskState 与 referencePositionScore 分离：可用 R + complete measurement 时按本地历史参考输出“风险较低 / 偏长 / 接近风险 / 高风险”；modelHint 不影响分级。

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

## E. 性能与正式版运行稳定性

- [ ] Composer 每次输入不得调用完整 `readPageSnapshot()`；新会话出生判定只使用 Composer 文本 + message-root presence。
- [ ] Composer 草稿风险使用合并调度，连续输入不会逐键触发完整 conversation observation。
- [ ] MutationObserver 忽略 sidebar / 无关页面 / Composer-only DOM churn；Assistant streaming、conversation renderer replacement、alert/toast 仍能触发后续测量。
- [ ] 相同 GuardUiModel + busy state 不重复改写 Shadow DOM 或 16 段风险轨道。
- [ ] 正式版无“复制诊断信息”入口，也不持续写入 runtime/scan diagnostic storage；旧诊断 key 只在 install/update 时一次性清理。
