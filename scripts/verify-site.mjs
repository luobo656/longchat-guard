import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const required = [
  'site/index.html',
  'site/zh/index.html',
  'site/guides/chatgpt-long-conversation-warning/index.html',
  'site/guides/chatgpt-context-window-warning/index.html',
  'site/zh/guides/chatgpt-long-conversation-warning/index.html',
  'site/zh/guides/chatgpt-context-window-warning/index.html',
  'site/styles.css',
  'site/robots.txt',
  'site/sitemap.xml',
  'site/llms-full.txt',
  'site/google69dd1f05e0ac8faa.html',
  'site/BingSiteAuth.xml',
  'site/9e0db27f74c442f49042d2d5d41d27ac.txt',
  'site/.nojekyll'
]

for (const relative of required) {
  if (!existsSync(join(root, relative))) {
    throw new Error(`Missing GEO site asset: ${relative}`)
  }
}

for (const relative of [
  'site/index.html',
  'site/zh/index.html',
  'site/guides/chatgpt-long-conversation-warning/index.html',
  'site/guides/chatgpt-context-window-warning/index.html',
  'site/zh/guides/chatgpt-long-conversation-warning/index.html',
  'site/zh/guides/chatgpt-context-window-warning/index.html'
]) {
  const html = readFileSync(join(root, relative), 'utf8')
  if (!html.includes('rel="canonical"')) throw new Error(`${relative} is missing canonical URL`)
  if (!html.includes('hreflang=')) throw new Error(`${relative} is missing hreflang links`)
  if (!html.includes('application/ld+json')) throw new Error(`${relative} is missing JSON-LD`)
  if (!html.includes('LongChat Guard')) throw new Error(`${relative} is missing canonical entity name`)
  if (!html.toLowerCase().includes('openai')) throw new Error(`${relative} is missing accuracy boundary`)

  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
  if (scripts.length === 0) throw new Error(`${relative} has no parseable JSON-LD block`)
  for (const script of scripts) JSON.parse(script[1])
}

const sitemap = readFileSync(join(root, 'site/sitemap.xml'), 'utf8')
for (const url of [
  'https://luobo656.github.io/longchat-guard/',
  'https://luobo656.github.io/longchat-guard/zh/',
  'https://luobo656.github.io/longchat-guard/guides/chatgpt-long-conversation-warning/',
  'https://luobo656.github.io/longchat-guard/zh/guides/chatgpt-long-conversation-warning/',
  'https://luobo656.github.io/longchat-guard/guides/chatgpt-context-window-warning/',
  'https://luobo656.github.io/longchat-guard/zh/guides/chatgpt-context-window-warning/'
]) {
  if (!sitemap.includes(url)) throw new Error(`Sitemap is missing ${url}`)
}

const robots = readFileSync(join(root, 'site/robots.txt'), 'utf8')
if (!robots.includes('Sitemap: https://luobo656.github.io/longchat-guard/sitemap.xml')) {
  throw new Error('robots.txt does not advertise the canonical sitemap')
}

const indexNowKey = readFileSync(
  join(root, 'site/9e0db27f74c442f49042d2d5d41d27ac.txt'),
  'utf8'
).trim()
if (indexNowKey !== '9e0db27f74c442f49042d2d5d41d27ac') {
  throw new Error('IndexNow ownership key is invalid')
}

const googleVerification = readFileSync(
  join(root, 'site/google69dd1f05e0ac8faa.html'),
  'utf8'
).trim()
if (googleVerification !== 'google-site-verification: google69dd1f05e0ac8faa.html') {
  throw new Error('Google Search Console verification file is invalid')
}

const bingVerification = readFileSync(join(root, 'site/BingSiteAuth.xml'), 'utf8')
if (!bingVerification.includes('37B036533D17363D5269988B241CB474')) {
  throw new Error('Bing Webmaster Tools verification file is invalid')
}

console.log('GEO site verification passed.')

