import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

const base = 'https://luobo656.github.io/longchat-guard/'
const sitemap = readFileSync('site/sitemap.xml', 'utf8')
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replaceAll('&amp;', '&'))
const uniq = new Set(urls)
if (uniq.size !== urls.length || urls.length < 30 || !urls.every(url => url.startsWith(base))) {
  throw new Error('Unexpected local sitemap URLs; refusing incomplete audit')
}

const failReasons = []
async function download(url) {
  const begin = Date.now()
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'LongChatGuardOwnedSiteAudit/1.0', 'Accept': 'text/html,application/xml,text/plain' },
      redirect: 'follow', signal: AbortSignal.timeout(20000)
    })
    const body = await response.text()
    return { status: response.status, url: response.url, contentType: response.headers.get('content-type'),
      xRobotsTag: response.headers.get('x-robots-tag'), durationMs: Date.now()-begin, body }
  } catch(error) {
    return { status: null, url, contentType: null, xRobotsTag:null, durationMs:Date.now()-begin, error: String(error.message),body:'' }
  }
}
const robots = await download(base+'robots.txt')
const remoteSitemap = await download(base+'sitemap.xml')
const robotsAllowed = robots.status === 200 &&
  robots.body.includes('Sitemap: '+base+'sitemap.xml') &&
  !/\nDisallow:\s*\//i.test(robots.body)
const sitemapReachable = remoteSitemap.status === 200 &&
  remoteSitemap.body.includes('<urlset') &&
  remoteSitemap.body.includes('<loc>'+base+'</loc>')
let cursor = 0
const results = Array.from({length:urls.length})
async function worker() {
  while (cursor < urls.length) {
    const i = cursor++
    const u = urls[i]
    const result = await download(u)
    const canonical = result.body.match(/<link\s+rel="canonical" href="([^"]+)"/)?.[1] ?? null
    const indexDirective = result.body.match(/<meta\s+name="robots" content="([^"]+)"/i)?.[1] ?? ''
    const hasNoindex = /\bnoindex\b/i.test(indexDirective) || /\bnoindex\b/i.test(result.xRobotsTag??'')
    const hasHreflang = [...result.body.matchAll(/<link\s+rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)]
    const expectedLocaleLinks = hasHreflang.length === 4 &&
      ['en','zh-CN','zh-TW','x-default'].every(x=>hasHreflang.some(a=>a[1]===x))
    const eligible = result.status===200 &&
      result.url.replace(/\?.*$/,'')===u &&
      /text\/html/.test(result.contentType??'') &&
      canonical===u && !hasNoindex && expectedLocaleLinks && robotsAllowed
    results[i]={url:u,httpStatus:result.status,httpFinalUrl:result.url,
      canonicalMatches:canonical===u,indexingAllowedByMeta:!hasNoindex,
      hreflangGroupPresent:expectedLocaleLinks,robotsAllows:robotsAllowed,
      correctContentType:/text\/html/.test(result.contentType??''),
      technicalFetchEligible:eligible, responseMs:result.durationMs,
      error:result.error??null,
      googleIndexed:null,bingIndexed:null}
    if(!eligible) failReasons.push(u+': HTTP '+result.status+' canonical='+canonical+' noindex='+hasNoindex+' hreflang='+hasHreflang.length)
  }
}
await Promise.all(Array.from({length:5},()=>worker()))
const eligibleCount=results.filter(x=>x.technicalFetchEligible).length
const out={schema:'LCG-PUBLIC-INDEXABILITY-v1',auditTime:new Date().toISOString(),source:'direct HTTPS requests to owned GitHub Pages website',
 scope:'sitemap-listed canonical HTML pages',total:urls.length,technicalEligible:eligibleCount,
 robotsHttp:robots.status,sitemapHttp:remoteSitemap.status,robotsAllows, sitemapReachable,
 googleIndexed:null,bingIndexed:null,
 caveat:'HTTP 200, robots and canonical evidence is NOT a Google/Bing URL Inspection result and does not prove index inclusion.',
 failed:failReasons, pages:results}
if (process.argv.includes('--write')) {
  const file='marketing/reports/public-indexability-2026-10-22.json'
  mkdirSync(dirname(file),{recursive:true})
  writeFileSync(file,JSON.stringify(out,null,2)+'\n','utf8')
  console.log('Saved '+file)
}
console.log('Owned-site indexability audit: '+eligibleCount+'/'+urls.length+' technically eligible; robots='+robots.status+', sitemap='+remoteSitemap.status)
if (failReasons.length) {
  console.error(failReasons.join('\n'))
  process.exitCode=1
}
