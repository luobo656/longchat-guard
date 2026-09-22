import { describe, expect, it } from 'vitest'
import { createCoalescedAsyncRunner } from '../src/content/coalesced-runner'

describe('coalesced async runner', () => {
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
})
