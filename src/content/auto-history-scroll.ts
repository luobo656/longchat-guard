import type { DebugScrollReply, DebugScrollRequest } from '../background/debug-scroll'

/** CDP preparation only. No message text is observed or stored here.
 * The ORIGINAL history scanner remains the sole source of completeness evidence.
 */
type Phase = 'up' | 'down'
export interface ScrollMetrics {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

export interface WheelPassOptions {
  maxSteps?: number
  settleMs?: number
  stableRounds?: number
}

const WHEEL_STEP = 88
const STEP_DELAY_MS = 135
const MAX_STEPS = 2400
const END_STABLE_ROUNDS = 12
const END_SETTLE_MS = 2200

export function scrollMetrics(surface: ScrollMetrics): ScrollMetrics {
  return {
    scrollTop: surface.scrollTop,
    scrollHeight: surface.scrollHeight,
    clientHeight: surface.clientHeight
  }
}

export function isScrollBoundary(
  metrics: ScrollMetrics,
  phase: Phase,
  reversed: boolean
): boolean {
  const maximum = Math.max(0, metrics.scrollHeight - metrics.clientHeight)
  if (maximum < 48) return false
  if (phase === 'up') {
    return reversed ? metrics.scrollTop <= -maximum + 4 : metrics.scrollTop <= 4
  }
  return reversed ? metrics.scrollTop >= -4 : metrics.scrollTop >= maximum - 4
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error('auto_scroll_cancelled'))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(new Error('auto_scroll_cancelled'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/** Purely observes scroll geometry between input events. No scrollTop writes. */
export async function runWheelPass(
  phase: Phase,
  surface: ScrollMetrics,
  wheel: (deltaY: number) => Promise<void>,
  wait: (ms: number) => Promise<void>,
  ensureSafe: () => void,
  options: WheelPassOptions = {}
): Promise<void> {
  const maxSteps = options.maxSteps ?? MAX_STEPS
  const stableRounds = options.stableRounds ?? END_STABLE_ROUNDS
  const settleMs = options.settleMs ?? END_SETTLE_MS
  let reversed = surface.scrollTop < -4
  let sawMovement = false
  let stable = 0

  for (let step = 0; step < maxSteps; step += 1) {
    ensureSafe()
    const before = scrollMetrics(surface)
    await wheel(phase === 'up' ? -WHEEL_STEP : WHEEL_STEP)
    await wait(STEP_DELAY_MS)
    ensureSafe()
    const after = scrollMetrics(surface)
    if (after.scrollTop < -4) reversed = true
    const heightChanged = Math.abs(after.scrollHeight - before.scrollHeight) > 1
    const moved = Math.abs(after.scrollTop - before.scrollTop) > 1
    if (moved) sawMovement = true
    const atBoundary = isScrollBoundary(after, phase, reversed)
    stable = atBoundary && !heightChanged && !moved ? stable + 1 : 0

    // Periodic render opportunities for virtualized ChatGPT history.
    if (step > 0 && step % 12 === 0) await wait(350)
    if (heightChanged) await wait(550)
    if (stable < stableRounds) continue

    // Never infer completion from one stalled wheel event.
    await wait(settleMs)
    ensureSafe()
    const settled = scrollMetrics(surface)
    if (!sawMovement ||
        Math.abs(settled.scrollHeight - after.scrollHeight) > 1 ||
        !isScrollBoundary(settled, phase, reversed)) {
      stable = 0
      // A page which never moves cannot prove that the CDP event hit its timeline.
      if (!sawMovement && step > stableRounds * 2) {
        throw new Error('auto_scroll_no_progress')
      }
      continue
    }
    return
  }
  throw new Error('auto_scroll_limit_reached')
}

function findAutoScrollSurface(doc: Document): HTMLElement | undefined {
  // Do NOT use findConversationScrollContainer() here: its original scanner
  // performs a small programmatic scroll probe to choose its surface.
  // This preparation must only READ geometry; all movement comes from CDP.
  const selectors = [
    '[data-app-action-timeline-scroll]',
    '.thread-scroll-container',
    '[role="region"][aria-label]',
    '[data-scroll-root]',
    'main',
    '[role="main"]'
  ]
  const candidates = Array.from(doc.querySelectorAll<HTMLElement>(selectors.join(',')))
  const root = doc.scrollingElement
  if (root instanceof HTMLElement) candidates.push(root)
  const unique = Array.from(new Set(candidates))
  const eligible = unique.filter((element) => {
    const rect = element.getBoundingClientRect()
    const scrollable = element === doc.scrollingElement ||
      /^(auto|scroll)$/.test(getComputedStyle(element).overflowY)
    return scrollable && element.scrollHeight > element.clientHeight + 48 &&
      rect.width > 150 && rect.height > 150 &&
      rect.bottom > 0 && rect.top < innerHeight
  })
  return eligible.sort((a, b) => {
    const aRoot = a.querySelector('[data-turn-key], [data-message-author-role]') ? 1 : 0
    const bRoot = b.querySelector('[data-turn-key], [data-message-author-role]') ? 1 : 0
    const aExplicit = a.matches('[data-app-action-timeline-scroll], .thread-scroll-container') ? 1 : 0
    const bExplicit = b.matches('[data-app-action-timeline-scroll], .thread-scroll-container') ? 1 : 0
    return (bExplicit - aExplicit) * 1000 + (bRoot - aRoot) * 100 +
      (b.clientHeight - a.clientHeight) / 10
  })[0]
}

function wheelPoint(surface: HTMLElement): { x: number; y: number } {
  const rect = surface.getBoundingClientRect()
  const x = Math.round(Math.max(2, Math.min(innerWidth - 2, rect.left + rect.width * 0.46)))
  const y = Math.round(Math.max(2, Math.min(innerHeight - 2, rect.top + rect.height * 0.56)))
  const target = document.elementFromPoint(x, y)
  if (!target || (
    surface !== document.scrollingElement &&
    surface !== document.documentElement &&
    !surface.contains(target)
  )) throw new Error('auto_scroll_target_obstructed')
  return { x, y }
}

async function sendScrollCommand(request: DebugScrollRequest): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('auto_scroll_bridge_timeout')), 8000)
  })
  try {
    const reply = await Promise.race([
      chrome.runtime.sendMessage(request) as Promise<DebugScrollReply>,
      timeout
    ])
    if (!reply?.ok) throw new Error(reply?.error ?? 'auto_scroll_bridge_unavailable')
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function prepareHistoryWithBrowserInput(
  signal: AbortSignal,
  report: (phase: 'up' | 'down' | 'settle' | 'done') => void,
  doc: Document = document
): Promise<void> {
  const surface = findAutoScrollSurface(doc)
  if (!surface) throw new Error('auto_scroll_no_timeline')
  const initialPath = location.pathname
  const nonce = crypto.randomUUID()
  let started = false
  const ensureSafe = (): void => {
    if (signal.aborted) throw new Error('auto_scroll_cancelled')
    if (doc.visibilityState === 'hidden' || !doc.hasFocus()) {
      throw new Error('auto_scroll_focus_lost')
    }
    if (location.pathname !== initialPath || !surface.isConnected) {
      throw new Error('auto_scroll_navigation')
    }
  }
  const wheel = async (deltaY: number): Promise<void> => {
    ensureSafe()
    const point = wheelPoint(surface)
    await sendScrollCommand({ type: 'lcg.debugScroll.wheel', nonce, ...point, deltaY })
  }
  const wait = (ms: number): Promise<void> => delay(ms, signal)
  const rejectOnInterruption = (event: Event): void => {
    // CDP mouseWheel itself is a trusted 'wheel', so do not listen for wheel.
    if (event.type === 'visibilitychange' && doc.visibilityState !== 'hidden') return
    // The user's own pointer or keyboard input should interrupt automation.
    interrupted = true
  }
  let interrupted = false
  const ensureUninterrupted = (): void => {
    ensureSafe()
    if (interrupted) throw new Error('auto_scroll_user_interrupted')
  }
  const onPageHide = (): void => { interrupted = true }
  doc.addEventListener('pointerdown', rejectOnInterruption, true)
  doc.addEventListener('keydown', rejectOnInterruption, true)
  doc.addEventListener('visibilitychange', rejectOnInterruption)
  window.addEventListener('blur', onPageHide)
  window.addEventListener('pagehide', onPageHide)
  try {
    ensureUninterrupted()
    await sendScrollCommand({ type: 'lcg.debugScroll.start', nonce })
    started = true
    report('up')
    await runWheelPass('up', surface, wheel, wait, ensureUninterrupted)
    report('settle')
    await wait(800)
    ensureUninterrupted()
    report('down')
    await runWheelPass('down', surface, wheel, wait, ensureUninterrupted)
    report('done')
  } finally {
    doc.removeEventListener('pointerdown', rejectOnInterruption, true)
    doc.removeEventListener('keydown', rejectOnInterruption, true)
    doc.removeEventListener('visibilitychange', rejectOnInterruption)
    window.removeEventListener('blur', onPageHide)
    window.removeEventListener('pagehide', onPageHide)
    if (started) {
      // Cleanup must also run after cancel, detach, timeout, or navigation.
      // Do not invoke the original scanner unless the debugger is detached.
      await sendScrollCommand({ type: 'lcg.debugScroll.stop', nonce })
    }
  }
}
