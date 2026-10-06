# LongChat Guard 2.1.0 发布验收基线

## A. 构建与权限

- [ ] `npm run typecheck` 通过。
- [ ] `npm test` 全绿。
- [ ] `npm run build` 通过。
- [ ] `npm run verify:dist` 通过。
- [ ] `git diff --check` 通过。
- [ ] Manifest 仍为 MV3；正式发布版本与 package 一致（2.1.0）。
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