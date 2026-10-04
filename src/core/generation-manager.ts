import { createGeneration } from './calibration'
import type { PersistedState } from './storage'
import type { CalibrationGeneration } from './types'

export type NewGenerationReason = Extract<
  NonNullable<CalibrationGeneration['createdReason']>,
  'environment_change' | 'recalibrate'
>

export function startNewGeneration(
  state: PersistedState,
  reason: NewGenerationReason,
  now: number
): PersistedState {
  const current = getCurrentGeneration(state)
  const id = createGenerationId(now, state.generations.length + 1)
  const next = createGeneration(id, now, current)
  next.createdReason = reason

  return {
    ...state,
    settings: { ...state.settings, generationId: id },
    generations: [next]
  }
}

export function clearLearningData(
  state: PersistedState,
  now: number
): PersistedState {
  const id = createGenerationId(now, 1)
  const generation = createGeneration(id, now)
  generation.createdReason = 'initial'

  return {
    ...state,
    settings: { ...state.settings, generationId: id },
    generations: [generation],
    ledgers: {},
    conversationControls: {}
  }
}

export function getCurrentGeneration(
  state: PersistedState
): CalibrationGeneration | undefined {
  return (
    state.generations.find(
      (generation) => generation.id === state.settings.generationId
    ) ?? state.generations[0]
  )
}

function createGenerationId(now: number, ordinal: number): string {
  return `generation-${now.toString(36)}-${ordinal}`
}
