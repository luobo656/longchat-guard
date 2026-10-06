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
  resolveConversationId,
  analyzePageSnapshot
} from '../core/page-adapter'
import type { PageMessageSnapshot } from '../core/page-adapter'
import {
  deriveCalibrationState,
  deriveEnvironmentConfidence,
  deriveMeasurementState,
  calibrationIsUsable,
  calibrationNeedsFreshGeneration,
  measurementIsUsable
} from '../core/product-state'
import { isAuthoritativeLedgerForEnvironment } from '../core/measurement-authority'
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
import {
  createConversationSessionState,
  markNewChatStarted,
  NEW_CHAT_START_EVIDENCE_TTL_MS,
  resetConversationSession,
  resolveConversationSession,
  resolveSessionConversationId,
  shouldArmNewChatFromComposerActivity
} from './conversation-session'
import {
  findComposerElement,
  readPageSnapshot
} from './dom-reader'
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
import { GuardUi, type GuardUiModel } from './ui'
import {
  appendRuntimeDiagnosticSnapshot,
  RuntimeDiagnosticsTrace,
  type RuntimeDiagnosticValue,
} from './runtime-diagnostics'
import { t } from './i18n'

const estimator = new HeuristicTokenEstimator()
const SCAN_DIAGNOSTICS_KEY = 'longChatGuardLastScanDiagnostics'
const SCAN_DIAGNOSTICS_TTL_MS = 7 * 24 * 60 * 60 * 1000
const NEW_CHAT_START_SESSION_KEY = 'longChatGuardRecentBlankStartAt'

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

interface PendingTurnIntent {
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

function continuationPrompt(): string {
  return t(
    'continuationPrompt',
    "Create a continuation package for a new ChatGPT chat so work can resume without re-analysis. Preserve the current goal and exact stage, completed work, confirmed decisions, constraints and user preferences, key files/paths/repos/commits/code/config/data/platform state, unresolved issues and failed attempts, prioritized next actions, risks and pitfalls, and essential exact wording when needed. Clearly separate confirmed facts from inference and items still needing verification. If code or files are involved, state what was changed, tested, committed, pushed or published, and what remains pending. Finish with a short instruction telling the new chat to continue from the listed next action instead of starting over."
  )
}

export async function startGuard(): Promise<void> {
  if (location.hostname !== 'chatgpt.com') return

  const initialResponse = await sendBackground({ type: 'guard.loadState' })
  await cleanupExpiredScanDiagnostics(Date.now())

  let latestState = initialResponse.state
  const runtimeDiagnostics = new RuntimeDiagnosticsTrace(
    chrome.runtime.getManifest().version
  )
  const diagnosticsStorage = {
    get: (key: string) => chrome.storage.local.get(key),
    set: (items: Record<string, unknown>) =>
      chrome.storage.local.set(items)
  }
  let diagnosticsWriteQueue: Promise<void> = Promise.resolve()
  let lastUiAssessable = false
  let unavailablePersisted = false

  const persistRuntimeDiagnostics = (reason: string): void => {
    const snapshot = runtimeDiagnostics.snapshot(reason)
    diagnosticsWriteQueue = diagnosticsWriteQueue
      .then(async () => {
        await appendRuntimeDiagnosticSnapshot(
          diagnosticsStorage,
          snapshot
        )
      })
      .catch(() => undefined)
  }

  runtimeDiagnostics.record('instance_start', {
    routeKind: diagnosticRouteKind(location.href),
    visibility: document.visibilityState,
    ledgerCount: Object.keys(latestState.ledgers).length
  })

  const fingerprinter = new WebCryptoFingerprinter(latestState.installSalt)
  const persistedConversationKey = (value: string): Promise<string> =>
    anonymizeConversationKey(value, latestState.installSalt)

  let scheduleRun: (() => void) | undefined
  let latestConversationKey: string | undefined
  let conversationSession = createConversationSessionState()
  let monitoringStarted = false
  let historyScanInProgress = false
  let activeCalibrationScan: ActiveCalibrationScan | undefined
  let measurementScanInProgress = false
  let activeMeasurementScan: ActiveCalibrationScan | undefined
  let pendingTurnIntent: PendingTurnIntent | undefined
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

  const renderUiModel = (
    model: GuardUiModel,
    source: string
  ): void => {
    const assessable =
      model.measurementState === 'complete' &&
      calibrationIsUsable(model.calibrationState) &&
      model.riskState !== 'unknown'

    runtimeDiagnostics.record('ui_model', {
      source,
      assessable,
      conversationKeyPresent: Boolean(model.conversationKey),
      measurementState: model.measurementState,
      calibrationState: model.calibrationState,
      environmentConfidence: model.environmentConfidence,
      riskState: model.riskState,
      trackAvailable: model.trackAvailable,
      referencePositionScore: Math.round(
        model.referencePositionScore * 100
      ) / 100
    })

    ui.update(model)

    if (assessable && !lastUiAssessable) {
      unavailablePersisted = false
      persistRuntimeDiagnostics('ui_assessable')
    } else if (
      !assessable &&
      (lastUiAssessable || !unavailablePersisted)
    ) {
      unavailablePersisted = true
      persistRuntimeDiagnostics(
        lastUiAssessable
          ? 'ui_assessable_to_unassessable'
          : 'ui_unassessable'
      )
    }
    lastUiAssessable = assessable
  }

  const renderUnavailable = (
    source: string,
    calibrationState: CalibrationState,
    extra: Record<string, RuntimeDiagnosticValue> = {}
  ): void => {
    runtimeDiagnostics.record('ui_unavailable', {
      source,
      routeKind: diagnosticRouteKind(location.href),
      latestConversationKeyPresent: Boolean(latestConversationKey),
      latestLedgerPresent: Boolean(
        latestConversationKey &&
          latestState.ledgers[latestConversationKey]
      ),
      sessionActive: Boolean(
        conversationSession.activeConversationId
      ),
      sessionObservedFromStart: Boolean(
        conversationSession.observedFromStartConversationId
      ),
      calibrationState,
      ...extra
    })
    ui.showUnavailable(calibrationState)
    if (lastUiAssessable || !unavailablePersisted) {
      persistRuntimeDiagnostics(
        lastUiAssessable
          ? `drop:${source}`
          : `unavailable:${source}`
      )
    }
    lastUiAssessable = false
    unavailablePersisted = true
  }

  const renderCurrentUiFromState = (
    source = 'state_refresh'
  ): void => {
    const conversationKey = latestConversationKey
    if (!conversationKey) {
      renderUnavailable(
        `${source}:missing_conversation_key`,
        currentCalibrationState()
      )
      return
    }
    const generation = currentGeneration()
    const ledger = latestState.ledgers[conversationKey]
    if (!generation || !ledger) {
      renderUnavailable(
        `${source}:missing_generation_or_ledger`,
        currentCalibrationState(),
        {
          generationPresent: Boolean(generation),
          ledgerPresent: Boolean(ledger)
        }
      )
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
    renderUiModel(
      {
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
        uncertaintySources: ledger.uncertaintySources
      },
      source
    )
  }

  const renderAuthoritativeLedgerIfAvailable = (
    conversationKey: string | undefined
  ): boolean => {
    if (!conversationKey) return false
    const generation = currentGeneration()
    const ledger = latestState.ledgers[conversationKey]
    if (!generation || !ledger) return false
    if (
      !isAuthoritativeLedgerForEnvironment({
        ledger,
        generationId: generation.id,
        environmentSignature: readEnvironmentSignature(document)
      })
    ) {
      return false
    }
    latestConversationKey = conversationKey
    runtimeDiagnostics.record('authoritative_fallback', {
      routeKind: diagnosticRouteKind(location.href),
      ledgerRevision: ledger.ledgerRevision,
      coverageState: ledger.coverageState,
      parserHealth: ledger.parserHealth,
      sequenceReliability: ledger.sequenceReliability
    })
    renderCurrentUiFromState('authoritative_fallback')
    return true
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

  const pageMessagesOverlapLedger = async (
    messages: PageMessageSnapshot[],
    ledger: PersistedConversationLedger
  ): Promise<boolean> => {
    if (messages.length === 0 || ledger.messages.length === 0) return false
    const activeFingerprints = new Set(ledger.activeFingerprints)
    const ledgerMessages = ledger.messages.filter(
      (message) =>
        activeFingerprints.size === 0 ||
        activeFingerprints.has(message.fingerprint)
    )

    for (const message of messages) {
      if (message.role === 'unknown' || !message.text.trim()) continue
      const contentFingerprint = await fingerprinter.fingerprint(
        `${message.role}\u001f${message.text}`
      )
      const stableHintHash = message.stableHint
        ? await fingerprinter.fingerprint(
            `stable\u001f${message.stableHint}`
          )
        : undefined
      if (
        ledgerMessages.some(
          (existing) =>
            existing.role === message.role &&
            (existing.contentFingerprint === contentFingerprint ||
              (stableHintHash !== undefined &&
                existing.stableHintHash === stableHintHash))
        )
      ) {
        return true
      }
    }
    return false
  }

  const ui = new GuardUi({
    onCopyContinuation: () => {
      void copyText(continuationPrompt())
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
      const preliminarySnapshot = readPageSnapshot(
        document,
        location.href,
        'none'
      )
      const environmentSignature = readEnvironmentSignature(document)
      const previousSessionConversationId =
        conversationSession.activeConversationId
      const routeConversationId =
        parseConversationIdFromUrl(location.href)
      const observedConversationId =
        resolveConversationId(preliminarySnapshot)
      const resolvedConversationId =
        resolveSessionConversationId({
          activeConversationId:
            previousSessionConversationId,
          routeConversationId,
          observedConversationId
        })
      const previousSessionConversationKey =
        previousSessionConversationId
          ? await persistedConversationKey(
              `chatgpt:${previousSessionConversationId}`
            )
          : undefined
      const previousSessionLedger =
        previousSessionConversationKey
          ? latestState.ledgers[previousSessionConversationKey]
          : undefined
      const identityChanged = Boolean(
        previousSessionConversationId &&
          resolvedConversationId &&
          previousSessionConversationId !== resolvedConversationId
      )
      const sameConversationEvidence = Boolean(
        identityChanged &&
          previousSessionConversationId &&
          conversationSession.observedFromStartConversationId ===
            previousSessionConversationId &&
          previousSessionLedger &&
          (await pageMessagesOverlapLedger(
            preliminarySnapshot.messages,
            previousSessionLedger
          ))
      )
      runtimeDiagnostics.record('page_observation', {
        routeKind: diagnosticRouteKind(location.href),
        routeConversationIdPresent: Boolean(routeConversationId),
        observedConversationIdPresent: Boolean(
          observedConversationId
        ),
        resolvedConversationIdPresent: Boolean(
          resolvedConversationId
        ),
        identityChanged,
        sameConversationEvidence,
        routeMatchesSession: Boolean(
          routeConversationId &&
            conversationSession.activeConversationId &&
            routeConversationId ===
              conversationSession.activeConversationId
        ),
        observedMatchesSession: Boolean(
          observedConversationId &&
            conversationSession.activeConversationId &&
            observedConversationId ===
              conversationSession.activeConversationId
        ),
        sessionActive: Boolean(
          conversationSession.activeConversationId
        ),
        sessionObservedFromStart: Boolean(
          conversationSession.observedFromStartConversationId
        ),
        blankSurfaceObserved: Boolean(
          conversationSession.blankSurfaceObserved
        ),
        messageCount: preliminarySnapshot.messages.length,
        userCount: preliminarySnapshot.messages.filter(
          (message) => message.role === 'user'
        ).length,
        assistantCount: preliminarySnapshot.messages.filter(
          (message) => message.role === 'assistant'
        ).length
      })
      const blankConversationSurface =
        !resolvedConversationId &&
        preliminarySnapshot.messages.length === 0
      const lookupConversationId =
        resolvedConversationId ??
        conversationSession.activeConversationId
      const knownConversationKey = lookupConversationId
        ? await persistedConversationKey(
            `chatgpt:${lookupConversationId}`
          )
        : undefined
      const knownLedger = knownConversationKey
        ? latestState.ledgers[knownConversationKey]
        : undefined
      const persistedAuthoritative =
        isAuthoritativeLedgerForEnvironment({
          ledger: knownLedger,
          generationId: latestState.settings.generationId,
          environmentSignature
        })

      const nowForSession = Date.now()
      const sessionResolution = resolveConversationSession(
        conversationSession,
        {
          conversationId: resolvedConversationId,
          isBlankSurface: blankConversationSurface,
          messageCount: preliminarySnapshot.messages.length,
          hasUserMessage: preliminarySnapshot.messages.some(
            (message) => message.role === 'user'
          ),
          persistedAuthoritative,
          sameConversationEvidence,
          bridgedNewChatStartedAt:
            readNewChatStartSessionEvidence(nowForSession),
          now: nowForSession
        }
      )
      conversationSession = sessionResolution.state
      preliminarySnapshot.coverageEvidence =
        sessionResolution.coverageEvidence
      runtimeDiagnostics.record('session_resolution', {
        coverageEvidence: sessionResolution.coverageEvidence,
        activeConversationIdPresent: Boolean(
          sessionResolution.activeConversationId
        ),
        sessionActive: Boolean(
          conversationSession.activeConversationId
        ),
        sessionObservedFromStart: Boolean(
          conversationSession.observedFromStartConversationId
        ),
        blankSurfaceObserved: Boolean(
          conversationSession.blankSurfaceObserved
        ),
        persistedAuthoritative,
        identityChanged,
        sameConversationEvidence,
        identityRebound: Boolean(
          identityChanged &&
            sameConversationEvidence &&
            sessionResolution.coverageEvidence ===
              'observed_from_start'
        ),
        consumedBridgedStart:
          sessionResolution.consumedBridgedStart
      })
      if (sessionResolution.consumedBridgedStart) {
        clearNewChatStartSessionEvidence()
      }

      const activeSessionConversationKey =
        sessionResolution.activeConversationId
          ? await persistedConversationKey(
              `chatgpt:${sessionResolution.activeConversationId}`
            )
          : undefined
      const adapterResult = analyzePageSnapshot(preliminarySnapshot)
      const parserCanary = parserCanaryPasses(
        adapterResult.messages
      )
      const conversationKey = adapterResult.conversationKey
        ? await persistedConversationKey(adapterResult.conversationKey)
        : activeSessionConversationKey

      runtimeDiagnostics.record('adapter_result', {
        conversationKeyPresent: Boolean(conversationKey),
        adapterConversationKeyPresent: Boolean(
          adapterResult.conversationKey
        ),
        activeSessionKeyPresent: Boolean(
          activeSessionConversationKey
        ),
        matchesLatestConversationKey: Boolean(
          conversationKey &&
            latestConversationKey &&
            conversationKey === latestConversationKey
        ),
        health: adapterResult.health,
        coverageState: adapterResult.coverageState,
        parserCanary,
        reasons: adapterResult.reasons,
        messageCount: adapterResult.messages.length
      })

      if (
        !conversationKey ||
        adapterResult.health === 'unreliable' ||
        !parserCanary
      ) {
        if (renderAuthoritativeLedgerIfAvailable(conversationKey)) {
          return
        }
        latestConversationKey = conversationKey
        renderUnavailable(
          'process_unreadable',
          deriveCalibrationState({
            generation: currentGeneration(),
            currentEnvironment: environmentSignature
          }),
          {
            conversationKeyPresent: Boolean(conversationKey),
            adapterHealth: adapterResult.health,
            adapterCoverageState: adapterResult.coverageState,
            parserCanary,
            adapterReasons: adapterResult.reasons
          }
        )
        return
      }

      if (conversationKey !== latestConversationKey) {
        const identityRebound = Boolean(
          sameConversationEvidence &&
            previousSessionConversationKey &&
            previousSessionConversationKey === latestConversationKey
        )
        const pendingIntent = pendingTurnIntent
        if (
          identityRebound &&
          pendingIntent &&
          pendingIntent.conversationKey ===
            previousSessionConversationKey
        ) {
          pendingTurnIntent = {
            ...pendingIntent,
            conversationKey
          }
        } else if (
          pendingIntent?.conversationKey &&
          pendingIntent.conversationKey !== conversationKey
        ) {
          pendingTurnIntent = undefined
        }
        latestConversationKey = conversationKey
        if (!identityRebound) {
          completionTracker = new ResponseCompletionTracker()
        }
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
                existing.contentFingerprint ===
                  message.contentFingerprint &&
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
      runtimeDiagnostics.record('background_observation', {
        staleObservation: Boolean(response.staleObservation),
        disposition:
          response.observationDisposition ?? 'none',
        snapshotPresent: Boolean(response.snapshot),
        snapshotRevision:
          response.snapshot?.ledgerRevision ?? 0,
        snapshotCoverage:
          response.snapshot?.coverageState ?? 'none',
        snapshotParser:
          response.snapshot?.parserHealth ?? 'none',
        snapshotSequence:
          response.snapshot?.sequenceReliability ?? 'none'
      })

      if (response.staleObservation) {
        window.setTimeout(() => scheduleRun?.(), 50)
        return
      }

      let latestRisk: RiskAssessment | undefined = response.risk
      let persistedSnapshot = response.snapshot
      if (!persistedSnapshot) {
        persistedSnapshot = latestState.ledgers[conversationKey]
      }
      if (!persistedSnapshot) throw new Error('missing_persisted_snapshot')

      if (
        pendingTurnIntent &&
        newUserCount > 0 &&
        response.observationDisposition === 'committed'
      ) {
        const expectedRevision = previousLedger?.ledgerRevision ?? 0
        const sameConversation =
          !pendingTurnIntent.conversationKey ||
          pendingTurnIntent.conversationKey === conversationKey
        const validTurnStart =
          sameConversation &&
          pendingTurnIntent.generationId ===
            persistedSnapshot.generationId &&
          pendingTurnIntent.ledgerRevision === expectedRevision &&
          newUserCount === 1
        pendingTurnIntent = validTurnStart
          ? {
              ...pendingTurnIntent,
              conversationKey,
              accepted: true
            }
          : undefined
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
        pendingTurnIntent?.accepted
      ) {
        const completionResponse = await sendBackground({
          type: 'guard.recordCompletion',
          event: {
            conversationKey,
            assistantFingerprint:
              completion.candidate.assistantFingerprint,
            beforeTurnLoad: pendingTurnIntent.load,
            expectedGenerationId: persistedSnapshot.generationId,
            expectedLedgerRevision: persistedSnapshot.ledgerRevision,
            observedAt: now
          }
        })
        latestState = completionResponse.state
        latestRisk = completionResponse.risk ?? latestRisk
        pendingTurnIntent = undefined
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
      if (!generation || !ledger) {
        renderUnavailable(
          'process_missing_generation_or_ledger',
          currentCalibrationState(),
          {
            generationPresent: Boolean(generation),
            ledgerPresent: Boolean(ledger),
            conversationKeyPresent: Boolean(conversationKey)
          }
        )
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
      const effectiveRisk =
        latestRisk ??
        assessRisk({
          currentLoad: ledger.currentEstimatedLoad,
          composerDraftLoad: composerTokenEstimate,
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
      const attention = shouldDrawAttention({
        state: effectiveRisk.state,
        control
      })

      if (attention) {
        const controlResponse = await sendBackground({
          type: 'guard.updateControl',
          conversationKey,
          patch: withAlertRecorded(control, effectiveRisk.state)
        })
        latestState = controlResponse.state
      }

      const effectiveControl =
        latestState.conversationControls[conversationKey] ?? control
      const pendingFailureConfirmation =
        generation.pendingFailureConfirmations.some(
          (item) => item.conversationKey === conversationKey
        )

      renderUiModel(
        {
          conversationKey,
          measurementState,
          calibrationState,
          environmentConfidence,
          riskState: effectiveRisk.state,
          referencePositionScore:
            effectiveRisk.referencePositionScore,
          trackAvailable:
            measurementIsUsable(measurementState) &&
            calibrationIsUsable(calibrationState),
          growthReserveReady: summary.growthReserveReady,
          muted: effectiveControl.muted ?? false,
          pendingFailureConfirmation,
          uncertaintySources: ledger.uncertaintySources
        },
        'process_final'
      )

      if (pendingFailureConfirmation) {
        ui.focusPendingConfirmation()
      } else if (attention) {
        ui.drawAttention()
      }
    } catch (error) {
      runtimeDiagnostics.record('process_exception', {
        routeKind: diagnosticRouteKind(location.href),
        error: diagnosticErrorCode(error),
        latestConversationKeyPresent: Boolean(
          latestConversationKey
        ),
        sessionActive: Boolean(
          conversationSession.activeConversationId
        )
      })
      const rawConversationKey =
        rawConversationKeyFromUrl(location.href) ??
        (conversationSession.activeConversationId
          ? `chatgpt:${conversationSession.activeConversationId}`
          : undefined)
      const currentKey = rawConversationKey
        ? await persistedConversationKey(rawConversationKey)
        : latestConversationKey
      if (renderAuthoritativeLedgerIfAvailable(currentKey)) return
      renderUnavailable(
        'process_exception_no_authoritative_fallback',
        currentCalibrationState(),
        { error: diagnosticErrorCode(error) }
      )
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

    const environmentAtStart = readEnvironmentSignature(document)
    if (
      calibrationNeedsFreshGeneration({
        generation: currentGeneration(),
        currentEnvironment: environmentAtStart
      })
    ) {
      const generationResponse = await sendBackground({
        type: 'guard.startGeneration',
        reason: 'environment_change',
        observedAt: Date.now()
      })
      latestState = generationResponse.state
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
      if (
        summary?.failureReference?.quality === 'conservative' &&
        uncertaintySources.length > 0
      ) {
        ui.showScanNotice(
          t(
            'calibrationConservativeSuccess',
            'Reference established. This chat includes files, tools, or other context that cannot be measured precisely, so alerts will be more conservative.'
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
        runtimeDiagnostics.record('storage_state_refresh', {
          latestConversationKeyPresent: Boolean(
            latestConversationKey
          ),
          latestLedgerPresent: Boolean(
            latestConversationKey &&
              latestState.ledgers[latestConversationKey]
          ),
          ledgerCount: Object.keys(latestState.ledgers).length
        })
        renderCurrentUiFromState('storage_change')
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
      pendingTurnIntent &&
      now - pendingTurnIntent.capturedAt < 750
    ) {
      return true
    }

    const generationId = latestState.settings.generationId
    const conversationKey = latestConversationKey
    const ledger = conversationKey
      ? latestState.ledgers[conversationKey]
      : undefined

    if (conversationKey && ledger) {
      pendingTurnIntent = {
        conversationKey,
        generationId,
        ledgerRevision: ledger.ledgerRevision,
        load: ledger.currentEstimatedLoad,
        accepted: false,
        capturedAt: now
      }
      return true
    }

    const snapshotConversationId = resolveConversationId(snapshot)
    const recentPendingNewChatStart = Boolean(
      conversationSession.pendingNewChatStartedAt !== undefined &&
        now - conversationSession.pendingNewChatStartedAt >= 0 &&
        now - conversationSession.pendingNewChatStartedAt <=
          NEW_CHAT_START_EVIDENCE_TTL_MS
    )
    const emptyAssignedConversation = Boolean(
      snapshotConversationId &&
        !ledger &&
        snapshot.messages.length === 0
    )
    if (
      snapshot.messages.length === 0 &&
      (
        !snapshotConversationId ||
        conversationSession.blankSurfaceObserved === true ||
        recentPendingNewChatStart ||
        emptyAssignedConversation
      )
    ) {
      conversationSession = markNewChatStarted(
        conversationSession,
        now
      )
      runtimeDiagnostics.record('turn_intent_new_chat_start', {
        routeKind: diagnosticRouteKind(location.href),
        messageCount: snapshot.messages.length,
        preassignedConversationIdPresent: Boolean(
          snapshotConversationId
        ),
        sessionActive: Boolean(
          conversationSession.activeConversationId
        ),
        blankSurfaceObserved: Boolean(
          conversationSession.blankSurfaceObserved
        )
      })
      rememberNewChatStartSessionEvidence(now)
      latestConversationKey = undefined
      pendingTurnIntent = {
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

  const onSubmit = (event: SubmitEvent): void => {
    captureTurnStart(event.target)
  }

  const resetConversationNavigationState = (
    reason: string
  ): void => {
    runtimeDiagnostics.record('session_reset', {
      reason,
      routeKind: diagnosticRouteKind(location.href),
      sessionWasActive: Boolean(
        conversationSession.activeConversationId
      ),
      latestConversationKeyPresent: Boolean(
        latestConversationKey
      )
    })
    conversationSession = resetConversationSession()
    clearNewChatStartSessionEvidence()
    latestConversationKey = undefined
    pendingTurnIntent = undefined
    completionTracker = new ResponseCompletionTracker()
  }

  const armNewChatNavigationState = (reason: string): void => {
    resetConversationNavigationState(reason)
    const now = Date.now()
    conversationSession = markNewChatStarted(
      conversationSession,
      now
    )
    rememberNewChatStartSessionEvidence(now)
    runtimeDiagnostics.record('new_chat_navigation_armed', {
      reason,
      routeKind: diagnosticRouteKind(location.href),
      pendingNewChatStart: true
    })
  }

  const onPopState = (): void => {
    resetConversationNavigationState('popstate')
    scheduleRun?.()
  }

  const onClick = (event: MouseEvent): void => {
    const element =
      event.target instanceof Element ? event.target : null
    const navigationLink =
      element?.closest<HTMLAnchorElement>('a[href]')
    let newChatNavigationArmed = false
    if (
      navigationLink &&
      isConversationNavigationHref(navigationLink.href)
    ) {
      if (isBlankConversationRoute(navigationLink.href)) {
        armNewChatNavigationState('blank_navigation_link')
        newChatNavigationArmed = true
      } else {
        resetConversationNavigationState('navigation_link')
      }
    }

    const navigationControl =
      element?.closest<HTMLElement>('button, [role="button"]')
    if (
      !newChatNavigationArmed &&
      navigationControl &&
      isNewChatNavigationTarget(navigationControl)
    ) {
      armNewChatNavigationState('new_chat_control')
    }

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
    captureTurnStart(buttonElement)
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (
      event.key !== 'Enter' ||
      event.shiftKey ||
      event.isComposing
    ) {
      return
    }
    captureTurnStart(event.target)
  }

  const armNewChatFromComposerActivity = (
    target: EventTarget | null
  ): void => {
    if (!isPromptSendTarget(target)) return

    const snapshot = readPageSnapshot(
      document,
      location.href,
      'none'
    )
    const composerHasText = Boolean(
      (snapshot.composerText ?? '').trim()
    )
    const conversationKey = latestConversationKey
    const hasPersistedLedger = Boolean(
      conversationKey &&
        latestState.ledgers[conversationKey]
    )

    if (
      !shouldArmNewChatFromComposerActivity({
        messageCount: snapshot.messages.length,
        composerHasText,
        hasPersistedLedger
      })
    ) {
      return
    }

    const now = Date.now()
    conversationSession = markNewChatStarted(
      conversationSession,
      now
    )
    rememberNewChatStartSessionEvidence(now)
    if (!pendingTurnIntent) {
      pendingTurnIntent = {
        generationId: latestState.settings.generationId,
        ledgerRevision: 0,
        load: 0,
        accepted: false,
        capturedAt: now
      }
    }
    runtimeDiagnostics.record('new_chat_composer_armed', {
      routeKind: diagnosticRouteKind(location.href),
      conversationIdPresent: Boolean(
        resolveConversationId(snapshot)
      ),
      messageCount: snapshot.messages.length
    })
  }

  const onInput = (event: Event): void => {
    armNewChatFromComposerActivity(event.target)
    scheduleRun?.()
  }

  function startMonitoring(): void {
    if (monitoringStarted) return
    if (!canStartMonitoring(latestState.settings)) {
      ui.showConsentCard()
      return
    }

    monitoringStarted = true
    runtimeDiagnostics.record('monitoring_started', {
      routeKind: diagnosticRouteKind(location.href)
    })
    persistRuntimeDiagnostics('monitoring_started')
    scheduleRun = createCoalescedAsyncRunner(processPage)

    document.addEventListener('submit', onSubmit, true)
    document.addEventListener('click', onClick, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('input', onInput, true)
    window.addEventListener('popstate', onPopState)
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
        runtimeDiagnostics.record('beforeunload', {
          routeKind: diagnosticRouteKind(location.href),
          latestConversationKeyPresent: Boolean(
            latestConversationKey
          ),
          sessionActive: Boolean(
            conversationSession.activeConversationId
          )
        })
        persistRuntimeDiagnostics('beforeunload')
        activeCalibrationScan = undefined
        activeMeasurementScan = undefined
        observer.disconnect()
        mutationRunner.cancel()
        document.removeEventListener('submit', onSubmit, true)
        document.removeEventListener('click', onClick, true)
        document.removeEventListener('keydown', onKeyDown, true)
        document.removeEventListener('input', onInput, true)
        window.removeEventListener('popstate', onPopState)
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

function diagnosticRouteKind(url: string): string {
  try {
    const parsed = new URL(url, 'https://chatgpt.com')
    if (parseConversationIdFromUrl(parsed.href)) {
      return 'conversation'
    }
    if (parsed.pathname === '/' || parsed.pathname === '/chat') {
      return 'root'
    }
    if (/^\/g\/[^/]+\/?$/.test(parsed.pathname)) {
      return 'g_root'
    }
    if (parsed.pathname.startsWith('/g/')) return 'g_other'
    if (parsed.pathname.startsWith('/workspace')) return 'workspace'
    return 'other'
  } catch {
    return 'invalid'
  }
}

function diagnosticErrorCode(error: unknown): string {
  if (error instanceof Error) {
    return error.message
      .replace(/[^a-zA-Z0-9_:.-]+/g, '_')
      .slice(0, 96)
  }
  return 'unknown_error'
}

function isBlankConversationRoute(url: string): boolean {
  try {
    const parsed = new URL(url, location.href)
    if (parsed.hostname !== 'chatgpt.com') return false
    if (parsed.pathname === '/' || parsed.pathname === '/chat') {
      return true
    }
    return /^\/g\/[^/]+\/?$/.test(parsed.pathname)
  } catch {
    return false
  }
}

function isConversationNavigationHref(url: string): boolean {
  try {
    const parsed = new URL(url, location.href)
    if (parsed.hostname !== 'chatgpt.com') return false
    return Boolean(
      parseConversationIdFromUrl(parsed.href) ||
      isBlankConversationRoute(parsed.href)
    )
  } catch {
    return false
  }
}

function isNewChatNavigationTarget(
  element: HTMLElement
): boolean {
  const semantic = `${element.getAttribute('data-testid') ?? ''} ${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('title') ?? ''} ${element.textContent ?? ''}`
  return /new[-_ ]?chat|new conversation|新建聊天|新聊天|新的聊天|新建对话|新建對話|新增聊天|新增對話|開始新聊天|开始新聊天/i.test(
    semantic
  )
}

function isPromptSendTarget(target: EventTarget | null): boolean {
  const element =
    target instanceof Element ? target : null
  if (!element) return false
  const composer = findComposerElement(document)
  if (!composer) return false
  if (
    element === composer ||
    composer.contains(element) ||
    element.contains(composer)
  ) {
    return true
  }
  const form = element.closest('form')
  if (form && form.contains(composer)) return true

  let composerContainer = composer.parentElement
  for (let depth = 0; depth < 4 && composerContainer; depth += 1) {
    if (
      composerContainer !== document.body &&
      composerContainer !== document.documentElement &&
      composerContainer.contains(element)
    ) {
      return true
    }
    composerContainer = composerContainer.parentElement
  }
  return false
}

function rememberNewChatStartSessionEvidence(capturedAt: number): void {
  try {
    window.sessionStorage.setItem(
      NEW_CHAT_START_SESSION_KEY,
      String(Math.max(0, Math.floor(capturedAt)))
    )
  } catch {
    // Best-effort bridge across same-tab document navigation.
  }
}

function readNewChatStartSessionEvidence(
  now: number
): number | undefined {
  try {
    const value = window.sessionStorage.getItem(
      NEW_CHAT_START_SESSION_KEY
    )
    if (!value) return undefined
    const capturedAt = Number(value)
    const age = now - capturedAt
    if (
      !Number.isFinite(capturedAt) ||
      age < 0 ||
      age > NEW_CHAT_START_EVIDENCE_TTL_MS
    ) {
      window.sessionStorage.removeItem(
        NEW_CHAT_START_SESSION_KEY
      )
      return undefined
    }
    return capturedAt
  } catch {
    return undefined
  }
}

function clearNewChatStartSessionEvidence(): void {
  try {
    window.sessionStorage.removeItem(
      NEW_CHAT_START_SESSION_KEY
    )
  } catch {
    // Best effort only.
  }
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