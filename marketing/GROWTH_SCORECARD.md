# LongChat Guard 推广指标公开记录

> 数据日期：2026-10-22。统计记录时间：2026-10-22T13:56:33.740Z。这份记录来自 GitHub 官方 REST API 和网站可访问性检查，**不是网站访客分析或商店安装统计**。

| 指标 | 当前值 | 来源与解释 |
|---|---|---|
| GitHub Stars | 0 | GitHub 仓库公开元数据 |
| GitHub Forks | 0 | GitHub 仓库公开元数据 |
| GitHub 仓库浏览 | 6（独立访客 5，近14天） | GitHub Traffic（若可获取），与官网 UV 不同 |
| GitHub 克隆 | 102（独立克隆者 51，近14天） | 自动化、重复克隆可能存在，**不是安装量** |
| v4.3.0 Release 文件下载合计 | 2 | 6 个文件下载之和，**不是扩展安装量** |
| 官网状态 | HTTP 200 | GitHub Pages 首页直连 |
| Sitemap 状态 | HTTP 200；30 个 URL | 网站文件覆盖，不代表已被收录 |
| Google 搜索展示／点击／已收录 | 未取得 | GSC 未接入可用分析数据 |
| Bing 搜索展示／点击／已收录 | 未取得 | Bing Webmaster 数据未接入 |
| AI 引用／提及 | 未取得 | 不用模型主观回答推测完整统计 |
| Chrome / Edge 新增安装 | 未取得 | 未连接两家开发者商店统计 |

## 使用这个数据时必须注意

- **未知不等于 0。** 缺少 GSC 或商店认证时，不猜测点击、排名或下载转化率。
- GitHub Views/Clones 是滚动 14 天的窗口，不是按日累计的全站访问；不要跨快照简单相加。
- Release 的资产下载可能包含维护人员、自测、自动化操作或重复下载。
- 站点 sitemap 与 HTTP 200 仅表示技术可访问，不证明已经被 Google/Bing 收录，更不保证进入 AI 搜索引用。
- 维护脚本：node scripts/growth/collect-metrics.mjs；计划任务每周一自动更新当前记录。历史数据见 [history.json](./metrics/history.json)。

## 接下来真正需要的外部数据

在 Google Search Console 或 Bing Webmaster Tools 可访问后取得搜索查询、落地页、展示/点击及索引状态；在浏览器商店开发者后台取得真实安装量和用户转化。只能在这些来源可验证时填写相应字段。
