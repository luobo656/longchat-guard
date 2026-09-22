# V1 验收基线

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

## B. V1 用户界面

- [ ] 未同意隐私说明前只显示一次性隐私同意卡
- [ ] 同意卡文案包含：仅在本机读取当前 ChatGPT 页面内容用于长会话趋势判断；不上传；不保存聊天正文；可通过卸载扩展/清除扩展数据删除本地数据
- [ ] 只有“同意并开始”构成 affirmative consent
- [ ] 点击“暂不开启”后显示灰色小胶囊“未启用”，不自动反复弹同意卡
- [ ] 未同意前不调用 `readPageSnapshot`
- [ ] 未同意前不做 fingerprint 或 token 估算
- [ ] 未同意前不注册会话观察 MutationObserver 或发送监听
- [ ] 默认只显示状态胶囊
- [ ] 点击胶囊后只显示当前会话长度、学习状态、必要时旧会话历史可能不完整说明
- [ ] 当前会话长度只显示正常范围 / 偏长 / 建议整理 / 接近风险区 / 暂时无法判断等模糊文案
- [ ] 显示本地风险趋势条，但不显示任何数字、比例或额度
- [ ] cold-start 趋势条不得伪装成精确额度
- [ ] unreliable 趋势条明显灰化并 fail-closed
- [ ] 用户界面不显示 token / tokens
- [ ] 用户界面不显示 `≈数字`
- [ ] 用户界面不显示数字 + K
- [ ] 用户界面不显示阈值、百分比或可被理解为官方额度的数据
- [ ] 底部免责声明为“仅作本地趋势判断，不代表 OpenAI 官方额度或上限。”
- [ ] 面板只提供复制续接提示词、重新学习、本会话暂不提醒
- [ ] 面板展开在右下胶囊上方、右侧对齐，窄屏不出屏
- [ ] 点击页面其他位置收起面板
- [ ] 点击 Shadow DOM 内部、胶囊、面板或按钮不收起
- [ ] Escape 收起面板
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
- [ ] incomplete 时提示旧会话历史可能不完整，实际长度可能高于当前判断

## D. 风险逻辑

- [ ] 风险只基于当前会话负载、已学习边界、coverage/parser 保守修正
- [ ] composer 草稿不进入风险依据
- [ ] expected assistant growth 不进入风险依据
- [ ] 下一轮预测负载不进入用户可见逻辑
- [ ] parser unreliable 时 fail-closed，显示无法可靠监测
- [ ] coverage 不完整只能更保守，不能让结果更乐观

## E. 学习与校准

- [ ] 完整 Coverage + healthy parser 下的成功 assistant completion 可更新 Safe Floor
- [ ] incomplete / degraded 的成功回复不得形成 confirmed Safe Floor
- [ ] 只有明确 conversation length 类错误可更新 Failure Ceiling
- [ ] 非长度错误不得污染 Failure Ceiling
- [ ] “重新学习”创建新 Generation，旧样本不与新 Generation 直接平均
- [ ] warm-start prior 不得单独制造 high 风险

## F. 隐私

- [ ] `chrome.storage.local` 中无用户聊天正文
- [ ] 无 assistant 原文
- [ ] 无 composer 草稿正文
- [ ] 无附件正文
- [ ] 无邮箱、姓名、API Key
- [ ] fingerprint 使用本地随机 salt
- [ ] 旧安装 schema migration 默认未同意
- [ ] `settings.privacyConsentVersion=1` 与 `privacyConsentedAt` 仅在同意后写入
- [ ] 页面内容 locally processed, never transmitted to developer/server
- [ ] 文档说明卸载扩展或清除扩展数据可删除本地数据

## G. 品牌图标与 manifest

- [ ] `public/icons/icon.svg` 存在并为深青绿底板、白色气泡、橙色守护盾牌的原创高对比构图
- [ ] `public/icons/icon16.png`、`icon32.png`、`icon48.png`、`icon128.png` 存在
- [ ] 图标不含 ChatGPT/OpenAI logo、六结标志、字母或文字
- [ ] `manifest.icons` 与 `action.default_icon` 指向存在的图标路径
- [ ] manifest name 与 `action.default_title` 均为“LongChat Guard”
- [ ] name/description 不暗示 OpenAI 官方关系
- [ ] MV3 权限最小，仅 `storage` 与 `https://chatgpt.com/*`
- [ ] manifest version 为 `1.0.0`

## H. 发布阻断

出现任一情况不得发布 V1：

1. 聊天正文进入持久化存储或日志
2. 上传聊天正文
3. 在用户界面显示具体 token 数、近似 token 数、K 数、阈值、百分比或官方额度式数据
4. 旧会话被错误标为完整
5. 解析失败后仍显示绿色安全状态
6. 非长度错误污染 Failure Ceiling
7. Branch / 编辑 / 重新生成明显重复累计
8. Chrome 或 Edge 任一无法正常加载
9. 图标、名称或描述暗示官方关系
