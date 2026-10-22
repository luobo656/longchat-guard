import { t } from './i18n'

/** Visual interaction shield, not an OS-level input lock.
 * Pointer hit testing MUST continue through the veil: CDP mouseWheel events
 * target the actual conversation underneath it.
 */
export type AutoReadShieldStage = 'up' | 'settle' | 'down' | 'verify' | 'save' | 'stopping'
export type AutoReadShieldCancelReason = 'user_cancelled' | 'auto_scroll_focus_lost'
export type ShieldInputDecision = 'allow' | 'block' | 'cancel'

/** This pure policy is shared by the handler and unit tests.
 * Physical wheel and injected CDP wheel are not reliably distinguishable.
 */
export function shieldInputDecision(
  type: string, key: string | undefined, onCancelButton: boolean
): ShieldInputDecision {
  if (type === 'wheel') return 'allow'
  if (type === 'keydown' && key === 'Escape') return 'cancel'
  if (onCancelButton && ['keydown', 'keyup', 'keypress'].includes(type) &&
      (key === 'Enter' || key === ' ' || key === 'Spacebar')) return 'allow'
  if (onCancelButton && (
    type.startsWith('pointer') || type.startsWith('mouse') ||
    type.startsWith('touch') || type === 'click' ||
    type === 'auxclick' || type === 'dblclick'
  )) return 'allow'
  return 'block'
}

export interface AutoReadShield {
  setStage(stage: AutoReadShieldStage): void
  getStage(): AutoReadShieldStage
  close(): void
}

const BLOCKED_INPUT_EVENTS = [
  'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click',
  'auxclick', 'dblclick', 'contextmenu', 'touchstart', 'touchend',
  'touchmove', 'keydown', 'keyup', 'keypress', 'beforeinput',
  'input', 'submit', 'dragstart', 'drop', 'selectstart'
] as const

export function createAutoReadShield(
  onCancel: (reason: AutoReadShieldCancelReason) => void,
  doc: Document = document,
  view: Window = window
): AutoReadShield {
  const root = doc.createElement('div')
  root.dataset.longChatAutoReadShield = 'true'
  // The full-screen layer only paints. It MUST NOT intercept CDP wheel targeting.
  root.style.cssText =
    'position:fixed;inset:0;z-index:2147483647;pointer-events:none;isolation:isolate;'
  const shadow = root.attachShadow({ mode: 'open' })
  shadow.innerHTML = `
    <style>
      :host { all:initial; pointer-events:none }
      * {box-sizing:border-box}
      .veil {
        position:fixed;inset:0;pointer-events:none;
        background:rgba(12,17,25,.47);
      }
      .banner {
        position:fixed;top:clamp(12px,4vh,42px);left:50%;
        transform:translateX(-50%);width:min(550px,calc(100vw - 24px));
        padding:17px 19px 16px;
        background:#fff;color:#1e2734;border:1px solid #d7dfe8;
        border-radius:14px;box-shadow:0 18px 60px rgba(8,17,28,.23);
        pointer-events:none;
        font-family:system-ui,-apple-system,"Segoe UI","PingFang SC",
          "Microsoft YaHei",sans-serif;font-size:13px;line-height:1.55;
        font-weight:400;
      }
      .topline {display:flex;align-items:center;gap:10px;margin-bottom:9px}
      .spinner {
        flex:0 0 17px;width:17px;height:17px;border-radius:50%;
        border:2px solid #d8e5f2;border-top-color:#2669a8;
        animation:spin 1.1s linear infinite;
      }
      .heading {font-size:15px;font-weight:700;color:inherit}
      .state {font-weight:650;font-size:13px;margin:0 0 5px}
      .explanation {color:#5c697a;font-size:12px;margin:0}
      .bottom {margin-top:13px;display:flex;align-items:center;gap:10px;
        justify-content:space-between;flex-wrap:wrap}
      .steps {font-size:11px;font-weight:600;color:#687b8c}
      .cancel {
        pointer-events:auto;min-height:34px;padding:7px 14px;
        border:1px solid #bfcbd8;border-radius:9px;background:#fff;
        color:#1c2935;font-size:12px;font-weight:650;cursor:pointer;
        font-family:inherit;
      }
      .cancel:hover:not(:disabled) {background:#eef3f8}
      .cancel:focus-visible {outline:3px solid #4689cd;outline-offset:2px}
      .cancel:disabled {opacity:.6;cursor:default}
      @keyframes spin {to {transform:rotate(360deg)}}
      @media(prefers-reduced-motion:reduce) {
        .spinner {animation:none;border-top-color:#2669a8}
      }
      @media(prefers-color-scheme:dark) {
        .banner {background:#24282e;border-color:#434b56;color:#f2f4f6}
        .state {color:#f1f5f9}
        .explanation,.steps {color:#c2cbd5}
        .cancel {background:#313840;border-color:#596473;color:#f3f6f9}
        .cancel:hover:not(:disabled) {background:#3c4652}
      }
    </style>
    <div class="veil" aria-hidden="true"></div>
    <section class="banner" role="status" aria-live="polite" aria-atomic="true">
      <div class="topline">
        <span class="spinner" aria-hidden="true"></span>
        <strong class="heading" data-role="heading"></strong>
      </div>
      <p class="state" data-role="state"></p>
      <p class="explanation" data-role="explanation"></p>
      <div class="bottom">
        <span class="steps" data-role="steps"></span>
        <button class="cancel" data-role="cancel" type="button"></button>
      </div>
    </section>
  `
  const element = <T extends HTMLElement>(selector: string): T => {
    const found = shadow.querySelector<T>(selector)
    if (!found) throw new Error('auto_shield_missing_element')
    return found
  }
  const heading = element<HTMLElement>('[data-role="heading"]')
  const stateText = element<HTMLElement>('[data-role="state"]')
  const explanation = element<HTMLElement>('[data-role="explanation"]')
  const steps = element<HTMLElement>('[data-role="steps"]')
  const cancel = element<HTMLButtonElement>('[data-role="cancel"]')
  heading.textContent = t('autoShieldTitle', 'Automatic reading in progress')
  cancel.textContent = t('autoShieldCancel', 'Cancel automatic reading')
  let stage: AutoReadShieldStage = 'up'
  let disposed = false
  let cancelled = false

  const requestCancel = (reason: AutoReadShieldCancelReason): void => {
    if (disposed || cancelled || stage === 'save' || stage === 'stopping') return
    cancelled = true
    setStage('stopping')
    onCancel(reason)
  }

  const onInput = (event: Event): void => {
    if (disposed) return
    const onCancelButton = event.composedPath().includes(cancel)
    const action = shieldInputDecision(
      event.type,
      'key' in event && typeof event.key === 'string' ? event.key : undefined,
      onCancelButton
    )
    if (action === 'allow') return
    if (event.cancelable) event.preventDefault()
    event.stopImmediatePropagation()
    if (action === 'cancel') requestCancel('user_cancelled')
  }
  const onFocusLoss = (): void => { requestCancel('auto_scroll_focus_lost') }
  const onVisibilityChange = (): void => {
    if (doc.visibilityState === 'hidden') onFocusLoss()
  }

  const setStage = (next: AutoReadShieldStage): void => {
    if (disposed || (cancelled && next !== 'stopping')) return
    stage = next
    const copy: Record<AutoReadShieldStage, [string, string, string]> = {
      up: [
        t('autoShieldUp', 'Loading older messages'),
        t('autoShieldUpHelp', 'Browser wheel input is moving slowly upward. Keep this tab active and do not use your mouse or keyboard.'),
        t('autoShieldStepOne', 'Step 1: Load history')
      ],
      settle: [
        t('autoShieldSettle', 'Waiting for history to stabilize'),
        t('autoShieldSettleHelp', 'Older messages may load in several batches; reaching the top once does not prove completion.'),
        t('autoShieldStepOne', 'Step 1: Load history')
      ],
      down: [
        t('autoShieldDown', 'Returning to the latest message'),
        t('autoShieldDownHelp', 'The browser is scrolling back down while the page renders its message windows.'),
        t('autoShieldStepTwo', 'Step 2: Return to the latest message')
      ],
      verify: [
        t('autoShieldVerify', 'Checking conversation continuity'),
        t('autoShieldVerifyHelp', 'The original full reader is checking both ends and the message sequence. Results are not saved unless verification succeeds.'),
        t('autoShieldStepThree', 'Step 3: Verify complete reading')
      ],
      save: [
        t('autoShieldSave', 'Saving verified measurement'),
        t('autoShieldSaveHelp', 'The scan passed its checks. Finishing the local update.'),
        t('autoShieldStepThree', 'Step 3: Verify complete reading')
      ],
      stopping: [
        t('autoShieldStopping', 'Stopping automatic reading'),
        t('autoShieldStoppingHelp', 'Finishing safely. An unfinished read will not be saved.'),
        t('autoShieldStoppingStep', 'Cancellation requested')
      ]
    }
    const [label, help, stepLabel] = copy[next]
    stateText.textContent = label
    explanation.textContent = help
    steps.textContent = stepLabel
    cancel.disabled = next === 'save' || next === 'stopping'
    cancel.textContent = next === 'save'
      ? t('autoShieldFinishing', 'Finishing…')
      : next === 'stopping'
        ? t('autoShieldStoppingStep', 'Cancellation requested')
        : t('autoShieldCancel', 'Cancel automatic reading')
  }

  const onCancelClick = (): void => { requestCancel('user_cancelled') }
  cancel.addEventListener('click', onCancelClick)
  for (const name of BLOCKED_INPUT_EVENTS) {
    view.addEventListener(name, onInput, { capture: true, passive: false })
  }
  view.addEventListener('blur', onFocusLoss, true)
  view.addEventListener('pagehide', onFocusLoss, true)
  doc.addEventListener('visibilitychange', onVisibilityChange, true)
  doc.documentElement.appendChild(root)
  setStage('up')
  try { cancel.focus({ preventScroll: true }) } catch {
    // Focus is advisory; the visual mask is still usable.
  }

  return {
    setStage,
    getStage: () => stage,
    close(): void {
      if (disposed) return
      disposed = true
      cancel.removeEventListener('click', onCancelClick)
      for (const name of BLOCKED_INPUT_EVENTS) {
        view.removeEventListener(name, onInput, true)
      }
      view.removeEventListener('blur', onFocusLoss, true)
      view.removeEventListener('pagehide', onFocusLoss, true)
      doc.removeEventListener('visibilitychange', onVisibilityChange, true)
      root.remove()
    }
  }
}
