# LongChat Guard 2.1.1 发布验收基线

## 4.3.2 项目新会话即刻实时监测验收（实验）

- [ ] 对 Projects 首页新建对话，单页导航经历空白项目输入、无 ID 非空白过渡、首条 user/assistant 各阶段时，已确认的空白创建起点不得遗失；最终可信 `/c` ID 出现后可以正常产生完整性证明并开始实时监测。
- [ ] 带旧 canonical / 旧侧栏会话 DOM ID 的非 `/c` 项目中间态不得错误绑定其他会话账本；加载片段暂只有 Assistant 的窗口不消耗新会话起点证据。
- [ ] 直接打开已有 `/c` 历史会话、同项目分支、旧会话列表点击和身份不明页面不能靠短对话或 DOM 空白误显示低风险。
- [ ] 4.3.2 的真实 Manifest、package、lockfile、验证脚本、测试和 dist 一致，扩展 ID/权限、本地 R/L/匿名盐未变；源码提交保留 4.3.1 回滚；全部测试、typecheck、build 与 CI 通过。
- [ ] 用户在真实 Edge 至少两个 Projects 复测新建→首次输入→GPT 流式回复→第二轮、重开旧历史仍保守；未验之前不称线上彻底解决。

## 4.3.1 本地版本显示验收

- [ ] Edge/Chrome 同一个未打包扩展目录重新加载后，在 `edge://extensions`/`chrome://extensions` 的扩展详情显示 `4.3.1`，而不是 `4.3.0`；无需将诊断版本文字重新加入页面悬浮面板。
- [ ] Manifest、package.json、package-lock.json（根包）、构建产物、版本测试一致；商店 4.3.0 现有历史文案/ZIP、Git 标签与在线软件说明保持原状，仅本地待验版可被识别。
- [ ] 不改扩展 ID、权限、原有 `conversationGuardState`、安装匿名盐、当前环境兼容键和计量算法；升级后通过已保存的 R/L 恢复回归测试。

## 4.3.1 跨版本持久缓存专项验收（实验）

- [ ] 原本 4.3.0 的持久化已认证 R + 已完整读取 L，经过扩展进程重启、同口径补丁升级、loadState/saveState/readState 多轮归一化后完全可用：不重读旧历史、不重学旧基准、不重新申请隐私授权；匿名盐和会话键保持不变。
- [ ] 经 30+ 个后续正常聊天成功样本后，最早的 strong/conservative 失败参考仍存在且可用，失败参考载荷/质量/样本数不被新 safe-only 数据挤掉；没有真实 R 时仍未知。
- [ ] 已认证 20+ 会话超出原 12 条滚动缓存上限时，较老会话的权威 ledger 仍在，完整性/环境/负载/L/匿名锚点一致，冷档前缀单位保留正确，多次 normalize 幂等；更老未完成/不可靠记录可按短期上限裁剪。
- [ ] 当可见窗口还包含冷档锚点之前的旧消息时，具有真实有序尾锚且在会话尾部的新追加消息能正确计量且前缀不重复；锚点重排、全不相交或未知尾部仍 fail closed。
- [ ] 旧会话直接打开时，只有 conversation ID/generation/parser+measurement schema 一致、历史认证完整、parser 健康且锚点可信才使用缓存；不兼容环境、换会话 ID、旧 generation、未认证分支不能解锁绿色轨道。
- [ ] 无新权限、无聊天正文/草稿/附件正文持久化，现有读写配额保护能防止写失败时覆盖历史可信数据；typecheck、全测试、build+dist+store preflight、Git diff 和 GitHub CI 全绿。
- [ ] 正式发布前用同一个 Edge 扩展 ID 依次实测“已校准→20+条历史记录→更新→重开已读取会话→继续一轮”，不能以模拟测试替代真实浏览器验收。

## 4.3.1 未发布修复候选验收

- [ ] ChatGPT 非聊天正文、真实可见明确触顶横幅出现时显示「已达会话长度上限」，隐藏经验 R/L 刻度；Parser 暂不可用也不应显示低风险；不把可见提示自动写入 R。
- [ ] 历史或项目空白页残留的旧提示、隐藏元素、会话内的引用和泛化文章文案不触发真实触顶状态。
- [ ] 新项目聊天首次 user、GPT streaming、完整回复和下一轮正常保留完整性证据；保存/恢复匿名账本后发生 renderer stable ID 替换时，不把一条回复分成多条、不重复计量、不出现无故序列降级。
- [ ] 老版 `ordinalHint` 缺失账本无需清零，后续只有可信匹配时才补回；无锚点的同角色消息窗口仍 fail closed。
- [ ] 页面 adapter 的旧 canonical/DOM ID 不得与 session 认证的 ID 分离写入记录；独立旧会话和真实项目分支未证明完整时依然未知。
- [ ] en、zh_CN、zh_TW 文案完整，缓存数据/插件身份/权限、历史 R/L 算法、商店 ZIP/冻结标签不变；`npm run typecheck`、`npm test`、`npm run build` 和 `git diff --check` 全绿。
- [ ] 正式升级前，在真实 Edge/Chrome 进行 ≥2 个项目新会话「首条发送→流式回复→完成→第二轮」与真实触顶页面、旧会话和分支回归验收；纯单元测试不能替代。

## 2026-10-22 官网四轨增长专项（不修改扩展安装包）

- [ ] 全部公开网页、站点地图、robots/canonical/hreflang 实际 HTTP 检查可复现，不把技术可访问性误称为 Google 已收录。
- [ ] 新的解决问题型内容具有 en/zh_CN/zh_TW 同主题页面、真实边界及清晰可核查的例子，不发表未经允许的用户聊天原文。
- [ ] GitHub 的 About/README/Release 与官网互相可导航，站外发布真实性清晰，不制造第三方链接。
- [ ] 保存官方 GitHub 统计并提供每周聚合数据检查，无法取得的 GSC、安装、AI 引用等字段显示未知；不加入网站跟踪 SDK 或额外权限。
- [ ] SEO/网站改动通过原有 4.3.0 扩展测试和生产构建，且网站真实部署成功，冻结标签及已审核 ZIP 不变。

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

## 4.2.25 项目新会话与误触顶修复验收

- [ ] 项目空白页到 `/g/g-p-.../c/<id>` 的真实首轮输入/发送可自动获得完整性证明和有用的风险判断，无需再次手动完整读取；未认证、刷新后中途打开的历史会话仍 fail closed。
- [ ] 导航到显式项目空白页必须隔离旧 ID、旧 ledger、旧 pending；即使旧 canonical 和残留消息节点存在，也不应误归属。项目旧聊天直接打开绝不能凭短暂 0 消息认证完整。
- [ ] 普通首页新会话、直接带 ID 的空会话开始、SPA pushState 导航、常规历史导航和分支均保持既有认证/保守行为。
- [ ] 被动长度限制只处理紧凑非聊天正文真实 alert/toast，且强证据须与同一会话最新真实提交发送动作或已接受用户轮次关联。旧 toast、陌生会话、无发送意图、低置信度、旧提示正文均不得产生候选校准弹窗；合法真实长度错误仍可待确认。
- [ ] 4.2.24/CDP 滚动/蒙版/用户主动校准/完整读取/历史 R/计量风险与测试日志均无退化；无新权限、无数据清除、三语言既有界面不变；typecheck、全量 tests、build、dist 和回滚部署校验通过。

## 4.2.26 自动开始立即误取消回归

- [ ] 从引导框点击「自动滚动」到新蒙版取消按钮获得焦点，旧按钮产生的 DOM blur 不能取消自动任务；需要看到实际滚轮步数及后续完整扫描，不能复现原日志 `stopping`、0 wheel、`auto_scroll_focus_lost`。
- [ ] 全局 Window 真正 blur、页面 hidden/pagehide、Esc、取消按钮仍中止并可靠清理 debugger；反复启动没有残留监听或额外调试 attach。
- [ ] 4.2.25 的项目新聊天监测、触顶误提示抑制、人工滚动、CDP 滚动轨迹与蒙版视觉/日志、冻结的历史扫描器和计量保持不变，原学习数据不删除。
- [ ] 类型检查、所有单元及集成测试、生产构建、dist 校验和 Git 变更检查通过；先备份 4.2.25 原目录 11 文件再部署且逐项比较哈希，真实 Edge 长会话仍待用户验收。

## 4.3.0 商店候选发行验收

- [ ] 4.2.26 的 GitHub 冻结标签、归档分支、Release 与 ZIP 可访问且指向相同 commit；新分支不会覆盖旧版。
- [ ] 「完整读取当前会话」和「用此会话校准」点击一次直接自动滚动，没有手动模式选择，也没有“自动（实验）”、手动中键文字和人工回退；成功后仍由原版扫描器计量，失败则安全拒绝。
- [ ] 菜单删除「复制读取测试日志」及右侧 `v4.2.x` 字符，取消纯开发日志的 clipboard 和内存比较器；保留复制续接提示的**用户功能**与重校准、提醒静音。
- [ ] 新的滚动蒙版为现代三阶段卡片（加载历史、返回最新、完整性校验），对窄屏/深浅色/减少动态效果与无障碍焦点友好；没有虚假百分比，网页真实滚动目标不中断。
- [ ] Esc、取消按钮、窗口失焦/换标签/页面隐藏/导航离开、调试器拒绝连接、超时均正确停止；扫描中取消不能提交；后台 debugger 会话不泄漏；仅用户主动触发时附加。
- [ ] 历史 R / 当前 L 的正文/消息识别规则、项目新会话即时监测、误触顶防护与本地已有校准数据保持不变。
- [ ] 三语言文案同步且无死键/漏键，隐私政策说明 debugger 强权限；发布包仅 `dist/` 真实构建文件，ZIP 根目录有 manifest、无源码测试或私人文本，具备 SHA256 校验。
- [ ] 全套 typecheck、tests、build、verify:dist、diff 检查通过，并在真实 Edge/Chrome 检查 ≥100 消息长会话、历史触顶校准及用户取消。商店审核是否通过需等审核结果。

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
