import { describe, expect, it } from 'vitest'
import manifest from '../public/manifest.json'

describe('release manifest', () => {
  it('uses v1.0.0 with minimal permissions', () => {
    expect(manifest.version).toBe('1.0.0')
    expect(manifest.permissions).toEqual(['storage'])
    expect(manifest.host_permissions).toEqual(['https://chatgpt.com/*'])
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
    expect(manifest.action.default_title).toBe('ChatGPT 长会话预警')

  })
})
