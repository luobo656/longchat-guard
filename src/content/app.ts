import type {
  BackgroundRequest,
  BackgroundResponse
} from '../background/coordinator'
import { summarizeGeneration } from '../core/calibration'
import {
  anonymizeConversationKey,
  WebCryptoFingerprinter
} from '../core/fingerprinter'
import {
  parseConversationIdFromUrl,
  analyzePageSnapshot
} from '../core/page-adapter'
import type { PageMessageSnapshot } from '../core/page-adapter'
import {
  deriveCalibrationState,
  deriveEnvironmentConfidence,
  deriveMeasurementState,
  calibrationIsUsable,
  measurementIsUsable
} from '../core/product-state'
import { assessRisk } from '../core/risk-engine'
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
  CalibrationState,
  ObservedMessageRecord,
  PersistedConversationLedger,
  RiskAssessment,
  UncertaintySource
} from '../core/types'
import {
  shouldDrawAttention,
  withAlertRecorded
} from '../core/warning-controller'
import {
  createCoalescedAsyncRunner,
  createDebouncedRunner
} from './coalesced-runner'
import { readPageSnapshot } from './dom-reader'
import {
  detectUncertaintySources,
  parserCanaryPasses,
  readEnvironmentSignature
} from './environment'
import {
  scanConversationHistory,
  type HistoryScanFailureReason,
  type HistoryScanResult
} from './history-scanner'
import { GuardUi } from './ui'
import { t } from './i18n'

const estimator = new HeuristicTokenEstimator()
const SCAN_DIAGNOSTICS_KEY = 'longChatGuardLastScanDiagnostics'
const SCAN_DIAGNOSTICS_TTL_MS = 7 * 24 * 60 * 60 * 1000

export interface StoredScanDiagnostics {
  version: 4
  recordedAt: number
  reason: HistoryScanFailureReason
  stages: Array<
    Pick<
      HistoryScanResult['diagnostics'][number],
      | 'phase'
      | 'scrollTop'
      | 'scrollHeight'
      | 'clientHeight'
      | 'logicalTop'
      | 'scrollMode'
      | 'pageMessageCount'
      | 'observedCount'
      | 'totalMessageCount'
      | 'reason'
    >
  >
}

interface ActiveCalibrationScan {
  id: string
  rawConversationKey: string
  persistedConversationKey: string
  expectedGenerationId: string
  expectedLedgerRevision: number
}

interface PendingTurnStart {
  conversationKey?: string
  generationId: string
  ledgerRevision: number
  load: number
  accepted: boolean
  capturedAt: number
}

export function buildStoredScanDiagnostics(
  result: HistoryScanResult,
  recordedAt: number
): StoredScanDiagnostics | undefined {
  if (result.complete || !result.reason) return undefined
  return {
    version: 4,
    recordedAt,
    reason: result.reason,
    stages: result.diagnostics.slice(-8).map((stage) => ({
      phase: stage.phase,
      scrollTop: stage.scrollTop,
      scrollHeight: stage.scrollHeight,
      clientHeight: stage.clientHeight,
      ...(stage.logicalTop !== undefined
        ? { logicalTop: stage.logicalTop }
        : {}),
      ...(stage.scrollMode ? { scrollMode: stage.scrollMode } : {}),
      ...(stage.pageMessageCount !== undefined
        ? { pageMessageCount: stage.pageMessageCount }
        : {}),
      ...(stage.observedCount !== undefined
        ? { observedCount: stage.observedCount }
        : {}),
      ...(stage.totalMessageCount !== undefined
        ? { totalMessageCount: stage.totalMessageCount }
        : {}),
      ...(stage.reason ? { reason: stage.reason } : {})
    }))
  }
}

export function shouldDiscardStoredScanDiagnostics(
  value: unknown,
  now: number
): boolean {
  if (!value || typeof value !== 'object') return true
  const saved = value as { version?: unknown; recordedAt?: unknown }
  return (
    saved.version !== 4 ||
    typeof saved.recordedAt !== 'number' ||
    now - saved.recordedAt > SCAN_DIAGNOSTICS_TTL_MS
  )
}

async function cleanupExpiredScanDiagnostics(now: number): Promise<void> {
  try {
    const stored = await chrome.storage.local.get(SCAN_DIAGNOSTICS_KEY)
    if (
      stored[SCAN_DIAGNOSTICS_KEY] &&
      shouldDiscardStoredScanDiagnostics(
        stored[SCAN_DIAGNOSTICS_KEY],
        now
      )
    ) {
      await chrome.storage.local.remove(SCAN_DIAGNOSTICS_KEY)
    }
  } catch {
    // Diagnostics are best-effort and never block monitoring.
  }
}

const CONTINUATION_PROMPT = t(
  'continuationPrompt',
  "Create a continuation package for a new ChatGPT chat so work can resume without re-analysis. Preserve the current goal and exact stage, completed work, confirmed decisions, constraints and user preferences, key files/paths/repos/commits/code/config/data/platform state, unresolved issues and failed attempts, prioritized next actions, risks and pitfalls, and essential exact wording when needed. Clearly separate confirmed facts from inference and items still needing verification. If code or files are involved, state what was changed, tested, committed, pushed or published, and what remains pending. Finish with a short instruction telling the new chat to continue from the listed next action instead of starting over."
)

export async function startGuard(): Promise<void> {
  if (location.hostname !== 'chatgpt.com') return

  const initialResponse = await sendBackground({ type: 'guard.loadState' })
  await cleanupExpiredScanDiagnostics(Date.now())

  let latestState = initialResponse.state
  const fingerprinter = new WebCryptoFingerprinter(latestState.installSalt)
  const persistedConversationKey = (value: string): Promise<string> =>
    anonymizeConversationKey(value, latestState.installSalt)

  let scheduleRun: (() => void) | undefined
  let latestConversationKey: string | undefined
  let blankStartArmed = false
  let pendingBlankStart = false
  let monitoringStarted = false
  let historyScanInProgress = false
  let activeCalibrationScan: ActiveCalibrationScan | undefined
  let measurementScanInProgress = false
  let activeMeasurementScan: ActiveCalibrationScan | undefined
  let pendingTurnStart: PendingTurnStart | undefined
  let observationEpoch = Date.now()
  let completionTracker = new ResponseCompletionTracker()

  const refresh = (): void => scheduleRun?.()

  const currentGeneration = () =>
    latestState.generations.find(
      (item) => item.id === latestState.settings.generationId
    ) ?? latestState.generations[0]

  const currentCalibrationState = (): CalibrationState =>
    deriveCalibrationState({
      generation: currentGeneration(),
      currentEnvironment: readEnvironmentSignature(document),
      calibrating: historyScanInProgress
    })

  const renderCurrentUiFromState = (): void => {
    const conversationKey = latestConversationKey
    if (!conversationKey) {
      ui.showUnavailable(currentCalibrationState())
      return
    }
    const generation = currentGeneration()
    const ledger = latestState.ledgers[conversationKey]
    if (!generation || !ledger) {
      ui.showUnavailable(currentCalibrationState())
      return
    }
    const measurementState = deriveMeasurementState({
      supported: ledger.generationId === generation.id,
      ledger
    })
    const currentEnvironment = readEnvironmentSignature(document)
    const calibrationState = deriveCalibrationState({
      generation,
      currentEnvironment,
      calibrating: historyScanInProgress
    })
    const environmentConfidence = deriveEnvironmentConfidence(
      generation.environmentSignature,
      currentEnvironment
    )
    const summary = summarizeGeneration(generation)
    const composerDraftLoad = estimator.estimate(
      readPageSnapshot(document, location.href, 'none').composerText ?? ''
    )
    const risk = assessRisk({
      currentLoad: ledger.currentEstimatedLoad,
      composerDraftLoad,
      measurementState,
      calibrationState,
      environmentConfidence,
      ...(summary.failureReference
        ? { failureReference: summary.failureReference }
        : {}),
      ...(summary.growthReserveReady
        ? { growthReserve: summary.growthReserve }
        : {})
    })
    const control =
      latestState.conversationControls[conversationKey] ?? {}
    ui.update({
      conversationKey,
      measurementState,
      calibrationState,
      environmentConfidence,
      riskState: risk.state,
      referencePositionScore: risk.referencePositionScore,
      trackAvailable:
        measurementIsUsable(measurementState) &&
        calibrationIsUsable(calibrationState),
      growthReserveReady: summary.growthReserveReady,
      muted: control.muted ?? false,
      pendingFailureConfirmation:
        generation.pendingFailureConfirmations.some(
          (item) => item.conversationKey === conversationKey
        ),
      measurementRecoveryAvailable:
        measurementState !== 'complete' &&
        calibrationIsUsable(calibrationState),
      uncertaintySources: ledger.uncertaintySources
    })
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
      ui.showToast(
        t('toastActionFailed', 'Action failed. Please try again.')
      )
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
        ? await fingerprinter.fingerprint(
            `stable\u001f${message.stableHint}`
          )
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
        .then(() =>
          ui.showToast(
            t('toastContinuationCopied', 'Continuation prompt copied')
          )
        )
        .catch(() =>
          ui.showToast(
            t('toastCopyFailed', 'Copy failed. Please try again.')
          )
        )
    },

    onCalibrate: () => {
      void runCalibrationScan()
    },

    onMeasureCurrentChat: () => {
      void runMeasurementScan()
    },

    onRecalibrate: () => {
      if (historyScanInProgress || measurementScanInProgress) return
      void runAction(
        () =>
          sendBackground({
            type: 'guard.startGeneration',
            reason: 'recalibrate',
            observedAt: Date.now()
          }),
        t(
          'toastRecalibrationStarted',
          'Previous reference kept as an outdated prior. Calibrate again before relying on risk levels.'
        )
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
          ? t(
              'toastFailureLearned',
              'Calibration evidence saved from this limit event.'
            )
          : t('toastFailureIgnored', 'This event was ignored.')
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
    if (historyScanInProgress || measurementScanInProgress) return

    try {
      const isRoot = isRootChatUrl(location.href)
      const preliminarySnapshot = readPageSnapshot(
        document,
        location.href,
        'none'
      )
      const urlConversationId = parseConversationIdFromUrl(location.href)
      const knownConversationKey = urlConversationId
        ? await persistedConversationKey(
            `chatgpt:${urlConversationId}`
          )
        : undefined
      const knownLedger = knownConversationKey
        ? latestState.ledgers[knownConversationKey]
        : undefined
      const persistedComplete =
        knownLedger?.coverageState === 'complete' &&
        knownLedger.sequenceReliability === 'reliable'

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
      preliminarySnapshot.coverageEvidence = lifecycle.coverageEvidence

      const adapterResult = analyzePageSnapshot(preliminarySnapshot)
      const conversationKey = adapterResult.conversationKey
        ? await persistedConversationKey(adapterResult.conversationKey)
        : undefined
      const environmentSignature = readEnvironmentSignature(document)

      if (
        !conversationKey ||
        adapterResult.health === 'unreliable' ||
        !parserCanaryPasses(adapterResult.messages)
      ) {
        latestConversationKey = undefined
        ui.showUnavailable(
          deriveCalibrationState({
            generation: currentGeneration(),
            currentEnvironment: environmentSignature
          })
        )
        return
      }

      if (conversationKey !== latestConversationKey) {
        if (
          pendingTurnStart?.conversationKey &&
          pendingTurnStart.conversationKey !== conversationKey
        ) {
          pendingTurnStart = undefined
        }
        latestConversationKey = conversationKey
        completionTracker = new ResponseCompletionTracker()
      }

      const previousLedger = latestState.ledgers[conversationKey]
      const observedMessages = await observePageMessages(
        adapterResult.messages
      )
      const now = Date.now()
      const newUserCount = observedMessages.filter(
        (message) =>
          message.role === 'user' &&
          !previousLedger?.messages.some(
            (existing) =>
              (message.stableHintHash &&
                existing.stableHintHash === message.stableHintHash) ||
              (!message.stableHintHash &&
                existing.contentFingerprint === message.contentFingerprint &&
                existing.role === 'user')
          )
      ).length

      const composerTokenEstimate = estimator.estimate(
        adapterResult.composerText
      )
      const uncertaintySources = uniqueUncertaintySources([
        ...detectUncertaintySources(document),
        ...(observedMessages.some(
          (message) => (message.attachmentCount ?? 0) > 0
        )
          ? (['attachment'] as const)
          : [])
      ])

      observationEpoch = Math.max(observationEpoch + 1, now)
      let response = await sendBackground({
        type: 'guard.observeWindow',
        window: {
          conversationKey,
          coverageState: adapterResult.coverageState,
          parserHealth: adapterResult.health,
          tailEvidence: adapterResult.tailEvidence,
          observedMessages,
          composerTokenEstimate,
          environmentSignature,
          uncertaintySources,
          expectedGenerationId: latestState.settings.generationId,
          baseRevision: previousLedger?.ledgerRevision ?? 0,
          observationEpoch,
          observedAt: now
        }
      })
      latestState = response.state

      if (response.staleObservation) {
        pendingTurnStart = undefined
        window.setTimeout(() => scheduleRun?.(), 50)
        return
      }

      let latestRisk: RiskAssessment | undefined = response.risk
      let persistedSnapshot = response.snapshot
      if (!persistedSnapshot) {
        persistedSnapshot = latestState.ledgers[conversationKey]
      }
      if (!persistedSnapshot) throw new Error('missing_persisted_snapshot')

      if (pendingTurnStart && newUserCount > 0) {
        const expectedRevision = previousLedger?.ledgerRevision ?? 0
        const sameConversation =
          !pendingTurnStart.conversationKey ||
          pendingTurnStart.conversationKey === conversationKey
        const validTurnStart =
          sameConversation &&
          pendingTurnStart.generationId === persistedSnapshot.generationId &&
          pendingTurnStart.ledgerRevision === expectedRevision &&
          newUserCount === 1
        pendingTurnStart = validTurnStart
          ? {
              ...pendingTurnStart,
              conversationKey,
              accepted: true
            }
          : undefined
      }

      if (
        pendingBlankStart &&
        adapterResult.coverageState === 'complete'
      ) {
        blankStartArmed = false
        pendingBlankStart = false
      }

      for (const error of adapterResult.visibleErrors) {
        if (error.kind !== 'conversation_length_limit') continue
        response = await sendBackground({
          type: 'guard.recordFailure',
          event: {
            conversationKey,
            errorKind: error.kind,
            confidence: error.confidence,
            composerTokenEstimate,
            expectedGenerationId: persistedSnapshot.generationId,
            expectedLedgerRevision: persistedSnapshot.ledgerRevision,
            observedAt: now
          }
        })
        latestState = response.state
        latestRisk = response.risk ?? latestRisk
      }

      persistedSnapshot =
        latestState.ledgers[conversationKey] ?? persistedSnapshot
      const tailFingerprint =
        persistedSnapshot.activeFingerprints.at(-1)
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
        ...(tail?.fingerprint
          ? { assistantFingerprint: tail.fingerprint }
          : {}),
        ...(tail?.role ? { role: tail.role } : {}),
        ...(tail?.contentFingerprint
          ? { contentFingerprint: tail.contentFingerprint }
          : {}),
        ...(tail?.tokenEstimate !== undefined
          ? { tokenEstimate: tail.tokenEstimate }
          : {})
      })

      if (
        completion.state === 'completed' &&
        pendingTurnStart?.accepted
      ) {
        const completionResponse = await sendBackground({
          type: 'guard.recordCompletion',
          event: {
            conversationKey,
            assistantFingerprint:
              completion.candidate.assistantFingerprint,
            beforeTurnLoad: pendingTurnStart.load,
            expectedGenerationId: persistedSnapshot.generationId,
            expectedLedgerRevision: persistedSnapshot.ledgerRevision,
            observedAt: now
          }
        })
        latestState = completionResponse.state
        latestRisk = completionResponse.risk ?? latestRisk
        pendingTurnStart = undefined
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

      const generation = currentGeneration()
      const ledger = latestState.ledgers[conversationKey]
      if (!generation || !ledger || !latestRisk) {
        ui.showUnavailable(currentCalibrationState())
        return
      }

      const measurementState = deriveMeasurementState({
        supported: ledger.generationId === generation.id,
        ledger
      })
      const calibrationState = deriveCalibrationState({
        generation,
        currentEnvironment: ledger.environmentSignature
      })
      const environmentConfidence = deriveEnvironmentConfidence(
        generation.environmentSignature,
        ledger.environmentSignature
      )
      const summary = summarizeGeneration(generation)
      const control =
        latestState.conversationControls[conversationKey] ?? {}
      const attention = shouldDrawAttention({
        state: latestRisk.state,
        control
      })

      if (attention) {
        const controlResponse = await sendBackground({
          type: 'guard.updateControl',
          conversationKey,
          patch: withAlertRecorded(control, latestRisk.state)
        })
        latestState = controlResponse.state
      }

      const effectiveControl =
        latestState.conversationControls[conversationKey] ?? control
      const pendingFailureConfirmation =
        generation.pendingFailureConfirmations.some(
          (item) => item.conversationKey === conversationKey
        )

      ui.update({
        conversationKey,
        measurementState,
        calibrationState,
        environmentConfidence,
        riskState: latestRisk.state,
        referencePositionScore: latestRisk.referencePositionScore,
        trackAvailable:
          measurementIsUsable(measurementState) &&
          calibrationIsUsable(calibrationState),
        growthReserveReady: summary.growthReserveReady,
        muted: effectiveControl.muted ?? false,
        pendingFailureConfirmation,
        measurementRecoveryAvailable:
          measurementState !== 'complete' &&
          calibrationIsUsable(calibrationState),
        uncertaintySources: ledger.uncertaintySources
      })

      if (pendingFailureConfirmation) {
        ui.focusPendingConfirmation()
      } else if (attention) {
        ui.drawAttention()
      }
    } catch {
      ui.showUnavailable(currentCalibrationState())
    }
  }

  async function runMeasurementScan(): Promise<void> {
    if (historyScanInProgress || measurementScanInProgress) return
    await cleanupExpiredScanDiagnostics(Date.now())

    const startSnapshot = readPageSnapshot(
      document,
      location.href,
      'none'
    )
    const startAdapter = analyzePageSnapshot(startSnapshot)
    const rawConversationKey =
      startAdapter.conversationKey ??
      rawConversationKeyFromUrl(location.href)

    if (!rawConversationKey) {
      ui.showScanNotice(
        t(
          'measurementNoConversation',
          'Open the chat you want to measure, then try again.'
        ),
        'warning'
      )
      return
    }

    const persistedKey = await persistedConversationKey(rawConversationKey)
    const scan: ActiveCalibrationScan = {
      id: createScanSessionId(),
      rawConversationKey,
      persistedConversationKey: persistedKey,
      expectedGenerationId: latestState.settings.generationId,
      expectedLedgerRevision:
        latestState.ledgers[persistedKey]?.ledgerRevision ?? 0
    }

    activeMeasurementScan = scan
    measurementScanInProgress = true
    ui.setMeasurementBusy(true)

    try {
      const result = await scanConversationHistory(
        document,
        observePageMessages
      )

      if (!isSameActiveMeasurementScan(scan)) {
        throw new Error('scan_session_replaced')
      }

      const currentRawConversationKey =
        rawConversationKeyFromUrl(location.href) ??
        analyzePageSnapshot(
          readPageSnapshot(document, location.href, 'none')
        ).conversationKey

      if (currentRawConversationKey !== scan.rawConversationKey) {
        throw new Error('conversation_changed_during_scan')
      }

      if (!result.complete) {
        await persistScanFailureDiagnostic(result)
        ui.showScanNotice(
          t(
            'measurementScanIncomplete',
            'The full chat could not be read, so this chat\'s risk was not updated. Keep the page open and try again.'
          ),
          'warning'
        )
        return
      }

      if (result.unknownRoleCount > 0) {
        ui.showScanNotice(
          t(
            'measurementParserFailed',
            'This chat could not be measured reliably because some message roles could not be read.'
          ),
          'error'
        )
        return
      }

      const uncertaintySources = uniqueUncertaintySources([
        ...result.uncertaintySources,
        ...(result.attachmentCount > 0
          ? (['attachment'] as const)
          : [])
      ])
      const response = await sendBackground({
        type: 'guard.commitMeasurementScan',
        event: {
          conversationKey: scan.rawConversationKey,
          expectedGenerationId: scan.expectedGenerationId,
          expectedLedgerRevision: scan.expectedLedgerRevision,
          environmentSignature: readEnvironmentSignature(document),
          uncertaintySources,
          observedMessages: result.observedMessages,
          observedAt: Date.now()
        }
      })
      latestState = response.state

      try {
        await chrome.storage.local.remove(SCAN_DIAGNOSTICS_KEY)
      } catch {
        // Optional cleanup only.
      }

      ui.showToast(
        t(
          'measurementScanSuccess',
          'Full chat read complete. LongChat Guard can now assess this chat using your existing alert reference.'
        ),
        4200
      )
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'unknown_error'
      ui.showScanNotice(
        measurementCommitFailureMessage(reason),
        'error'
      )
    } finally {
      if (isSameActiveMeasurementScan(scan)) activeMeasurementScan = undefined
      measurementScanInProgress = false
      ui.setMeasurementBusy(false)
      refresh()
    }
  }

  async function runCalibrationScan(): Promise<void> {
    if (historyScanInProgress) return
    await cleanupExpiredScanDiagnostics(Date.now())

    const startSnapshot = readPageSnapshot(
      document,
      location.href,
      'none'
    )
    const startAdapter = analyzePageSnapshot(startSnapshot)
    const rawConversationKey =
      startAdapter.conversationKey ??
      rawConversationKeyFromUrl(location.href)

    if (!rawConversationKey) {
      ui.showScanNotice(
        t(
          'calibrationNoConversation',
          'Open the historical chat you know reached the conversation-length limit, then try again.'
        ),
        'warning'
      )
      return
    }
    if (
      startAdapter.health !== 'healthy' ||
      !parserCanaryPasses(startAdapter.messages)
    ) {
      ui.showScanNotice(
        t(
          'calibrationParserFailed',
          'Calibration was not saved because message roles could not be read reliably.'
        ),
        'error'
      )
      return
    }

    const persistedKey = await persistedConversationKey(
      rawConversationKey
    )
    const expectedGenerationId = latestState.settings.generationId
    const expectedLedgerRevision =
      latestState.ledgers[persistedKey]?.ledgerRevision ?? 0
    const scan: ActiveCalibrationScan = {
      id: createScanSessionId(),
      rawConversationKey,
      persistedConversationKey: persistedKey,
      expectedGenerationId,
      expectedLedgerRevision
    }

    activeCalibrationScan = scan
    historyScanInProgress = true
    ui.setCalibrationBusy(true)

    try {
      const result = await scanConversationHistory(
        document,
        observePageMessages
      )

      if (!isSameActiveScan(scan)) {
        throw new Error('scan_session_replaced')
      }

      const currentRawConversationKey =
        rawConversationKeyFromUrl(location.href) ??
        analyzePageSnapshot(
          readPageSnapshot(document, location.href, 'none')
        ).conversationKey

      if (currentRawConversationKey !== scan.rawConversationKey) {
        throw new Error('conversation_changed_during_scan')
      }

      if (!result.complete) {
        await persistScanFailureDiagnostic(result)
        ui.showScanNotice(
          historyScanFailureMessage(result.reason),
          'warning'
        )
        return
      }

      if (result.unknownRoleCount > 0) {
        ui.showScanNotice(
          t(
            'calibrationParserFailed',
            'Calibration was not saved because message roles could not be read reliably.'
          ),
          'error'
        )
        return
      }

      const uncertaintySources = uniqueUncertaintySources([
        ...result.uncertaintySources,
        ...(result.attachmentCount > 0
          ? (['attachment'] as const)
          : [])
      ])
      const environmentSignature =
        readEnvironmentSignature(document)
      const observedAt = Date.now()

      const response = await sendBackground({
        type: 'guard.commitCalibration',
        event: {
          conversationKey: scan.rawConversationKey,
          expectedGenerationId: scan.expectedGenerationId,
          expectedLedgerRevision: scan.expectedLedgerRevision,
          scanSessionId: scan.id,
          environmentSignature,
          uncertaintySources,
          observedMessages: result.observedMessages,
          observedAt
        }
      })
      latestState = response.state

      try {
        await chrome.storage.local.remove(SCAN_DIAGNOSTICS_KEY)
      } catch {
        // Optional cleanup only.
      }

      const generation = currentGeneration()
      const summary = generation
        ? summarizeGeneration(generation)
        : undefined
      if (summary?.failureReference?.quality === 'conservative') {
        ui.showScanNotice(
          t(
            'calibrationConservativeSuccess',
            'Reference established. This chat includes context that cannot be measured precisely, so alerts will be more conservative.'
          ),
          'warning'
        )
      } else {
        ui.showToast(
          t(
            'calibrationSuccess',
            'Calibration complete. The local failure reference is established.'
          ),
          4200
        )
      }
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'unknown_error'
      ui.showScanNotice(
        calibrationCommitFailureMessage(reason),
        'error'
      )
    } finally {
      if (isSameActiveScan(scan)) activeCalibrationScan = undefined
      historyScanInProgress = false
      ui.setCalibrationBusy(false)
      refresh()
    }
  }

  const onStorageChanged = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ): void => {
    if (
      areaName !== 'local' ||
      !changes.conversationGuardState ||
      historyScanInProgress ||
      measurementScanInProgress
    ) {
      return
    }
    void sendBackground({ type: 'guard.readState' })
      .then((response) => {
        latestState = response.state
        renderCurrentUiFromState()
      })
      .catch(() => undefined)
  }

  const captureTurnStart = (target: EventTarget | null): boolean => {
    if (!isPromptSendTarget(target)) return false
    const snapshot = readPageSnapshot(
      document,
      location.href,
      'none'
    )
    if (!(snapshot.composerText ?? '').trim()) return false

    const now = Date.now()
    if (
      pendingTurnStart &&
      now - pendingTurnStart.capturedAt < 750
    ) {
      return true
    }

    const generationId = latestState.settings.generationId
    const conversationKey = latestConversationKey
    const ledger = conversationKey
      ? latestState.ledgers[conversationKey]
      : undefined

    if (conversationKey && ledger) {
      pendingTurnStart = {
        conversationKey,
        generationId,
        ledgerRevision: ledger.ledgerRevision,
        load: ledger.currentEstimatedLoad,
        accepted: false,
        capturedAt: now
      }
      return true
    }

    if (
      isRootChatUrl(location.href) &&
      !parseConversationIdFromUrl(location.href) &&
      snapshot.messages.length === 0
    ) {
      pendingTurnStart = {
        generationId,
        ledgerRevision: 0,
        load: 0,
        accepted: false,
        capturedAt: now
      }
      return true
    }

    return false
  }

  const markNewChatSend = (): void => {
    if (!isRootChatUrl(location.href)) return
    const snapshot = readPageSnapshot(
      document,
      location.href,
      'none'
    )
    if (
      parseConversationIdFromUrl(location.href) ||
      snapshot.messages.length > 0
    ) {
      return
    }
    blankStartArmed = true
    pendingBlankStart = true
  }

  const onSubmit = (event: SubmitEvent): void => {
    if (captureTurnStart(event.target)) markNewChatSend()
  }
  const onClick = (event: MouseEvent): void => {
    const element =
      event.target instanceof Element ? event.target : null
    const buttonElement =
      element?.closest<HTMLElement>('button, [role="button"]')
    if (!buttonElement) return
    if (
      buttonElement instanceof HTMLButtonElement &&
      buttonElement.disabled
    ) {
      return
    }
    if (buttonElement.getAttribute('aria-disabled') === 'true') return
    const semantic =
      `${buttonElement.getAttribute('data-testid') ?? ''} ${buttonElement.getAttribute('aria-label') ?? ''}`
    if (
      /send-button|send message|发送|发送消息/i.test(semantic)
    ) {
      if (captureTurnStart(buttonElement)) markNewChatSend()
    }
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.isComposing
    ) {
      return
    }
    if (captureTurnStart(event.target)) markNewChatSend()
  }
  const onInput = (): void => scheduleRun?.()

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
    document.addEventListener('input', onInput, true)
    chrome.storage.onChanged.addListener(onStorageChanged)

    const mutationRunner = createDebouncedRunner(
      () => scheduleRun?.(),
      120
    )
    const observer = new MutationObserver(mutationRunner.schedule)
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    })

    window.addEventListener(
      'beforeunload',
      () => {
        activeCalibrationScan = undefined
        observer.disconnect()
        mutationRunner.cancel()
        document.removeEventListener('submit', onSubmit, true)
        document.removeEventListener('click', onClick, true)
        document.removeEventListener('keydown', onKeyDown, true)
        document.removeEventListener('input', onInput, true)
        chrome.storage.onChanged.removeListener(onStorageChanged)
        ui.destroy()
      },
      { once: true }
    )
    scheduleRun()
  }

  if (canStartMonitoring(latestState.settings)) {
    startMonitoring()
  } else if (
    hasDismissedPrivacyConsent(latestState.settings)
  ) {
    ui.showDisabled()
  } else {
    ui.showConsentCard()
  }

  function isSameActiveScan(scan: ActiveCalibrationScan): boolean {
    return activeCalibrationScan?.id === scan.id
  }

  function isSameActiveMeasurementScan(
    scan: ActiveCalibrationScan
  ): boolean {
    return activeMeasurementScan?.id === scan.id
  }
}

async function persistScanFailureDiagnostic(
  result: HistoryScanResult
): Promise<void> {
  try {
    const diagnostic = buildStoredScanDiagnostics(
      result,
      Date.now()
    )
    if (diagnostic) {
      await chrome.storage.local.set({
        [SCAN_DIAGNOSTICS_KEY]: diagnostic
      })
    }
  } catch {
    // Diagnostics are optional and contain no raw chat content.
  }
}

function historyScanFailureMessage(
  reason: HistoryScanFailureReason | undefined
): string {
  if (reason === 'no_scroll_container') {
    return t(
      'scanNoScroll',
      'Conversation scroll area was not found. Refresh and try again.'
    )
  }
  if (reason === 'no_messages') {
    return t(
      'scanNoMessages',
      'No conversation messages are available yet. Wait for the page to finish loading.'
    )
  }
  if (reason === 'head_not_stable') {
    return t(
      'scanHeadLoading',
      'Older history did not finish stabilizing, so calibration was not saved. Keep the page open and try again.'
    )
  }
  if (reason === 'tail_not_stable') {
    return t(
      'scanTailChanging',
      'The end of the conversation is still changing. Calibration was not saved.'
    )
  }
  if (reason === 'window_alignment_failed') {
    return t(
      'scanAlignmentFailed',
      'Part of the history could not be read continuously, so calibration was stopped instead of guessing.'
    )
  }
  if (reason === 'scan_limit_reached') {
    return t(
      'scanLimitReached',
      'This chat is very long and the full history could not be confirmed. Calibration was not saved.'
    )
  }
  return t(
    'scanIncomplete',
    'Complete history was not confirmed, so calibration was not saved.'
  )
}

function measurementCommitFailureMessage(reason: string): string {
  if (
    reason === 'conversation_changed_during_scan' ||
    reason === 'ledger_changed_during_scan'
  ) {
    return t(
      'measurementConversationChanged',
      'The chat changed while it was being read. Nothing was updated; keep this chat open and try again.'
    )
  }
  if (reason === 'generation_changed_during_scan') {
    return t(
      'measurementGenerationChanged',
      'The alert reference changed while this chat was being read. Nothing was updated; try again.'
    )
  }
  if (
    reason === 'measurement_parser_unreliable' ||
    reason === 'measurement_scan_empty'
  ) {
    return t(
      'measurementSampleUnusable',
      'This chat could not be measured reliably enough to determine its current risk.'
    )
  }
  return t(
    'measurementScanFailed',
    'The full chat could not be read, so this chat\'s risk was not updated.'
  )
}

function calibrationCommitFailureMessage(reason: string): string {
  if (
    reason === 'conversation_changed_during_scan' ||
    reason === 'ledger_changed_during_scan'
  ) {
    return t(
      'calibrationConversationChanged',
      'The conversation changed while it was being scanned. Nothing was calibrated; keep this chat open and try again.'
    )
  }
  if (reason === 'generation_changed_during_scan') {
    return t(
      'calibrationGenerationChanged',
      'The alert reference changed while scanning. Nothing was calibrated; try again.'
    )
  }
  if (
    reason === 'calibration_parser_unreliable' ||
    reason === 'calibration_scan_empty'
  ) {
    return t(
      'calibrationSampleUnusable',
      'This chat could not be measured reliably enough to use as a calibration sample.'
    )
  }
  return t(
    'toastScanFailed',
    'Calibration did not finish. No failure reference was saved.'
  )
}

function rawConversationKeyFromUrl(
  url: string
): string | undefined {
  const conversationId = parseConversationIdFromUrl(url)
  return conversationId
    ? `chatgpt:${conversationId}`
    : undefined
}

function createScanSessionId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `scan-${Date.now()}-${Math.random().toString(36).slice(2)}`
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
  coverageEvidence:
    | 'observed_from_start'
    | 'persisted_complete'
    | 'none'
} {
  let blankStartArmed = input.blankStartArmed
  let pendingBlankStart = input.pendingBlankStart

  if (
    input.isRoot &&
    !input.hasConversationId &&
    input.messageCount === 0
  ) {
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

function isRootChatUrl(url: string): boolean {
  const parsed = new URL(url)
  return (
    parsed.hostname === 'chatgpt.com' &&
    (parsed.pathname === '/' || parsed.pathname === '/chat')
  )
}

function isPromptSendTarget(target: EventTarget | null): boolean {
  const element =
    target instanceof Element ? target : null
  if (!element) return false
  if (
    element.matches(
      '#prompt-textarea, [data-testid="prompt-textarea"]'
    )
  ) {
    return true
  }
  if (
    element.closest(
      '#prompt-textarea, [data-testid="prompt-textarea"]'
    )
  ) {
    return true
  }
  const form = element.closest('form')
  if (!form) return false
  return (
    form.querySelector(
      '#prompt-textarea, [data-testid="prompt-textarea"]'
    ) !== null
  )
}

function uniqueUncertaintySources(
  values: UncertaintySource[]
): UncertaintySource[] {
  return Array.from(new Set(values))
}

async function sendBackground(
  request: BackgroundRequest
): Promise<Extract<BackgroundResponse, { ok: true }>> {
  const response =
    (await chrome.runtime.sendMessage(
      request
    )) as BackgroundResponse
  if (!response.ok) throw new Error(response.error)
  return response
}

async function copyText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    throw new Error('clipboard_unavailable')
  }
  await navigator.clipboard.writeText(text)
}
