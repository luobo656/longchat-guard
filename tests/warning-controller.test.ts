import { describe, expect, it } from 'vitest'
import {
  shouldDrawAttention,
  withAlertRecorded
} from '../src/core/warning-controller'

describe('warning controller', () => {
  it('draws attention only for the first organize warning and later escalation', () => {
    expect(
      shouldDrawAttention({ state: 'organize', control: {} })
    ).toBe(true)

    const recorded = withAlertRecorded({}, 'organize')
    expect(
      shouldDrawAttention({
        state: 'organize',
        control: recorded
      })
    ).toBe(false)
    expect(
      shouldDrawAttention({ state: 'high', control: recorded })
    ).toBe(true)
  })

  it('does not draw attention for unknown, normal or long', () => {
    for (const state of ['unknown', 'normal', 'long'] as const) {
      expect(
        shouldDrawAttention({ state, control: {} })
      ).toBe(false)
    }
  })

  it('honors per-conversation mute', () => {
    expect(
      shouldDrawAttention({
        state: 'high',
        control: { muted: true }
      })
    ).toBe(false)
  })
})
