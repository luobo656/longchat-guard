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
      :host {
        all: initial;
        pointer-events: none;
        --accent: #188b7c;
        --accent-soft: #e2f3ee;
        --ink: #142a35;
        --muted: #62727d;
      }
      * { box-sizing: border-box; }
      .veil {
        position: fixed; inset: 0; pointer-events: none;
        background: rgba(12, 24, 35, .28);
      }
      .banner {
        position: fixed; top: clamp(16px, 8vh, 88px); left: 50%;
        transform: translateX(-50%); width: min(472px, calc(100vw - 28px));
        padding: 24px 26px 20px;
        color: var(--ink); background: rgba(255, 255, 255, .97);
        border: 1px solid rgba(225, 235, 235, .96);
        border-radius: 22px;
        box-shadow: 0 32px 90px rgba(9, 29, 40, .23),
                    0 3px 12px rgba(9, 29, 40, .055);
        pointer-events: none; overflow: hidden;
        font: 400 13px/1.55 system-ui, -apple-system, "Segoe UI",
          "PingFang SC", "Microsoft YaHei", sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .banner::before {
        content: ""; position: absolute; top: 0; left: 25px; right: 25px;
        height: 2px; border-radius: 0 0 4px 4px;
        background: linear-gradient(90deg, #62c6ae, #1b8d7c 62%, #c9ece4);
      }
      .topline { display:flex; align-items:center; gap:11px; }
      .mark {
        width: 38px; height: 38px; flex: 0 0 38px;
        border-radius: 12px; display:grid; place-items:center;
        background: linear-gradient(145deg, #173a43, #286c64);
        box-shadow: 0 4px 12px rgba(22, 100, 90, .16);
      }
      .mark svg { width:23px; height:23px; display:block; }
      .identity { display:flex; flex-direction:column; gap:1px; min-width:0; }
      .heading { font-size:14px; font-weight:710; letter-spacing:-.2px; }
      .mode { font-size:11px; color:#81919a; line-height:1.3; }
      .activity {
        margin-left:auto; display:flex; align-items:center; gap:6px;
        padding:5px 9px; border-radius:99px; white-space:nowrap;
        background:var(--accent-soft); color:#157b70;
        font-size:10px; font-weight:650;
      }
      .activity-dot {
        width:6px; height:6px; border-radius:50%;
        background:var(--accent);
        box-shadow:0 0 0 3px rgba(24,139,124,.11);
        animation: breathe 1.8s ease-in-out infinite;
      }
      .content { margin-top:23px; }
      .eyebrow { margin:0 0 4px; color:var(--accent);
        font-size:11px; font-weight:660; letter-spacing:.35px; }
      .state { margin:0; font-size:21px; line-height:1.38;
        font-weight:720; letter-spacing:-.6px; color:var(--ink); }
      .explanation { margin:9px 0 0; min-height:39px; max-width:405px;
        font-size:12px; color:var(--muted); line-height:1.7; }
      .progress { margin-top:22px; display:grid; grid-template-columns:repeat(3,1fr);
        gap:7px; }
      .bar { height:5px; border-radius:999px; background:#e3e9eb;
        overflow:hidden; position:relative; }
      .bar::after { content:""; position:absolute; inset:0;
        border-radius:inherit; background:linear-gradient(90deg,#1b9381,#61c9ac);
        opacity:0; transform:scaleX(.22); transform-origin:left;
        transition:transform .35s ease, opacity .3s ease; }
      :host([data-stage="up"]) .bar.one::after,
      :host([data-stage="settle"]) .bar.one::after,
      :host([data-stage="down"]) .bar.one::after,
      :host([data-stage="verify"]) .bar.one::after,
      :host([data-stage="save"]) .bar.one::after,
      :host([data-stage="down"]) .bar.two::after,
      :host([data-stage="verify"]) .bar.two::after,
      :host([data-stage="save"]) .bar.two::after,
      :host([data-stage="verify"]) .bar.three::after,
      :host([data-stage="save"]) .bar.three::after {
        opacity:1; transform:scaleX(1); }
      :host([data-stage="up"]) .bar.one::after,
      :host([data-stage="settle"]) .bar.one::after,
      :host([data-stage="down"]) .bar.two::after,
      :host([data-stage="verify"]) .bar.three::after {
        animation: grow 1.7s ease-in-out infinite alternate; }
      .steps { margin:8px 0 0; font-size:11px; color:#73838a;
        font-weight:550; }
      .bottom { display:flex; align-items:center; justify-content:space-between;
        gap:14px; margin-top:20px; padding-top:16px;
        border-top:1px solid #edf1f1; }
      .footnote { font-size:11px; line-height:1.55;
        color:#7f8f96; max-width:240px; }
      .cancel {
        pointer-events:auto; flex:0 0 auto; min-width:93px; min-height:36px;
        padding:8px 13px; border:1px solid #d9e2e3;
        background:#f8faf9; color:#3b555c;
        border-radius:10px; font-size:12px; font-weight:650; line-height:1.3;
        font-family:inherit;
        cursor:pointer; transition:background .16s, border-color .16s, transform .16s;
      }
      .cancel:hover:not(:disabled) { background:#edf5f2; border-color:#b9d9d2; }
      .cancel:active:not(:disabled) { transform:scale(.98); }
      .cancel:focus-visible { outline:3px solid #37a88c; outline-offset:3px; }
      .cancel:disabled { opacity:.54; cursor:default; }
      @keyframes grow { from { opacity:.7; } to { opacity:1; } }
      @keyframes breathe { 50% { box-shadow:0 0 0 5px rgba(24,139,124,.07); } }
      @media (max-width:420px) {
        .banner { padding:19px 18px 16px; border-radius:18px; }
        .state { font-size:19px; }
        .content { margin-top:19px; }
        .footnote { max-width:190px; }
      }
      @media (prefers-reduced-motion:reduce) {
        .activity-dot,.bar::after { animation:none !important; }
        .bar::after,.cancel { transition:none !important; }
      }
      @media (prefers-color-scheme: dark) {
        :host { --ink:#eff6f4; --muted:#a9b9bc; --accent:#6dd6b9; --accent-soft:#203f3d; }
        .veil { background:rgba(3,9,15,.44); }
        .banner { color:var(--ink); background:rgba(26,34,42,.97);
          border-color:#354a4d; box-shadow:0 30px 90px rgba(0,0,0,.38); }
        .mode,.steps,.footnote { color:#93a6ab; }
        .activity { color:#8ce1c7; }
        .bar { background:#3a4a50; }
        .bottom { border-top-color:#35464b; }
        .cancel { background:#2b3b40; color:#e1eeeb; border-color:#486066; }
        .cancel:hover:not(:disabled) { background:#36534f; border-color:#6ca89b; }
      }
    </style>
    <div class="veil" aria-hidden="true"></div>
    <section class="banner" role="status" aria-live="polite" aria-atomic="true">
      <div class="topline">
        <span class="mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="white"
               stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 7h14M5 12h10M5 17h7"/>
            <path d="m16 16 2 2 3-4"/>
          </svg>
        </span>
        <span class="identity">
          <strong class="heading" data-role="heading"></strong>
          <span class="mode" data-role="mode"></span>
        </span>
        <span class="activity"><span class="activity-dot" aria-hidden="true"></span><span data-role="activity"></span></span>
      </div>
      <div class="content">
        <p class="eyebrow" data-role="steps"></p>
        <p class="state" data-role="state"></p>
        <p class="explanation" data-role="explanation"></p>
        <div class="progress" aria-hidden="true">
          <span class="bar one"></span>
          <span class="bar two"></span>
          <span class="bar three"></span>
        </div>
      </div>
      <div class="bottom">
        <span class="footnote" data-role="footnote"></span>
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
  const mode = element<HTMLElement>('[data-role="mode"]')
  const activity = element<HTMLElement>('[data-role="activity"]')
  const footnote = element<HTMLElement>('[data-role="footnote"]')
  const stateText = element<HTMLElement>('[data-role="state"]')
  const explanation = element<HTMLElement>('[data-role="explanation"]')
  const steps = element<HTMLElement>('[data-role="steps"]')
  const cancel = element<HTMLButtonElement>('[data-role="cancel"]')
  heading.textContent = 'LongChat Guard'
  mode.textContent = t('autoShieldMode', 'Full conversation read')
  activity.textContent = t('autoShieldActivity', 'Reading locally')
  footnote.textContent = t('autoShieldQuietNote', 'Keep this tab active. You can stop at any time.')
  cancel.textContent = t('autoShieldCancel', 'Cancel')
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
  // Element blur is capturable at window even though it does not bubble.
  // Moving focus from the guide's Auto button to this shield's Cancel button
  // must never be mistaken for the browser tab losing focus.
  const onWindowBlur = (event: Event): void => {
    if (event.target === view) requestCancel('auto_scroll_focus_lost')
  }
  const onPageHide = (): void => { requestCancel('auto_scroll_focus_lost') }
  const onVisibilityChange = (): void => {
    if (doc.visibilityState === 'hidden') onPageHide()
  }

  const setStage = (next: AutoReadShieldStage): void => {
    if (disposed || (cancelled && next !== 'stopping')) return
    stage = next
    root.dataset.stage = next
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
        ? t('autoShieldStoppingStep', 'Stopping…')
        : t('autoShieldCancel', 'Cancel')
  }

  const onCancelClick = (): void => { requestCancel('user_cancelled') }
  cancel.addEventListener('click', onCancelClick)
  for (const name of BLOCKED_INPUT_EVENTS) {
    view.addEventListener(name, onInput, { capture: true, passive: false })
  }
  // Never use capture:true for window.blur: it also captures DOM child blur.
  view.addEventListener('blur', onWindowBlur)
  view.addEventListener('pagehide', onPageHide)
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
      view.removeEventListener('blur', onWindowBlur)
      view.removeEventListener('pagehide', onPageHide)
      doc.removeEventListener('visibilitychange', onVisibilityChange, true)
      root.remove()
    }
  }
}
