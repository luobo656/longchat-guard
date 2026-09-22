# 开发代理规则

本文件适用于后续任何 Codex / WebCodex / 自动开发代理。

## 开始工作前必须阅读

按顺序：

1. `PRODUCT_BASELINE.md`
2. `ARCHITECTURE.md`
3. `ACCEPTANCE.md`
4. `README.md`

不得只阅读任务提示后直接编码。

## 产品边界

V1 仅针对 `chatgpt.com` 网页端。

不得擅自加入：

- Codex
- CLI
- API
- 其他 AI 网站
- 云账号/云同步
- OpenAI API Key
- 服务器
- 自动代用户发消息

## 精度表述

任何 token、context、risk、limit：

- 如果不是 OpenAI 明确官方数据，必须标记为估算、默认参数或本地学习结果
- 不得写“官方剩余额度”
- 不得写“精确会话上限”
- 不得将可调阈值包装成官方事实

## 隐私

聊天正文只允许在内存中瞬时处理。

禁止将以下内容写入持久化存储或日志：

- 用户消息正文
- assistant 回答正文
- composer 草稿正文
- 附件正文
- 姓名
- 邮箱
- API Key

持久化仅允许匿名统计和本地加盐指纹。

## 架构

不得以 OpenAI 未公开 backend API 作为核心主路径。

页面适配失败必须 fail-closed。

不确定性不得让风险变得更乐观。

## 校准

必须区分：

- Coverage / Completeness
- Calibration Confidence

每个 conversation 以 Safe Floor / Failure Ceiling 为核心边界。

非 conversation length 类错误不得更新 Failure Ceiling。

套餐/环境变化必须使用新 Generation，而不是把新旧环境数据直接混合平均。

## 变更流程

如果用户提出的新需求与现有基线冲突：

1. 以用户最新明确指令为准
2. 先修改对应基线文档
3. 再修改实现
4. 同步调整验收用例

不得让代码先偏离、文档以后再补。

## V1 范围控制

任何新增功能如果不是实现“网页 ChatGPT 长会话提前预警”的必要条件，默认放入未来版本，不进入 V1。

## 完成标准

开发任务不能只以“代码写完”为结束。

必须：

1. 对照 ACCEPTANCE.md 检查相关条目
2. 运行对应测试
3. 检查无正文落盘
4. 检查无多余权限
5. 检查失败时是否 fail-closed

