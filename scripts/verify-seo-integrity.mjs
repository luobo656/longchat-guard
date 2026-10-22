import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join, relative, dirname, sep, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const site = join(root, 'site')
const origin = 'https://luobo656.github.io/longchat-guard/'
const langs = [['en', ''], ['zh-CN', 'zh/'], ['zh-TW', 'zh-tw/']]
const knownCopiedFiles = new Set([
  'llms.txt', 'AI_DISCOVERY.md', 'FAQ.md', 'PRIVACY.md', 'icon128.png', 'favicon.svg'
])
const errors = []
const add = (path, problem) => errors.push(path + ': ' + problem)
function walk(dir) {
  return readdirSync(dir, {withFileTypes:true}).flatMap(f =>
    f.isDirectory() ? walk(join(dir,f.name))
      : f.name === 'index.html' ? [join(dir,f.name)] : []
  )
}
const paths = walk(site)
const indexed = new Map()
const groups = new Map()
for (const path of paths) {
  const relativeDir = relative(site,dirname(path)).split(sep).join('/')
  const suffix = relativeDir ? relativeDir + '/' : ''
  const pageUrl = origin + suffix
  const locale = suffix.startsWith('zh-tw/') ? 'zh-TW'
    : suffix.startsWith('zh/') ? 'zh-CN' : 'en'
  const group = suffix.replace(/^(zh-tw\/|zh\/)/,'')
  const html = readFileSync(path,'utf8')
  indexed.set(pageUrl,{path,html,locale,group})
  if (!groups.has(group)) groups.set(group,new Map())
  groups.get(group).set(locale,pageUrl)
}
const decode = s => s.replaceAll('&amp;','&')
function localTargetPath(url) {
  const parsed = new URL(url)
  if (!parsed.href.startsWith(origin)) return null
  const sub = decodeURIComponent(parsed.pathname.slice(new URL(origin).pathname.length))
  if (sub.split('/').includes('..')) throw new Error('Invalid path')
  return sub
}
for(const [url,page] of indexed) {
  const {html,path,locale,group}=page
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1]?.trim()
  const desc = html.match(/<meta name="description" content="([^"]+)"/)?.[1]?.trim()
  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1]
  const htmlLang = html.match(/<html lang="([^"]+)"/)?.[1]
  if (!title || title.length < 20 || title.length > 120) add(path,'invalid title length')
  if (!desc || desc.length < 60 || desc.length > 300) add(path,'invalid description length')
  if (canonical !== url) add(path,'canonical mismatch: '+canonical)
  if (htmlLang !== locale) add(path,'html language mismatch: '+htmlLang+' vs '+locale)
  if ((html.match(/<h1(?: [^>]*)?>/g)||[]).length !== 1) add(path,'expected exactly one H1')
  if (/name="robots"[^>]*content="[^"]*noindex/i.test(html)) add(path,'noindex is forbidden for canonical guides')
  if (/<meta name="keywords"/i.test(html)) add(path,'meta keyword stuffing')
  if (/<script[^>]+src=["']https?:\/\//i.test(html)) add(path,'external script blocked')
  const alt = [...html.matchAll(/<link\s+rel="alternate" hreflang="([^"]+)" href="([^"]+)"\s*\/?>/g)]
  if (alt.length !== 4) add(path,'expected 4 hreflang alternates')
  const variants = groups.get(group)
  for (const [name] of langs) {
    if (!variants.has(name)) add(path,'missing translated version '+name)
    const matches = alt.filter(m=>m[1]===name)
    if (matches.length !== 1 || matches[0][2] !== variants.get(name)) add(path,'wrong hreflang '+name)
  }
  const defaultLink = alt.filter(m=>m[1]==='x-default')
  if (defaultLink.length !== 1 || defaultLink[0][2] !== variants.get('en')) add(path,'wrong x-default')
  const jsonld = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  if (!jsonld.length) add(path,'missing JSON-LD')
  for(const [,body] of jsonld) {
    try {
      const value=JSON.parse(body)
      const nodes = value['@graph'] ?? [value]
      for (const n of nodes) {
        if (n.softwareVersion && n.softwareVersion !== '4.3.0') add(path,'stale structured softwareVersion')
        if (n.about?.softwareVersion && n.about.softwareVersion !== '4.3.0') add(path,'stale nested softwareVersion')
        if (n.mainEntityOfPage && typeof n.mainEntityOfPage === 'string' && n.mainEntityOfPage !== url) add(path,'incorrect mainEntityOfPage')
        if (n.dateModified && n.dateModified > '2026-10-22') add(path,'future-dated structured article')
      }
    } catch (error) {add(path,'broken JSON-LD: '+error.message)}
  }
  // Resolve local links and assets, including links into translated page groups.
  for(const [,attribute,targetRaw] of html.matchAll(/\b(href|src)="([^"]+)"/g)) {
    const target=decode(targetRaw)
    if (target.startsWith('#') || target.startsWith('mailto:') || target.startsWith('data:')) continue
    let final
    try {final=new URL(target,url)} catch { add(path,'invalid URL '+target);continue }
    if (!final.href.startsWith(origin)) continue
    const rel=localTargetPath(final.href)
    if (rel===null) continue
    if (final.pathname.endsWith('/')) {
      if (!existsSync(join(site,rel,'index.html'))) add(path,'local page link missing '+final.pathname)
    } else if (!existsSync(join(site,rel)) && !knownCopiedFiles.has(rel)) {
      add(path,'local asset link missing '+final.pathname)
    }
  }
}
const sitemap = spawnSync(process.execPath,['scripts/generate-site-sitemap.mjs'],{
  cwd: root,encoding:'utf8'
})
if (sitemap.status !== 0) errors.push('sitemap: '+(sitemap.stderr+sitemap.stdout).slice(0,300))
if (paths.length < 27) errors.push('unexpected missing site pages: '+paths.length)
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode=1
} else {
  console.log('SEO/GEO integrity passed: '+paths.length+' localized pages, '+groups.size+' translation groups; canonical, reciprocal hreflang, metadata, JSON-LD, internal links and sitemap.')
}
