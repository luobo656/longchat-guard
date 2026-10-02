import type { BackgroundRequest, BackgroundResponse } from '../background/coordinator'
import { CALIBRATION_DEFAULTS, summarizeGeneration } from '../core/calibration'
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
  MessageRecord,
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
import {
  scanConversationHistory,
  type HistoryScanFailureReason,
  type HistoryScanResult
} from './history-scanner'
import { GuardUi, type BaselineState, type LearningStage } from './ui'
import { t } from './i18n'

const estimator = new HeuristicTokenEstimator()
const SCAN_DIAGNOSTICS_KEY = 'longChatGuardLastScanDiagnostics'
const SCAN_DIAGNOSTICS_TTL_MS = 7 * 24 * 60 * 60 * 1000

type HistoryScanMode = 'baseline' | 'refresh' | 'limit'

export interface StoredScanDiagnostics {
  version: 3
  recordedAt: number
  reason: HistoryScanFailureReason
  stages: Array<Pick<HistoryScanResult['diagnostics'][number],
    'phase' | 'scrollTop' | 'scrollHeight' | 'clientHeight' | 'logicalTop' |
    'scrollMode' | 'pageMessageCount' | 'observedCount' | 'totalMessageCount' | 'reason'
  >>
}

export function buildStoredScanDiagnostics(
  result: HistoryScanResult,
  recordedAt: number
): StoredScanDiagnostics | undefined {
  if (result.complete || !result.reason) return undefined
  return {
    version: 3,
    recordedAt,
    reason: result.reason,
    stages: result.diagnostics.slice(-8).map((stage) => ({
      phase: stage.phase,
      scrollTop: stage.scrollTop,
      scrollHeight: stage.scrollHeight,
      clientHeight: stage.clientHeight,
      ...(stage.logicalTop !== undefined ? { logicalTop: stage.logicalTop } : {}),
      ...(stage.scrollMode ? { scrollMode: stage.scrollMode } : {}),
      ...(stage.pageMessageCount !== undefined ? { pageMessageCount: stage.pageMessageCount } : {}),
      ...(stage.observedCount !== undefined ? { observedCount: stage.observedCount } : {}),
      ...(stage.totalMessageCount !== undefined ? { totalMessageCount: stage.totalMessageCount } : {}),
      ...(stage.reason ? { reason: stage.reason } : {})
    }))
  }
}

export function shouldDiscardStoredScanDiagnostics(value: unknown, now: number): boolean {
  if (!value || typeof value !== 'object') return true
  const saved = value as { version?: unknown; recordedAt?: unknown }
  return (
    saved.version !== 3 ||
    typeof saved.recordedAt !== 'number' ||
    now - saved.recordedAt > SCAN_DIAGNOSTICS_TTL_MS
  )
}

async function cleanupExpiredScanDiagnostics(now: number): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(SCAN_DIAGNOSTICS_KEY)
    if (
      stored[SCAN_DIAGNOSTICS_KEY] &&
      shouldDiscardStoredScanDiagnostics(stored[SCAN_DIAGNOSTICS_KEY], now)
    ) {
      await chrome.storage.local.remove(SCAN_DIAGNOSTICS_KEY)
    }
  } catch {
    // Diagnostic cleanup is best-effort and never blocks the user flow.
  }
}

const CONTINUATION_PROMPT = t(
  'continuationPrompt',
  "Create a continuation package for a new ChatGPT chat so work can resume without re-analysis. Preserve the current goal and exact stage, completed work, confirmed decisions, constraints and user preferences, key files/paths/repos/commits/code/config/data/platform state, unresolved issues and failed attempts, prioritized next actions, risks and pitfalls, and essential exact wording when needed. Clearly separate confirmed facts from inference and items still needing verification. If code or files are involved, state what was changed, tested, committed, pushed or published, and what remains pending. Finish with a short instruction telling the new chat to continue from the listed next action instead of starting over."
)

export function deriveScanSafeCompletion(
  messages: Pick<MessageRecord, 'fingerprint' | 'role' | 'tokenEstimate'>[]
): { assistantFingerprint: string; assistantTokenCount: number; estimatedLoad: number } | undefined {
  let estimatedLoad = 0
  let candidate:
    | { assistantFingerprint: string; assistantTokenCount: number; estimatedLoad: number }
    | undefined
  for (const message of messages) {
    estimatedLoad += Math.max(0, message.tokenEstimate)
    if (message.role === 'assistant' && message.tokenEstimate > 0) {
      candidate = {
        assistantFingerprint: message.fingerprint,
        assistantTokenCount: message.tokenEstimate,
        estimatedLoad
      }
    }
  }
  return candidate
}

export async function startGuard(): Promise<void> {
  if (location.hostname !== 'chatgpt.com') return

  const initialResponse = await sendBackground({ type: 'guard.loadState' })
  await cleanupExpiredScanDiagnostics(Date.now())
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
  let focusPendingConfirmationAfterRender = false
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
    return summary.independentConversations > 0 ? 'calibrated' : 'cold'
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
      ui.showToast(t('toastActionFailed', 'Action failed. Please try again.'))
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
        .then(() => ui.showToast(t('toastContinuationCopied', 'Continuation prompt copied')))
        .catch(() => ui.showToast(t('toastCopyFailed', 'Copy failed. Please try again.')))
    },
    onScanHistory: () => {
      const generation = latestState.generations.find(
        (item) => item.id === latestState.settings.generationId
      )
      const summary = generation ? summarizeGeneration(generation) : undefined
      void runHistoryScan(summary && hasUsableBaseline(summary) ? 'refresh' : 'baseline')
    },
    onCalibrateLimit: () => {
      void runHistoryScan('limit')
    },
    onRecalibrate: () => {
      void runAction(
        () =>
          sendBackground({
            type: 'guard.startGeneration',
            reason: 'recalibrate',
            observedAt: Date.now()
          }),
        t('toastRelearned', 'Existing baseline kept while recalibration starts')
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
        control.muted
          ? t('toastRemindersRestored', 'Alerts restored for this chat')
          : t('toastConversationMuted', 'Alerts muted for this chat')
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
        accepted
          ? t('toastFailureLearned', 'Conversation-limit sample learned')
          : t('toastFailureIgnored', 'This error was ignored')
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
        t('toastMonitoringEnabled', 'Local long-chat alerts enabled')
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
        t('toastMonitoringDeferred', 'Not enabled')
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

      // 2.x intentionally ignores unsent composer drafts for risk/calibration.
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
        trendScore: latestRisk.trendScore,
        estimatedLoad: persistedSnapshot.currentEstimatedLoad,
        learningMode: summary.usingWarmStartPrior
          ? 'warm'
          : summary.independentConversations > 0
            ? 'calibrated'
            : 'cold',
        baselineState: deriveBaselineState(summary),
        hasRiskBoundary: hasUsableBaseline(summary),
        showScanAction: shouldShowScanAction(summary),
        showLimitCalibrationAction: summary.confirmedFailureConversations === 0,
        muted: effectiveControl.muted ?? false,
        pendingFailureConfirmation
      })

      if (pendingFailureConfirmation && focusPendingConfirmationAfterRender) {
        focusPendingConfirmationAfterRender = false
        ui.focusPendingConfirmation()
      } else if (attention) {
        ui.drawAttention()
      }
    } catch {
      ui.showUnavailable(currentLearningMode())
    }
  }

  async function runHistoryScan(mode: HistoryScanMode): Promise<void> {
    if (historyScanInProgress) return
    await cleanupExpiredScanDiagnostics(Date.now())
    const currentSnapshot = readPageSnapshot(document, location.href, 'none')
    const currentAdapter = analyzePageSnapshot(currentSnapshot)
    if (mode === 'limit') {
      const generation = latestState.generations.find(
        (item) => item.id === latestState.settings.generationId
      )
      const summary = generation ? summarizeGeneration(generation) : undefined
      if ((summary?.confirmedFailureConversations ?? 0) > 0) {
        ui.showToast(t('toastLimitAlreadyConfirmed', 'A confirmed limit baseline already exists.'))
        return
      }
    }
    const conversationKey =
      currentAdapter.conversationKey ??
      latestConversationKey ??
      (() => {
        const conversationId = parseConversationIdFromUrl(location.href)
        return conversationId ? `chatgpt:${conversationId}` : undefined
      })()
    if (!conversationKey) {
      ui.showToast(
        t(
          'toastNoConversation',
          'Chat is open, but its conversation information is not available yet. Refresh and try again.'
        )
      )
      return
    }

    historyScanInProgress = true
    focusPendingConfirmationAfterRender = false
    ui.setHistoryScanBusy(true, mode === 'limit' ? 'limit' : 'primary')
    try {
      const result = await scanConversationHistory(document, observePageMessages)
      if (!result.complete) {
        try {
          const diagnostic = buildStoredScanDiagnostics(result, Date.now())
          if (diagnostic) {
            await chrome.storage.local.set({ [SCAN_DIAGNOSTICS_KEY]: diagnostic })
          }
        } catch {
          // Diagnostics are optional and must never block the user flow.
        }
        ui.showToast(historyScanFailureMessage(result.reason))
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

      const assistantGrowthHistory = result.observedMessages
        .filter((message) => message.role === 'assistant' && message.tokenEstimate > 0)
        .map((message) => message.tokenEstimate)
        .slice(-24)
      if (assistantGrowthHistory.length > 0) {
        const growthResponse = await sendBackground({
          type: 'guard.seedGrowthHistory',
          event: {
            conversationKey,
            tokenCounts: assistantGrowthHistory,
            observedAt: now
          }
        })
        latestState = growthResponse.state
      }

      if (strongCoverage) {
        const safeCompletion = deriveScanSafeCompletion(messages)
        if (safeCompletion) {
          const completionResponse = await sendBackground({
            type: 'guard.recordCompletion',
            event: {
              conversationKey,
              ...safeCompletion,
              observedAt: now
            }
          })
          latestState = completionResponse.state
        }
      }

      let detectedLimitConfidence: 'high' | 'medium' | undefined
      if (mode === 'limit') {
        const postScanAdapter = analyzePageSnapshot(
          readPageSnapshot(document, location.href, 'none')
        )
        const limitErrors = [
          ...currentAdapter.visibleErrors,
          ...postScanAdapter.visibleErrors
        ].filter((error) => error.kind === 'conversation_length_limit')
        detectedLimitConfidence = limitErrors.some((error) => error.confidence === 'high')
          ? 'high'
          : limitErrors.some((error) => error.confidence === 'medium')
            ? 'medium'
            : undefined

        const failureResponse = await sendBackground({
          type: 'guard.recordFailure',
          event: {
            conversationKey,
            errorKind: 'conversation_length_limit',
            confidence: detectedLimitConfidence ?? 'medium',
            forcePrompt: detectedLimitConfidence !== 'high',
            composerTokenEstimate: 0,
            observedAt: now
          }
        })
        latestState = failureResponse.state
      }

      const activeGeneration = latestState.generations.find(
        (item) => item.id === latestState.settings.generationId
      )
      const activeSummary = activeGeneration ? summarizeGeneration(activeGeneration) : undefined
      const awaitingLimitConfirmation =
        activeGeneration?.pendingFailureConfirmations?.some(
          (item) => item.conversationKey === conversationKey
        ) ?? false

      if (mode === 'limit') {
        if (awaitingLimitConfirmation) {
          focusPendingConfirmationAfterRender = true
          ui.showToast(
            t('toastLimitConfirm', 'Scan complete. Please confirm that this chat really reached the conversation-length limit.')
          )
        } else if (
          detectedLimitConfidence === 'high' ||
          (activeSummary?.confirmedFailureConversations ?? 0) > 0
        ) {
          ui.showToast(
            t('toastLimitDetected', 'Conversation-length limit detected. The limit baseline was confirmed automatically.')
          )
        }
      } else if (mode === 'baseline') {
        if (activeSummary && hasUsableBaseline(activeSummary)) {
          ui.showToast(
            t('toastBaselineReady', 'Reference baseline established. Risk tracking is ready.')
          )
        } else {
          ui.showToast(
            t('toastBaselineNotSet', 'Scan finished, but this chat was not reliable enough to establish a baseline. Try another complete chat.')
          )
        }
      } else if (result.attachmentCount > 0) {
        ui.showToast(
          t('toastScanAttachments', 'Scan complete. Current progress was refreshed; attachment data is handled conservatively.')
        )
      } else if (!parserHealthy) {
        ui.showToast(
          t('toastScanRoleUncertain', 'Scan complete. Current progress was refreshed with conservative handling for uncertain roles.')
        )
      } else {
        ui.showToast(t('toastProgressUpdated', 'Current chat progress updated.'))
      }
    } catch {
      ui.showToast(
        t('toastScanFailed', 'Full scan did not finish. Please try again later.')
      )
    } finally {
      historyScanInProgress = false
      ui.setHistoryScanBusy(false, mode === 'limit' ? 'limit' : 'primary')
      refresh()
    }
  }

  function historyScanFailureMessage(
    reason: import('./history-scanner').HistoryScanFailureReason | undefined
  ): string {
    if (reason === 'no_scroll_container') {
      return t('scanNoScroll', 'Conversation scroll area was not found. Refresh and try again.')
    }
    if (reason === 'no_messages') {
      return t(
        'scanNoMessages',
        'No conversation messages are available yet. Wait for the page to finish loading.'
      )
    }
    if (reason === 'head_not_stable') {
      return t('scanHeadLoading', 'Older messages are still loading. Wait a few seconds and try again.')
    }
    if (reason === 'tail_not_stable') {
      return t(
        'scanTailChanging',
        'The end of the conversation is still changing. Wait for the page to settle.'
      )
    }
    if (reason === 'window_alignment_failed') {
      return t(
        'scanAlignmentFailed',
        'Part of the history could not be read continuously, so the scan was stopped to avoid a misleading estimate.'
      )
    }
    if (reason === 'scan_limit_reached') {
      return t('scanLimitReached', 'This chat is very long and the scan did not finish. Try once more.')
    }
    return t(
      'scanIncomplete',
      'Complete history was not confirmed, so this scan will not establish or update the baseline.'
    )
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

export function deriveLearningStage(
  summary: ReturnType<typeof summarizeGeneration>
): LearningStage {
  if (summary.independentConversations <= 0) return 'learning'
  if (summary.independentConversations === 1) return 'initial'
  const stable =
    summary.safeBoundary !== undefined &&
    summary.failureBoundary !== undefined &&
    summary.turnBuffer > 0 &&
    summary.confirmedSafeConversations >=
      CALIBRATION_DEFAULTS.minConfirmedSafeConversationsForStable &&
    summary.independentConversations >=
      CALIBRATION_DEFAULTS.minIndependentBoundaryConversationsForStable
  return stable ? 'stable' : 'calibrating'
}

export function deriveBaselineState(
  summary: ReturnType<typeof summarizeGeneration>
): BaselineState {
  const hasBoundary =
    summary.safeBoundary !== undefined || summary.failureBoundary !== undefined
  if (!hasBoundary) return 'none'
  if (summary.confirmedFailureConversations > 0) return 'confirmed'
  if (summary.confirmedSafeConversations > 0) return 'safe'
  if (summary.usingWarmStartPrior) return 'inherited'
  return 'safe'
}

export function hasUsableBaseline(
  summary: ReturnType<typeof summarizeGeneration>
): boolean {
  return deriveBaselineState(summary) !== 'none'
}

export function shouldShowScanAction(
  _summary: ReturnType<typeof summarizeGeneration>
): boolean {
  return true
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
