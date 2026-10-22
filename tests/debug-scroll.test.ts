import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DebugScrollController, isDebugScrollRequest
} from '../src/background/debug-scroll'

const validSender = {
  id: 'local-extension', frameId: 0,
  url: 'https://chatgpt.com/c/history-1',
  documentId: 'doc-1',
  tab: { id: 12, windowId: 4, url: 'https://chatgpt.com/c/history-1' }
} as chrome.runtime.MessageSender

function mockEnvironment() {
  const callbacks: Record<string, Array<(...args: any[]) => void>> = {}
  const register = (name: string) => ({
    addListener: (handler: (...args: any[]) => void) => {
      ;(callbacks[name] ??= []).push(handler)
    }
  })
  const api = {
    runtime: { id: 'local-extension' },
    debugger: {
      attach: vi.fn(async () => {}),
      detach: vi.fn(async () => {}),
      sendCommand: vi.fn(async () => ({})),
      onDetach: register('onDetach')
    },
    tabs: {
      get: vi.fn(async () => ({
        id: 12, windowId: 4, active: true,
        url: 'https://chatgpt.com/c/history-1',
        width: 1200, height: 900
      })),
      onRemoved: register('onRemoved'),
      onActivated: register('onActivated'),
      onUpdated: register('onUpdated')
    },
    windows: {
      get: vi.fn(async () => ({ id: 4, focused: true })),
      onFocusChanged: register('onFocusChanged')
    }
  }
  return { api, events: (name: string, ...args: any[]) =>
    (callbacks[name] ?? []).forEach(callback => callback(...args)) }
}
const start = { type: 'lcg.debugScroll.start' as const, nonce: 'session-1234567890123456' }
const wheel = {
  type: 'lcg.debugScroll.wheel' as const, nonce: start.nonce,
  x: 300, y: 440, deltaY: -88
}
const stop = { type: 'lcg.debugScroll.stop' as const, nonce: start.nonce }

afterEach(() => { vi.restoreAllMocks() })
describe('browser debugger wheel bridge', () => {
  it('only attaches to its active ChatGPT tab and sends the one approved CDP method', async () => {
    const { api } = mockEnvironment()
    const controller = new DebugScrollController(api as unknown as typeof chrome)
    expect(await controller.handle(start, validSender)).toEqual({ ok: true })
    expect(api.debugger.attach).toHaveBeenCalledWith({ tabId: 12 }, '1.3')
    expect(await controller.handle(wheel, validSender)).toEqual({ ok: true })
    expect(api.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 12 }, 'Input.dispatchMouseEvent',
      { type: 'mouseWheel', x: 300, y: 440,
        deltaX: 0, deltaY: -88, pointerType: 'mouse' }
    )
    expect(await controller.handle(stop, validSender)).toEqual({ ok: true })
    expect(api.debugger.detach).toHaveBeenCalledWith({ tabId: 12 })
  })

  it('rejects non-extension senders and non-main frames', async () => {
    const { api } = mockEnvironment()
    const controller = new DebugScrollController(api as unknown as typeof chrome)
    expect((await controller.handle(start, {
      ...validSender, frameId: 1
    })).ok).toBe(false)
    expect((await controller.handle(start, {
      ...validSender, id: 'another-extension'
    })).ok).toBe(false)
    expect(api.debugger.attach).not.toHaveBeenCalled()
  })

  it('blocks input outside the foreground tab or allowed scroll sizes', async () => {
    const { api } = mockEnvironment()
    const controller = new DebugScrollController(api as unknown as typeof chrome)
    expect((await controller.handle(start, validSender)).ok).toBe(true)
    expect((await controller.handle({ ...wheel, deltaY: -1200 }, validSender)).ok).toBe(false)
    expect((await controller.handle({ ...wheel, x: 2000 }, validSender)).ok).toBe(false)
    expect(api.debugger.sendCommand).not.toHaveBeenCalled()
    api.windows.get.mockResolvedValueOnce({ id: 4, focused: false })
    expect((await controller.handle(wheel, validSender)).ok).toBe(false)
    await controller.handle(stop, validSender)
  })

  it('never overlaps two debugger sessions and detaches when leaving the tab', async () => {
    const { api, events } = mockEnvironment()
    const controller = new DebugScrollController(api as unknown as typeof chrome)
    expect((await controller.handle(start, validSender)).ok).toBe(true)
    expect((await controller.handle({ ...start, nonce: 'different-session-123456' }, validSender)).ok).toBe(false)
    events('onActivated', { windowId: 4, tabId: 99 })
    await Promise.resolve()
    expect(api.debugger.detach).toHaveBeenCalledWith({ tabId: 12 })
    expect((await controller.handle(wheel, validSender)).ok).toBe(false)
  })

  it('fails closed on mismatched message origins or document IDs', async () => {
    const { api } = mockEnvironment()
    const controller = new DebugScrollController(api as unknown as typeof chrome)
    expect((await controller.handle(start, {
      ...validSender, url: 'https://example.com'
    })).ok).toBe(false)
    expect((await controller.handle(start, validSender)).ok).toBe(true)
    expect((await controller.handle(wheel, {
      ...validSender, documentId: 'different-document'
    })).ok).toBe(false)
    await controller.handle(stop, validSender)
  })

  it('validates the command envelope before the background handler', () => {
    expect(isDebugScrollRequest(start)).toBe(true)
    expect(isDebugScrollRequest({ ...start, nonce: 'tiny' })).toBe(false)
    expect(isDebugScrollRequest({ type: 'Runtime.evaluate', nonce: start.nonce })).toBe(false)
  })
})
