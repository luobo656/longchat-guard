import { describe, expect, it } from 'vitest'
import {
  shouldClosePanelForKey,
  shouldClosePanelForPointerPath
} from '../src/content/ui'

describe('guard UI interaction helpers', () => {
  it('closes on outside pointerdown', () => {
    const host = { name: 'host' } as unknown as EventTarget
    const outside = { name: 'page' } as unknown as EventTarget

    expect(shouldClosePanelForPointerPath([outside], host)).toBe(true)
  })

  it('does not close for Shadow DOM, pill, panel, or button pointerdown paths', () => {
    const host = { name: 'host' } as unknown as EventTarget
    const panel = { name: 'panel' } as unknown as EventTarget
    const button = { name: 'button' } as unknown as EventTarget

    expect(shouldClosePanelForPointerPath([button, panel, host], host)).toBe(false)
  })

  it('closes on Escape only', () => {
    expect(shouldClosePanelForKey('Escape')).toBe(true)
    expect(shouldClosePanelForKey('Enter')).toBe(false)
  })
})
