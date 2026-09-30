import { describe, expect, it } from 'vitest'
import manifest from '../public/manifest.json'

describe('release manifest', () => {
  it('uses v2.0.2 with minimal permissions', () => {
    expect(manifest.version).toBe('2.0.2')
    expect(manifest.permissions).toEqual(['storage'])
    expect(manifest.host_permissions).toEqual(['https://chatgpt.com/*'])
    expect(manifest.name).toBe('__MSG_extensionName__')
    expect(manifest.description).toBe('__MSG_extensionDescription__')
    expect(manifest.default_locale).toBe('en')
    expect(manifest.short_name).toBe('LongChat Guard')
    expect(manifest.action.default_title).toBe('__MSG_actionTitle__')
  })

  it('wires all required icon sizes for manifest and action', () => {
    const expected = {
      '16': 'icons/icon16.png',
      '32': 'icons/icon32.png',
      '48': 'icons/icon48.png',
      '128': 'icons/icon128.png'
    }

    expect(manifest.icons).toEqual(expected)
    expect(manifest.action.default_icon).toEqual(expected)
    expect(manifest.name).toBe('__MSG_extensionName__')
    expect(manifest.action.default_title).toBe('__MSG_actionTitle__')

  })
})
