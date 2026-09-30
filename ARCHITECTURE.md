# LongChat Guard 2.0 架构基线

## 1. 技术栈

- Chrome / Edge
- Manifest V3
- TypeScript
- Vite
- Vitest

目标是纯浏览器本地扩展，无服务器、无网络后端、无 OpenAI API Key。

## 2. 模块

```text
chatgpt.com
  -> Page Adapter
  -> Ephemeral Content Processor
  -> Anonymous Conversation Ledger
  -> Coverage Tracker
  -> Calibration Engine
  -> Risk Engine
  -> Notification Controller
  -> Shadow DOM status pill
```

## 3. Page Adapter

Page Adapter 负责：

- 判断是否为 `chatgpt.com`
- 识别 conversation id
- 识别 user / assistant 消息
- 识别可见错误
- 输出 parser health

不得以 OpenAI 未公开 backend API 作为核心路径。解析失败必须 fail-closed，不显示安全结论。

## 4. Coverage 生命周期

Coverage 与风险位置分离。2.0 不用 coverage 给风险分数加权；Coverage 只控制成功 completion 能否成为 confirmed safe `S`，以及完整历史是否可信。

`complete` 只能来自：

- 已持久化 complete 的同一 conversation 刷新恢复
- 真正空白新聊天页 armed 后，观察到用户首条消息，再迁移到 `/c/<id>`

不得把以下情况标为 complete：

- 首页点击历史会话
- 直接打开旧 `/c/<id>`
- 只加载到历史尾部
- parser degraded / unreliable

## 5. L / S / F / B Calibration + Risk Engine

2.0 核心经验量：

- `L = currentEstimatedLoad`
- `S = safeBoundary`：complete + healthy 的稳定成功回复形成，同会话取最高值
- `F = failureBoundary`：confirmed conversation-length-limit 的质量加权鲁棒低分位
- `B = turnBuffer`：近期 assistant 增长的高分位；正常完成自动追加，完整扫描按 conversation/generation 只 seed 一次

风险级别不再累加人工权重。有 `F+B` 时：`L+B >= F` 为 high，`L+2B >= F` 为 organize，`L+3B >= F` 为 long，否则 normal。只有 `S` 没 `F` 时，超过 S 最多 long。没有 S/F 时保持 normal/learning。parser unreliable 唯一直接进入 unreliable。

`trendScore` 与告警严重度独立：有 F 时为本地经验位置 `L/F`；只有 S 时仅作弱参考；无边界时保持左端。

环境换代只由独立矛盾证据触发：已有 F+B 时，至少两个独立会话出现“失败比旧 F 早一个 B”或“安全结果比旧 F 高一个 B”，才自动新建 generation。

## 6. UI

UI 使用 Shadow DOM。默认只显示状态胶囊。

点击胶囊后显示：

- “风险”卡：简短状态 + 彩色渐变轨道 + 白色当前位置圆点
- 轨道位置由独立 `trendScore` 驱动；固定渐变从绿色过渡到红色，只标“安全 / 高风险”
- 分阶段学习状态仅显示：学习中 / 初步完成 / 校准中 / 已稳定
- 未学到当前 generation 的 confirmed F 时显示“扫描当前会话”；学到 F 后自动隐藏
- 复制续接提示词
- 重新学习
- 本会话不提醒
- 扫描诊断仅在内部本地存储用于排错，不提供用户可见入口

“重新学习”创建新 Generation，旧 generation 保留为后台历史；新代没有 confirmed F，因此扫描按钮重新出现。warm-start 只作弱先验，当前 generation 的新证据优先，若新证据与旧边界冲突则旧边界退出当前计算。

`risk.score` 在 2.0 只编码 UI/提醒严重度，不再是加权预测模型。用户可见轨道单独使用 `trendScore`。轨道不展示计算规则、数字或阈值；parser unreliable 时灰化并 fail-closed。

完整扫描若生成待确认的长度上限样本，下一次 UI render 自动聚焦确认卡。正常回复的稳定 completion 继续通过 `recordCompletion` 自动累积 confirmed safe 样本；confirmed safe 仅接受 complete coverage + healthy parser，并按 conversation 去重、保留该会话最高安全负载。

## 7. Internationalization / Brand Identity

Manifest 使用 `__MSG_extensionName__` / `__MSG_extensionDescription__` 与 `default_locale: en`，并提供 `_locales/en`、`_locales/zh_CN`、`_locales/zh_TW`。

- canonical brand 始终是 `LongChat Guard`
- 简中 store/manifest display name 为 `LongChat Guard · 长会话预警`
- 繁中 store/manifest display name 为 `LongChat Guard · 長對話預警`
- toolbar action title 只使用 `LongChat Guard`
- UI 文案通过 `chrome.i18n.getMessage` 读取，测试环境使用英文 fallback

官网和仓库发现性文件使用同一 canonical identity，并通过 JSON-LD、canonical/hreflang、FAQ、`llms.txt`、AI discovery profile、GitHub/Chrome Web Store 互链强化实体一致性。

## 8. Storage

允许持久化：

- install salt
- extension settings
- anonymous message fingerprint
- token / char estimate
- branch metadata
- conversation statistics
- generation / calibration metadata
- per-conversation reminder control
- failure-only last-scan diagnostics：仅失败原因与最后少量滚动结构指标，不含 URL/正文，7 天自动过期；扫描成功立即删除

禁止持久化：

- raw message text
- composer draft text
- assistant raw response
- attachment raw text
- user email / name
- API keys
