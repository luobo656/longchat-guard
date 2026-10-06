export const NEW_CHAT_START_EVIDENCE_TTL_MS = 30_000

export interface ConversationSessionState {
  activeConversationId?: string
  observedFromStartConversationId?: string
  pendingNewChatStartedAt?: number
  blankSurfaceObserved?: boolean
}

export interface ConversationSessionObservation {
  conversationId?: string | undefined
  isBlankSurface: boolean
  messageCount: number
  hasUserMessage: boolean
  persistedAuthoritative: boolean
  sameConversationEvidence?: boolean | undefined
  bridgedNewChatStartedAt?: number | undefined
  now: number
}

export interface ConversationSessionResolution {
  state: ConversationSessionState
  coverageEvidence: 'observed_from_start' | 'persisted_complete' | 'none'
  activeConversationId?: string
  consumedBridgedStart: boolean
}

export function createConversationSessionState(): ConversationSessionState {
  return {}
}

export function markNewChatStarted(
  state: ConversationSessionState,
  capturedAt: number
): ConversationSessionState {
  return {
    blankSurfaceObserved: true,
    pendingNewChatStartedAt: capturedAt
  }
}

export function resetConversationSession(): ConversationSessionState {
  return {}
}

export function shouldArmNewChatFromComposerActivity(input: {
  messageCount: number
  composerHasText: boolean
  hasPersistedLedger: boolean
}): boolean {
  return (
    input.messageCount === 0 &&
    input.composerHasText &&
    !input.hasPersistedLedger
  )
}

export function resolveSessionConversationId(input: {
  activeConversationId?: string | undefined
  routeConversationId?: string | undefined
  observedConversationId?: string | undefined
}): string | undefined {
  if (input.routeConversationId) return input.routeConversationId
  if (input.activeConversationId) return input.activeConversationId
  return input.observedConversationId
}

export function resolveConversationSession(
  state: ConversationSessionState,
  observation: ConversationSessionObservation
): ConversationSessionResolution {
  const localStart = recentTimestamp(
    state.pendingNewChatStartedAt,
    observation.now
  )
  const bridgedStart = recentTimestamp(
    observation.bridgedNewChatStartedAt,
    observation.now
  )
  const pendingNewChatStartedAt = newerTimestamp(localStart, bridgedStart)

  if (observation.isBlankSurface) {
    if (state.activeConversationId) {
      const observedFromStart =
        state.observedFromStartConversationId ===
        state.activeConversationId
      return {
        state,
        activeConversationId: state.activeConversationId,
        coverageEvidence: observedFromStart
          ? 'observed_from_start'
          : observation.persistedAuthoritative
            ? 'persisted_complete'
            : 'none',
        consumedBridgedStart: false
      }
    }

    const next: ConversationSessionState = {
      blankSurfaceObserved: true,
      ...(pendingNewChatStartedAt !== undefined
        ? { pendingNewChatStartedAt }
        : {})
    }
    return {
      state: next,
      coverageEvidence: 'none',
      consumedBridgedStart: false
    }
  }

  const conversationId =
    observation.conversationId ?? state.activeConversationId

  if (!conversationId) {
    return {
      state: pendingNewChatStartedAt !== undefined
        ? { pendingNewChatStartedAt }
        : {},
      coverageEvidence: 'none',
      consumedBridgedStart: false
    }
  }

  const sameIdentity = state.activeConversationId === conversationId
  const alreadyObservedFromStart =
    state.observedFromStartConversationId === conversationId
  const canTransferObservedFromStart =
    !sameIdentity &&
    observation.sameConversationEvidence === true &&
    state.observedFromStartConversationId ===
      state.activeConversationId
  const canBindNewChatStart =
    observation.hasUserMessage &&
    (
      pendingNewChatStartedAt !== undefined ||
      state.blankSurfaceObserved === true
    )

  const observedFromStart =
    alreadyObservedFromStart ||
    canTransferObservedFromStart ||
    canBindNewChatStart

  const keepPendingStart =
    !canBindNewChatStart &&
    pendingNewChatStartedAt !== undefined &&
    observation.messageCount === 0

  const next: ConversationSessionState = {
    activeConversationId: conversationId,
    ...(observedFromStart
      ? { observedFromStartConversationId: conversationId }
      : {}),
    ...(keepPendingStart
      ? { pendingNewChatStartedAt }
      : {})
  }

  const coverageEvidence = observedFromStart
    ? 'observed_from_start'
    : observation.persistedAuthoritative
      ? 'persisted_complete'
      : 'none'

  return {
    state: next,
    activeConversationId: conversationId,
    coverageEvidence,
    consumedBridgedStart:
      Boolean(bridgedStart !== undefined && canBindNewChatStart) &&
      (!sameIdentity || !alreadyObservedFromStart)
  }
}

function recentTimestamp(
  capturedAt: number | undefined,
  now: number
): number | undefined {
  if (capturedAt === undefined || !Number.isFinite(capturedAt)) {
    return undefined
  }
  const age = now - capturedAt
  return age >= 0 && age <= NEW_CHAT_START_EVIDENCE_TTL_MS
    ? capturedAt
    : undefined
}

function newerTimestamp(
  left: number | undefined,
  right: number | undefined
): number | undefined {
  if (left === undefined) return right
  if (right === undefined) return left
  return Math.max(left, right)
}