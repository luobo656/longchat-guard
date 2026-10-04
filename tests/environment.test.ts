import { describe, expect, it } from 'vitest'
import { parserCanaryPasses } from '../src/content/environment'
import type { PageMessageSnapshot } from '../src/core/page-adapter'

function message(
  role: PageMessageSnapshot['role'],
  semanticScore: number
): PageMessageSnapshot {
  return {
    role,
    text: 'x',
    ordinalHint: 0,
    semanticScore,
    hasCode: false,
    attachmentCount: 0
  }
}

describe('parser canary', () => {
  it('accepts a healthy known-role message window', () => {
    expect(
      parserCanaryPasses([
        message('user', 1),
        message('assistant', 1)
      ])
    ).toBe(true)
  })

  it('fails closed for empty or role-ambiguous windows', () => {
    expect(parserCanaryPasses([])).toBe(false)
    expect(
      parserCanaryPasses([
        message('user', 1),
        message('unknown', 1)
      ])
    ).toBe(false)
  })

  it('fails closed when semantic message detection becomes weak', () => {
    expect(
      parserCanaryPasses([
        message('user', 0.4),
        message('assistant', 0.4)
      ])
    ).toBe(false)
  })
})
