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

console.log('Extension build verification passed.')
