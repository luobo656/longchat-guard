# LongChat Guard 官网 SEO/GEO 改进记录（2026-10-22）

本轮只更新 GitHub Pages 网站和公开文档，不修改已提交商店审核的 4.3.0 扩展、权限、风险算法和安装包。

## 具体改动

- 新增三种语言的自动读取与校准使用指南：强调确认触顶、完整读取和校准区别、未知状态、临时 debugger 权限，并提供可操作的步骤。
- 多语言网页 24 增加到 27 页，按 9 个主题提供英语、简体中文、繁体中文三个完整语言组；三语言首页和风险方法页增加自然内链。
- 原有部分结构化数据的 SoftwareApplication 版本从 2.1.1 对齐 4.3.0，只有真实更改过的页面更新 dateModified 日期。
- 首页社交分享图片改为保持不变的正式图标，避免把旧版 2.1.1 的真实存档截图冒充最新 4.3.0 界面。
- 新的 sitemap 生成器从真实 HTML 页面及可证明的变更日期生成 canonical 和三语 hreflang 互惠关系。
- 新增发布前 SEO 完整性检查：标题、描述、主标题、canonical、hreflang、JSON-LD、版本、内链、站点地图；GitHub Pages 部署前自动核对。
- 网站 sitemap 和 IndexNow 更新列表包含新增三个指南链接；官方文档、README、AI_DISCOVERY.md、llms.txt 和 llms-full.txt 链接到新增指南。

## 对应用户搜索意图

| 需求 | 入口（英文，简繁有对应路径） |
|---|---|
| ChatGPT 长会话风险预警 | /guides/chatgpt-long-conversation-warning/ |
| ChatGPT context window 与经验风险 | /guides/chatgpt-context-window-warning/ |
| ChatGPT conversation too long | /guides/chatgpt-conversation-too-long/ |
| LongChat Guard 如何校准、自动读取 | /guides/how-to-calibrate-longchat-guard/ |
| ChatGPT 长会话怎样续接 | /guides/how-to-continue-long-chatgpt-conversation/ |
| 浏览器扩展类型比较 | /guides/chatgpt-long-conversation-extension/ |
| 原理、隐私与局限 | /methodology/ |

## 数据真实性和限制

- GSC Wizard 已连接账号因试用或订阅到期返回 payment_required，无法取得该账号真实展示量、点击、排名或收录结果，也不能声称 URL 已被 Search Console 检查。
- Ahrefs API 返回 Insufficient plan，无法建立真实关键词或自然流量基线。
- robots.txt、公开验证文件、sitemap、IndexNow 发布通知以及 llms.txt 是发现网站的辅助条件，不保证 Google 收录、AI 引用或排名提升。
- 官网不得声称商店已批准 4.3.0；用户当前只是提交审核。
- 不造官方 token 限额、星级、评论或外部背书；真实 2.1.1 截图仍明示为历史存档。

## 验证

命令：node scripts/generate-site-sitemap.mjs、npm run verify:site、npm run verify:seo、npm test、npm run typecheck。

发布后检查三个新 URL 和 sitemap 的真实 HTTPS 响应，再在可使用的 Google Search Console 中跟踪 7/28 天曝光、点击、URL 索引。无法承诺短期自然搜索增长。
