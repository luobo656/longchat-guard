export type CoverageState = 'complete' | 'mostly_complete' | 'incomplete' | 'unknown'
export type ParserHealth = 'healthy' | 'degraded' | 'unreliable'
export type RiskLevel = 'normal' | 'long' | 'organize' | 'high' | 'unreliable'
export type EvidenceConfidence = 'high' | 'medium' | 'low'
export type FeedbackKind = 'too_early' | 'right' | 'too_late'

export type ErrorKind =
  | 'conversation_length_limit'
  | 'model_usage_limit'
  | 'periodic_usage_limit'
  | 'rate_limit'
  | 'network_error'
  | 'file_error'
  | 'auth_error'
  | 'service_error'
  | 'safety_refusal'
  | 'unknown'

export interface MessageRecord {
  fingerprint: string
  contentFingerprint?: string
  stableHintHash?: string
  role: 'user' | 'assistant' | 'unknown'
  tokenEstimate: number
  charCount: number
  observedAt: number
  lastObservedAt?: number
  localBranchId: string
  ordinalHint?: number
  hasCode?: boolean
  attachmentCount?: number
}

export interface ObservedMessageRecord {
  contentFingerprint: string
  stableHintHash?: string
  role: 'user' | 'assistant' | 'unknown'
  tokenEstimate: number
  charCount: number
  observedAt: number
  ordinalHint?: number
  hasCode?: boolean
  attachmentCount?: number
}

export interface ConversationStats {
  conversationKey: string
  generationId: string
  highestConfirmedSafeLoad?: number
  firstConfirmedFailureLoad?: number
  currentEstimatedLoad: number
  coverageState: CoverageState
  parserHealth: ParserHealth
  updatedAt: number
}

export interface PersistedConversationLedger {
  conversationKey: string
  generationId: string
  coverageState: CoverageState
  parserHealth: ParserHealth
  messages: MessageRecord[]
  activeFingerprints: string[]
  sequenceReliability?: 'reliable' | 'uncertain'
  sequenceUncertainReason?: string
  currentEstimatedLoad: number
  lastObservedUserMessageAt?: number
  completedAssistantFingerprints?: string[]
  confirmedFailureFingerprints?: string[]
  dismissedFailureKeys?: string[]
  updatedAt: number
}

export interface ConversationBoundarySample {
  conversationKey: string
  generationId: string
  highestConfirmedSafeLoad?: number
  firstConfirmedFailureLoad?: number
  coverageState?: CoverageState
  parserHealth?: ParserHealth
  successEvidenceQuality?: 'complete' | 'partial'
  failureEvidenceQuality?: 'confirmed' | 'pending'
  firstObservedAt?: number
  lastObservedAt?: number
  updatedAt: number
}

export interface CalibrationGeneration {
  id: string
  createdAt: number
  archivedAt?: number
  warmStartedFrom?: string
  createdReason?: 'initial' | 'environment_change' | 'recalibrate' | 'auto_change'
  warmStartPrior?: WarmStartPrior
  verificationFactor?: number
  samples: ConversationBoundarySample[]
  confidence: number
  suspiciousChangeCount: number
  recentAssistantTokenCounts?: number[]
  pendingFailureConfirmations?: PendingFailureConfirmation[]
  changePointSuggested?: boolean
  feedbackBias?: number
}

export interface WarmStartPrior {
  sourceGenerationId: string
  estimatedRiskStart: number
  estimatedHighRisk: number
  confidence: number
  createdAt: number
}

export interface PendingFailureConfirmation {
  conversationKey: string
  estimatedLoad: number
  errorKind: ErrorKind
  confidence: EvidenceConfidence
  observedAt: number
}

export interface ConversationControl {
  muted?: boolean
  snoozeUntilUserTurn?: number
  lastDisplayedLevel?: RiskLevel
  lastAlertLevel?: RiskLevel
  lastAlertScore?: number
  lastAlertUserTurn?: number
}

export interface RiskInput {
  currentLoad: number
  composerLoad: number
  expectedAssistantGrowth: number
  safetyMargin: number
  coverage: CoverageState
  parserHealth: ParserHealth
  confidence: number
  safeFloor?: number
  safeFloorEvidenceReady?: boolean
  failureCeiling?: number
  estimatedRiskStart?: number
  estimatedHighRisk?: number
  suspiciousChangeCount?: number
  changePointSuggested?: boolean
  usingWarmStartPrior?: boolean
  feedbackBias?: number
}

export interface RiskAssessment {
  level: RiskLevel
  predictedNextTurnLoad: number
  score: number
  reasons: string[]
}
