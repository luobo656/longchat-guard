export type GenerationState = 'generating' | 'idle' | 'unknown'

export interface CompletionObservation {
  assistantFingerprint?: string
  role?: 'user' | 'assistant' | 'unknown'
  contentFingerprint?: string
  tokenEstimate?: number
  observedAt: number
  generationState: GenerationState
  hasLengthError: boolean
}

export interface CompletionCandidate {
  assistantFingerprint: string
  contentFingerprint: string
  tokenEstimate: number
  firstObservedAt: number
  lastChangedAt: number
  completed: boolean
}

export type CompletionStatus =
  | { state: 'pending'; candidate?: CompletionCandidate; reason: string }
  | { state: 'completed'; candidate: CompletionCandidate }

// Product default only; not an OpenAI service signal.
export const DEFAULT_COMPLETION_STABILITY_MS = 2500

export class ResponseCompletionTracker {
  private candidate?: CompletionCandidate
  private completed = new Set<string>()

  constructor(private readonly stabilityMs = DEFAULT_COMPLETION_STABILITY_MS) {}

  observe(input: CompletionObservation): CompletionStatus {
    if (
      !input.assistantFingerprint ||
      input.role !== 'assistant' ||
      !input.contentFingerprint ||
      input.tokenEstimate === undefined
    ) {
      return pending('no_active_assistant_tail', this.candidate)
    }
    if (input.generationState === 'generating') {
      this.reset({
        assistantFingerprint: input.assistantFingerprint,
        contentFingerprint: input.contentFingerprint,
        tokenEstimate: input.tokenEstimate,
        observedAt: input.observedAt
      })
      return pending('generation_in_progress', this.candidate)
    }
    if (input.hasLengthError) {
      return pending('length_error_visible', this.candidate)
    }

    if (
      !this.candidate ||
      this.candidate.assistantFingerprint !== input.assistantFingerprint ||
      this.candidate.contentFingerprint !== input.contentFingerprint ||
      this.candidate.tokenEstimate !== input.tokenEstimate
    ) {
      this.reset({
        assistantFingerprint: input.assistantFingerprint,
        contentFingerprint: input.contentFingerprint,
        tokenEstimate: input.tokenEstimate,
        observedAt: input.observedAt
      })
      return pending('stability_window_open', this.candidate)
    }

    const stableFor = input.observedAt - this.candidate.lastChangedAt
    if (stableFor < this.stabilityMs) {
      return pending('stability_window_open', this.candidate)
    }
    if (this.completed.has(input.assistantFingerprint)) {
      return pending('already_completed', this.candidate)
    }
    const completed = { ...this.candidate, completed: true }
    this.candidate = completed
    this.completed.add(input.assistantFingerprint)
    return { state: 'completed', candidate: completed }
  }

  private reset(input: {
    assistantFingerprint: string
    contentFingerprint: string
    tokenEstimate: number
    observedAt: number
  }): void {
    this.candidate = {
      assistantFingerprint: input.assistantFingerprint,
      contentFingerprint: input.contentFingerprint,
      tokenEstimate: input.tokenEstimate,
      firstObservedAt: input.observedAt,
      lastChangedAt: input.observedAt,
      completed: false
    }
  }
}

function pending(reason: string, candidate?: CompletionCandidate): CompletionStatus {
  const result: CompletionStatus = { state: 'pending', reason }
  if (candidate) result.candidate = candidate
  return result
}
