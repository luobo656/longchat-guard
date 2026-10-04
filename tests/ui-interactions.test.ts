import { describe, expect, it } from 'vitest'
import {
  overflowMenuPosition,
  shouldClosePanelForKey,
  shouldClosePanelForPointerPath
} from '../src/content/ui'

describe('guard UI interaction helpers', () => {
  it('closes on outside pointerdown', () => {
    const host = { name: 'host' } as unknown as EventTarget
    const outside = { name: 'page' } as unknown as EventTarget

    expect(
      shouldClosePanelForPointerPath([outside], host)
    ).toBe(true)
  })

  it('does not close for Shadow DOM, pill, panel, or button pointerdown paths', () => {
    const host = { name: 'host' } as unknown as EventTarget
    const panel = { name: 'panel' } as unknown as EventTarget
    const button = { name: 'button' } as unknown as EventTarget

    expect(
      shouldClosePanelForPointerPath(
        [button, panel, host],
        host
      )
    ).toBe(false)
  })

  it('closes on Escape only', () => {
    expect(shouldClosePanelForKey('Escape')).toBe(true)
    expect(shouldClosePanelForKey('Enter')).toBe(false)
  })

  it('anchors the menu to the trigger and prefers above the risk card when space exists', () => {
    const position = overflowMenuPosition(
      1440,
      900,
      {
        left: 1368,
        right: 1396,
        top: 112,
        bottom: 138
      },
      { width: 190, height: 78 }
    )

    expect(position.left).toBe(1206)
    expect(position.top).toBe(26)
  })

  it('keeps the menu inside the viewport and falls below when above space is insufficient', () => {
    const position = overflowMenuPosition(
      360,
      640,
      {
        left: 296,
        right: 324,
        top: 92,
        bottom: 118
      },
      { width: 190, height: 78 }
    )

    expect(position.left).toBeGreaterThanOrEqual(8)
    expect(position.left + 190).toBeLessThanOrEqual(352)
    expect(position.top).toBe(126)
    expect(position.top + 78).toBeLessThanOrEqual(632)
  })
})
