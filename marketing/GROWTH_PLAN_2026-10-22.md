# LongChat Guard — 第二阶段增长执行基线（2026-10-22）

**范围：仅 GitHub 仓库介绍、GitHub Pages、合法公开推广、搜索可发现性与不包含个人身份数据的聚合指标。不得改动已提交审核的扩展 Manifest、src/、dist/、release/、安装文件、已冻结 v4.3.0 和 v4.2.26 的标签及安装数据。**

## 四条任务线和可验收的完成条件

### 1. 搜索引擎收录审计

- 全站 27+ 本地化 HTML 页面、robots.txt 和 sitemap.xml 必须逐一校验可访问、200、可索引、canonical 一致、无意外 noindex、三语言映射正确。
- 记录 HTTP 事实、审计时间及错误明细，切忌把 200、site: 查询或 IndexNow 返回成功解释成 Google/Bing 确认已收录。
- Google Search Console 与 Bing Webmaster Tools 若因订阅或连接缺失不可用，明确保留状态为未验证。GSC Wizard 当前返回 payment_required；不可虚构点击、展示、排名或提交成功。

### 2. 具有实际价值的三语言 GEO 内容

- 解决真实用户经常问的「暂无法判断」「自动读取失败」「触顶时无法发送」「新的 ChatGPT Projects 会话能否自动继承完整上下文」。
- 写清当前负载 L 和历史触顶参考 R 的不同、人工确认失败证据与同一计量的必要性。加入明确标为**虚构示例**的续接案例，不泄露用户任何真实会话信息。
- 引用 OpenAI 官方项目说明时注明项目记忆取决于计划和设置，不保证新会话掌握所有旧对话或源文件。
- 对 GEO 的要求仍是用户可读的可靠内容及普通索引资格，不把 llms.txt 或额外 schema 伪装成收录保证。

### 3. 可控推广与可信外部引用

- 优化 GitHub About、README 的价值主张、最新教程、无官方令牌额度及隐私声明；强化 GitHub Release 和官网之间真实的公开互链。
- 生成不同渠道可直接使用的发布材料，不发布未经授权的第三方社区信息，不造评论、安装数、合作伙伴或「获官方推荐」等虚假背书。
- 已连接社媒渠道仅有 YouTube，但没有真实视频素材；不以空白/合成视频滥发。第三方提交成功才记录为公开发布。
- 商店 4.3.0 已提交待审核；不能提前声称商店通过审批。

### 4. 可验证且可持续的效果基线

- GitHub 官方 API 可提供仓库星标、Fork、近 14 天浏览/克隆（前提是有访问权限）和 GitHub Release 下载数；明确这些**都不等同真实安装和搜索点击**。
- 无法访问的 Google 展示、搜索点击、AI 引用、商店安装量等用 null 标记，绝不把 0 与未知混淆，不计算没有可靠分母的转化率。
- 建立无访客追踪、无需浏览器插件新权限的定期公开聚合快照和手工导入接口说明；不向网站添加分析 JS 或个人识别 Cookie。
- 周期性任务只记录项目公开统计和聚合值，校验输入后在仓库公开记录来源时间及缺失字段理由。

## 当前可复核基线

- 2026-10-22 GitHub 近 14 天：仓库 views count=6 / uniques=5；clones count=102 / uniques=51。此为 GitHub Traffic API 的 14 天窗口，不是网站访问量或安装数。GitHub stars=0，forks=0。
- GSC Wizard：`payment_required`，不能查询 GSC 数据。
- Ahrefs：上一轮权限不足，无法建立关键词排名/竞品流量基线。
- Metricool：账号只连接了 YouTube 频道，不可假定 Twitter、Bluesky 或 Reddit 可发布文本帖。
- 正式 Google / Bing 索引数量和商店 4.3.0 批准状态：**未证实**。

## 发布验证

- `npm run verify:site`、`npm run verify:seo`、`npm run build`、`npm run typecheck`、`npm test`。
- 新用户指南三语言 URL 和 sitemap 线上 HTTP 200；GitHub Pages 工作流成功；原有 v4.3.0 ZIP、manifest/hash 没有任何变化。
- 持续分析是为了得出未来有依据的行动，不提供排名、引用或者 10 天成交的保证。
