import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createCoalescedAsyncRunner,
  createDebouncedRunner
} from '../src/content/coalesced-runner'

describe('coalesced async runner', () => {
  afterEach(() => vi.useRealTimers())

  it('runs once more after a mutation arrives while work is running', async () => {
    let runs = 0
    let releaseFirst: (() => void) | undefined
    const firstRun = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    const runner = createCoalescedAsyncRunner(async () => {
      runs += 1
      if (runs === 1) await firstRun
    })

    runner()
    runner()
    await Promise.resolve()
    expect(runs).toBe(1)

    releaseFirst?.()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(runs).toBe(2)
  })

  it('debounces mutation bursts and can cancel pending work', () => {
    vi.useFakeTimers()
    let runs = 0
    const runner = createDebouncedRunner(() => {
      runs += 1
    }, 120)

    runner.schedule()
    runner.schedule()
    runner.schedule()
    vi.advanceTimersByTime(119)
    expect(runs).toBe(0)
    vi.advanceTimersByTime(1)
    expect(runs).toBe(1)

    runner.schedule()
    runner.cancel()
    vi.advanceTimersByTime(120)
    expect(runs).toBe(1)
  })
})
