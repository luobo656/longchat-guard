import type { RiskLevel } from '../core/types'
import { t } from './i18n'

export type LearningStage = 'learning' | 'initial' | 'calibrating' | 'stable'
export type BaselineState = 'none' | 'safe' | 'confirmed' | 'inherited'

export interface GuardUiModel {
  conversationKey?: string
  riskLevel: RiskLevel
  trendScore: number
  estimatedLoad: number
  learningMode: 'cold' | 'warm' | 'calibrated'
  baselineState: BaselineState
  hasRiskBoundary: boolean
  showScanAction: boolean
  muted: boolean
  pendingFailureConfirmation: boolean
}

export interface GuardUiCallbacks {
  onCopyContinuation(): void
  onScanHistory(): void
  onRecalibrate(): void
  onToggleMute(): void
  onConfirmFailure(accepted: boolean): void
  onAcceptPrivacyConsent(): void
  onDeclinePrivacyConsent(): void
}

const ROOT_ID = 'conversation-guard-root'
const DESTROY_KEY = '__conversationGuardUiDestroy'

export const PANEL_VISIBLE_LABELS = [
  'Risk',
  'Safe',
  'High risk',
  'Baseline',
  'Details & actions',
  'Copy continuation prompt',
  'Scan to set baseline',
  'Refresh current chat',
  'Recalibrate',
  'Mute this chat'
] as const

export const PANEL_FORBIDDEN_VALUE_PATTERNS = [
  String.raw`\btoken\b`,
  String.raw`\btokens\b`,
  String.raw`≈\s*\d`,
  String.raw`\d+\s*K\b`,
  String.raw`\d+\s*%`
] as const

export const PRIVACY_CONSENT_COPY = [
  'Reads visible ChatGPT content locally to estimate long-chat risk.',
  'Does not upload chat content.',
  'Does not save raw chat text.',
  'Uninstall or clear extension data to remove local data.',
  'Agree and start',
  'Not now'
] as const

export class GuardUi {
  private readonly root: HTMLDivElement
  private readonly shadow: ShadowRoot
  private readonly pill: HTMLButtonElement
  private readonly panel: HTMLDivElement
  private readonly monitorPanel: HTMLDivElement
  private readonly consentPanel: HTMLDivElement
  private readonly statusDot: HTMLSpanElement
  private readonly statusText: HTMLSpanElement
  private readonly toast: HTMLDivElement
  private readonly onDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.open) return
    const path = event.composedPath()
    if (shouldClosePanelForPointerPath(path, this.root)) this.setOpen(false)
  }
  private readonly onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (this.open && shouldClosePanelForKey(event.key)) this.setOpen(false)
  }
  private readonly destroyGlobalHook = (): void => this.destroy()
  private mode: 'monitoring' | 'consent' | 'disabled' = 'monitoring'
  private open = false
  private previousBaselineState: BaselineState | undefined
  private historyScanBusy = false

  constructor(private readonly callbacks: GuardUiCallbacks) {
    const globalState = globalThis as typeof globalThis & {
      [DESTROY_KEY]?: () => void
    }
    globalState[DESTROY_KEY]?.()

    this.root = document.createElement('div')
    this.root.id = ROOT_ID
    this.root.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:2147483647;pointer-events:auto;'
    this.shadow = this.root.attachShadow({ mode: 'open' })
    this.shadow.innerHTML = template()
    document.documentElement.appendChild(this.root)

    this.pill = requireElement<HTMLButtonElement>(this.shadow, '[data-role="pill"]')
    this.panel = requireElement<HTMLDivElement>(this.shadow, '[data-role="panel"]')
    this.monitorPanel = requireElement<HTMLDivElement>(this.shadow, '[data-role="monitor-panel"]')
    this.consentPanel = requireElement<HTMLDivElement>(this.shadow, '[data-role="consent-panel"]')
    this.statusDot = requireElement<HTMLSpanElement>(this.shadow, '[data-role="status-dot"]')
    this.statusText = requireElement<HTMLSpanElement>(this.shadow, '[data-role="status-text"]')
    this.toast = requireElement<HTMLDivElement>(this.shadow, '[data-role="toast"]')

    this.pill.addEventListener('click', () => {
      if (this.mode === 'disabled') {
        this.showConsentCard()
        return
      }
      this.setOpen(!this.open)
    })
    this.bindButton('copy', callbacks.onCopyContinuation)
    this.bindButton('scan-history', callbacks.onScanHistory)
    this.bindButton('learn', callbacks.onRecalibrate)
    this.bindButton('mute', callbacks.onToggleMute)
    this.bindButton('confirm-yes', () => callbacks.onConfirmFailure(true))
    this.bindButton('confirm-no', () => callbacks.onConfirmFailure(false))
    this.bindButton('consent-accept', callbacks.onAcceptPrivacyConsent)
    this.bindButton('consent-decline', callbacks.onDeclinePrivacyConsent)

    document.addEventListener('pointerdown', this.onDocumentPointerDown, true)
    document.addEventListener('keydown', this.onDocumentKeyDown, true)
    globalState[DESTROY_KEY] = this.destroyGlobalHook
  }

  update(model: GuardUiModel): void {
    this.mode = 'monitoring'
    this.monitorPanel.hidden = false
    this.consentPanel.hidden = true
    this.root.dataset.risk = model.riskLevel
    this.statusText.textContent = statusLabel(model)
    this.statusDot.dataset.risk = model.riskLevel
    const trend = requireElement<HTMLElement>(this.shadow, '[data-role="trend"]')
    trend.dataset.risk = model.riskLevel
    trend.dataset.boundaryReady = String(model.hasRiskBoundary)
    const riskTrack = requireElement<HTMLElement>(this.shadow, '[data-role="risk-track"]')
    riskTrack.style.setProperty(
      '--risk-position',
      `${model.hasRiskBoundary ? clampTrendScore(model.trendScore) : 0}%`
    )

    setText(
      this.shadow,
      'current-load',
      currentLengthLabel(model.riskLevel, model.baselineState)
    )
    setText(this.shadow, 'baseline', baselineLabel(model.baselineState))
    const baselineHint = requireElement<HTMLElement>(this.shadow, '[data-role="baseline-hint"]')
    baselineHint.hidden = model.baselineState !== 'none'
    const advanced = requireElement<HTMLDetailsElement>(this.shadow, '[data-role="advanced-details"]')
    if (model.baselineState === 'none') advanced.open = true
    else if (this.previousBaselineState === 'none') advanced.open = false
    this.previousBaselineState = model.baselineState

    const scan = button(this.shadow, 'scan-history')
    scan.hidden = !model.showScanAction
    scan.disabled = this.historyScanBusy
    scan.textContent = this.historyScanBusy
      ? t('actionScanning', 'Scanning…')
      : model.baselineState === 'none'
        ? t('actionScanBaseline', 'Scan to set baseline')
        : t('actionRefreshCurrent', 'Refresh current chat')

    const pending = requireElement<HTMLElement>(this.shadow, '[data-role="pending-confirm"]')
    pending.hidden = !model.pendingFailureConfirmation

    const mute = button(this.shadow, 'mute')
    mute.textContent = model.muted
      ? t('actionRestore', 'Restore alerts')
      : t('actionMute', 'Mute this chat')
    mute.disabled = !model.conversationKey
  }

  setOpen(open: boolean): void {
    this.open = open
    this.panel.hidden = !open
    this.pill.setAttribute('aria-expanded', String(open))
  }

  drawAttention(): void {
    this.setOpen(true)
    this.root.classList.remove('guard-attention')
    void this.root.offsetWidth
    this.root.classList.add('guard-attention')
  }

  showToast(message: string): void {
    this.toast.textContent = message
    this.toast.hidden = false
    window.setTimeout(() => {
      this.toast.hidden = true
    }, 1800)
  }

  setHistoryScanBusy(busy: boolean): void {
    this.historyScanBusy = busy
    const scan = button(this.shadow, 'scan-history')
    scan.disabled = busy
    scan.textContent = busy
      ? t('actionScanning', 'Scanning…')
      : this.previousBaselineState === 'none'
        ? t('actionScanBaseline', 'Scan to set baseline')
        : t('actionRefreshCurrent', 'Refresh current chat')
  }

  focusPendingConfirmation(): void {
    const pending = requireElement<HTMLElement>(this.shadow, '[data-role="pending-confirm"]')
    if (pending.hidden) return
    this.setOpen(true)
    pending.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    button(this.shadow, 'confirm-yes').focus({ preventScroll: true })
    this.root.classList.remove('guard-attention')
    void this.root.offsetWidth
    this.root.classList.add('guard-attention')
  }

  showUnavailable(learningMode: GuardUiModel['learningMode'] = 'cold'): void {
    this.update({
      riskLevel: 'unreliable',
      trendScore: 0,
      estimatedLoad: 0,
      learningMode,
      baselineState:
        learningMode === 'cold' ? 'none' : learningMode === 'warm' ? 'inherited' : 'safe',
      hasRiskBoundary: learningMode !== 'cold',
      showScanAction: true,
      muted: false,
      pendingFailureConfirmation: false
    })
  }

  showConsentCard(): void {
    this.mode = 'consent'
    this.root.dataset.risk = 'unreliable'
    this.statusText.textContent = t('pillConsentRequired', 'Consent required')
    this.statusDot.dataset.risk = 'unreliable'
    this.monitorPanel.hidden = true
    this.consentPanel.hidden = false
    this.setOpen(true)
  }

  showDisabled(): void {
    this.mode = 'disabled'
    this.root.dataset.risk = 'unreliable'
    this.statusText.textContent = t('pillDisabled', 'Disabled')
    this.statusDot.dataset.risk = 'unreliable'
    this.monitorPanel.hidden = true
    this.consentPanel.hidden = false
    this.setOpen(false)
  }

  destroy(): void {
    const globalState = globalThis as typeof globalThis & {
      [DESTROY_KEY]?: () => void
    }
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true)
    document.removeEventListener('keydown', this.onDocumentKeyDown, true)
    this.root.remove()
    if (globalState[DESTROY_KEY] === this.destroyGlobalHook) {
      delete globalState[DESTROY_KEY]
    }
  }

  private bindButton(action: string, handler: () => void): void {
    button(this.shadow, action).addEventListener('click', handler)
  }
}

function template(): string {
  return `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .stack { display:flex; flex-direction:column; align-items:flex-end; gap:8px; font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif; color:#171717; }
      .pill { border:1px solid rgba(0,0,0,.12); background:rgba(255,255,255,.94); backdrop-filter:blur(16px); box-shadow:0 8px 30px rgba(0,0,0,.12); border-radius:999px; padding:8px 12px; display:flex; align-items:center; gap:7px; cursor:pointer; color:#171717; font-size:13px; font-weight:650; }
      .pill:hover { background:#fff; }
      .dot { width:8px; height:8px; border-radius:50%; background:#8a8a8a; box-shadow:0 0 0 3px rgba(138,138,138,.12); }
      .dot[data-risk="normal"] { background:#22a06b; box-shadow:0 0 0 3px rgba(34,160,107,.12); }
      .dot[data-risk="long"] { background:#d69e2e; box-shadow:0 0 0 3px rgba(214,158,46,.13); }
      .dot[data-risk="organize"] { background:#e87924; box-shadow:0 0 0 3px rgba(232,121,36,.14); }
      .dot[data-risk="high"] { background:#d14343; box-shadow:0 0 0 3px rgba(209,67,67,.14); }
      .dot[data-risk="unreliable"] { background:#9a9a9a; box-shadow:0 0 0 3px rgba(154,154,154,.14); }
      .panel { width:320px; max-width:calc(100vw - 24px); max-height:min(520px,calc(100vh - 96px)); overflow:auto; border:1px solid rgba(0,0,0,.1); border-radius:10px; background:rgba(255,255,255,.975); backdrop-filter:blur(20px); box-shadow:0 16px 48px rgba(0,0,0,.16); padding:12px; font-size:12px; line-height:1.4; }
      .panel[hidden] { display:none; }
      .title { font-size:14px; font-weight:760; margin:1px 2px 8px; letter-spacing:-.01em; }
      .metric { border:1px solid #ececec; border-radius:9px; padding:8px 10px; background:#fafafa; margin-top:7px; display:flex; align-items:center; justify-content:space-between; gap:10px; min-height:38px; }
      .metric span { color:#777; font-size:10px; }
      .metric strong { font-size:13px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .trend { margin-top:7px; border-radius:13px; padding:9px 11px 8px; background:linear-gradient(180deg,#252527,#222224); color:#fff; box-shadow:inset 0 0 0 1px rgba(255,255,255,.045),0 7px 18px rgba(0,0,0,.1); }
      .risk-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; }
      .risk-head span { color:rgba(255,255,255,.6); font-size:10px; }
      .risk-head strong { color:#fff; font-size:13px; font-weight:700; }
      .track { --risk-position:0%; position:relative; height:20px; border-radius:999px; background:linear-gradient(90deg,#38ad70 0%,#82bf60 28%,#d8bd51 55%,#e58b49 77%,#cf5961 100%); box-shadow:inset 0 1px 2px rgba(0,0,0,.18),inset 0 0 0 1px rgba(255,255,255,.07); }
      .track::after { content:""; position:absolute; inset:0; border-radius:inherit; pointer-events:none; background:linear-gradient(180deg,rgba(255,255,255,.13),rgba(255,255,255,0) 58%,rgba(0,0,0,.035)); }
      .thumb { position:absolute; z-index:2; top:50%; left:clamp(11px,var(--risk-position),calc(100% - 11px)); width:22px; height:22px; border-radius:50%; transform:translate(-50%,-50%); background:#fff; border:1px solid rgba(0,0,0,.06); box-shadow:0 2px 6px rgba(0,0,0,.24),0 0 0 1px rgba(255,255,255,.3); transition:left .28s cubic-bezier(.2,.75,.25,1); }
      .risk-scale { display:flex; justify-content:space-between; margin-top:5px; padding:0 1px; color:rgba(255,255,255,.46); font-size:9px; }
      .trend[data-risk="unreliable"] .track { filter:grayscale(1); opacity:.45; }
      .trend[data-risk="unreliable"] .thumb { background:#d8d8d8; }
      .trend[data-boundary-ready="false"] .track { background:linear-gradient(90deg,#72777c 0%,#91969a 50%,#a8acaf 100%); filter:none; opacity:.72; }
      .trend[data-boundary-ready="false"] .thumb { background:#e3e3e3; box-shadow:0 2px 6px rgba(0,0,0,.2),0 0 0 1px rgba(255,255,255,.25); }
      .pending { margin-top:10px; border-radius:10px; padding:10px; background:#fff8e6; border:1px solid #f4d58d; }
      .pending[hidden] { display:none; }
      .section[hidden] { display:none; }
      .advanced { margin-top:8px; border:1px solid #ececec; border-radius:9px; background:#fafafa; overflow:hidden; }
      .advanced summary { min-height:34px; padding:8px 10px; display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer; list-style:none; color:#555; font-size:11px; font-weight:650; user-select:none; }
      .advanced summary::-webkit-details-marker { display:none; }
      .advanced summary::after { content:"⌄"; color:#8a8a8a; font-size:15px; line-height:1; transform:translateY(-1px); transition:transform .16s ease; }
      .advanced[open] summary::after { transform:rotate(180deg) translateY(1px); }
      .advanced[open] summary { border-bottom:1px solid #ececec; }
      .advanced-body { padding:0 8px 8px; }
      .advanced-body .metric { margin-top:8px; background:#fff; }
      .advanced-body .actions { margin-top:8px; }
      .baseline-hint { margin:8px 2px 0; color:#666; font-size:11px; line-height:1.45; }
      .baseline-hint[hidden] { display:none; }
      .consent-copy { margin:0; padding-left:18px; color:#444; }
      .consent-copy li { margin:6px 0; }
      .actions { display:grid; grid-template-columns:1fr; gap:6px; margin-top:9px; }
      button.action { min-height:32px; border:1px solid #e0e0e0; background:#fff; border-radius:8px; padding:6px 9px; font:600 11px/1.25 Inter,ui-sans-serif,system-ui; color:#303030; cursor:pointer; text-align:center; transition:background .14s ease,border-color .14s ease,transform .08s ease; }
      button.action:hover:not(:disabled) { background:#f7f7f7; border-color:#d7d7d7; }
      button.action:active:not(:disabled) { transform:translateY(1px); }
      button.action:disabled { opacity:.45; cursor:not-allowed; }
      button.action[hidden] { display:none; }
      button.primary { min-height:34px; background:#181818; color:#fff; border-color:#181818; }
      button.primary:hover:not(:disabled) { background:#242424; border-color:#242424; }
      .footer { margin-top:10px; color:#858585; font-size:10px; }
      .toast { max-width:320px; border-radius:8px; padding:7px 10px; background:#171717; color:#fff; font:600 11px system-ui; box-shadow:0 8px 25px rgba(0,0,0,.2); }
      .toast[hidden] { display:none; }
      @keyframes guardPulse { 0%{transform:scale(1)} 40%{transform:scale(1.035)} 100%{transform:scale(1)} }
      :host(.guard-attention) .panel { animation:guardPulse .35s ease-out; }
      @media (prefers-color-scheme: dark) {
        .pill,.panel { background:rgba(35,35,35,.96); color:#f1f1f1; border-color:rgba(255,255,255,.14); }
        .metric { background:#2c2c2c; border-color:#3a3a3a; }
        .advanced { background:#2c2c2c; border-color:#3a3a3a; }
        .advanced summary { color:#d2d2d2; }
        .advanced[open] summary { border-bottom-color:#3a3a3a; }
        .advanced-body .metric { background:#252525; }
        .baseline-hint { color:#b9b9b9; }
        .metric span,.footer { color:#a9a9a9; }
        button.action { background:#2b2b2b; color:#f3f3f3; border-color:#444; }
        button.action:hover:not(:disabled) { background:#363636; }
        button.primary { background:#f1f1f1; color:#171717; border-color:#f1f1f1; }
      }
    </style>
    <div class="stack">
      <div class="toast" data-role="toast" hidden></div>
      <div class="panel" data-role="panel" hidden>
        <div class="section" data-role="monitor-panel">
          <div class="title">LongChat Guard</div>
          <div class="trend" data-role="trend"><div class="risk-head"><span>${t('labelRisk', 'Risk')}</span><strong data-value="current-load">${t('riskBaselineNeeded', 'Set baseline')}</strong></div><div class="track" data-role="risk-track"><div class="thumb"></div></div><div class="risk-scale"><span>${t('labelSafe', 'Safe')}</span><span>${t('labelHighRisk', 'High risk')}</span></div></div>
          <div class="pending" data-role="pending-confirm" hidden>
            <strong>${t('limitQuestion', 'Did this chat reach the limit?')}</strong>
            <div class="actions">
              <button class="action primary" data-action="confirm-yes">${t('limitYes', 'Yes')}</button>
              <button class="action" data-action="confirm-no">${t('limitNo', 'No')}</button>
            </div>
          </div>
          <details class="advanced" data-role="advanced-details">
            <summary>${t('detailsActions', 'Details & actions')}</summary>
            <div class="advanced-body">
              <p class="baseline-hint" data-role="baseline-hint">${t('baselineHint', 'Open a complete old chat or the current chat, then scan it to set a baseline.')}</p>
              <div class="metric"><span>${t('labelBaseline', 'Baseline')}</span><strong data-value="baseline">${t('baselineNone', 'Not set')}</strong></div>
              <div class="actions">
                <button class="action primary" data-action="copy">${t('actionCopyContinuation', 'Copy continuation prompt')}</button>
                <button class="action" data-action="scan-history">${t('actionScanBaseline', 'Scan to set baseline')}</button>
                <button class="action" data-action="learn">${t('actionRelearn', 'Relearn')}</button>
                <button class="action" data-action="mute">${t('actionMute', 'Mute this chat')}</button>
              </div>
            </div>
          </details>
        </div>
        <div class="section" data-role="consent-panel" hidden>
          <div class="title">${t('consentTitle', 'Enable local long-chat alerts')}</div>
          <ul class="consent-copy">
            <li>${t('consentLocalRead', PRIVACY_CONSENT_COPY[0])}</li>
            <li>${t('consentNoUpload', PRIVACY_CONSENT_COPY[1])}</li>
            <li>${t('consentNoRawPersist', PRIVACY_CONSENT_COPY[2])}</li>
            <li>${t('consentDeleteLocal', PRIVACY_CONSENT_COPY[3])}</li>
          </ul>
          <div class="actions">
            <button class="action primary" data-action="consent-accept">${t('consentAccept', PRIVACY_CONSENT_COPY[4])}</button>
            <button class="action" data-action="consent-decline">${t('consentDecline', PRIVACY_CONSENT_COPY[5])}</button>
          </div>
        </div>
      </div>
      <button class="pill" data-role="pill" aria-expanded="false" aria-label="${t('pillAria', 'Open LongChat Guard')}">
        <span class="dot" data-role="status-dot"></span>
        <span data-role="status-text">${t('pillMonitoring', 'Monitoring')}</span>
      </button>
    </div>
  `
}

function baselineLabel(state: BaselineState): string {
  if (state === 'confirmed') return t('baselineConfirmed', 'Confirmed')
  if (state === 'inherited') return t('baselineInherited', 'Reused')
  if (state === 'safe') return t('baselineReady', 'Ready')
  return t('baselineNone', 'Not set')
}

function clampTrendScore(score: number): number {
  if (!Number.isFinite(score)) return 0
  return Math.max(0, Math.min(100, score))
}

function statusLabel(model: GuardUiModel): string {
  if (model.baselineState === 'none') return t('riskBaselineNeeded', 'Set baseline')
  if (model.riskLevel === 'unreliable') return t('riskRecognizing', 'Checking')
  if (model.riskLevel === 'normal') return t('riskNormal', 'Normal')
  if (model.riskLevel === 'long') return t('riskLong', 'Long')
  if (model.riskLevel === 'organize') return t('riskOrganize', 'Near risk')
  if (model.riskLevel === 'high') return t('riskHigh', 'High risk')
  return t('riskRecognizing', 'Checking')
}

function currentLengthLabel(
  level: RiskLevel,
  baselineState: BaselineState = 'safe'
): string {
  if (baselineState === 'none') return t('riskBaselineNeeded', 'Set baseline')
  if (level === 'normal') return t('riskNormal', 'Normal')
  if (level === 'long') return t('riskLong', 'Long')
  if (level === 'organize') return t('riskOrganize', 'Near risk')
  if (level === 'high') return t('riskHigh', 'High risk')
  return t('riskRecognizing', 'Checking')
}

export function shouldClosePanelForPointerPath(
  path: readonly EventTarget[],
  host: EventTarget
): boolean {
  return !path.includes(host)
}

export function shouldClosePanelForKey(key: string): boolean {
  return key === 'Escape'
}

function setText(shadow: ShadowRoot, key: string, value: string): void {
  requireElement<HTMLElement>(shadow, `[data-value="${key}"]`).textContent = value
}

function button(shadow: ShadowRoot, action: string): HTMLButtonElement {
  return requireElement<HTMLButtonElement>(shadow, `[data-action="${action}"]`)
}

function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`missing_ui_element:${selector}`)
  return element
}
