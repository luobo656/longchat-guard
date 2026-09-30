import fs from 'node:fs'

const manifestPath = 'dist/manifest.json'
const contentPath = 'dist/content.js'
const backgroundPath = 'dist/background.js'

for (const path of [manifestPath, contentPath, backgroundPath]) {
  if (!fs.existsSync(path)) throw new Error(`missing_build_artifact:${path}`)
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const content = fs.readFileSync(contentPath, 'utf8')

if (/^\s*import\s/m.test(content) || /^\s*export\s/m.test(content)) {
  throw new Error('content_script_must_be_self_contained_classic_script')
}

if (JSON.stringify(manifest.permissions ?? []) !== JSON.stringify(['storage'])) {
  throw new Error('unexpected_extension_permissions')
}

if (
  JSON.stringify(manifest.host_permissions ?? []) !==
  JSON.stringify(['https://chatgpt.com/*'])
) {
  throw new Error('unexpected_host_permissions')
}

const matches = manifest.content_scripts?.[0]?.matches ?? []
if (JSON.stringify(matches) !== JSON.stringify(['https://chatgpt.com/*'])) {
  throw new Error('unexpected_content_script_matches')
}

if (manifest.name !== '__MSG_extensionName__' || manifest.description !== '__MSG_extensionDescription__') {
  throw new Error('manifest_i18n_placeholders_missing')
}
if (manifest.default_locale !== 'en') {
  throw new Error('unexpected_default_locale')
}
if (manifest.short_name !== 'LongChat Guard') {
  throw new Error('unexpected_short_name')
}
if (manifest.action?.default_title !== '__MSG_actionTitle__') {
  throw new Error('unexpected_action_title')
}

const expectedLocaleNames = {
  en: 'LongChat Guard',
  zh_CN: 'LongChat Guard · 长会话预警',
  zh_TW: 'LongChat Guard · 長對話預警'
}

for (const [locale, expectedName] of Object.entries(expectedLocaleNames)) {
  const localePath = `dist/_locales/${locale}/messages.json`
  if (!fs.existsSync(localePath)) throw new Error(`missing_locale:${locale}`)
  const messages = JSON.parse(fs.readFileSync(localePath, 'utf8'))
  if (messages.extensionName?.message !== expectedName) {
    throw new Error(`unexpected_locale_name:${locale}`)
  }
  if (messages.actionTitle?.message !== 'LongChat Guard') {
    throw new Error(`translated_brand_action_title:${locale}`)
  }
  if (!messages.extensionDescription?.message) {
    throw new Error(`missing_locale_description:${locale}`)
  }
}

console.log('Extension build verification passed.')
