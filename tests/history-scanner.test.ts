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
    expect(result.diagnostics.length).toBeGreaterThan(0)
    expect(JSON.stringify(result.diagnostics)).not.toContain('m1')
  })

  it('accumulates uncertainty sources across virtualized history windows', async () => {
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
      },
      readUncertaintySources: () =>
        surface.scrollTop < 200
          ? ['tool_result' as const]
          : []
    }

    const result = await scanHistorySource(source, observe, {
      settle: async () => {},
      requiredStableRounds: 1,
      stepRatio: 0.5
    })

    expect(result.complete).toBe(true)
    expect(result.uncertaintySources).toContain('tool_result')
  })

  it('scans a reversed ChatGPT timeline where raw scrollTop is zero at the bottom', async () => {
    const surface = {
      scrollTop: 0,
      scrollHeight: 900,
      clientHeight: 300
    }
    const all = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']
    const source = {
      surface,
      scrollMode: 'reversed' as const,
      readWindow: () => {
        const max = surface.scrollHeight - surface.clientHeight
        const logicalTop = surface.scrollTop + max
        const index = Math.min(3, Math.floor(logicalTop / 150))
        return all.slice(index, index + 3).map(message)
      }
    }

    const result = await scanHistorySource(source, observe, {
      settle: async () => {},
      requiredStableRounds: 1,
      stepRatio: 0.5
    })

    expect(result.complete).toBe(true)
    expect(result.observedMessages.map((item) => item.contentFingerprint)).toEqual(all)
    expect(surface.scrollTop).toBe(0)
    expect(result.diagnostics.some((item) => item.scrollMode === 'reversed')).toBe(true)
    expect(result.diagnostics.some((item) => (item.scrollTop ?? 0) < 0)).toBe(true)
  })

  it('waits through a transient empty virtualized window before scanning', async () => {
    const surface = {
      scrollTop: 500,
      scrollHeight: 900,
      clientHeight: 300
    }
    const all = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']
    let reads = 0
    const source = {
      surface,
      readWindow: () => {
        reads += 1
        if (reads === 1) return []
        const index = Math.min(3, Math.floor(surface.scrollTop / 150))
        return all.slice(index, index + 3).map(message)
      }
    }
    const result = await scanHistorySource(source, observe, {
      settle: async () => {},
      requiredStableRounds: 1,
      maxEmptyWindowRetries: 2,
      stepRatio: 0.5
    })

    expect(result.complete).toBe(true)
    expect(result.messageCount).toBe(6)
    expect(reads).toBeGreaterThan(1)
  })

  it('allows a slower head-loading phase before deciding there are no messages', async () => {
    const surface = {
      scrollTop: 500,
      scrollHeight: 900,
      clientHeight: 300
    }
    const all = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6']
    let headWaits = 0
    const source = {
      surface,
      readWindow: () => {
        if (surface.scrollTop <= 4 && headWaits < 3) return []
        const index = Math.min(3, Math.floor(surface.scrollTop / 150))
        return all.slice(index, index + 3).map(message)
      }
    }

    const result = await scanHistorySource(source, observe, {
      settle: async () => {},
      headSettle: async () => {
        headWaits += 1
      },
      requiredStableRounds: 1,
      maxEmptyWindowRetries: 4,
      stepRatio: 0.5
    })

    expect(result.complete).toBe(true)
    expect(result.messageCount).toBe(6)
    expect(headWaits).toBeGreaterThanOrEqual(3)
  })

  it('fails closed when an empty virtualized window never resolves', async () => {
    const surface = {
      scrollTop: 0,
      scrollHeight: 900,
      clientHeight: 300
    }
    let reads = 0
    const result = await scanHistorySource(
      {
        surface,
        readWindow: () => {
          reads += 1
          return []
        }
      },
      observe,
      {
        settle: async () => {},
        requiredStableRounds: 1,
        maxEmptyWindowRetries: 2
      }
    )

    expect(result.complete).toBe(false)
    expect(result.reason).toBe('no_messages')
    expect(reads).toBe(3)
  })

  it('recovers alignment by reducing a scroll jump before failing closed', async () => {
    const surface = {
      scrollTop: 600,
      scrollHeight: 900,
      clientHeight: 300
    }
    const all = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8']
    const source = {
      surface,
      readWindow: () => {
        const index = Math.min(all.length - 2, Math.floor(surface.scrollTop / 100))
        return all.slice(index, index + 3).map(message)
      }
    }

    const result = await scanHistorySource(source, observe, {
      settle: async () => {},
      requiredStableRounds: 1,
      stepRatio: 1
    })

    expect(result.complete).toBe(true)
    expect(result.observedMessages.map((item) => item.contentFingerprint)).toEqual(all)
  })

  it('recovers an alignment gap on a reversed virtualized timeline', async () => {
    const surface = {
      scrollTop: 0,
      scrollHeight: 900,
      clientHeight: 300
    }
    const all = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8']
    const source = {
      surface,
      scrollMode: 'reversed' as const,
      readWindow: () => {
        const logicalTop = surface.scrollTop + (surface.scrollHeight - surface.clientHeight)
        const index = Math.min(all.length - 2, Math.floor(logicalTop / 100))
        return all.slice(index, index + 3).map(message)
      }
    }

    const result = await scanHistorySource(source, observe, {
      settle: async () => {},
      requiredStableRounds: 1,
      stepRatio: 1
    })

    expect(result.complete).toBe(true)
    expect(result.observedMessages.map((item) => item.contentFingerprint)).toEqual(all)
    expect(surface.scrollTop).toBe(0)
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

  it('keeps probing the top and incorporates older messages that appear late', async () => {
    const surface = {
      scrollTop: 0,
      scrollHeight: 900,
      clientHeight: 300
    }
    let topReads = 0
    const source = {
      surface,
      readWindow: () => {
        if (surface.scrollTop <= 4) {
          topReads += 1
          return (topReads < 3 ? ['m2', 'm3'] : ['m1', 'm2', 'm3']).map(message)
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

    expect(result.complete).toBe(true)
    expect(result.observedMessages.map((item) => item.contentFingerprint)).toEqual([
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
      'm6'
    ])
    expect(topReads).toBeGreaterThanOrEqual(3)
  })

  it('does not declare the head stable during a short quiet gap before older messages arrive', async () => {
    const surface = {
      scrollTop: 0,
      scrollHeight: 900,
      clientHeight: 300
    }
    let topReads = 0
    const source = {
      surface,
      readWindow: () => {
        if (surface.scrollTop <= 4) {
          topReads += 1
          return (topReads < 5 ? ['m2', 'm3'] : ['m1', 'm2', 'm3']).map(message)
        }
        if (surface.scrollTop < 350) return ['m2', 'm3', 'm4'].map(message)
        return ['m4', 'm5', 'm6'].map(message)
      }
    }

    const result = await scanHistorySource(source, observe, {
      settle: async () => {},
      headSettle: async () => {},
      requiredStableRounds: 1,
      requiredHeadStableRounds: 4,
      stepRatio: 0.5
    })

    expect(result.complete).toBe(true)
    expect(result.observedMessages.map((item) => item.contentFingerprint)).toEqual([
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
      'm6'
    ])
    expect(topReads).toBeGreaterThanOrEqual(5)
  })

  it('reconnects to the previous top after reversed history prepends shift the coordinate system', async () => {
    const surface = {
      scrollTop: 0,
      scrollHeight: 600,
      clientHeight: 200
    }
    let expanded = false
    let headSettles = 0
    const source = {
      surface,
      scrollMode: 'reversed' as const,
      readWindow: () => {
        const max = Math.max(0, surface.scrollHeight - surface.clientHeight)
        const logicalTop = Math.max(0, Math.min(max, surface.scrollTop + max))
        if (!expanded) {
          if (logicalTop < 180) return ['m5', 'm6', 'm7'].map(message)
          return ['m6', 'm7', 'm8'].map(message)
        }
        if (logicalTop < 160) return ['m1', 'm2', 'm3'].map(message)
        if (logicalTop < 320) return ['m2', 'm3', 'm4'].map(message)
        if (logicalTop < 500) return ['m3', 'm4', 'm5'].map(message)
        if (logicalTop < 650) return ['m5', 'm6', 'm7'].map(message)
        return ['m6', 'm7', 'm8'].map(message)
      }
    }

    const result = await scanHistorySource(source, observe, {
      settle: async () => {},
      headSettle: async () => {
        headSettles += 1
        if (!expanded) {
          expanded = true
          surface.scrollHeight = 1000
        }
      },
      requiredStableRounds: 1,
      requiredHeadStableRounds: 2,
      stepRatio: 0.5
    })

    expect(result.complete).toBe(true)
    expect(result.observedMessages.map((item) => item.contentFingerprint)).toEqual([
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
      'm6',
      'm7',
      'm8'
    ])
    expect(headSettles).toBeGreaterThanOrEqual(1)
  })

  it('fails closed when older messages keep appearing and the top never stabilizes', async () => {
    const surface = {
      scrollTop: 0,
      scrollHeight: 900,
      clientHeight: 300
    }
    let topReads = 0
    const source = {
      surface,
      readWindow: () => {
        if (surface.scrollTop <= 4) {
          topReads += 1
          return [`older-${topReads}`, 'm1', 'm2'].map(message)
        }
        if (surface.scrollTop < 350) return ['m1', 'm2', 'm3'].map(message)
        return ['m3', 'm4', 'm5'].map(message)
      }
    }
    const result = await scanHistorySource(source, observe, {
      settle: async () => {},
      requiredStableRounds: 1,
      maxSweepSteps: 8,
      stepRatio: 0.5
    })

    expect(result.complete).toBe(false)
    expect(['scan_limit_reached', 'head_not_stable', 'window_alignment_failed']).toContain(result.reason)
  })

  it('does not reject a stable conversation only because scroll height changes slightly', async () => {
    const surface = {
      scrollTop: 0,
      scrollHeight: 900,
      clientHeight: 300
    }
    let reads = 0
    const all = ['m1', 'm2', 'm3', 'm4']
    const source = {
      surface,
      readWindow: () => {
        reads += 1
        if (reads < 5) surface.scrollHeight += 8
        const index = surface.scrollTop < 250 ? 0 : 1
        return all.slice(index, index + 3).map(message)
      }
    }

    const result = await scanHistorySource(source, observe, {
      settle: async () => {},
      requiredStableRounds: 1,
      stepRatio: 0.5
    })

    expect(result.complete).toBe(true)
    expect(result.observedMessages.map((item) => item.contentFingerprint)).toEqual(all)
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
