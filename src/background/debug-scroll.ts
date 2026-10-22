/** Deliberately restricted CDP bridge for user-initiated history preloading.
 * No page content, arbitrary CDP methods, or network traffic crosses this bridge.
 */
export type DebugScrollRequest =
  | { type: 'lcg.debugScroll.start'; nonce: string }
  | { type: 'lcg.debugScroll.wheel'; nonce: string; x: number; y: number; deltaY: number }
  | { type: 'lcg.debugScroll.stop'; nonce: string }

export type DebugScrollReply = { ok: true } | { ok: false; error: string }

interface ActiveScrollSession {
  tabId: number
  windowId: number
  documentId: string | undefined
  path: string
  nonce: string
  startedAt: number
  touchedAt: number
  attached: boolean
  watchdog?: ReturnType<typeof setTimeout>
}

const MAX_DURATION_MS = 18 * 60_000
const MAX_IDLE_MS = 25_000
const CHAT_ORIGIN = 'https://chatgpt.com'

export function isDebugScrollRequest(value: unknown): value is DebugScrollRequest {
  if (typeof value !== 'object' || value === null) return false
  const request = value as Record<string, unknown>
  return (
    (request.type === 'lcg.debugScroll.start' ||
      request.type === 'lcg.debugScroll.wheel' ||
      request.type === 'lcg.debugScroll.stop') &&
    typeof request.nonce === 'string' &&
    request.nonce.length >= 16 &&
    request.nonce.length <= 128
  )
}

function chatPath(value: string | undefined): string | undefined {
  try {
    const url = new URL(value ?? '')
    if (url.origin !== CHAT_ORIGIN) return undefined
    return url.pathname
  } catch {
    return undefined
  }
}

export class DebugScrollController {
  private active: ActiveScrollSession | undefined

  constructor(private readonly api: typeof chrome = chrome) {
    api.debugger.onDetach.addListener((source) => {
      const session = this.active
      if (session && source.tabId === session.tabId) {
        if (session.watchdog) clearTimeout(session.watchdog)
        this.active = undefined
      }
    })
    api.tabs.onRemoved.addListener((tabId) => {
      if (tabId === this.active?.tabId) void this.release(this.active)
    })
    api.tabs.onActivated.addListener((info) => {
      if (this.active && info.windowId === this.active.windowId &&
          info.tabId !== this.active.tabId) void this.release(this.active)
    })
    api.tabs.onUpdated.addListener((tabId, info) => {
      if (tabId === this.active?.tabId && (info.url || info.status === 'loading')) {
        void this.release(this.active)
      }
    })
    api.windows.onFocusChanged.addListener((windowId) => {
      if (this.active && windowId !== this.active.windowId) {
        void this.release(this.active)
      }
    })
  }

  async handle(request: DebugScrollRequest, sender: chrome.runtime.MessageSender): Promise<DebugScrollReply> {
    try {
      if (sender.id !== this.api.runtime.id ||
          sender.frameId !== 0 ||
          !sender.tab?.id ||
          !chatPath(sender.url ?? sender.tab.url)) {
        throw new Error('unauthorized_sender')
      }
      const tabId = sender.tab.id
      if (request.type === 'lcg.debugScroll.start') {
        if (this.active) throw new Error('debug_scroll_busy')
        const tab = await this.ensureForeground(tabId)
        const path = chatPath(sender.url ?? sender.tab.url)
        if (!path || chatPath(tab.url) !== path) throw new Error('conversation_changed')
        const session: ActiveScrollSession = {
          tabId, windowId: tab.windowId, documentId: sender.documentId,
          path, nonce: request.nonce, startedAt: Date.now(),
          touchedAt: Date.now(), attached: false
        }
        this.active = session // Reserve before awaiting attach; no double-attach race.
        try {
          await this.api.debugger.attach({ tabId }, '1.3')
          session.attached = true
          if (this.active !== session) {
            await this.release(session)
            throw new Error('debug_scroll_interrupted')
          }
        } catch (error) {
          await this.release(session)
          throw error
        }
        this.armWatchdog(session)
        return { ok: true }
      }

      const session = this.active
      if (request.type === 'lcg.debugScroll.stop') {
        if (!session) return { ok: true }
        if (session.tabId !== tabId || session.nonce !== request.nonce ||
            session.documentId !== sender.documentId) {
          throw new Error('debug_scroll_wrong_session')
        }
        await this.release(session)
        return { ok: true }
      }
      if (!session || !session.attached || session.tabId !== tabId ||
          session.nonce !== request.nonce ||
          session.documentId !== sender.documentId) {
        throw new Error('debug_scroll_not_attached')
      }
      if (Date.now() - session.startedAt > MAX_DURATION_MS ||
          Date.now() - session.touchedAt > MAX_IDLE_MS) {
        await this.release(session)
        throw new Error('debug_scroll_timeout')
      }
      const tab = await this.ensureForeground(tabId)
      if (tab.windowId !== session.windowId || chatPath(tab.url) !== session.path) {
        await this.release(session)
        throw new Error('conversation_changed')
      }
      const { x, y, deltaY } = request
      if (![x, y, deltaY].every(Number.isFinite) ||
          x < 1 || y < 1 || x >= (tab.width ?? 0) ||
          y >= (tab.height ?? 0) || Math.abs(deltaY) < 1 ||
          Math.abs(deltaY) > 120) {
        throw new Error('invalid_scroll_coordinates')
      }
      try {
        await this.api.debugger.sendCommand(
          { tabId }, 'Input.dispatchMouseEvent',
          { type: 'mouseWheel', x, y, deltaX: 0, deltaY, pointerType: 'mouse' }
        )
      } catch {
        await this.release(session)
        throw new Error('debug_scroll_dispatch_failed')
      }
      session.touchedAt = Date.now()
      this.armWatchdog(session)
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'debug_scroll_failed' }
    }
  }

  private async ensureForeground(tabId: number): Promise<chrome.tabs.Tab> {
    const tab = await this.api.tabs.get(tabId)
    if (!tab.active || !tab.id || !chatPath(tab.url)) {
      throw new Error('debug_scroll_tab_not_active')
    }
    const window = await this.api.windows.get(tab.windowId)
    if (!window.focused) throw new Error('debug_scroll_window_not_focused')
    return tab
  }

  private armWatchdog(session: ActiveScrollSession): void {
    if (session.watchdog) clearTimeout(session.watchdog)
    session.watchdog = setTimeout(() => { void this.release(session) }, MAX_IDLE_MS)
  }

  private async release(session: ActiveScrollSession): Promise<void> {
    if (session.watchdog) clearTimeout(session.watchdog)
    if (this.active === session) this.active = undefined
    if (session.attached) {
      session.attached = false
      try { await this.api.debugger.detach({ tabId: session.tabId }) } catch {
        // Already detached by the user, DevTools, or tab navigation.
      }
    }
  }
}
