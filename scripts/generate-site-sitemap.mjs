import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { join, relative, dirname, sep } from 'node:path'

const siteRoot = join(process.cwd(), 'site')
const sitemapPath = join(siteRoot, 'sitemap.xml')
const baseUrl = 'https://luobo656.github.io/longchat-guard/'
const locales = [
  ['en', ''],
  ['zh-CN', 'zh/'],
  ['zh-TW', 'zh-tw/']
]

function findPages(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const full = join(path, entry.name)
    if (entry.isDirectory()) return findPages(full)
    return entry.isFile() && entry.name === 'index.html' ? [full] : []
  })
}
function xmlEscape(s) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}
const oldText = readFileSync(sitemapPath, 'utf8')
const priorDates = new Map(
  [...oldText.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/g)]
    .map(([, url, date]) => [url, date])
)

const groups = new Map()
const records = findPages(siteRoot).map(file => {
  const rel = relative(siteRoot, dirname(file)).split(sep).join('/')
  const suffix = rel === '' ? '' : rel + '/'
  const locale = suffix.startsWith('zh-tw/') ? 'zh-TW'
    : suffix.startsWith('zh/') ? 'zh-CN' : 'en'
  const group = suffix.replace(/^(zh\/|zh-tw\/)/, '')
  const url = baseUrl + suffix
  const html = readFileSync(file, 'utf8')
  const canonical = html.match(/<link rel="canonical" href="([^"]+)">/)?.[1]
  if (canonical !== url) throw new Error(`Canonical mismatch in ${file}: ${canonical} vs ${url}`)
  const updates = [...html.matchAll(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})"/g)]
    .map(m => m[1])
  const date = updates.sort().at(-1) ?? priorDates.get(url)
  if (!date) throw new Error(`Missing trustworthy dateModified/lastmod: ${file}`)
  if (!groups.has(group)) groups.set(group, new Map())
  const variants = groups.get(group)
  if (variants.has(locale)) throw new Error(`Duplicate locale ${locale} for ${group}`)
  variants.set(locale, url)
  return { url, locale, group, date }
})
for (const [group, variants] of groups) {
  if (variants.size !== 3 || locales.some(([name]) => !variants.has(name))) {
    throw new Error(`Missing locale in ${group}: ${[...variants.keys()].join(',')}`)
  }
}
records.sort((a, b) => {
  const ag = a.group === '' ? '' : a.group
  const bg = b.group === '' ? '' : b.group
  if (ag !== bg) return ag.localeCompare(bg, 'en')
  return locales.findIndex(l => l[0] === a.locale) -
    locales.findIndex(l => l[0] === b.locale)
})
const output = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
  '        xmlns:xhtml="http://www.w3.org/1999/xhtml">'
]
for (const page of records) {
  const variants = groups.get(page.group)
  output.push('  <url>')
  output.push(`    <loc>${xmlEscape(page.url)}</loc>`)
  output.push(`    <lastmod>${page.date}</lastmod>`)
  for (const [locale] of locales) {
    output.push(`    <xhtml:link rel="alternate" hreflang="${locale}" href="${xmlEscape(variants.get(locale))}"/>`)
  }
  output.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(variants.get('en'))}"/>`)
  output.push('  </url>')
}
output.push('</urlset>', '')
const rendered = output.join('\n')
if (process.argv.includes('--write')) {
  writeFileSync(sitemapPath, rendered, 'utf8')
  console.log(`Generated ${records.length} localized sitemap URLs (${groups.size} page groups).`)
} else if (oldText !== rendered) {
  throw new Error('Sitemap is stale. Run: node scripts/generate-site-sitemap.mjs --write')
} else {
  console.log(`Sitemap current: ${records.length} localized URLs, ${groups.size} reciprocal hreflang groups.`)
}
