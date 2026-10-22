import { describe, expect, it, vi } from 'vitest'
import {
  createAutoReadShield, shieldInputDecision
} from '../src/content/auto-read-shield'

function fakeMaskEnvironment() {
  const elements = new Map<string, any>()
  for (const key of ['heading', 'state', 'explanation', 'steps', 'cancel']) {
    elements.set('[data-role="' + key + '"]', {
      textContent: '', disabled: false, focus: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn()
    })
  }
  let markup = ''
  const shadow = {
    get innerHTML() { return markup },
    set innerHTML(value: string) { markup = value },
    querySelector: (selector: string) => elements.get(selector) ?? null
  }
  const root = {
    dataset: {} as Record<string,string>,
    style: { cssText: '' },
    attachShadow: vi.fn(() => shadow),
    remove: vi.fn()
  }
  const viewHandlers = new Map<string,(event: Event)=>void>()
  const documentHandlers = new Map<string,(event: Event)=>void>()
  const view = {
    addEventListener: vi.fn((type: string, handler: (event: Event)=>void) => {
      viewHandlers.set(type, handler)
    }),
    removeEventListener: vi.fn((type: string) => {
      viewHandlers.delete(type)
    })
  }
  const documentMock = {
    visibilityState: 'visible',
    createElement: vi.fn(() => root),
    documentElement: { appendChild: vi.fn() },
    addEventListener: vi.fn((type: string, handler:(event:Event)=>void) => {
      documentHandlers.set(type,handler)
    }),
    removeEventListener: vi.fn((type: string) => {
      documentHandlers.delete(type)
    })
  }
  function fire(type: string, options: {
    onButton?: boolean, key?: string
  } = {}) {
    const event = {
      type, key: options.key, cancelable: true,
      composedPath: () => options.onButton
        ? [elements.get('[data-role="cancel"]'), root]
        : [{ name: 'chat-input' }],
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn()
    }
    viewHandlers.get(type)?.(event as unknown as Event)
    return event
  }
  return {
    doc: documentMock as unknown as Document,
    view: view as unknown as Window,
    elements, root, shadow, viewHandlers, documentHandlers,
    fire, viewSpy:view, documentSpy:documentMock
  }
}

describe('CDP-compatible automatic read overlay', () => {
  it('distinguishes cancellation from blocked input and forwards CDP wheel', () => {
    expect(shieldInputDecision('wheel', undefined, false)).toBe('allow')
    expect(shieldInputDecision('click', undefined, false)).toBe('block')
    expect(shieldInputDecision('keydown', 'Enter', false)).toBe('block')
    expect(shieldInputDecision('beforeinput', undefined, false)).toBe('block')
    expect(shieldInputDecision('keydown', 'Escape', false)).toBe('cancel')
    expect(shieldInputDecision('click', undefined, true)).toBe('allow')
    expect(shieldInputDecision('keydown', 'Enter', true)).toBe('allow')
  })

  it('renders a visual veil that is transparent to scroll target hit testing', () => {
    const env = fakeMaskEnvironment()
    const onCancel = vi.fn()
    const shield = createAutoReadShield(onCancel,env.doc,env.view)
    expect(env.root.dataset.longChatAutoReadShield).toBe('true')
    expect(env.root.style.cssText).toContain('pointer-events:none')
    expect(env.shadow.innerHTML).toContain('.veil')
    expect(env.shadow.innerHTML).toContain('pointer-events:none')
    expect(env.shadow.innerHTML).toContain('.cancel')
    expect(env.shadow.innerHTML).toContain('pointer-events:auto')
    expect(env.viewHandlers.has('wheel')).toBe(false)
    expect(env.documentSpy.documentElement.appendChild).toHaveBeenCalledWith(env.root)
    expect(env.elements.get('[data-role="cancel"]').focus).toHaveBeenCalled()
    expect(shield.getStage()).toBe('up')
    shield.close()
  })

  it('blocks page pointer clicks and keyboard typing but keeps Cancel usable', () => {
    const env=fakeMaskEnvironment()
    const shield=createAutoReadShield(vi.fn(),env.doc,env.view)
    const pageClick=env.fire('click')
    expect(pageClick.preventDefault).toHaveBeenCalledOnce()
    expect(pageClick.stopImmediatePropagation).toHaveBeenCalledOnce()
    const pageKey=env.fire('keydown',{key:'a'})
    expect(pageKey.preventDefault).toHaveBeenCalledOnce()
    const pageTouch=env.fire('touchmove')
    expect(pageTouch.preventDefault).toHaveBeenCalledOnce()
    const buttonClick=env.fire('click',{onButton:true})
    expect(buttonClick.preventDefault).not.toHaveBeenCalled()
    const buttonEnter=env.fire('keydown',{key:'Enter',onButton:true})
    expect(buttonEnter.preventDefault).not.toHaveBeenCalled()
    shield.close()
  })

  it('reports stages then accepts Escape once and waits for safe cleanup', () => {
    const env=fakeMaskEnvironment()
    const onCancel=vi.fn()
    const shield=createAutoReadShield(onCancel,env.doc,env.view)
    shield.setStage('down')
    expect(shield.getStage()).toBe('down')
    shield.setStage('verify')
    expect(env.elements.get('[data-role="state"]').textContent)
      .toMatch(/check|验证|驗證/i)
    const escape=env.fire('keydown',{key:'Escape'})
    expect(escape.preventDefault).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onCancel).toHaveBeenCalledWith('user_cancelled')
    expect(shield.getStage()).toBe('stopping')
    expect(env.elements.get('[data-role="cancel"]').disabled).toBe(true)
    env.fire('keydown',{key:'Escape'})
    expect(onCancel).toHaveBeenCalledTimes(1)
    shield.setStage('save')
    expect(shield.getStage()).toBe('stopping')
    shield.close()
    expect(env.viewHandlers.size).toBe(0)
    expect(env.documentHandlers.size).toBe(0)
    expect(env.root.remove).toHaveBeenCalledOnce()
    shield.close()
    expect(env.root.remove).toHaveBeenCalledTimes(1)
  })

  it('stops on explicit cancel button and window focus loss', () => {
    const env=fakeMaskEnvironment()
    const onCancel=vi.fn()
    const shield=createAutoReadShield(onCancel,env.doc,env.view)
    const cancel=env.elements.get('[data-role="cancel"]')
    const click=cancel.addEventListener.mock.calls.find((call:unknown[])=>call[0]==='click')
    expect(click).toBeDefined()
    click?.[1]()
    expect(onCancel).toHaveBeenCalledWith('user_cancelled')
    env.viewHandlers.get('blur')?.({type:'blur'} as Event)
    expect(onCancel).toHaveBeenCalledTimes(1)
    shield.close()

    const later=fakeMaskEnvironment()
    const secondCancel=vi.fn()
    const second=createAutoReadShield(secondCancel,later.doc,later.view)
    later.viewHandlers.get('blur')?.({type:'blur'} as Event)
    expect(secondCancel).toHaveBeenCalledWith('auto_scroll_focus_lost')
    second.close()
  })

  it('disables cancellation during the final saving stage', () => {
    const env=fakeMaskEnvironment()
    const onCancel=vi.fn()
    const shield=createAutoReadShield(onCancel,env.doc,env.view)
    shield.setStage('save')
    expect(env.elements.get('[data-role="cancel"]').disabled).toBe(true)
    env.fire('keydown',{key:'Escape'})
    expect(onCancel).not.toHaveBeenCalled()
    expect(shield.getStage()).toBe('save')
    shield.close()
  })
})
