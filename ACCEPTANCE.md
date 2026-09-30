# LongChat Guard 2.0 验收基线

## A. 构建与范围

- [ ] Chrome 可加载 MV3 扩展
- [ ] Edge 可加载同一构建产物
- [ ] 仅在 `https://chatgpt.com/*` 注入核心逻辑
- [ ] TypeScript strict 通过
- [ ] Vitest 自动化测试通过
- [ ] Vite 构建成功
- [ ] `dist/manifest.json`、`dist/background.js`、`dist/content.js` 存在
- [ ] content script 为可直接加载的 classic script，不包含顶层 ESM `import` / `export`
- [ ] 不新增权限，不申请 `<all_urls>`、cookies、history、webRequest 等非必要权限

## B. 2.0 用户界面

- [ ] 未同意隐私说明前只显示一次性隐私同意卡
- [ ] 同意卡文案包含：仅在本机读取当前 ChatGPT 页面内容用于长会话趋势判断；不上传；不保存聊天正文；可通过卸载扩展/清除扩展数据删除本地数据
- [ ] 只有“同意并开始”构成 affirmative consent
- [ ] 点击“暂不开启”后显示灰色小胶囊“未启用”，不自动反复弹同意卡
- [ ] 未同意前不调用 `readPageSnapshot`
- [ ] 未同意前不做 fingerprint 或 token 估算
- [ ] 未同意前不注册会话观察 MutationObserver 或发送监听
- [ ] 默认只显示状态胶囊
- [ ] 点击胶囊后主信息只显示风险卡、学习状态和必要操作，不显示规则说明或统计解释
- [ ] 风险状态只显示正常 / 偏长 / 接近风险 / 高风险 / 识别中
- [ ] 风险轨道使用绿色到红色的固定渐变背景，白色圆点表示当前位置，圆点位置随 `trendScore` 平滑移动
- [ ] 轨道只显示“安全 / 高风险”，不显示数字、比例、阈值或计算规则
- [ ] 新会话负载远低于已学习风险起点时，即使 coverage incomplete、置信度较低，圆点也必须保持靠近左端；这些不确定性只影响告警决策
- [ ] unreliable 轨道明显灰化并 fail-closed
- [ ] 学习状态按证据分为学习中 / 初步完成 / 校准中 / 已稳定；单个失败样本不得直接显示“已稳定”
- [ ] 主面板不显示学习样本数、附件说明、校准置信度或其他规则性说明
- [ ] 用户界面不显示 token / tokens
- [ ] 用户界面不显示 `≈数字`
- [ ] 用户界面不显示数字 + K
- [ ] 用户界面不显示阈值、百分比或可被理解为官方额度的数据
- [ ] 主面板不显示冗长免责声明或规则说明
- [ ] 面板操作只提供复制续接提示词、扫描当前会话、重新学习、本会话不提醒；不提供扫描诊断或开发者工具入口
- [ ] 当前 generation 已有 confirmed F 后隐藏“扫描当前会话”；点击“重新学习”创建新 generation 后扫描按钮重新显示
- [ ] 面板展开在右下胶囊上方、右侧对齐，窄屏不出屏
- [ ] 点击页面其他位置收起面板
- [ ] 点击 Shadow DOM 内部、胶囊、面板或按钮不收起
- [ ] Escape 收起面板
- [ ] 完整扫描后若出现长度上限确认卡，面板自动打开并将确认卡滚动到可见区域、聚焦主要确认按钮
- [ ] 不显示下一轮预测
- [ ] 不显示统计完整性卡片
- [ ] 不显示校准置信度百分比
- [ ] 不显示确认安全至
- [ ] 不显示历史风险区
- [ ] 不显示太早 / 正好 / 太晚
- [ ] 不显示 5 轮后提醒
- [ ] 不显示套餐/环境已变化、重新校准、恢复上一档案、清除全部学习数据

## C. Coverage

- [ ] 真正空白新聊天页：无 conversation id 且无消息时 armed
- [ ] armed 状态下用户发送首条消息后，迁移到 `/c/<id>` 的该会话标为 complete
- [ ] 从首页点击历史会话不能继承 complete
- [ ] 刷新已持久化 complete 的会话保持 complete
- [ ] 直接打开旧 `/c/id` 标为 incomplete，除非此前已持久化 complete
- [ ] incomplete 时继续在内部保守处理，不能因此把结果变得更乐观；主面板不显示常驻旧会话警告

## D. 2.0 L/S/F/B 风险逻辑

- [ ] L 只取当前会话本地负载；composer 草稿、固定 expected growth、feedbackBias 不参与风险决策
- [ ] S 只来自 complete coverage + healthy parser 的稳定 assistant completion；同会话只保留最高安全负载
- [ ] F 只来自 confirmed conversation-length-limit；多个失败使用质量加权鲁棒低分位，单个极端低值不得完全支配 F
- [ ] B 来自近期 assistant 增长高分位；稳定 completion 自动学习，完整历史扫描按 conversation/generation 去重 seed
- [ ] 有 F+B 时按距离 F 还剩 3 / 2 / 1 个 B 分别进入 long / organize / high；L>=F 必须 high
- [ ] 只有 S 没 F 时最多 long；没有 S/F 时不得伪造 organize/high
- [ ] coverage incomplete / 低置信度不得把短新会话抬到 long/organize/high
- [ ] parser unreliable 时 fail-closed；其他 parser/coverage 状态不通过人工加分推高风险
- [ ] trendScore 与告警 severity 分离；有 F 时直接反映 L/F 的本地经验位置

## E. 学习、换代与迁移

- [ ] 多个独立 complete + healthy 会话自动累积 S；同一会话只更新最高 S
- [ ] 只有明确 conversation length 类错误可更新 F，其他错误不得污染 F
- [ ] 已稳定要求当前 generation 同时存在 S、F、B，confirmed safe conversations >= 2，独立边界会话 >= 4
- [ ] 已有 F+B 时，单个环境冲突不得换代；至少两个独立 conflict key 才自动新 generation
- [ ] early-failure conflict 与 above-F safe conflict 两条链路都能自动换代，并将当前观察 seed 到新 generation
- [ ] warm-start prior 不得单独制造 organize/high；当前新证据与旧 prior 冲突时旧边界退出当前计算
- [ ] schema >= 7 的迁移保留 install salt、隐私同意、ledgers 和既有 S/F samples；旧完整账本可回填 B，无需用户重新扫描

## F. 隐私

- [ ] `chrome.storage.local` 中无用户聊天正文
- [ ] 成功扫描不保留诊断；失败只保存最近一次原因与最后少量结构指标，不含 URL、聊天正文或消息指纹明文，并在 7 天后自动删除
- [ ] 无 assistant 原文
- [ ] 无 composer 草稿正文
- [ ] 无附件正文
- [ ] 无邮箱、姓名、API Key
- [ ] fingerprint 使用本地随机 salt
- [ ] 旧安装 schema migration 默认未同意
- [ ] `settings.privacyConsentVersion=1` 与 `privacyConsentedAt` 仅在同意后写入
- [ ] 页面内容 locally processed, never transmitted to developer/server
- [ ] 文档说明卸载扩展或清除扩展数据可删除本地数据

## G. 品牌、本地化与 GEO

- [ ] canonical brand 始终为 `LongChat Guard`，任何 locale 都不得把品牌翻译成“龙查卫队”等名称
- [ ] 英文 display name 为 `LongChat Guard`
- [ ] 简体中文 display name 为 `LongChat Guard · 长会话预警`
- [ ] 繁体中文 display name 为 `LongChat Guard · 長對話預警`
- [ ] manifest 使用 `__MSG_extensionName__` / `__MSG_extensionDescription__`、`default_locale: en` 和 `_locales/en|zh_CN|zh_TW`
- [ ] action title 在所有语言中固定为 `LongChat Guard`
- [ ] 普通用户可见 UI 在 en / zh_CN / zh_TW 下都有本地化文案，不出现混合语言主界面
- [ ] README、官网、商店 listing、FAQ、llms.txt、AI discovery profile 对产品定义、品牌、隐私和官方关系保持一致
- [ ] 官网 JSON-LD 的 SoftwareApplication 版本与发布版本一致，并互链 GitHub 与 Chrome Web Store canonical sources
- [ ] GEO 页面提供直接问答、可引用事实和 canonical source links，不通过关键词堆砌伪造相关性

## H. 品牌图标与 manifest

- [ ] `public/icons/icon.svg` 存在并为深青绿底板、白色气泡、橙色守护盾牌的原创高对比构图
- [ ] `public/icons/icon16.png`、`icon32.png`、`icon48.png`、`icon128.png` 存在
- [ ] 图标不含 ChatGPT/OpenAI logo、六结标志、字母或文字
- [ ] `manifest.icons` 与 `action.default_icon` 指向存在的图标路径
- [ ] manifest name / description / action title 使用 i18n message placeholder；各 locale 解析后品牌规则符合 G 节，action title 始终为 `LongChat Guard`
- [ ] name/description 不暗示 OpenAI 官方关系
- [ ] MV3 权限最小，仅 `storage` 与 `https://chatgpt.com/*`
- [ ] manifest version 为 `2.0.1`

## I. 发布阻断

出现任一情况不得发布 2.0：

1. 聊天正文进入持久化存储或日志
2. 上传聊天正文
3. 在用户界面显示具体 token 数、近似 token 数、K 数、阈值、百分比或官方额度式数据
4. 旧会话被错误标为完整
5. 解析失败后仍显示绿色安全状态
6. 非长度错误污染 Failure Ceiling
7. Branch / 编辑 / 重新生成明显重复累计
8. Chrome 或 Edge 任一无法正常加载
9. 图标、名称或描述暗示官方关系
