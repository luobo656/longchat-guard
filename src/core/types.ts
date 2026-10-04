export type CoverageState = 'complete' | 'mostly_complete' | 'incomplete' | 'unknown'
export type ParserHealth = 'healthy' | 'degraded' | 'unreliable'
export type SequenceReliability = 'reliable' | 'uncertain'

export type MeasurementState = 'unavailable' | 'partial' | 'complete' | 'uncertain'
export type CalibrationState =
  | 'uncalibrated'
  | 'calibrating'
  | 'calibrated_conservative'
  | 'calibrated'
  | 'environment_unknown'
  | 'stale'
export type RiskState = 'unknown' | 'normal' | 'long' | 'organize' | 'high'
export type EnvironmentConfidence = 'verified' | 'unverified' | 'mismatch'
export type FailureReferenceQuality = 'strong' | 'conservative' | 'provisional'
export type EvidenceConfidence = 'high' | 'medium' | 'low'

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

export type UncertaintySource =
  | 'attachment'
  | 'tool_result'
  | 'web_search'
  | 'code_execution'
  | 'voice'
  | 'generated_image'
  | 'unknown_context'

export interface EnvironmentSignature {
  parserSchemaVersion: string
  measurementSchemaVersion: number
  modelHint?: string
}

export interface MessageRecord {
  fingerprint: string
  contentFingerprint?: string
  stableHintHash?: string
  role: 'user' | 'assistant' | 'unknown'
  tokenEstimate: number
  charCount?: number
  observedAt: number
  lastObservedAt?: number
  localBranchId?: string
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

export interface PersistedConversationLedger {
  conversationKey: string
  generationId: string
  ledgerRevision: number
  observationEpoch: number
  coverageState: CoverageState
  parserHealth: ParserHealth
  messages: MessageRecord[]
  activeFingerprints: string[]
  sequenceReliability: SequenceReliability
  sequenceUncertainReason?: string
  currentEstimatedLoad: number
  retainedPrefixLoad?: number
  uncertaintySources: UncertaintySource[]
  environmentSignature?: EnvironmentSignature
  completedAssistantFingerprints: string[]
  confirmedFailureFingerprints: string[]
  dismissedFailureKeys: string[]
  updatedAt: number
}

export interface CalibrationEvidenceSample {
  conversationKey: string
  generationId: string
  highestConfirmedSafeLoad?: number
  empiricalFailureLoad?: number
  failureReferenceQuality?: FailureReferenceQuality
  coverageState?: CoverageState
  parserHealth?: ParserHealth
  sequenceReliability?: SequenceReliability
  uncertaintySources?: UncertaintySource[]
  environmentSignature?: EnvironmentSignature
  firstObservedAt?: number
  lastObservedAt?: number
  updatedAt: number
}

export interface TurnGrowthSample {
  conversationKey: string
  generationId: string
  beforeLoad: number
  afterLoad: number
  delta: number
  uncertain: boolean
  uncertaintySources: UncertaintySource[]
  observedAt: number
}

export interface EmpiricalFailureReference {
  load: number
  quality: Exclude<FailureReferenceQuality, 'provisional'>
  sourceConversationCount: number
}

export interface CalibrationGeneration {
  id: string
  createdAt: number
  warmStartedFrom?: string
  createdReason?: 'initial' | 'environment_change' | 'recalibrate'
  warmStartPrior?: WarmStartPrior
  environmentSignature?: EnvironmentSignature
  samples: CalibrationEvidenceSample[]
  turnGrowthSamples: TurnGrowthSample[]
  environmentConflictKeys: string[]
  pendingFailureConfirmations: PendingFailureConfirmation[]
  changePointSuggested: boolean
}

export interface WarmStartPrior {
  sourceGenerationId: string
  safeLoad?: number
  failureReference?: {
    load: number
    quality: Exclude<FailureReferenceQuality, 'provisional'>
  }
  environmentSignature?: EnvironmentSignature
  createdAt: number
}

export interface PendingFailureConfirmation {
  conversationKey: string
  estimatedLoad: number
  errorKind: ErrorKind
  confidence: EvidenceConfidence
  coverageState?: CoverageState
  parserHealth?: ParserHealth
  sequenceReliability?: SequenceReliability
  uncertaintySources?: UncertaintySource[]
  environmentSignature?: EnvironmentSignature
  observedAt: number
}

export interface ConversationControl {
  muted?: boolean
  lastAlertState?: RiskState
  updatedAt?: number
}

export interface RiskInput {
  currentLoad: number
  composerDraftLoad: number
  measurementState: MeasurementState
  calibrationState: CalibrationState
  environmentConfidence: EnvironmentConfidence
  failureReference?: EmpiricalFailureReference
  growthReserve?: number
}

export interface RiskAssessment {
  state: RiskState
  score: number
  referencePositionScore: number
  projectedLoad: number
  reasons: string[]
}
