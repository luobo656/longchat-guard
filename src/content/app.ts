import type { BackgroundRequest, BackgroundResponse } from '../background/coordinator'
import { summarizeGeneration } from '../core/calibration'
import { WebCryptoFingerprinter } from '../core/fingerprinter'
import { parseConversationIdFromUrl, analyzePageSnapshot } from '../core/page-adapter'
import type { PageMessageSnapshot } from '../core/page-adapter'
import {
  DEFAULT_COMPLETION_STABILITY_MS,
  ResponseCompletionTracker
} from '../core/response-completion-tracker'
import { HeuristicTokenEstimator } from '../core/token-estimator'
import {
  hasDismissedPrivacyConsent,
  hasRequiredPrivacyConsent
} from '../core/storage'
import type {
  ConversationControl,
  ObservedMessageRecord,
  RiskAssessment
} from '../core/types'
import {
  shouldDrawAttention,
  stabilizeRiskLevel,
  withAlertRecorded,
  withDisplayedLevel
} from '../core/warning-controller'
import { createCoalescedAsyncRunner } from './coalesced-runner'
import { readPageSnapshot } from './dom-reader'
import { scanConversationHistory } from './history-scanner'
import { GuardUi } from './ui'

const estimator = new HeuristicTokenEstimator()

const CONTINUATION_PROMPT =
  '请总结当前对话，以便我在一个新的 ChatGPT 对话中无缝继续。请保留：当前目标、已完成工作、已经确认的决定、重要约束、关键数据/文件/代码状态、尚未解决的问题、容易踩坑的地方，以及下一步建议。不要省略会影响后续继续工作的上下文。'

export async function startGuard(): Promise<void> {
  if (location.hostname !== 'chatgpt.com') return

  const initialResponse = await sendBackground({ type: 'guard.loadState' })
  let latestState = initialResponse.state
  const fingerprinter = new WebCryptoFingerprinter(latestState.installSalt)
  let scheduleRun: (() => void) | undefined
  let latestConversationKey: string | undefined
  let blankStartArmed = false
  let pendingBlankStart = false
  let initializedUserBaseline = false
  let observedNewUserDuringRun = false
  let monitoringStarted = false
  let historyScanInProgress = false
  const seenUserKeys = new Set<string>()
  let completionTracker = new ResponseCompletionTracker()

  const refresh = () => scheduleRun?.()

  const currentLearningMode = (): 'cold' | 'warm' | 'calibrated' => {
    const generation = latestState.generations.find(
      (item) => item.id === latestState.settings.generationId
    )
    if (!generation) return 'cold'
    const summary = summarizeGeneration(generation)
    if (summary.usingWarmStartPrior) return 'warm'
    return summary.failureCeiling !== undefined || summary.safeFloorEvidenceReady
      ? 'calibrated'
      : 'cold'
  }

  const runAction = async (
    action: () => Promise<Extract<BackgroundResponse, { ok: true }>>,
    successMessage: string
  ): Promise<boolean> => {
    try {
      const response = await action()
      latestState = response.state
      ui.showToast(successMessage)
      refresh()
      return true
    } catch {
      ui.showToast('操作失败，请稍后重试')
      return false
    }
  }

  const observePageMessages = async (
    messages: PageMessageSnapshot[]
  ): Promise<ObservedMessageRecord[]> => {
    const now = Date.now()
    const observedMessages: ObservedMessageRecord[] = []
    for (const [index, message] of messages.entries()) {
      const contentFingerprint = await fingerprinter.fingerprint(
        `${message.role}\u001f${message.text}`
      )
      const stableHintHash = message.stableHint
        ? await fingerprinter.fingerprint(`stable\u001f${message.stableHint}`)
        : undefined
      const observedMessage: ObservedMessageRecord = {
        contentFingerprint,
        role: message.role,
        tokenEstimate: estimator.estimate(message.text),
        charCount: message.text.length,
        observedAt: now,
        ordinalHint: index,
        hasCode: message.hasCode,
        attachmentCount: message.attachmentCount
      }
      if (stableHintHash) observedMessage.stableHintHash = stableHintHash
      observedMessages.push(observedMessage)
    }
    return observedMessages
  }

  const ui = new GuardUi({
    onCopyContinuation: () => {
      void copyText(CONTINUATION_PROMPT)
        .then(() => ui.showToast('续接提示词已复制'))
        .catch(() => ui.showToast('复制失败，请手动重试'))
    },
    onScanHistory: () => {
      void runHistoryScan()
    },
    onRecalibrate: () => {
      void runAction(
        () =>
          sendBackground({
            type: 'guard.startGeneration',
            reason: 'recalibrate',
            observedAt: Date.now()
          }),
        '已重新学习当前环境'
      )
    },
    onToggleMute: () => {
      const key = latestConversationKey
      if (!key) return
      const control = latestState.conversationControls[key] ?? {}
      void runAction(
        () =>
          sendBackground({
            type: 'guard.updateControl',
            conversationKey: key,
            patch: { muted: !control.muted }
          }),
        control.muted ? '已恢复本会话提醒' : '本会话已静音'
      )
    },
    onConfirmFailure: (accepted) => {
      const key = latestConversationKey
      if (!key) return
      void runAction(
        () =>
          sendBackground({
            type: 'guard.confirmPendingFailure',
            conversationKey: key,
            accepted,
            observedAt: Date.now()
          }),
        accepted ? '已作为会话长度样本学习' : '已忽略这次错误'
      )
    },
    onAcceptPrivacyConsent: () => {
      void runAction(
        () =>
          sendBackground({
            type: 'guard.updatePrivacyConsent',
            accepted: true,
            observedAt: Date.now()
          }),
        '已启用本地长会话预警'
      ).then((saved) => {
        if (saved) startMonitoring()
      })
    },
    onDeclinePrivacyConsent: () => {
      void runAction(
        () =>
          sendBackground({
            type: 'guard.updatePrivacyConsent',
            accepted: false,
            observedAt: Date.now()
          }),
        '暂不开启'
      ).then((saved) => {
        if (saved) ui.showDisabled()
      })
    }
  })

  const processPage = async (): Promise<void> => {
    if (historyScanInProgress) return
    try {
      const isRoot = isRootChatUrl(location.href)
      const preliminarySnapshot = readPageSnapshot(document, location.href, 'none')
      const urlConversationId = parseConversationIdFromUrl(location.href)
      const knownConversationKey = urlConversationId
        ? `chatgpt:${urlConversationId}`
        : undefined
      const persistedComplete =
        knownConversationKey !== undefined &&
        latestState.ledgers[knownConversationKey]?.coverageState === 'complete'
      const lifecycle = resolveCoverageLifecycle({
        isRoot,
        hasConversationId: Boolean(urlConversationId),
        messageCount: preliminarySnapshot.messages.length,
        hasUserMessage: preliminarySnapshot.messages.some(
          (message) => message.role === 'user'
        ),
        blankStartArmed,
        pendingBlankStart,
        persistedComplete
      })
      blankStartArmed = lifecycle.blankStartArmed
      pendingBlankStart = lifecycle.pendingBlankStart
      const coverageEvidence = lifecycle.coverageEvidence

      preliminarySnapshot.coverageEvidence = coverageEvidence
      const adapterResult = analyzePageSnapshot(preliminarySnapshot)
      const conversationKey = adapterResult.conversationKey

      if (!conversationKey || adapterResult.health === 'unreliable') {
        latestConversationKey = undefined
        ui.showUnavailable(currentLearningMode())
        return
      }

      if (conversationKey !== latestConversationKey) {
        latestConversationKey = conversationKey
        initializedUserBaseline = false
        observedNewUserDuringRun = coverageEvidence === 'observed_from_start'
        seenUserKeys.clear()
        completionTracker = new ResponseCompletionTracker()
      }

      const observedMessages: ObservedMessageRecord[] = []
      const now = Date.now()
      for (const [index, message] of adapterResult.messages.entries()) {
        const contentFingerprint = await fingerprinter.fingerprint(
          `${message.role}\u001f${message.text}`
        )
        const stableHintHash = message.stableHint
          ? await fingerprinter.fingerprint(`stable\u001f${message.stableHint}`)
          : undefined
        const observedMessage: ObservedMessageRecord = {
          contentFingerprint,
          role: message.role,
          tokenEstimate: estimator.estimate(message.text),
          charCount: message.text.length,
          observedAt: now,
          ordinalHint: index,
          hasCode: message.hasCode,
          attachmentCount: message.attachmentCount
        }
        if (stableHintHash) observedMessage.stableHintHash = stableHintHash
        observedMessages.push(observedMessage)

        if (message.role === 'user') {
          const userKey = stableHintHash ?? contentFingerprint
          if (initializedUserBaseline && !seenUserKeys.has(userKey)) {
            observedNewUserDuringRun = true
          }
          seenUserKeys.add(userKey)
        }
      }
      initializedUserBaseline = true

      // V1 intentionally ignores unsent composer drafts for risk/calibration.
      const composerTokenEstimate = 0
      let response = await sendBackground({
        type: 'guard.observeWindow',
        window: {
          conversationKey,
          coverageState: adapterResult.coverageState,
          parserHealth: adapterResult.health,
          tailEvidence: adapterResult.tailEvidence,
          observedMessages,
          composerTokenEstimate,
          observedAt: now
        }
      })
      latestState = response.state
      let latestRisk: RiskAssessment | undefined = response.risk
      let persistedSnapshot = response.snapshot
      if (!persistedSnapshot) throw new Error('missing_persisted_snapshot')

      if (pendingBlankStart && adapterResult.coverageState === 'complete') {
        blankStartArmed = false
        pendingBlankStart = false
      }

      for (const error of adapterResult.visibleErrors) {
        response = await sendBackground({
          type: 'guard.recordFailure',
          event: {
            conversationKey,
            errorKind: error.kind,
            confidence: error.confidence,
            composerTokenEstimate,
            observedAt: now
          }
        })
        latestState = response.state
        latestRisk = response.risk ?? latestRisk
      }

      persistedSnapshot =
        latestState.ledgers[conversationKey] ?? persistedSnapshot
      const tailFingerprint = persistedSnapshot.activeFingerprints.at(-1)
      const tail = persistedSnapshot.messages.find(
        (message) => message.fingerprint === tailFingerprint
      )
      const hasLengthError = adapterResult.visibleErrors.some(
        (error) =>
          error.kind === 'conversation_length_limit' &&
          error.confidence !== 'low'
      )
      const completion = completionTracker.observe({
        observedAt: now,
        generationState: adapterResult.generationState,
        hasLengthError,
        ...(tail?.fingerprint ? { assistantFingerprint: tail.fingerprint } : {}),
        ...(tail?.role ? { role: tail.role } : {}),
        ...(tail?.contentFingerprint
          ? { contentFingerprint: tail.contentFingerprint }
          : {}),
        ...(tail?.tokenEstimate !== undefined
          ? { tokenEstimate: tail.tokenEstimate }
          : {})
      })

      if (completion.state === 'completed' && observedNewUserDuringRun) {
        const completionResponse = await sendBackground({
          type: 'guard.recordCompletion',
          event: {
            conversationKey,
            assistantFingerprint: completion.candidate.assistantFingerprint,
            estimatedLoad: persistedSnapshot.currentEstimatedLoad,
            assistantTokenCount: completion.candidate.tokenEstimate,
            observedAt: now
          }
        })
        latestState = completionResponse.state
        latestRisk = completionResponse.risk ?? latestRisk
      } else if (
        completion.state === 'pending' &&
        completion.candidate &&
        completion.reason === 'stability_window_open'
      ) {
        window.setTimeout(
          () => scheduleRun?.(),
          DEFAULT_COMPLETION_STABILITY_MS + 50
        )
      }

      const generation = latestState.generations.find(
        (item) => item.id === latestState.settings.generationId
      )
      if (!generation || !latestRisk) {
        ui.showUnavailable(currentLearningMode())
        return
      }

      const summary = summarizeGeneration(generation)
      const control = latestState.conversationControls[conversationKey] ?? {}
      const userTurn = countActiveUserTurns(persistedSnapshot)
      const displayedLevel = stabilizeRiskLevel(
        latestRisk,
        control.lastDisplayedLevel
      )
      const attention = shouldDrawAttention({
        level: displayedLevel,
        score: latestRisk.score,
        userTurn,
        control
      })

      const nextControl = attention
        ? withAlertRecorded(control, displayedLevel, latestRisk.score, userTurn)
        : withDisplayedLevel(control, displayedLevel)
      if (!controlsEqual(control, nextControl)) {
        const controlResponse = await sendBackground({
          type: 'guard.updateControl',
          conversationKey,
          patch: nextControl
        })
        latestState = controlResponse.state
      }

      const effectiveControl =
        latestState.conversationControls[conversationKey] ?? nextControl
      const pendingFailureConfirmation =
        generation.pendingFailureConfirmations?.some(
          (item) => item.conversationKey === conversationKey
        ) ?? false
      ui.update({
        conversationKey,
        riskLevel: displayedLevel,
        riskScore: latestRisk.score,
        estimatedLoad: persistedSnapshot.currentEstimatedLoad,
        coverage: persistedSnapshot.coverageState,
        learningMode: summary.usingWarmStartPrior
          ? 'warm'
          : summary.failureCeiling !== undefined || summary.safeFloorEvidenceReady
            ? 'calibrated'
            : 'cold',
        muted: effectiveControl.muted ?? false,
        pendingFailureConfirmation,
        showIncompleteHistoryNote: persistedSnapshot.coverageState !== 'complete'
      })

      if (attention) ui.drawAttention()
    } catch {
      ui.showUnavailable(currentLearningMode())
    }
  }

  async function runHistoryScan(): Promise<void> {
    if (historyScanInProgress) return
    const currentSnapshot = readPageSnapshot(document, location.href, 'none')
    const currentAdapter = analyzePageSnapshot(currentSnapshot)
    const conversationKey =
      currentAdapter.conversationKey ??
      latestConversationKey ??
      (() => {
        const conversationId = parseConversationIdFromUrl(location.href)
        return conversationId ? `chatgpt:${conversationId}` : undefined
      })()
    if (!conversationKey) {
      ui.showToast('当前会话已打开，但暂未识别到会话信息。请刷新页面后重试')
      return
    }

    historyScanInProgress = true
    ui.setHistoryScanBusy(true)
    try {
      const result = await scanConversationHistory(document, observePageMessages)
      if (!result.complete) {
        ui.showToast('未确认完整历史，本次不会作为完整学习样本')
        return
      }

      const now = Date.now()
      const parserHealthy = result.unknownRoleCount === 0
      const strongCoverage = parserHealthy && result.attachmentCount === 0
      const messages = result.observedMessages.map((message, index) => {
        const fingerprint = message.stableHintHash
          ? `stable:${message.stableHintHash}`
          : `scan:${index}:${message.contentFingerprint.slice(0, 16)}`
        return {
          fingerprint,
          contentFingerprint: message.contentFingerprint,
          ...(message.stableHintHash ? { stableHintHash: message.stableHintHash } : {}),
          role: message.role,
          tokenEstimate: message.tokenEstimate,
          charCount: message.charCount,
          observedAt: now + index,
          localBranchId: 'active',
          ordinalHint: index,
          ...(message.hasCode !== undefined ? { hasCode: message.hasCode } : {}),
          ...(message.attachmentCount !== undefined
            ? { attachmentCount: message.attachmentCount }
            : {})
        }
      })
      const activeFingerprints = messages.map((message) => message.fingerprint)
      const currentEstimatedLoad = messages.reduce(
        (total, message) => total + message.tokenEstimate,
        0
      )
      const generationId = latestState.settings.generationId
      const response = await sendBackground({
        type: 'guard.upsertLedger',
        snapshot: {
          conversationKey,
          generationId,
          coverageState: strongCoverage ? 'complete' : 'mostly_complete',
          parserHealth: parserHealthy ? 'healthy' : 'degraded',
          messages,
          activeFingerprints,
          sequenceReliability: 'reliable',
          currentEstimatedLoad,
          updatedAt: now
        }
      })
      latestState = response.state
      latestConversationKey = conversationKey

      if (result.attachmentCount > 0) {
        ui.showToast('扫描完成，但含附件内容，暂不作为强校准样本')
      } else if (!parserHealthy) {
        ui.showToast('扫描完成，但部分消息角色未确认，已降低学习权重')
      } else {
        ui.showToast('完整扫描完成，已确认当前会话历史')
      }
    } catch {
      ui.showToast('完整扫描未完成，请保持会话页面打开后重试')
    } finally {
      historyScanInProgress = false
      ui.setHistoryScanBusy(false)
      refresh()
    }
  }

  const markNewChatSend = (target: EventTarget | null): void => {
    if (!isRootChatUrl(location.href)) return
    if (!isPromptSendTarget(target)) return
    const snapshot = readPageSnapshot(document, location.href, 'none')
    if (parseConversationIdFromUrl(location.href) || snapshot.messages.length > 0) return
    if (!(snapshot.composerText ?? '').trim()) return
    blankStartArmed = true
    pendingBlankStart = true
    scheduleRun?.()
  }

  const onSubmit = (event: SubmitEvent): void => markNewChatSend(event.target)
  const onClick = (event: MouseEvent): void => {
    const element = event.target instanceof Element ? event.target : null
    const button = element?.closest<HTMLElement>('button, [role="button"]')
    if (!button) return
    if (button instanceof HTMLButtonElement && button.disabled) return
    if (button.getAttribute('aria-disabled') === 'true') return
    const semantic = `${button.getAttribute('data-testid') ?? ''} ${button.getAttribute('aria-label') ?? ''}`
    if (/send-button|send message|发送|发送消息/i.test(semantic)) markNewChatSend(button)
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
    markNewChatSend(event.target)
  }

  function startMonitoring(): void {
    if (monitoringStarted) return
    if (!canStartMonitoring(latestState.settings)) {
      ui.showConsentCard()
      return
    }
    monitoringStarted = true
    scheduleRun = createCoalescedAsyncRunner(processPage)

    document.addEventListener('submit', onSubmit, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown, true)

    const observer = new MutationObserver(() => scheduleRun?.())
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    })
    window.addEventListener(
      'beforeunload',
      () => {
        observer.disconnect()
        document.removeEventListener('submit', onSubmit, true)
        document.removeEventListener('click', onClick, true)
        document.removeEventListener('keydown', onKeyDown, true)
        ui.destroy()
      },
      { once: true }
    )
    scheduleRun()
  }

  if (canStartMonitoring(latestState.settings)) {
    startMonitoring()
  } else if (hasDismissedPrivacyConsent(latestState.settings)) {
    ui.showDisabled()
  } else {
    ui.showConsentCard()
  }
}

export function canStartMonitoring(settings: {
  privacyConsentVersion?: number
  privacyConsentedAt?: number
}): boolean {
  return hasRequiredPrivacyConsent({
    enabled: true,
    generationId: 'test',
    ...settings
  })
}

async function sendBackground(
  request: BackgroundRequest
): Promise<Extract<BackgroundResponse, { ok: true }>> {
  const response = (await chrome.runtime.sendMessage(request)) as BackgroundResponse
  if (!response.ok) throw new Error(response.error)
  return response
}

function isRootChatUrl(url: string): boolean {
  const parsed = new URL(url)
  return (
    parsed.hostname === 'chatgpt.com' &&
    (parsed.pathname === '/' || parsed.pathname === '/chat')
  )
}

export function resolveCoverageLifecycle(input: {
  isRoot: boolean
  hasConversationId: boolean
  messageCount: number
  hasUserMessage: boolean
  blankStartArmed: boolean
  pendingBlankStart: boolean
  persistedComplete: boolean
}): {
  blankStartArmed: boolean
  pendingBlankStart: boolean
  coverageEvidence: 'observed_from_start' | 'persisted_complete' | 'none'
} {
  let blankStartArmed = input.blankStartArmed
  let pendingBlankStart = input.pendingBlankStart

  if (input.isRoot && !input.hasConversationId && input.messageCount === 0) {
    blankStartArmed = true
  } else if (
    blankStartArmed &&
    input.isRoot &&
    !input.hasConversationId &&
    input.hasUserMessage
  ) {
    pendingBlankStart = true
  } else if (!pendingBlankStart && input.messageCount > 0) {
    blankStartArmed = false
  }

  return {
    blankStartArmed,
    pendingBlankStart,
    coverageEvidence: pendingBlankStart
      ? 'observed_from_start'
      : input.persistedComplete
        ? 'persisted_complete'
        : 'none'
  }
}

function isPromptSendTarget(target: EventTarget | null): boolean {
  const element = target instanceof Element ? target : null
  if (!element) return false
  if (element.matches('#prompt-textarea, [data-testid="prompt-textarea"]')) return true
  if (element.closest('#prompt-textarea, [data-testid="prompt-textarea"]')) return true
  const form = element.closest('form')
  if (!form) return false
  return form.querySelector('#prompt-textarea, [data-testid="prompt-textarea"]') !== null
}

function countActiveUserTurns(snapshot: {
  activeFingerprints: string[]
  messages: Array<{ fingerprint: string; role: string }>
}): number {
  const records = new Map(
    snapshot.messages.map((message) => [message.fingerprint, message])
  )
  return snapshot.activeFingerprints.reduce(
    (count, fingerprint) =>
      count + (records.get(fingerprint)?.role === 'user' ? 1 : 0),
    0
  )
}

function controlsEqual(
  left: ConversationControl,
  right: ConversationControl
): boolean {
  return (
    left.muted === right.muted &&
    left.snoozeUntilUserTurn === right.snoozeUntilUserTurn &&
    left.lastDisplayedLevel === right.lastDisplayedLevel &&
    left.lastAlertLevel === right.lastAlertLevel &&
    left.lastAlertScore === right.lastAlertScore &&
    left.lastAlertUserTurn === right.lastAlertUserTurn
  )
}

async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('clipboard_unavailable')
  await navigator.clipboard.writeText(text)
}
