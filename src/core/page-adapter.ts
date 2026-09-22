import { classifyVisibleError } from './error-classifier'
import type { CoverageState, ErrorKind, EvidenceConfidence, ParserHealth } from './types'

export type AdapterRole = 'user' | 'assistant' | 'unknown'

export interface PageMessageSnapshot {
  role: AdapterRole
  text: string
  stableHint?: string
  ordinalHint: number
  semanticScore: number
  hasCode: boolean
  attachmentCount: number
}

export interface PageAdapterSnapshot {
  url: string
  title?: string
  documentText?: string
  conversationIdHints: string[]
  messages: PageMessageSnapshot[]
  composerText?: string
  visibleErrors: string[]
  generationState: 'generating' | 'idle' | 'unknown'
  coverageEvidence: 'observed_from_start' | 'persisted_complete' | 'none'
  tailEvidence: 'at_tail' | 'not_tail' | 'unknown'
}

export interface PageAdapterResult {
  supported: boolean
  conversationKey?: string
  messages: PageMessageSnapshot[]
  composerText: string
  visibleErrors: Array<{ text: string; kind: ErrorKind; confidence: EvidenceConfidence }>
  generationState: 'generating' | 'idle' | 'unknown'
  health: ParserHealth
  coverageState: CoverageState
  tailEvidence: 'at_tail' | 'not_tail' | 'unknown'
  reasons: string[]
}

export function analyzePageSnapshot(snapshot: PageAdapterSnapshot): PageAdapterResult {
  const supported = isSupportedUrl(snapshot.url)
  const conversationKey = deriveConversationKey(snapshot)
  const messages = snapshot.messages
    .filter((message) => message.text.trim().length > 0)
    .sort((a, b) => a.ordinalHint - b.ordinalHint)
  const knownRoles = messages.filter((message) => message.role !== 'unknown').length
  const averageSemanticScore =
    messages.length === 0
      ? 0
      : messages.reduce((total, message) => total + message.semanticScore, 0) / messages.length
  const visibleErrors = snapshot.visibleErrors
    .map((text) => {
      const classification = classifyVisibleError(text)
      return { text, kind: classification.kind, confidence: classification.confidence }
    })
    .filter((error) => error.text.trim().length > 0)
  const reasons: string[] = []

  if (!supported) reasons.push('unsupported_url')
  if (!conversationKey) reasons.push('missing_conversation_key')
  if (messages.length === 0) reasons.push('no_messages')
  if (messages.length > 0 && knownRoles / messages.length < 0.75) reasons.push('weak_role_detection')
  if (averageSemanticScore < 0.6 && messages.length > 0) reasons.push('weak_semantic_detection')

  const health = resolveHealth({
    supported,
    hasConversationKey: Boolean(conversationKey),
    messageCount: messages.length,
    knownRoleRatio: messages.length === 0 ? 0 : knownRoles / messages.length,
    averageSemanticScore
  })

  const result: PageAdapterResult = {
    supported,
    messages,
    composerText: snapshot.composerText ?? '',
    visibleErrors,
    generationState: snapshot.generationState,
    health,
    coverageState: resolveCoverageState(snapshot, health),
    tailEvidence: snapshot.tailEvidence,
    reasons
  }
  if (conversationKey) result.conversationKey = conversationKey
  return result
}

function deriveConversationKey(snapshot: PageAdapterSnapshot): string | undefined {
  const url = new URL(snapshot.url)
  const conversationPath = url.pathname.match(/^\/c\/([^/?#]+)/)
  if (conversationPath?.[1]) return `chatgpt:${conversationPath[1]}`

  for (const hint of snapshot.conversationIdHints) {
    const normalized = hint.trim()
    const hintPath = parseConversationIdFromUrl(normalized)
    if (hintPath) return `chatgpt:${hintPath}`
    if (/^[a-zA-Z0-9_-]{8,}$/.test(normalized)) return `chatgpt:${normalized}`
  }

  return undefined
}

export function parseConversationIdFromUrl(value: string): string | undefined {
  try {
    const url = new URL(value, 'https://chatgpt.com')
    const match = url.pathname.match(/^\/c\/([^/?#]+)/)
    return match?.[1]
  } catch {
    return undefined
  }
}

function isSupportedUrl(url: string): boolean {
  try {
    return new URL(url).hostname === 'chatgpt.com'
  } catch {
    return false
  }
}

function resolveHealth(input: {
  supported: boolean
  hasConversationKey: boolean
  messageCount: number
  knownRoleRatio: number
  averageSemanticScore: number
}): ParserHealth {
  if (!input.supported || !input.hasConversationKey) return 'unreliable'
  if (input.messageCount === 0) return 'degraded'
  if (input.knownRoleRatio >= 0.75 && input.averageSemanticScore >= 0.6) return 'healthy'
  if (input.knownRoleRatio >= 0.5) return 'degraded'
  return 'unreliable'
}

function resolveCoverageState(
  snapshot: PageAdapterSnapshot,
  health: ParserHealth
): CoverageState {
  if (health === 'unreliable') return 'unknown'
  if (
    snapshot.messages.length > 0 &&
    (snapshot.coverageEvidence === 'observed_from_start' ||
      snapshot.coverageEvidence === 'persisted_complete')
  ) {
    return 'complete'
  }
  if (snapshot.messages.length > 0) return 'incomplete'
  return 'unknown'
}
