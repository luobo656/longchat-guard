# V1 架构基线

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

Coverage 与 calibration confidence 分离。V1 用户界面不显示完整性卡片或置信度百分比，但内部仍使用 Coverage 做保守修正。

`complete` 只能来自：

- 已持久化 complete 的同一 conversation 刷新恢复
- 真正空白新聊天页 armed 后，观察到用户首条消息，再迁移到 `/c/<id>`

不得把以下情况标为 complete：

- 首页点击历史会话
- 直接打开旧 `/c/<id>`
- 只加载到历史尾部
- parser degraded / unreliable

## 5. Risk Engine

V1 风险输入只包括：

- `currentEstimatedLoad`
- 当前 generation 的已学习 Safe Floor / Failure Ceiling / warm-start prior
- coverage 保守修正
- parser health 保守修正
- change-point / suspicious failure 保守修正

V1 不再把以下内容作为风险依据：

- composer 草稿
- 预计 assistant 增长
- 下一轮预测负载
- 用户“太早/正好/太晚”反馈

风险输出是本地估算的状态：`normal`、`long`、`organize`、`high`、`unreliable`。不得包装成官方额度。

## 6. UI

UI 使用 Shadow DOM。默认只显示状态胶囊。

点击胶囊后显示：

- 当前会话长度模糊状态
- 本地风险趋势条
- 学习状态
- 必要时旧会话历史可能不完整说明
- 复制续接提示词
- 重新学习
- 本会话暂不提醒

“重新学习”复用新 Generation 流程，旧 generation 保留为后台历史，不提供恢复上一档案或清除全部学习数据的 V1 主面板入口。

本地风险趋势条可以由内部 `risk.score` 和已学习边界驱动，但不得显示 token 数、百分比、K 值、阈值、总额度或剩余额度。cold-start 只能表达趋势，不得伪装成精确额度；parser unreliable 时灰化并 fail-closed。

## 7. Storage

允许持久化：

- install salt
- extension settings
- anonymous message fingerprint
- token / char estimate
- branch metadata
- conversation statistics
- generation / calibration metadata
- per-conversation reminder control

禁止持久化：

- raw message text
- composer draft text
- assistant raw response
- attachment raw text
- user email / name
- API keys
