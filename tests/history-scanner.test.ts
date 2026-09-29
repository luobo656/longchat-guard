import { describe, expect, it } from 'vitest'
import { scanHistorySource } from '../src/content/history-scanner'
import type { PageMessageSnapshot } from '../src/core/page-adapter'

describe('history scanner', () => {
  it('stitches virtualized windows from top to bottom and proves complete coverage', async () => {
    const surface = {
      scrollTop: 500,
      scrollHeight: 900,
      clientHeight: 300
    }
    const all = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']
    const source = {
      surface,
      readWindow: () => {
        const index = Math.min(3, Math.floor(surface.scrollTop / 150))
        return all.slice(index, index + 3).map(message)
      }
    }
    const result = await scanHistorySource(source, observe, {
      settle: async () => {},
      requiredStableRounds: 1,
      stepRatio: 0.5
    })

    expect(result.complete).toBe(true)
    expect(result.messageCount).toBe(6)
    expect(result.observedMessages.map((item) => item.contentFingerprint)).toEqual(all)
    expect(surface.scrollTop).toBe(500)
  })

  it('refuses to claim completeness when consecutive windows cannot align', async () => {
    const surface = {
      scrollTop: 0,
      scrollHeight: 900,
      clientHeight: 300
    }
    const source = {
      surface,
      readWindow: () =>
        surface.scrollTop < 100
          ? ['m1', 'm2'].map(message)
          : ['x1', 'x2'].map(message)
    }
    const result = await scanHistorySource(source, observe, {
      settle: async () => {},
      requiredStableRounds: 1,
      stepRatio: 0.5
    })

    expect(result.complete).toBe(false)
    expect(result.reason).toBe('window_alignment_failed')
  })

  it('rejects a scan when older messages appear during the final head verification', async () => {
    const surface = {
      scrollTop: 0,
      scrollHeight: 900,
      clientHeight: 300
    }
    let reachedBottom = false
    const source = {
      surface,
      readWindow: () => {
        const maxTop = surface.scrollHeight - surface.clientHeight
        if (surface.scrollTop >= maxTop) reachedBottom = true
        if (surface.scrollTop <= 4) {
          return (reachedBottom ? ['m1', 'm2', 'm3'] : ['m2', 'm3']).map(message)
        }
        if (surface.scrollTop < 350) return ['m2', 'm3', 'm4'].map(message)
        return ['m4', 'm5', 'm6'].map(message)
      }
    }
    const result = await scanHistorySource(source, observe, {
      settle: async () => {},
      requiredStableRounds: 1,
      stepRatio: 0.5
    })

    expect(result.complete).toBe(false)
    expect(['head_not_stable', 'window_alignment_failed']).toContain(result.reason)
  })
})

function message(text: string): PageMessageSnapshot {
  return {
    role: 'assistant',
    text,
    stableHint: text,
    ordinalHint: 0,
    semanticScore: 0.95,
    hasCode: false,
    attachmentCount: 0
  }
}

async function observe(messages: PageMessageSnapshot[]) {
  return messages.map((item, index) => ({
    contentFingerprint: item.text,
    ...(item.stableHint ? { stableHintHash: item.stableHint } : {}),
    role: item.role,
    tokenEstimate: 10,
    charCount: item.text.length,
    observedAt: index,
    ordinalHint: index,
    hasCode: item.hasCode,
    attachmentCount: item.attachmentCount
  }))
}
