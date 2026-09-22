import {
  archiveGeneration,
  createGeneration,
  reactivateGeneration
} from './calibration'
import type { PersistedState } from './storage'
import type { CalibrationGeneration } from './types'

export type NewGenerationReason = Extract<
  NonNullable<CalibrationGeneration['createdReason']>,
  'environment_change' | 'recalibrate' | 'auto_change'
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

  const generations = current
    ? state.generations.map((generation) =>
        generation.id === current.id
          ? archiveGeneration(generation, now)
          : generation
      )
    : [...state.generations]

  return {
    ...state,
    settings: { ...state.settings, generationId: id },
    generations: [...generations, next]
  }
}

export function restoreGeneration(
  state: PersistedState,
  generationId: string,
  now: number
): PersistedState {
  const target = state.generations.find(
    (generation) => generation.id === generationId
  )
  if (!target) throw new Error('generation_not_found')
  if (state.settings.generationId === generationId) return state

  const currentId = state.settings.generationId
  const generations = state.generations.map((generation) => {
    if (generation.id === generationId) return reactivateGeneration(generation)
    if (generation.id === currentId) return archiveGeneration(generation, now)
    return generation
  })

  return {
    ...state,
    settings: { ...state.settings, generationId },
    generations
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
