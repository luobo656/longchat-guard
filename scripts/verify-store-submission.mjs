import fs from 'node:fs'
import crypto from 'node:crypto'

const json = (path) => JSON.parse(fs.readFileSync(path, 'utf8'))
const text = (path) => fs.readFileSync(path, 'utf8')
const fail = (why) => { throw new Error(`store_preflight:${why}`) }
const expected = {
  en: { suffix: 'en', title: 'LongChat Guard', shortHeading: 'Short Description', longHeading: 'Long Description', singleHeading: 'Single Purpose' },
  zh_CN: { suffix: 'zh-CN', title: 'LongChat Guard · 长会话预警', shortHeading: '简短说明', longHeading: '详细说明', singleHeading: '单一用途' },
  zh_TW: { suffix: 'zh-TW', title: 'LongChat Guard · 長對話預警', shortHeading: '簡短說明', longHeading: '詳細說明', singleHeading: '單一用途' }
}
const manifest = json('dist/manifest.json')
// v4.3.0 store listings and site version are frozen historical release
// material. v4.3.1/v4.3.2 are UNPUBLISHED local test builds; validate actual
// manifest/package lockstep without rewriting the submitted store copy.
const pkg = json('package.json')
const lock = json('package-lock.json')
if (!['4.3.0', '4.3.1', '4.3.2'].includes(manifest.version) ||
    pkg.version !== manifest.version ||
    lock.version !== manifest.version ||
    lock.packages?.['']?.version !== manifest.version) fail('version_mismatch')
if (manifest.manifest_version !== 3) fail('not_mv3')
if (JSON.stringify(manifest.permissions) !== JSON.stringify(['storage', 'debugger'])) fail('permission_mismatch')
if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(['https://chatgpt.com/*'])) fail('host_permission_mismatch')
const approvedIconSha256 = {
  16: 'FC7C4C37CB2B58785F4E8B4EF9F2625C9A3A69DD0C573A40703463D5A321F1A3',
  32: '6D789F1278436FCECEB1276D686106C24758E96B8C34C222C2A4B0CFB42E77A7',
  48: 'E81C8B88EAD49F948C160B9CEB0C24040D4A8E565B1BE37F17D12F4D293EC310',
  128: 'F32DADC45A91EA2331E943574C95F1EF9FBEF0B358A076A0E1C90E31A4F06B24'
}
for (const [pixels, digest] of Object.entries(approvedIconSha256)) {
  const file = `icons/icon${pixels}.png`
  if (manifest.icons?.[pixels] !== file || manifest.action?.default_icon?.[pixels] !== file) fail(`icon_manifest:${pixels}`)
  const src = fs.readFileSync(`public/${file}`)
  const dist = fs.readFileSync(`dist/${file}`)
  if (!src.equals(dist)) fail(`icon_source_dist_diff:${pixels}`)
  if (src.toString('hex', 0, 8) !== '89504e470d0a1a0a' || src.readUInt32BE(16) !== +pixels || src.readUInt32BE(20) !== +pixels) fail(`icon_png_dimension:${pixels}`)
  if (crypto.createHash('sha256').update(src).digest('hex').toUpperCase() !== digest) fail(`approved_icon_changed:${pixels}`)
}
const localeKeySets = []
for (const [locale, config] of Object.entries(expected)) {
  const values = json(`dist/_locales/${locale}/messages.json`)
  const source = json(`public/_locales/${locale}/messages.json`)
  if (JSON.stringify(values) !== JSON.stringify(source)) fail(`locale_source_dist_diff:${locale}`)
  if (values.extensionName?.message !== config.title) fail(`locale_brand:${locale}`)
  const description = values.extensionDescription?.message ?? ''
  if (description.length < 40 || description.length > 132) fail(`short_description_length:${locale}:${description.length}`)
  if (!values.consentAutoWheel?.message || !values.autoShieldMode?.message || !values.autoReadRetryHelp?.message) fail(`missing_auto_copy:${locale}`)
  if (values.manualReadTitle || values.actionCopyReadTestLog) fail(`obsolete_copy:${locale}`)
  localeKeySets.push(Object.keys(values).sort().join(','))
  for (const browser of ['chrome', 'edge']) {
    const filename = `store-listing/${browser}-${config.suffix}.md`
    const listing = text(filename)
    const shortPart = listing.split(`## ${config.shortHeading}\n`)[1]?.split('\n')[1]?.trim()
    if (shortPart !== description) fail(`short_description_inconsistent:${filename}`)
    const longPart = listing.split(`## ${config.longHeading}\n`)[1]?.split(`## ${config.singleHeading}`)[0]?.trim()
    if (!longPart || longPart.length < 250 || longPart.length > 10000) fail(`long_description_length:${filename}`)
    if (!longPart.includes('4.3.0') || !listing.includes('https://luobo656.github.io/longchat-guard/PRIVACY.md')) fail(`listing_stale:${filename}`)
    if ((listing.match(/- `debugger`/g) ?? []).length !== 1) fail(`debugger_permission_copy:${filename}`)
    if (listing.includes('github.com/luobo656/longchat-guard/blob/main/PRIVACY.md')) fail(`outdated_privacy_url:${filename}`)
  }
}
if (new Set(localeKeySets).size !== 1) fail('locale_key_sets_differ')
const notice = text('store-listing/whats-new-4.3.0.md')
for (const heading of ['简体中文', '繁體中文', 'English']) {
  if (!notice.includes(heading)) fail(`missing_update_locale:${heading}`)
}
const policy = text('PRIVACY.md')
if (!policy.includes('debugger') || !policy.includes('October 22, 2026')) fail('outdated_privacy_policy')
for (const [path, archivalLabel] of [
  ['site/index.html', '2.1.1 archive'],
  ['site/zh/index.html', '版本存档'],
  ['site/zh-tw/index.html', '版本存檔']
]) {
  const html = text(path)
  if (!html.includes('"softwareVersion": "4.3.0"') || !html.includes(archivalLabel)) fail(`site_not_current:${path}`)
}
console.log(`Store preflight passed for build ${manifest.version}: approved icons, 3 locales, 6 archived v4.3.0 listings, permission/privacy copy, screenshots.`)
