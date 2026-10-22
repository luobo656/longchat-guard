import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const api='https://api.github.com/repos/luobo656/longchat-guard'
const homepage='https://luobo656.github.io/longchat-guard/'
const today=new Date().toISOString().slice(0,10)
const token=process.env.GROWTH_GH_TOKEN ?? process.env.GITHUB_TOKEN ?? ''
const headers={ 'Accept':'application/vnd.github+json','User-Agent':'LongChatGuardPublicGrowthMetrics/1.0',
  'X-GitHub-Api-Version':'2022-11-28' }
if(token) headers.Authorization='Bearer '+token
async function getJson(url) {
  try {
    const r=await fetch(url,{headers,signal:AbortSignal.timeout(18000)})
    if(!r.ok) return {data:null,error:'http_'+r.status}
    return {data:await r.json(),error:null}
  } catch(e){return {data:null,error:e.name==='TimeoutError'?'timeout':'unavailable'}}
}
async function check(url) {
  try {
    const r=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(18000)})
    const txt=await r.text()
    return {status:r.status,content:txt}
  } catch {return {status:null,content:''}}
}
const [repoResult,releaseResult,viewsResult,clonesResult,homeResult,sitemapResult]=await Promise.all([
  getJson(api),getJson(api+'/releases/tags/v4.3.0'),getJson(api+'/traffic/views'),
  getJson(api+'/traffic/clones'),check(homepage),check(homepage+'sitemap.xml')
])
if(!repoResult.data || !releaseResult.data) throw new Error('Core public GitHub API facts unavailable. Cannot fabricate a metrics report.')
const repo=repoResult.data,release=releaseResult.data
const assetCounts=Object.fromEntries(release.assets.map(a=>[a.name,a.download_count]))
const releaseDownloads=release.assets.reduce((n,a)=>n+a.download_count,0)
const trafficViews=viewsResult.data && Number.isInteger(viewsResult.data.count) ?
  {windowDays:14,total:viewsResult.data.count,unique:viewsResult.data.uniques}:null
const trafficClones=clonesResult.data && Number.isInteger(clonesResult.data.count) ?
  {windowDays:14,total:clonesResult.data.count,unique:clonesResult.data.uniques}:null
const sitemapUrls=[...sitemapResult.content.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1])
const snap={
  asOfDate:today,recordedAt:new Date().toISOString(),
  source:'GitHub REST API + publicly reachable GitHub Pages; NOT Google analytics',
  github:{repo:'luobo656/longchat-guard',
    stars:repo.stargazers_count,forks:repo.forks_count,openIssues:repo.open_issues_count,
    recentViews14d:trafficViews,recentClones14d:trafficClones,
    trafficAvailability:viewsResult.error || clonesResult.error || null,
    releaseTag:release.tag_name,releaseDownloads,releaseAssetDownloads:assetCounts},
  website:{homepageStatus:homeResult.status,sitemapStatus:sitemapResult.status,
    sitemapUrlCount:sitemapResult.status===200?sitemapUrls.length:null},
  search:{googleClicks:null,googleImpressions:null,googleIndexedPages:null,
    bingClicks:null,bingImpressions:null,bingIndexedPages:null,aiMentions:null,
    missingReason:'requires search property and proprietary search/AI analytics access; NOT inferred from site: queries'},
  commerce:{chromeInstalls:null,edgeInstalls:null,
    missingReason:'store analytics not connected; GitHub clone/download counts are NOT extension installations'}
}
if(!Number.isInteger(snap.github.stars)|| !Number.isInteger(snap.github.forks)) throw new Error('Incomplete GitHub data')
const path='marketing/metrics/history.json'
mkdirSync(dirname(path),{recursive:true})
let arr=[]
if(existsSync(path)){
  const old=JSON.parse(readFileSync(path,'utf8'))
  if(!Array.isArray(old)) throw new Error('Invalid existing history')
  arr=old
}
// The scheduled GitHub Actions token may lack Traffic API access. Preserve
// only this same day's earlier, independently verified private-owner totals;
// never carry an older rolling 14-day window into a different date.
const priorToday=arr.find(x=>x.asOfDate===today)
if(priorToday){
  const preserved=[]
  for(const key of ['recentViews14d','recentClones14d']){
    if(snap.github[key]===null && priorToday.github?.[key]){
      snap.github[key]=priorToday.github[key]
      preserved.push(key)
    }
  }
  if(preserved.length){
    snap.github.trafficAvailability=(snap.github.trafficAvailability??'not_available')+
      '; same-day verified GitHub Traffic kept from '+priorToday.recordedAt+
      ' for '+preserved.join(',')
  }
}
arr=arr.filter(x=>x.asOfDate!==today)
arr.push(snap)
arr.sort((a,b)=>a.asOfDate.localeCompare(b.asOfDate))
writeFileSync(path,JSON.stringify(arr,null,2)+'\n','utf8')
const n=(x)=>x===null?'未取得':String(x)
const views=snap.github.recentViews14d? `${snap.github.recentViews14d.total}（独立访客 ${snap.github.recentViews14d.unique}，近14天）`:'未取得（GitHub API 权限不足）'
const clones=snap.github.recentClones14d? `${snap.github.recentClones14d.total}（独立克隆者 ${snap.github.recentClones14d.unique}，近14天）`:'未取得（GitHub API 权限不足）'
const markdown=`# LongChat Guard 推广指标公开记录

> 数据日期：${today}。统计记录时间：${snap.recordedAt}。这份记录来自 GitHub 官方 REST API 和网站可访问性检查，**不是网站访客分析或商店安装统计**。

| 指标 | 当前值 | 来源与解释 |
|---|---|---|
| GitHub Stars | ${snap.github.stars} | GitHub 仓库公开元数据 |
| GitHub Forks | ${snap.github.forks} | GitHub 仓库公开元数据 |
| GitHub 仓库浏览 | ${views} | GitHub Traffic（若可获取），与官网 UV 不同 |
| GitHub 克隆 | ${clones} | 自动化、重复克隆可能存在，**不是安装量** |
| v4.3.0 Release 文件下载合计 | ${releaseDownloads} | ${release.assets.length} 个文件下载之和，**不是扩展安装量** |
| 官网状态 | HTTP ${n(homeResult.status)} | GitHub Pages 首页直连 |
| Sitemap 状态 | HTTP ${n(sitemapResult.status)}；${n(snap.website.sitemapUrlCount)} 个 URL | 网站文件覆盖，不代表已被收录 |
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
`
writeFileSync('marketing/GROWTH_SCORECARD.md',markdown,'utf8')
console.log('Growth snapshot recorded: '+today+
  '; stars='+snap.github.stars+', forks='+snap.github.forks+
  ', releaseDownloads='+releaseDownloads+', views14d='+n(trafficViews?.total??null)+
  ', site='+homeResult.status+', sitemap URLs='+snap.website.sitemapUrlCount)
