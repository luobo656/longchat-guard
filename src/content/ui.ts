import type { CoverageState, RiskLevel } from '../core/types'

export interface GuardUiModel {
  conversationKey?: string
  riskLevel: RiskLevel
  riskScore: number
  estimatedLoad: number
  coverage: CoverageState
  learningMode: 'cold' | 'warm' | 'calibrated'
  muted: boolean
  pendingFailureConfirmation: boolean
  showIncompleteHistoryNote: boolean
}

export interface GuardUiCallbacks {
  onCopyContinuation(): void
  onRecalibrate(): void
  onToggleMute(): void
  onConfirmFailure(accepted: boolean): void
  onAcceptPrivacyConsent(): void
  onDeclinePrivacyConsent(): void
}

const ROOT_ID = 'conversation-guard-root'
const DESTROY_KEY = '__conversationGuardUiDestroy'

const LABELS: Record<RiskLevel, string> = {
  normal: '正常',
  long: '会话较长',
  organize: '建议整理',
  high: '高风险',
  unreliable: '无法可靠监测'
}

export const PANEL_VISIBLE_LABELS = [
  '当前会话长度',
  '本地风险趋势',
  '学习状态',
  '复制续接提示词',
  '重新学习',
  '本会话暂不提醒'
] as const

export const PANEL_FORBIDDEN_VALUE_PATTERNS = [
  String.raw`\btoken\b`,
  String.raw`\btokens\b`,
  String.raw`≈\s*\d`,
  String.raw`\d+\s*K\b`,
  String.raw`\d+\s*%`
] as const

export const PRIVACY_CONSENT_COPY = [
  '仅在本机读取当前 ChatGPT 页面内容用于长会话趋势判断。',
  '不上传。',
  '不保存聊天正文。',
  '可通过卸载扩展/清除扩展数据删除本地数据。',
  '同意并开始',
  '暂不开启'
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
    this.statusText.textContent = LABELS[model.riskLevel]
    this.statusDot.dataset.risk = model.riskLevel
    const trend = requireElement<HTMLElement>(this.shadow, '[data-role="trend"]')
    trend.dataset.risk = model.riskLevel

    setText(this.shadow, 'current-load', currentLengthLabel(model.riskLevel))
    setText(this.shadow, 'learning', learningLabel(model.learningMode))

    const note = requireElement<HTMLElement>(this.shadow, '[data-role="coverage-note"]')
    note.hidden = !model.showIncompleteHistoryNote
    note.textContent = model.showIncompleteHistoryNote
      ? '旧会话历史可能不完整，实际长度可能高于当前估算。'
      : ''

    const pending = requireElement<HTMLElement>(this.shadow, '[data-role="pending-confirm"]')
    pending.hidden = !model.pendingFailureConfirmation

    const mute = button(this.shadow, 'mute')
    mute.textContent = model.muted ? '恢复本会话提醒' : '本会话暂不提醒'
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

  showUnavailable(): void {
    this.update({
      riskLevel: 'unreliable',
      riskScore: 100,
      estimatedLoad: 0,
      coverage: 'unknown',
      learningMode: 'cold',
      muted: false,
      pendingFailureConfirmation: false,
      showIncompleteHistoryNote: true
    })
  }

  showConsentCard(): void {
    this.mode = 'consent'
    this.root.dataset.risk = 'unreliable'
    this.statusText.textContent = '需要同意'
    this.statusDot.dataset.risk = 'unreliable'
    this.monitorPanel.hidden = true
    this.consentPanel.hidden = false
    this.setOpen(true)
  }

  showDisabled(): void {
    this.mode = 'disabled'
    this.root.dataset.risk = 'unreliable'
    this.statusText.textContent = '未启用'
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
      .panel { width:320px; max-width:calc(100vw - 24px); max-height:min(520px,calc(100vh - 96px)); overflow:auto; border:1px solid rgba(0,0,0,.12); border-radius:8px; background:rgba(255,255,255,.97); backdrop-filter:blur(20px); box-shadow:0 18px 60px rgba(0,0,0,.18); padding:14px; font-size:12px; line-height:1.45; }
      .panel[hidden] { display:none; }
      .title { font-size:14px; font-weight:750; margin-bottom:10px; }
      .metric { border:1px solid #ececec; border-radius:8px; padding:9px; background:#fafafa; margin-top:8px; }
      .metric span { display:block; color:#737373; font-size:10px; margin-bottom:3px; }
      .metric strong { display:block; font-size:13px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .trend { margin-top:8px; border:1px solid #ececec; border-radius:8px; padding:9px; background:#fafafa; }
      .trend span { display:block; color:#737373; font-size:10px; margin-bottom:7px; }
      .track { height:7px; border-radius:999px; background:#e6e6e6; overflow:hidden; }
      .fill { height:100%; border-radius:999px; background:#22a06b; width:24%; transition:width .18s ease, background-color .18s ease; }
      .trend[data-risk="long"] .fill { width:46%; background:#d69e2e; }
      .trend[data-risk="organize"] .fill { width:70%; background:#e87924; }
      .trend[data-risk="high"] .fill { width:88%; background:#d14343; }
      .trend[data-risk="unreliable"] .track { background:#eeeeee; }
      .trend[data-risk="unreliable"] .fill { width:100%; background:#9a9a9a; opacity:.45; }
      .notice { margin-top:10px; border-radius:8px; padding:9px 10px; background:#fff7ed; color:#8a4b12; border:1px solid #fed7aa; }
      .pending { margin-top:10px; border-radius:8px; padding:10px; background:#fff8e6; border:1px solid #f4d58d; }
      .pending[hidden], .notice[hidden] { display:none; }
      .section[hidden] { display:none; }
      .consent-copy { margin:0; padding-left:18px; color:#444; }
      .consent-copy li { margin:6px 0; }
      .actions { display:grid; grid-template-columns:1fr; gap:7px; margin-top:10px; }
      button.action { min-height:34px; border:1px solid #dedede; background:#fff; border-radius:8px; padding:7px 9px; font:600 11px/1.25 Inter,ui-sans-serif,system-ui; color:#282828; cursor:pointer; text-align:center; }
      button.action:hover:not(:disabled) { background:#f5f5f5; }
      button.action:disabled { opacity:.45; cursor:not-allowed; }
      button.primary { background:#171717; color:#fff; border-color:#171717; }
      button.primary:hover:not(:disabled) { background:#2b2b2b; }
      .footer { margin-top:10px; color:#858585; font-size:10px; }
      .toast { max-width:320px; border-radius:8px; padding:7px 10px; background:#171717; color:#fff; font:600 11px system-ui; box-shadow:0 8px 25px rgba(0,0,0,.2); }
      .toast[hidden] { display:none; }
      @keyframes guardPulse { 0%{transform:scale(1)} 40%{transform:scale(1.035)} 100%{transform:scale(1)} }
      :host(.guard-attention) .panel { animation:guardPulse .35s ease-out; }
      @media (prefers-color-scheme: dark) {
        .pill,.panel { background:rgba(35,35,35,.96); color:#f1f1f1; border-color:rgba(255,255,255,.14); }
        .metric { background:#2c2c2c; border-color:#3a3a3a; }
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
          <div class="title">ChatGPT 长会话预警</div>
          <div class="metric"><span>当前会话长度</span><strong data-value="current-load">暂时无法判断</strong></div>
          <div class="trend" data-role="trend"><span>本地风险趋势</span><div class="track"><div class="fill"></div></div></div>
          <div class="metric"><span>学习状态</span><strong data-value="learning">学习中</strong></div>
          <div class="notice" data-role="coverage-note" hidden></div>
          <div class="pending" data-role="pending-confirm" hidden>
            <strong>刚才可能触发了当前会话长度上限。</strong>
            <div class="actions">
              <button class="action primary" data-action="confirm-yes">是，会话长度上限</button>
              <button class="action" data-action="confirm-no">不是</button>
            </div>
          </div>
          <div class="actions">
            <button class="action primary" data-action="copy">复制续接提示词</button>
            <button class="action" data-action="learn">重新学习</button>
            <button class="action" data-action="mute">本会话暂不提醒</button>
          </div>
          <div class="footer">仅作本地趋势判断，不代表 OpenAI 官方额度或上限。</div>
        </div>
        <div class="section" data-role="consent-panel" hidden>
          <div class="title">启用本地长会话预警</div>
          <ul class="consent-copy">
            <li>${PRIVACY_CONSENT_COPY[0]}</li>
            <li>${PRIVACY_CONSENT_COPY[1]}</li>
            <li>${PRIVACY_CONSENT_COPY[2]}</li>
            <li>${PRIVACY_CONSENT_COPY[3]}</li>
          </ul>
          <div class="actions">
            <button class="action primary" data-action="consent-accept">${PRIVACY_CONSENT_COPY[4]}</button>
            <button class="action" data-action="consent-decline">${PRIVACY_CONSENT_COPY[5]}</button>
          </div>
        </div>
      </div>
      <button class="pill" data-role="pill" aria-expanded="false" aria-label="打开 ChatGPT 长会话提醒">
        <span class="dot" data-role="status-dot"></span>
        <span data-role="status-text">正在监测</span>
      </button>
    </div>
  `
}

function learningLabel(mode: GuardUiModel['learningMode']): string {
  if (mode === 'warm') return '重新学习中'
  if (mode === 'calibrated') return '已结合本地历史边界'
  return '学习中'
}

function currentLengthLabel(level: RiskLevel): string {
  if (level === 'normal') return '正常范围'
  if (level === 'long') return '偏长'
  if (level === 'organize') return '建议整理'
  if (level === 'high') return '接近风险区'
  return '暂时无法判断'
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
