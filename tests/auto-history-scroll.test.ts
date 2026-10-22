import { describe, expect, it, vi } from 'vitest'
import {
  isScrollBoundary, runWheelPass
} from '../src/content/auto-history-scroll'

describe('CDP wheel preparation geometry', () => {
  it('moves up and down in small wheel steps and requires a settled edge', async () => {
    const surface = { scrollTop: 1000, scrollHeight: 1500, clientHeight: 500 }
    const dispatched: number[] = []
    const wheel = vi.fn(async (delta: number) => {
      dispatched.push(delta)
      // Simulated effect of the browser input, not an extension scrollTop write.
      surface.scrollTop = Math.max(0, Math.min(1000, surface.scrollTop + delta))
    })
    const wait = vi.fn(async () => {})
    const safe = vi.fn()
    await runWheelPass('up', surface, wheel, wait, safe, {
      maxSteps: 50, stableRounds: 3, settleMs: 0
    })
    expect(surface.scrollTop).toBe(0)
    expect(dispatched.every(delta => delta === -88)).toBe(true)
    dispatched.length = 0
    await runWheelPass('down', surface, wheel, wait, safe, {
      maxSteps: 50, stableRounds: 3, settleMs: 0
    })
    expect(surface.scrollTop).toBe(1000)
    expect(dispatched.every(delta => delta === 88)).toBe(true)
    expect(safe).toHaveBeenCalled()
  })

  it('supports reversed scrollTop surfaces without changing their geometry directly', async () => {
    const surface = { scrollTop: 0, scrollHeight: 900, clientHeight: 300 }
    const wheel = async (delta: number) => {
      surface.scrollTop = Math.max(-600, Math.min(0, surface.scrollTop + delta))
    }
    await runWheelPass('up', surface, wheel, async () => {}, () => {}, {
      maxSteps: 40, stableRounds: 3, settleMs: 0
    })
    expect(isScrollBoundary(surface, 'up', true)).toBe(true)
    await runWheelPass('down', surface, wheel, async () => {}, () => {}, {
      maxSteps: 40, stableRounds: 3, settleMs: 0
    })
    expect(isScrollBoundary(surface, 'down', true)).toBe(true)
  })

  it('rejects a blocked wheel target rather than marking a scan complete', async () => {
    const surface = { scrollTop: 0, scrollHeight: 800, clientHeight: 300 }
    await expect(runWheelPass('up', surface, async () => {}, async () => {}, () => {}, {
      maxSteps: 30, stableRounds: 3, settleMs: 0
    })).rejects.toThrow('auto_scroll_no_progress')
  })

  it('honors interruption without fabricating a completed scan', async () => {
    const surface = { scrollTop: 200, scrollHeight: 800, clientHeight: 300 }
    await expect(runWheelPass('up', surface, async () => {}, async () => {},
      () => { throw new Error('user_cancelled') }
    )).rejects.toThrow('user_cancelled')
  })
})
