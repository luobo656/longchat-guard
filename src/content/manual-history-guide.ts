import { t } from './i18n'

export type ManualHistoryGuideWait = (
  phase: 'up' | 'down' | 'done',
  count: number
) => Promise<'next' | 'cancel'>

export interface HistoryReadGuide {
  wait: ManualHistoryGuideWait
  chooseMode(): Promise<'manual' | 'auto' | 'cancel'>
  showAutoProgress(phase: 'up' | 'down' | 'settle' | 'done'): void
  offerManualFallback(): Promise<'manual' | 'cancel'>
  onCancel(listener: () => void): () => void
  close(): void
}

/** Keeps 4.2.21's manual-only lifecycle as a regression-testable fallback. */
export async function withManualHistoryGuide<T>(
  operation: (wait: ManualHistoryGuideWait) => Promise<T>,
  createGuide: () => { wait: ManualHistoryGuideWait; close(): void } = createManualHistoryGuide
): Promise<T> {
  const guide = createGuide()
  try {
    return await operation(guide.wait)
  } finally {
    guide.close()
  }
}

/** Shared lifecycle for the explicitly selected experimental or manual path. */
export async function withHistoryReadGuide<T>(
  operation: (guide: HistoryReadGuide) => Promise<T>,
  createGuide: () => HistoryReadGuide = createManualHistoryGuide
): Promise<T> {
  const guide = createGuide()
  try {
    return await operation(guide)
  } finally {
    guide.close()
  }
}

/** Nonmodal guide; the normal ChatGPT conversation stays scrollable. */
export function createManualHistoryGuide(): HistoryReadGuide {
  const root = document.createElement('div')
  root.dataset.longChatManualGuide = 'true'
  root.style.cssText = 'position:fixed;top:72px;right:18px;z-index:2147483646;width:min(340px,calc(100vw - 36px));'
  const shadow = root.attachShadow({ mode: 'open' })
  const wrap = document.createElement('section')
  wrap.style.cssText = 'font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#212121;background:#fff;border:1px solid #dedede;border-radius:14px;padding:16px;box-shadow:0 14px 42px rgba(0,0,0,.19);font-size:13px;line-height:1.6'
  wrap.setAttribute('role', 'dialog')
  wrap.setAttribute('aria-modal', 'false')
  const heading = document.createElement('strong')
  heading.style.cssText = 'display:block;font-size:15px;margin-bottom:8px;'
  heading.textContent = t('manualReadTitle', 'Read the full conversation')
  const explanation = document.createElement('p')
  explanation.style.cssText = 'margin:0 0 12px;white-space:pre-line;'
  const actions = document.createElement('div')
  actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;'
  const cancel = document.createElement('button')
  cancel.textContent = t('manualReadCancel', 'Cancel')
  const next = document.createElement('button')
  next.textContent = t('manualReadReachedTop', 'I reached the first message')
  const automatic = document.createElement('button')
  automatic.textContent = t('autoReadStart', 'Automatic (experimental)')
  for (const button of [cancel, next, automatic]) {
    button.style.cssText = 'border:1px solid #d4d4d4;border-radius:8px;padding:7px 11px;background:#f7f7f7;color:#222;cursor:pointer;font-size:12px;'
  }
  next.style.background = '#202020'
  next.style.color = '#fff'
  automatic.style.background = '#202020'
  automatic.style.color = '#fff'
  automatic.hidden = true
  actions.append(cancel, automatic, next)
  wrap.append(heading, explanation, actions)
  shadow.append(wrap)
  document.documentElement.appendChild(root)

  type GuideAction = 'next' | 'manual' | 'auto' | 'cancel'
  let phase: 'choose' | 'up' | 'down' | 'automatic' | 'fallback' = 'up'
  let done = false
  let resolve: ((result: GuideAction) => void) | undefined
  const cancelListeners = new Set<() => void>()
  const finish = (result: GuideAction): void => {
    if (done || !resolve) return
    const callback = resolve
    resolve = undefined
    callback(result)
  }
  const cancelNow = (): void => {
    if (done) return
    for (const listener of cancelListeners) listener()
    finish('cancel')
  }
  const onEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') cancelNow()
  }
  document.addEventListener('keydown', onEscape, true)
  cancel.addEventListener('click', cancelNow)
  next.addEventListener('click', () => finish(
    phase === 'choose' || phase === 'fallback' ? 'manual' : 'next'
  ))
  automatic.addEventListener('click', () => {
    if (phase === 'choose') finish('auto')
  })
  const pending = (): Promise<GuideAction> =>
    new Promise<GuideAction>((callback) => { resolve = callback })

  return {
    async chooseMode() {
      if (done) return 'cancel'
      phase = 'choose'
      explanation.textContent = t('manualReadScrollUp',
        'Middle-click over the conversation and scroll slowly up to the first message. Wait 2 seconds, then confirm.') + '\n\n' + t('autoReadModeDescription',
        'Alternatively, click Automatic (experimental) to simulate slow wheel events using browser debugging.')
      next.textContent = t('manualReadReachedTop', 'Reached the first message')
      next.hidden = false
      automatic.hidden = false
      const action = await pending()
      return action === 'auto' || action === 'manual' ? action : 'cancel'
    },
    async wait(direction) {
      if (done) return 'cancel'
      phase = direction === 'down' ? 'down' : 'up'
      automatic.hidden = true
      next.hidden = false
      if (phase === 'up') {
        explanation.textContent = t('manualReadScrollUp',
          'Middle-click over the conversation and scroll slowly up to the first message. Wait 2 seconds, then confirm.')
        next.textContent = t('manualReadReachedTop', 'Reached the first message')
      } else {
        explanation.textContent = t('manualReadScrollDown',
          'Middle-click and scroll slowly down to the latest message. Wait 2 seconds, then confirm.')
        next.textContent = t('manualReadReachedBottom', 'Back at the latest message')
      }
      const action = await pending()
      return action === 'next' ? 'next' : 'cancel'
    },
    showAutoProgress(stage) {
      if (done) return
      phase = 'automatic'
      next.hidden = true
      automatic.hidden = true
      const messages = {
        up: t('autoReadUp', 'Simulating slow wheel scrolling toward the oldest messages. Do not switch tabs or use the mouse.'),
        down: t('autoReadDown', 'Simulating slow wheel scrolling toward the newest messages. Do not switch tabs.'),
        settle: t('autoReadSettling', 'Waiting for the conversation to finish rendering.'),
        done: t('autoReadPrepared', 'Automatic scrolling completed. Starting the original full reader.')
      }
      explanation.textContent = messages[stage]
    },
    async offerManualFallback() {
      if (done) return 'cancel'
      phase = 'fallback'
      explanation.textContent = t('autoReadFailed',
        'Automatic scrolling could not be verified. Nothing was saved. You can use the proven manual method or cancel.')
      next.textContent = t('autoReadManualOption', 'Manual scrolling')
      next.hidden = false
      automatic.hidden = true
      const action = await pending()
      return action === 'manual' ? 'manual' : 'cancel'
    },
    onCancel(listener) {
      cancelListeners.add(listener)
      return () => { cancelListeners.delete(listener) }
    },
    close() {
      if (done) return
      cancelNow()
      done = true
      document.removeEventListener('keydown', onEscape, true)
      cancelListeners.clear()
      root.remove()
    }
  }
}
