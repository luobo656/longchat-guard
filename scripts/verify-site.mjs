import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const required = [
  'site/index.html',
  'site/zh/index.html',
  'site/zh-tw/index.html',
  'site/guides/chatgpt-long-conversation-warning/index.html',
  'site/guides/chatgpt-context-window-warning/index.html',
  'site/guides/when-to-start-new-chatgpt-conversation/index.html',
  'site/guides/how-to-continue-long-chatgpt-conversation/index.html',
  'site/zh/guides/chatgpt-long-conversation-warning/index.html',
  'site/zh/guides/chatgpt-context-window-warning/index.html',
  'site/zh/guides/when-to-start-new-chatgpt-conversation/index.html',
  'site/zh/guides/how-to-continue-long-chatgpt-conversation/index.html',
  'site/styles.css',
  'site/robots.txt',
  'site/sitemap.xml',
  'site/llms-full.txt',
  'site/google69dd1f05e0ac8faa.html',
  'site/google9fc4b5693d3525c2.html',
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
  'site/zh-tw/index.html',
  'site/guides/chatgpt-long-conversation-warning/index.html',
  'site/guides/chatgpt-context-window-warning/index.html',
  'site/guides/when-to-start-new-chatgpt-conversation/index.html',
  'site/guides/how-to-continue-long-chatgpt-conversation/index.html',
  'site/zh/guides/chatgpt-long-conversation-warning/index.html',
  'site/zh/guides/chatgpt-context-window-warning/index.html',
  'site/zh/guides/when-to-start-new-chatgpt-conversation/index.html',
  'site/zh/guides/how-to-continue-long-chatgpt-conversation/index.html'
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

const chromeStoreUrl =
  'https://chromewebstore.google.com/detail/longchat-guard/njeoedopjhefbhgllpjadjkljpnfioop'
const englishHome = readFileSync(join(root, 'site/index.html'), 'utf8')
const simplifiedHome = readFileSync(join(root, 'site/zh/index.html'), 'utf8')
const traditionalHome = readFileSync(join(root, 'site/zh-tw/index.html'), 'utf8')

for (const [label, html] of [
  ['en', englishHome],
  ['zh-CN', simplifiedHome],
  ['zh-TW', traditionalHome]
]) {
  if (!html.includes('"softwareVersion": "2.0.2"')) {
    throw new Error(`${label} home page has a stale SoftwareApplication version`)
  }
  if (!html.includes(chromeStoreUrl)) {
    throw new Error(`${label} home page is missing the canonical Chrome Web Store source`)
  }
}

if (!simplifiedHome.includes('LongChat Guard · 长会话预警')) {
  throw new Error('Simplified Chinese home page is missing the approved localized display name')
}
if (!traditionalHome.includes('LongChat Guard · 長對話預警')) {
  throw new Error('Traditional Chinese home page is missing the approved localized display name')
}
if (simplifiedHome.includes('龙查卫队') || traditionalHome.includes('龍查衛隊')) {
  throw new Error('Machine-translated brand name found in public product page')
}

const discovery = readFileSync(join(root, 'AI_DISCOVERY.md'), 'utf8')
const llmsFull = readFileSync(join(root, 'site/llms-full.txt'), 'utf8')
for (const [label, content] of [
  ['AI discovery profile', discovery],
  ['llms-full.txt', llmsFull]
]) {
  if (!content.includes('2.0.2')) throw new Error(`${label} has a stale product version`)
  if (!content.includes(chromeStoreUrl)) {
    throw new Error(`${label} is missing the canonical Chrome Web Store source`)
  }
}

const sitemap = readFileSync(join(root, 'site/sitemap.xml'), 'utf8')
for (const url of [
  'https://luobo656.github.io/longchat-guard/',
  'https://luobo656.github.io/longchat-guard/zh/',
  'https://luobo656.github.io/longchat-guard/zh-tw/',
  'https://luobo656.github.io/longchat-guard/guides/chatgpt-long-conversation-warning/',
  'https://luobo656.github.io/longchat-guard/zh/guides/chatgpt-long-conversation-warning/',
  'https://luobo656.github.io/longchat-guard/guides/chatgpt-context-window-warning/',
  'https://luobo656.github.io/longchat-guard/zh/guides/chatgpt-context-window-warning/',
  'https://luobo656.github.io/longchat-guard/guides/when-to-start-new-chatgpt-conversation/',
  'https://luobo656.github.io/longchat-guard/zh/guides/when-to-start-new-chatgpt-conversation/',
  'https://luobo656.github.io/longchat-guard/guides/how-to-continue-long-chatgpt-conversation/',
  'https://luobo656.github.io/longchat-guard/zh/guides/how-to-continue-long-chatgpt-conversation/'
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

const googlePublisherVerification = readFileSync(
  join(root, 'site/google9fc4b5693d3525c2.html'),
  'utf8'
).trim()
if (googlePublisherVerification !== 'google-site-verification: google9fc4b5693d3525c2.html') {
  throw new Error('Google publisher account verification file is invalid')
}

const bingVerification = readFileSync(join(root, 'site/BingSiteAuth.xml'), 'utf8')
if (!bingVerification.includes('37B036533D17363D5269988B241CB474')) {
  throw new Error('Bing Webmaster Tools verification file is invalid')
}

console.log('GEO site verification passed.')

