import type {
  CalibrationState,
  EnvironmentConfidence,
  MeasurementState,
  RiskState,
  UncertaintySource
} from '../core/types'
import { t } from './i18n'

export interface GuardUiModel {
  conversationKey?: string
  measurementState: MeasurementState
  calibrationState: CalibrationState
  environmentConfidence: EnvironmentConfidence
  riskState: RiskState
  referencePositionScore: number
  trackAvailable: boolean
  growthReserveReady: boolean
  muted: boolean
  pendingFailureConfirmation: boolean
  measurementRecoveryAvailable: boolean
  uncertaintySources: UncertaintySource[]
}

export interface GuardUiCallbacks {
  onCopyContinuation(): void
  onCalibrate(): void
  onMeasureCurrentChat(): void
  onRecalibrate(): void
  onToggleMute(): void
  onConfirmFailure(accepted: boolean): void
  onAcceptPrivacyConsent(): void
  onDeclinePrivacyConsent(): void
}

const ROOT_ID = 'conversation-guard-root'
const DESTROY_KEY = '__conversationGuardUiDestroy'

const PRIVACY_CONSENT_COPY = [
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
  private readonly menuTrigger: HTMLButtonElement
  private readonly menuPopover: HTMLDivElement
  private readonly scanNotice: HTMLDivElement
  private readonly scanNoticeText: HTMLDivElement
  private mode: 'monitoring' | 'consent' | 'disabled' = 'monitoring'
  private open = false
  private menuOpen = false
  private calibrationBusy = false
  private measurementBusy = false
  private preBusyCalibrationState: CalibrationState | undefined
  private toastTimer: number | undefined
  private latestModel: GuardUiModel | undefined

  private readonly onDocumentPointerDown = (event: PointerEvent): void => {
    if (!this.open) return
    const path = event.composedPath()
    if (
      this.menuOpen &&
      !path.includes(this.menuTrigger) &&
      !path.includes(this.menuPopover)
    ) {
      this.setMenuOpen(false)
    }
    if (shouldClosePanelForPointerPath(path, this.root)) this.setOpen(false)
  }

  private readonly onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (!this.open || !shouldClosePanelForKey(event.key)) return
    if (this.menuOpen) {
      event.preventDefault()
      this.setMenuOpen(false, true)
      return
    }
    this.setOpen(false)
  }

  private readonly onWindowResize = (): void => {
    if (this.menuOpen) this.positionMenuPopover()
  }

  private readonly destroyGlobalHook = (): void => this.destroy()

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
    this.monitorPanel = requireElement<HTMLDivElement>(
      this.shadow,
      '[data-role="monitor-panel"]'
    )
    this.consentPanel = requireElement<HTMLDivElement>(
      this.shadow,
      '[data-role="consent-panel"]'
    )
    this.statusDot = requireElement<HTMLSpanElement>(
      this.shadow,
      '[data-role="status-dot"]'
    )
    this.statusText = requireElement<HTMLSpanElement>(
      this.shadow,
      '[data-role="status-text"]'
    )
    this.toast = requireElement<HTMLDivElement>(this.shadow, '[data-role="toast"]')
    this.menuTrigger = requireElement<HTMLButtonElement>(
      this.shadow,
      '[data-role="menu-trigger"]'
    )
    this.menuPopover = requireElement<HTMLDivElement>(
      this.shadow,
      '[data-role="menu-popover"]'
    )
    this.scanNotice = requireElement<HTMLDivElement>(
      this.shadow,
      '[data-role="scan-notice"]'
    )
    this.scanNoticeText = requireElement<HTMLDivElement>(
      this.shadow,
      '[data-role="scan-notice-text"]'
    )

    this.pill.addEventListener('click', () => {
      if (this.mode === 'disabled') {
        this.showConsentCard()
        return
      }
      this.setOpen(!this.open)
    })

    this.bindButton('copy', callbacks.onCopyContinuation)
    this.bindButton('calibrate', callbacks.onCalibrate)
    this.bindButton('measure-current', callbacks.onMeasureCurrentChat)
    this.bindMenuAction('relearn', callbacks.onRecalibrate)
    this.bindMenuAction('mute', callbacks.onToggleMute)
    this.bindButton('confirm-yes', () => callbacks.onConfirmFailure(true))
    this.bindButton('confirm-no', () => callbacks.onConfirmFailure(false))
    this.bindButton('consent-accept', callbacks.onAcceptPrivacyConsent)
    this.bindButton('consent-decline', callbacks.onDeclinePrivacyConsent)
    this.bindButton('scan-notice-dismiss', () => this.clearScanNotice())

    this.menuTrigger.addEventListener('click', () => {
      this.setMenuOpen(!this.menuOpen, false, true)
    })
    this.menuPopover.addEventListener('keydown', (event) => {
      this.handleMenuKeyDown(event)
    })

    document.addEventListener('pointerdown', this.onDocumentPointerDown, true)
    document.addEventListener('keydown', this.onDocumentKeyDown, true)
    window.addEventListener('resize', this.onWindowResize)
    globalState[DESTROY_KEY] = this.destroyGlobalHook
  }

  update(model: GuardUiModel): void {
    this.latestModel = model
    this.mode = 'monitoring'
    this.monitorPanel.hidden = false
    this.consentPanel.hidden = true

    const visibleState = visibleStatus(model)
    this.root.dataset.risk = model.riskState
    this.statusText.textContent = visibleState.label
    this.statusDot.dataset.risk = model.riskState

    const renderTrack = shouldRenderRiskTrack(model)
    setText(this.shadow, 'card-caption', renderTrack
      ? t('labelRisk', 'Risk')
      : t('labelStatus', 'Status'))
    setText(this.shadow, 'card-status', visibleState.label)

    const riskCard = requireElement<HTMLElement>(this.shadow, '[data-role="trend"]')
    riskCard.dataset.risk = model.riskState
    riskCard.dataset.trackAvailable = String(renderTrack)

    const riskTrack = requireElement<HTMLElement>(
      this.shadow,
      '[data-role="risk-track"]'
    )
    const riskScale = requireElement<HTMLElement>(
      this.shadow,
      '[data-role="risk-scale"]'
    )
    riskTrack.hidden = !renderTrack
    riskScale.hidden = !renderTrack

    const activeSegments = renderTrack
      ? activeRiskSegmentCount(model.referencePositionScore)
      : 0
    riskTrack
      .querySelectorAll<HTMLElement>('[data-risk-segment]')
      .forEach((segment, index) => {
        segment.dataset.active = String(index < activeSegments)
      })

    const advice = requireElement<HTMLElement>(
      this.shadow,
      '[data-role="risk-advice"]'
    )
    const adviceText = statusDescription(model)
    advice.hidden = !adviceText
    advice.textContent = adviceText

    const calibrate = button(this.shadow, 'calibrate')
    const measureCurrent = button(this.shadow, 'measure-current')
    measureCurrent.hidden = !model.measurementRecoveryAvailable
    measureCurrent.disabled = this.measurementBusy
    setText(
      this.shadow,
      'measure-current-label',
      this.measurementBusy
        ? t('actionMeasuringCurrentChat', 'Reading full chat…')
        : t('actionMeasureCurrentChat', 'Read full current chat')
    )

    const showCalibrationAction =
      Boolean(model.conversationKey) &&
      (model.calibrationState === 'uncalibrated' ||
        model.calibrationState === 'stale' ||
        model.calibrationState === 'calibrating')
    calibrate.hidden = !showCalibrationAction
    calibrate.disabled =
      this.calibrationBusy || model.calibrationState === 'calibrating'
    setText(
      this.shadow,
      'calibrate-label',
      this.calibrationBusy || model.calibrationState === 'calibrating'
        ? t('actionCalibrating', 'Calibrating…')
        : t('actionCalibrateThisChat', 'Calibrate with this chat')
    )

    const pending = requireElement<HTMLElement>(
      this.shadow,
      '[data-role="pending-confirm"]'
    )
    pending.hidden = !model.pendingFailureConfirmation

    const copy = button(this.shadow, 'copy')
    copy.hidden =
      model.riskState !== 'organize' && model.riskState !== 'high'

    const mute = button(this.shadow, 'mute')
    setText(
      this.shadow,
      'mute-label',
      model.muted
        ? t('actionRestore', 'Restore alerts')
        : t('actionMute', 'Mute this chat')
    )
    mute.disabled = !model.conversationKey
  }

  setCalibrationBusy(busy: boolean): void {
    if (busy && !this.calibrationBusy) {
      this.preBusyCalibrationState = this.latestModel?.calibrationState
    }
    this.calibrationBusy = busy
    if (busy) this.clearScanNotice()
    if (this.latestModel) {
      const model = {
        ...this.latestModel,
        calibrationState: busy
          ? 'calibrating' as const
          : this.preBusyCalibrationState ?? this.latestModel.calibrationState
      }
      this.update(model)
    }
    if (!busy) this.preBusyCalibrationState = undefined
  }

  setMeasurementBusy(busy: boolean): void {
    this.measurementBusy = busy
    if (busy) this.clearScanNotice()
    if (this.latestModel) this.update(this.latestModel)
  }

  setOpen(open: boolean): void {
    this.open = open
    this.panel.hidden = !open
    this.pill.setAttribute('aria-expanded', String(open))
    if (!open) this.setMenuOpen(false)
  }

  drawAttention(): void {
    this.setOpen(true)
    this.root.classList.remove('guard-attention')
    void this.root.offsetWidth
    this.root.classList.add('guard-attention')
  }

  showToast(message: string, durationMs = 2600): void {
    if (this.toastTimer !== undefined) window.clearTimeout(this.toastTimer)
    this.toast.textContent = message
    this.toast.hidden = false
    this.toastTimer = window.setTimeout(() => {
      this.toast.hidden = true
      this.toastTimer = undefined
    }, durationMs)
  }

  showScanNotice(
    message: string,
    tone: 'warning' | 'error' = 'warning'
  ): void {
    this.scanNoticeText.textContent = message
    this.scanNotice.dataset.tone = tone
    this.scanNotice.hidden = false
    this.setOpen(true)
  }

  clearScanNotice(): void {
    this.scanNotice.hidden = true
    this.scanNoticeText.textContent = ''
  }

  showUnavailable(calibrationState: CalibrationState = 'uncalibrated'): void {
    this.update({
      measurementState: 'unavailable',
      calibrationState,
      environmentConfidence: 'unverified',
      riskState: 'unknown',
      referencePositionScore: 0,
      trackAvailable: false,
      growthReserveReady: false,
      muted: false,
      pendingFailureConfirmation: false,
      measurementRecoveryAvailable: false,
      uncertaintySources: []
    })
  }

  focusPendingConfirmation(): void {
    const pending = requireElement<HTMLElement>(
      this.shadow,
      '[data-role="pending-confirm"]'
    )
    if (pending.hidden) return
    this.setOpen(true)
    pending.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    button(this.shadow, 'confirm-yes').focus({ preventScroll: true })
  }

  showConsentCard(): void {
    this.mode = 'consent'
    this.root.dataset.risk = 'unknown'
    this.statusText.textContent = t('pillConsentRequired', 'Consent required')
    this.statusDot.dataset.risk = 'unknown'
    this.monitorPanel.hidden = true
    this.consentPanel.hidden = false
    this.setOpen(true)
  }

  showDisabled(): void {
    this.mode = 'disabled'
    this.root.dataset.risk = 'unknown'
    this.statusText.textContent = t('pillDisabled', 'Disabled')
    this.statusDot.dataset.risk = 'unknown'
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
    window.removeEventListener('resize', this.onWindowResize)
    if (this.toastTimer !== undefined) window.clearTimeout(this.toastTimer)
    this.root.remove()
    if (globalState[DESTROY_KEY] === this.destroyGlobalHook) {
      delete globalState[DESTROY_KEY]
    }
  }

  private setMenuOpen(
    open: boolean,
    restoreFocus = false,
    focusFirstItem = false
  ): void {
    this.menuOpen = open
    this.menuPopover.hidden = !open
    this.menuTrigger.setAttribute('aria-expanded', String(open))

    if (open) {
      this.positionMenuPopover()
      if (focusFirstItem) {
        this.menuItems()[0]?.focus({ preventScroll: true })
      }
    } else if (restoreFocus) {
      this.menuTrigger.focus({ preventScroll: true })
    }
  }

  private positionMenuPopover(): void {
    const triggerRect = this.menuTrigger.getBoundingClientRect()
    const menuRect = this.menuPopover.getBoundingClientRect()
    const position = overflowMenuPosition(
      window.innerWidth,
      window.innerHeight,
      triggerRect,
      { width: menuRect.width, height: menuRect.height }
    )
    this.menuPopover.style.left = `${position.left}px`
    this.menuPopover.style.top = `${position.top}px`
  }

  private menuItems(): HTMLButtonElement[] {
    return Array.from(
      this.menuPopover.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)'
      )
    )
  }

  private handleMenuKeyDown(event: KeyboardEvent): void {
    if (!this.menuOpen) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      this.setMenuOpen(false, true)
      return
    }
    if (event.key === 'Tab') {
      this.setMenuOpen(false)
      return
    }

    const items = this.menuItems()
    if (items.length === 0) return
    const currentIndex = Math.max(
      0,
      items.indexOf(this.shadow.activeElement as HTMLButtonElement)
    )
    let nextIndex: number | undefined
    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % items.length
    if (event.key === 'ArrowUp') {
      nextIndex = (currentIndex - 1 + items.length) % items.length
    }
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = items.length - 1
    if (nextIndex === undefined) return

    event.preventDefault()
    items[nextIndex]?.focus({ preventScroll: true })
  }

  private bindMenuAction(action: string, handler: () => void): void {
    button(this.shadow, action).addEventListener('click', () => {
      this.setMenuOpen(false)
      handler()
    })
  }

  private bindButton(action: string, handler: () => void): void {
    button(this.shadow, action).addEventListener('click', handler)
  }
}

function visibleStatus(model: GuardUiModel): { label: string } {
  if (model.calibrationState === 'calibrating') {
    return { label: t('statusCalibrating', 'Calibrating') }
  }
  if (model.measurementState === 'uncertain' ||
      model.measurementState === 'unavailable') {
    return { label: t('statusUnknown', 'Unable to assess') }
  }
  if (model.calibrationState === 'environment_unknown') {
    return { label: t('statusEnvironmentUnknown', 'Confirming environment') }
  }
  if (model.calibrationState === 'stale') {
    return { label: t('statusStale', 'Reference may be outdated') }
  }
  if (model.calibrationState === 'uncalibrated') {
    return { label: t('statusUncalibrated', 'Not calibrated') }
  }
  if (
    model.environmentConfidence === 'unverified' &&
    model.riskState === 'unknown'
  ) {
    return { label: t('statusEnvironmentUnverified', 'Model environment unconfirmed') }
  }
  if (model.riskState === 'normal') return { label: t('riskNormal', 'Normal') }
  if (model.riskState === 'long') return { label: t('riskLong', 'Long') }
  if (model.riskState === 'organize') {
    return { label: t('riskOrganize', 'Near risk') }
  }
  if (model.riskState === 'high') return { label: t('riskHigh', 'High risk') }
  return { label: t('statusUnknown', 'Unable to assess') }
}

function statusDescription(model: GuardUiModel): string {
  if (model.calibrationState === 'calibrating') {
    return t(
      'statusCalibratingHelp',
      'Reading the full chat. Keep this conversation open until calibration finishes.'
    )
  }
  if (model.measurementState !== 'complete') {
    return t(
      'statusMeasurementUncertainHelp',
      'This page cannot be measured reliably right now, so LongChat Guard will not guess.'
    )
  }
  if (model.calibrationState === 'environment_unknown') {
    return t(
      'statusEnvironmentUnknownHelp',
      'The current model or environment is not observable yet. LongChat Guard will keep risk unknown and automatically restore the calibration if the same environment becomes verifiable.'
    )
  }
  if (model.calibrationState === 'stale') {
    return t(
      'statusStaleHelp',
      'The previous reference cannot be proven valid for the current measurement environment. Calibrate again before relying on risk levels.'
    )
  }
  if (model.calibrationState === 'uncalibrated') {
    return t(
      'statusUncalibratedHelp',
      'Current chat length is recognized. To enable advance warnings, calibrate once with a historical chat you know reached the conversation-length limit.'
    )
  }
  if (model.environmentConfidence === 'unverified') {
    const riskAdvice = standardRiskAdvice(model.riskState)
    const referenceNote = t(
      'statusEnvironmentUnverifiedHelp',
      'The current model cannot be reliably confirmed. The bar shows position against your local historical reference, not an official ChatGPT limit.'
    )
    return riskAdvice ? `${riskAdvice} ${referenceNote}` : referenceNote
  }
  if (model.calibrationState === 'calibrated_conservative') {
    if (model.riskState === 'high') {
      return t(
        'riskAdviceHighConservative',
        'High risk based on a conservative local reference. Continue in a new chat now.'
      )
    }
    return t(
      'statusConservativeCalibration',
      'Reference established. This sample included context that cannot be measured precisely, so alerts are intentionally more conservative.'
    )
  }
  if (!model.growthReserveReady) {
    return t(
      'statusGrowthLearning',
      'Reference established. LongChat Guard is still learning typical whole-turn growth; until then it only warns at the empirical failure reference.'
    )
  }
  return standardRiskAdvice(model.riskState)
}

function standardRiskAdvice(state: RiskState): string {
  if (state === 'long') {
    return t(
      'riskAdviceLong',
      'This chat is getting long. Consider organizing important context.'
    )
  }
  if (state === 'organize') {
    return t(
      'riskAdviceOrganize',
      'Prepare to continue in a new chat soon.'
    )
  }
  if (state === 'high') {
    return t('riskAdviceHigh', 'Continue in a new chat now.')
  }
  return ''
}

function template(): string {
  return `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      button { font-family:inherit; }
      .stack { display:flex; flex-direction:column; align-items:flex-end; gap:8px; font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; color:#171717; }
      .pill { border:1px solid rgba(0,0,0,.12); background:rgba(255,255,255,.96); backdrop-filter:blur(16px); box-shadow:0 8px 30px rgba(0,0,0,.12); border-radius:999px; padding:8px 12px; display:flex; align-items:center; gap:7px; cursor:pointer; color:#171717; font-size:13px; font-weight:600; }
      .pill:hover { background:#fff; }
      .dot { width:8px; height:8px; border-radius:50%; background:#929292; box-shadow:0 0 0 3px rgba(146,146,146,.13); }
      .dot[data-risk="normal"] { background:#22a06b; box-shadow:0 0 0 3px rgba(34,160,107,.12); }
      .dot[data-risk="long"] { background:#d69e2e; box-shadow:0 0 0 3px rgba(214,158,46,.13); }
      .dot[data-risk="organize"] { background:#e87924; box-shadow:0 0 0 3px rgba(232,121,36,.14); }
      .dot[data-risk="high"] { background:#d14343; box-shadow:0 0 0 3px rgba(209,67,67,.14); }
      .panel { width:308px; max-width:calc(100vw - 24px); max-height:min(520px,calc(100vh - 96px)); overflow:visible; border:1px solid rgba(0,0,0,.09); border-radius:12px; background:rgba(255,255,255,.985); backdrop-filter:blur(20px); box-shadow:0 16px 48px rgba(0,0,0,.14); padding:12px; font-size:12px; line-height:1.45; }
      .panel[hidden],.section[hidden],[hidden] { display:none !important; }
      .header { display:flex; align-items:center; justify-content:space-between; gap:8px; margin:0 2px 6px; }
      .title { font-size:14px; font-weight:700; }
      .menu { position:relative; flex:0 0 auto; }
      button.menu-trigger { width:28px; height:26px; border:0; background:transparent; display:grid; place-items:center; border-radius:7px; cursor:pointer; color:#727272; font-size:15px; font-weight:700; line-height:1; letter-spacing:1px; user-select:none; }
      button.menu-trigger:hover,button.menu-trigger[aria-expanded="true"] { background:#f4f4f4; color:#333; }
      button.menu-trigger:focus-visible { outline:2px solid #4c9ffe; outline-offset:1px; }
      .menu-popover { position:fixed; z-index:2147483647; width:196px; padding:4px; border:1px solid #dedede; border-radius:10px; background:#fff; box-shadow:0 10px 28px rgba(0,0,0,.16); }
      button.menu-action { width:100%; min-height:34px; border:0; background:transparent; border-radius:7px; padding:8px 10px; display:flex; align-items:center; text-align:left; color:#2f2f2f; cursor:pointer; font-size:12px; font-weight:600; line-height:1.3; }
      button.menu-action + button.menu-action { margin-top:2px; }
      button.menu-action:hover:not(:disabled),button.menu-action:focus-visible { background:#f3f3f3; color:#171717; outline:none; }
      button.menu-action:disabled { opacity:.45; cursor:not-allowed; }
      .trend { border-radius:13px; padding:10px 11px 9px; background:linear-gradient(180deg,#252527,#222224); color:#fff; box-shadow:inset 0 0 0 1px rgba(255,255,255,.045),0 7px 18px rgba(0,0,0,.09); }
      .risk-head { display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; }
      .risk-head span { color:rgba(255,255,255,.68); font-size:11px; font-weight:400; }
      .risk-head strong { color:#fff; font-size:13px; font-weight:700; text-align:right; }
      .track { display:grid; grid-template-columns:repeat(16,1fr); height:16px; border-radius:999px; overflow:hidden; background:linear-gradient(90deg,#38ad70 0%,#82bf60 28%,#d8bd51 55%,#e58b49 77%,#cf5961 100%); box-shadow:inset 0 1px 2px rgba(0,0,0,.15),inset 0 0 0 1px rgba(255,255,255,.08); }
      .segment { position:relative; min-width:0; background:rgba(20,20,22,.54); border-right:1px solid rgba(20,20,22,.72); transition:background .18s ease; }
      .segment:nth-child(10),.segment:nth-child(12),.segment:nth-child(14) { border-right-width:2px; }
      .segment:last-child { border-right:0; }
      .segment[data-active="true"] { background:rgba(20,20,22,0); }
      .segment::after { content:""; position:absolute; inset:0; pointer-events:none; background:linear-gradient(180deg,rgba(255,255,255,.1),rgba(255,255,255,0) 58%,rgba(0,0,0,.025)); }
      .risk-scale { display:flex; justify-content:space-between; margin-top:5px; padding:0 1px; color:rgba(255,255,255,.56); font-size:10px; font-weight:400; }
      .risk-advice { margin:7px 1px 0; color:rgba(255,255,255,.88); font-size:11px; font-weight:400; line-height:1.45; }
      .trend[data-track-available="false"] { background:linear-gradient(180deg,#2b2c2e,#252629); }
      button.calibrate-link { width:100%; margin-top:7px; border:1px solid #e7e7e7; background:#fff; border-radius:8px; padding:8px 10px; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:2px; color:#2f2f2f; cursor:pointer; text-align:left; font-size:12px; font-weight:600; line-height:1.3; }
      .calibrate-help { color:#707070; font-size:11px; font-weight:400; line-height:1.35; }
      button.calibrate-link:hover:not(:disabled) { background:#f8f8f8; border-color:#dedede; }
      button.calibrate-link:disabled { opacity:.55; cursor:not-allowed; }
      .scan-notice { position:relative; margin-top:7px; padding:9px 30px 9px 10px; border:1px solid #ead7a4; border-radius:8px; background:#fffaf0; color:#4b3b18; font-size:11px; font-weight:400; line-height:1.45; }
      .scan-notice[data-tone="error"] { border-color:#e5b9b9; background:#fff5f5; color:#6b2626; }
      button.scan-notice-dismiss { position:absolute; top:5px; right:5px; width:22px; height:22px; border:0; border-radius:6px; background:transparent; color:#806f49; cursor:pointer; font-size:15px; font-weight:600; line-height:1; }
      .pending { margin-top:9px; border-radius:10px; padding:10px; background:#fff8e6; border:1px solid #f4d58d; }
      .pending strong { display:block; margin-bottom:4px; }
      .pending p { margin:0; color:#5f4a20; }
      .consent-copy { margin:0; padding-left:18px; color:#3f3f3f; }
      .consent-copy li { margin:6px 0; }
      .actions { display:grid; grid-template-columns:1fr; gap:6px; margin-top:9px; }
      button.action { min-height:32px; border:1px solid #e0e0e0; background:#fff; border-radius:8px; padding:6px 9px; font-size:12px; font-weight:600; line-height:1.3; color:#303030; cursor:pointer; text-align:center; transition:background .14s ease,border-color .14s ease,transform .08s ease; }
      button.action:hover:not(:disabled) { background:#f7f7f7; border-color:#d7d7d7; }
      button.action:active:not(:disabled) { transform:translateY(1px); }
      button.primary { min-height:34px; background:#181818; color:#fff; border-color:#181818; }
      button.primary:hover:not(:disabled) { background:#242424; border-color:#242424; }
      button.cta { width:100%; margin-top:9px; }
      .toast { max-width:308px; border-radius:8px; padding:7px 10px; background:#171717; color:#fff; font-size:11px; font-weight:600; line-height:1.35; box-shadow:0 8px 25px rgba(0,0,0,.2); }
      @keyframes guardPulse { 0%{transform:scale(1)} 40%{transform:scale(1.025)} 100%{transform:scale(1)} }
      :host(.guard-attention) .panel { animation:guardPulse .32s ease-out; }
      @media (prefers-color-scheme: dark) {
        .pill,.panel { background:rgba(35,35,35,.96); color:#f1f1f1; border-color:rgba(255,255,255,.14); }
        button.menu-trigger { color:#aaa; }
        button.menu-trigger:hover,button.menu-trigger[aria-expanded="true"] { background:#303030; color:#eee; }
        .menu-popover { background:#272727; border-color:#444; box-shadow:0 10px 28px rgba(0,0,0,.32); }
        button.menu-action { color:#f0f0f0; }
        button.menu-action:hover:not(:disabled),button.menu-action:focus-visible { background:#353535; color:#fff; }
        button.calibrate-link { background:#262626; border-color:#404040; color:#f0f0f0; }
        .calibrate-help { color:#b8b8b8; }
        .scan-notice { background:#332f25; border-color:#5a5036; color:#eadfbf; }
        .scan-notice[data-tone="error"] { background:#382828; border-color:#684242; color:#f0caca; }
        button.action { background:#2b2b2b; color:#f3f3f3; border-color:#444; }
        button.primary { background:#f1f1f1; color:#171717; border-color:#f1f1f1; }
      }
    </style>
    <div class="stack">
      <div class="toast" data-role="toast" hidden></div>
      <div class="panel" data-role="panel" hidden>
        <div class="section" data-role="monitor-panel">
          <div class="header">
            <div class="title">LongChat Guard</div>
            <div class="menu">
              <button class="menu-trigger" type="button" data-role="menu-trigger" aria-label="${t('menuMore', 'More')}" aria-haspopup="menu" aria-expanded="false">···</button>
            </div>
          </div>
          <div class="trend" data-role="trend" data-track-available="false">
            <div class="risk-head"><span data-value="card-caption">${t('labelStatus', 'Status')}</span><strong data-value="card-status">${t('statusUncalibrated', 'Not calibrated')}</strong></div>
            <div class="track" data-role="risk-track" hidden>${riskSegments()}</div>
            <div class="risk-scale" data-role="risk-scale" hidden><span>${t('labelLowRisk', 'Low risk')}</span><span>${t('labelHighRisk', 'High risk')}</span></div>
            <p class="risk-advice" data-role="risk-advice"></p>
          </div>
          <button class="calibrate-link" data-action="calibrate" hidden>
            <span data-value="calibrate-label">${t('actionCalibrateThisChat', 'Calibrate with this chat')}</span>
            <span class="calibrate-help">${t('actionCalibrateThisChatHelp', 'Only use a historical chat you know reached the conversation-length limit.')}</span>
          </button>
          <button class="calibrate-link" data-action="measure-current" hidden>
            <span data-value="measure-current-label">${t('actionMeasureCurrentChat', 'Read full current chat')}</span>
            <span class="calibrate-help">${t('actionMeasureCurrentChatHelp', 'Use this to determine the current risk of an older chat. This does not change your alert reference.')}</span>
          </button>
          <div class="scan-notice" data-role="scan-notice" role="status" aria-live="polite" hidden>
            <div data-role="scan-notice-text"></div>
            <button class="scan-notice-dismiss" type="button" data-action="scan-notice-dismiss" aria-label="${t('actionDismiss', 'Dismiss')}">×</button>
          </div>
          <div class="pending" data-role="pending-confirm" hidden>
            <strong>${t('passiveLimitQuestion', 'Possible conversation-length limit detected')}</strong>
            <p>${t('passiveLimitHelp', 'Use this chat as a calibration sample only if you know this was the conversation-length limit.')}</p>
            <div class="actions">
              <button class="action primary" data-action="confirm-yes">${t('passiveLimitYes', 'Use this chat to calibrate')}</button>
              <button class="action" data-action="confirm-no">${t('passiveLimitNo', 'Ignore')}</button>
            </div>
          </div>
          <button class="action primary cta" data-action="copy" hidden>${t('actionCopyContinuation', 'Copy continuation prompt')}</button>
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
      <div class="menu-popover" data-role="menu-popover" role="menu" aria-label="${t('menuMore', 'More')}" hidden>
        <button class="menu-action" type="button" role="menuitem" tabindex="-1" data-action="relearn">${t('actionRecalibrate', 'Recalibrate alert reference')}</button>
        <button class="menu-action" type="button" role="menuitem" tabindex="-1" data-action="mute"><span data-value="mute-label">${t('actionMute', 'Mute this chat')}</span></button>
      </div>
      <button class="pill" data-role="pill" aria-expanded="false" aria-label="${t('pillAria', 'Open LongChat Guard')}">
        <span class="dot" data-role="status-dot"></span>
        <span data-role="status-text">${t('statusUncalibrated', 'Not calibrated')}</span>
      </button>
    </div>
  `
}

function riskSegments(): string {
  return Array.from(
    { length: 16 },
    (_, index) =>
      `<span class="segment" data-risk-segment data-active="false" aria-hidden="true" data-segment="${index + 1}"></span>`
  ).join('')
}

function clampReferencePositionScore(score: number): number {
  if (!Number.isFinite(score)) return 0
  return Math.max(0, Math.min(100, score))
}

export function activeRiskSegmentCount(score: number): number {
  const clamped = clampReferencePositionScore(score)
  if (clamped <= 0) return 0
  return Math.min(16, Math.max(1, Math.ceil(clamped / 6.25)))
}

export function shouldRenderRiskTrack(model: GuardUiModel): boolean {
  const calibrated =
    model.calibrationState === 'calibrated' ||
    model.calibrationState === 'calibrated_conservative'
  const positionCanBeShown =
    model.riskState !== 'unknown' ||
    model.environmentConfidence === 'unverified'

  return (
    model.trackAvailable &&
    model.measurementState === 'complete' &&
    calibrated &&
    positionCanBeShown
  )
}

export interface OverflowMenuRect {
  left: number
  right: number
  top: number
  bottom: number
}

export function overflowMenuPosition(
  viewportWidth: number,
  viewportHeight: number,
  trigger: OverflowMenuRect,
  menu: { width: number; height: number }
): { left: number; top: number } {
  const margin = 8
  const gap = 8
  const left = Math.min(
    Math.max(trigger.right - menu.width, margin),
    Math.max(margin, viewportWidth - menu.width - margin)
  )
  const above = trigger.top - menu.height - gap
  const below = trigger.bottom + gap
  const top =
    above >= margin
      ? above
      : Math.min(
          Math.max(below, margin),
          Math.max(margin, viewportHeight - menu.height - margin)
        )
  return { left, top }
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
  requireElement<HTMLElement>(
    shadow,
    `[data-value="${key}"]`
  ).textContent = value
}

function button(shadow: ShadowRoot, action: string): HTMLButtonElement {
  return requireElement<HTMLButtonElement>(
    shadow,
    `[data-action="${action}"]`
  )
}

function requireElement<T extends Element>(
  root: ParentNode,
  selector: string
): T {
  const element = root.querySelector<T>(selector)
  if (!element) throw new Error(`missing_ui_element:${selector}`)
  return element
}
