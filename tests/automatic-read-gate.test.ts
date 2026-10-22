import { describe, expect, it, vi } from 'vitest'
import { runHistoryAfterAutomaticPreparation } from '../src/content/automatic-read-gate'

describe('automatic-only full-history commit gate', () => {
  it('performs preloading first, then verification and the original scanner', async () => {
    const events: string[] = []
    const controller = new AbortController()
    const result = await runHistoryAfterAutomaticPreparation(
      controller.signal,
      async () => { events.push('wheel-up-down') },
      async () => { events.push('original-history-scanner'); return { complete: true, count: 112 } },
      () => { events.push('check-completeness') }
    )
    expect(result).toEqual({ complete: true, count: 112 })
    expect(events).toEqual(['wheel-up-down', 'check-completeness', 'original-history-scanner'])
  })

  it('does not attach input or invoke the scanner when already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const prepare = vi.fn(async () => {})
    const scan = vi.fn(async () => ({ complete:true }))
    await expect(runHistoryAfterAutomaticPreparation(
      controller.signal, prepare, scan, () => {}
    )).rejects.toThrow('auto_scroll_cancelled')
    expect(prepare).not.toHaveBeenCalled()
    expect(scan).not.toHaveBeenCalled()
  })

  it('never invokes the scanner if scrolling fails or is cancelled', async () => {
    const controller = new AbortController()
    const scan = vi.fn(async () => ({ complete:true }))
    await expect(runHistoryAfterAutomaticPreparation(
      controller.signal,
      async () => { throw new Error('auto_scroll_no_progress') },
      scan, () => {}
    )).rejects.toThrow('auto_scroll_no_progress')
    expect(scan).not.toHaveBeenCalled()
    await expect(runHistoryAfterAutomaticPreparation(
      controller.signal,
      async () => { controller.abort() },
      scan, () => {}
    )).rejects.toThrow('auto_scroll_cancelled')
    expect(scan).not.toHaveBeenCalled()
  })

  it('does not return an apparently successful scan when cancelled during scanning', async () => {
    const controller = new AbortController()
    const scan = vi.fn(async () => {
      controller.abort()
      return { complete:true, messageCount: 144 }
    })
    await expect(runHistoryAfterAutomaticPreparation(
      controller.signal,
      async () => {},
      scan,
      () => {}
    )).rejects.toThrow('auto_scroll_cancelled')
    expect(scan).toHaveBeenCalledOnce()
  })

  it('honors a cancellation raised while transitioning into verification', async () => {
    const controller = new AbortController()
    const scan = vi.fn(async () => ({ complete:true }))
    await expect(runHistoryAfterAutomaticPreparation(
      controller.signal, async () => {}, scan, () => controller.abort()
    )).rejects.toThrow('auto_scroll_cancelled')
    expect(scan).not.toHaveBeenCalled()
  })
})
