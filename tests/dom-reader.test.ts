import { describe, expect, it } from 'vitest'
import {
  findConversationScrollContainer,
  readComposerText,
  readConversationHints,
  readGenerationState,
  readMessages,
  readPageSnapshot,
  readTailEvidence
} from '../src/content/dom-reader'

describe('chatgpt DOM reader', () => {
  it('does not duplicate nested message candidates', () => {
    const doc = fakeDocument([
      el('article', {}, [
        el('div', { 'data-message-author-role': 'user' }, [], 'hello'),
        el('div', { 'data-message-author-role': 'assistant' }, [], 'world')
      ])
    ])

    const messages = readMessages(doc as unknown as Document)

    expect(messages).toHaveLength(2)
    expect(messages.map((message) => message.text)).toEqual(['hello', 'world'])
  })

  it('reads current data-turn sections when author-role attributes are absent', () => {
    const doc = fakeDocument([
      el('section', { 'data-turn': 'user' }, [], 'hello'),
      el('section', { 'data-turn': 'assistant' }, [], 'world')
    ])

    const messages = readMessages(doc as unknown as Document)

    expect(messages.map((message) => [message.role, message.text])).toEqual([
      ['user', 'hello'],
      ['assistant', 'world']
    ])
  })

  it('reads the grouped data-turn-key renderer without mixing user and assistant text', () => {
    const user = el('div', { 'data-user-message-bubble': '' }, [], 'hello')
    const assistant = el(
      'div',
      { 'data-markdown-text-style': 'assistant-message' },
      [],
      'world'
    )
    const marker = el('h4', { 'data-conversation-role': 'assistant' })
    const answer = el('div', { 'data-content-search-unit-key': 'answer' }, [marker, assistant])
    const group = el('div', { 'data-turn-key': 'turn-abc' }, [user, answer])
    const doc = fakeDocument([group])

    const messages = readMessages(doc as unknown as Document)

    expect(messages.map((message) => [message.role, message.text, message.stableHint])).toEqual([
      ['user', 'hello', 'turn-key:turn-abc:user'],
      ['assistant', 'world', 'turn-key:turn-abc:assistant']
    ])
  })

  it('uses an assistant content unit when the grouped renderer has only a role marker', () => {
    const marker = el('h4', { 'data-conversation-role': 'assistant' })
    const paragraph = el('p', {}, [], 'answer text')
    const answer = el('div', { 'data-content-search-unit-key': 'answer' }, [marker, paragraph])
    const group = el('div', { 'data-turn-key': 'turn-only-assistant' }, [answer])
    const doc = fakeDocument([group])

    expect(readMessages(doc as unknown as Document).map((message) => [message.role, message.text])).toEqual([
      ['assistant', 'answer text']
    ])
  })

  it('does not treat conversation-turn data-testid as a conversation id', () => {
    const doc = fakeDocument([
      el('div', { 'data-testid': 'conversation-turn-3' }, [], 'message')
    ])

    expect(readConversationHints(doc as unknown as Document, 'https://chatgpt.com/')).toEqual([])
  })

  it('extracts canonical conversation ids only from /c/id paths', () => {
    const doc = fakeDocument([
      el('link', { rel: 'canonical', href: 'https://chatgpt.com/c/canonical123?x=1' }),
      el('div', { 'data-conversation-id': 'explicit456' })
    ])

    expect(readConversationHints(doc as unknown as Document, 'https://chatgpt.com/')).toEqual([
      'canonical123',
      'explicit456'
    ])
  })

  it('keeps directly opened /c/id incomplete', () => {
    const doc = fakeDocument([
      el('div', { 'data-message-author-role': 'assistant' }, [], 'older visible tail')
    ])

    const snapshot = readPageSnapshot(doc as unknown as Document, 'https://chatgpt.com/c/existing123', 'none')

    expect(snapshot.conversationIdHints).toEqual(['existing123'])
    expect(snapshot.coverageEvidence).toBe('none')
  })

  it('carries blank-start lifecycle evidence after navigation to /c/id', () => {
    const doc = fakeDocument([
      el('div', { 'data-message-author-role': 'user' }, [], 'new conversation first message')
    ])

    const snapshot = readPageSnapshot(
      doc as unknown as Document,
      'https://chatgpt.com/c/new123456',
      'observed_from_start'
    )

    expect(snapshot.conversationIdHints).toEqual(['new123456'])
    expect(snapshot.coverageEvidence).toBe('observed_from_start')
  })

  it('does not let a generic sidebar textbox override the prompt composer', () => {
    const doc = fakeDocument([
      el('div', { role: 'textbox', 'aria-label': 'Search chats' }, [], 'sidebar search'),
      el('div', { id: 'prompt-textarea', contenteditable: 'true' }, [], 'real prompt')
    ])

    expect(readComposerText(doc as unknown as Document)).toBe('real prompt')
  })

  it('detects stop-generation control semantically', () => {
    const doc = fakeDocument([
      el('button', { 'aria-label': 'Stop generating' }, [], '')
    ])

    expect(readGenerationState(doc as unknown as Document)).toBe('generating')
  })

  it('returns unknown when only the document would appear non-scrollable', () => {
    const doc = fakeDocument([
      el('div', { 'data-message-author-role': 'assistant' }, [], 'tail')
    ])

    expect(readTailEvidence(doc as unknown as Document)).toBe('unknown')
  })

  it('detects at-tail from a real scrollable message ancestor', () => {
    const message = el('div', { 'data-message-author-role': 'assistant' }, [], 'tail')
    const scroll = el('div', {}, [message])
    scroll.scrollHeight = 1000
    scroll.clientHeight = 500
    scroll.scrollTop = 500
    const doc = fakeDocument([scroll])

    expect(readTailEvidence(doc as unknown as Document)).toBe('at_tail')
  })

  it('detects not-tail from a real scrollable message ancestor', () => {
    const message = el('div', { 'data-message-author-role': 'assistant' }, [], 'tail')
    const scroll = el('div', {}, [message])
    scroll.scrollHeight = 1000
    scroll.clientHeight = 500
    scroll.scrollTop = 100
    const doc = fakeDocument([scroll])

    expect(readTailEvidence(doc as unknown as Document)).toBe('not_tail')
  })

  it('can use a message ancestor with scroll range even when overflow style is nonstandard', () => {
    const message = el('div', { 'data-message-author-role': 'assistant' }, [], 'tail')
    const scroll = el('div', {}, [message])
    scroll.scrollHeight = 1800
    scroll.clientHeight = 600
    scroll.scrollTop = 600
    scroll.style.overflowY = 'visible'
    const doc = fakeDocument([scroll])

    expect(findConversationScrollContainer(doc as unknown as Document)).toBe(scroll)
  })

  it('does not select an unrelated scrollable sidebar when it is not an ancestor of messages', () => {
    const message = el('div', { 'data-message-author-role': 'assistant' }, [], 'tail')
    const messageLayer = el('div', {}, [message])
    const sidebar = el('nav', { class: 'overflow-y-auto' }, [])
    sidebar.scrollHeight = 3200
    sidebar.clientHeight = 800
    sidebar.scrollTop = 1200
    const main = el('main', {}, [messageLayer])
    const doc = fakeDocument([sidebar, main])

    expect(findConversationScrollContainer(doc as unknown as Document)).toBeUndefined()
    expect(sidebar.scrollTop).toBe(1200)
  })

  it('prefers the explicit ChatGPT timeline scroll root over unrelated scrollable regions', () => {
    const turn = el('div', { 'data-turn-key': 'turn-1' }, [], 'hello')
    const timeline = el('div', { 'data-app-action-timeline-scroll': '' }, [turn])
    timeline.scrollHeight = 2600
    timeline.clientHeight = 800
    timeline.scrollTop = 0
    const sidebar = el('nav', { class: 'overflow-y-auto' }, [])
    sidebar.scrollHeight = 5000
    sidebar.clientHeight = 800
    sidebar.scrollTop = 1500
    const doc = fakeDocument([sidebar, timeline])

    expect(findConversationScrollContainer(doc as unknown as Document)).toBe(timeline)
    expect(sidebar.scrollTop).toBe(1500)
  })

  it('uses a conversation-turn test id on the message element as a stable hint', () => {
    const turn = el('article', { 'data-testid': 'conversation-turn-17' }, [], 'hello')
    const doc = fakeDocument([turn])

    expect(readMessages(doc as unknown as Document)[0]?.stableHint).toBe(
      'conversation-turn:conversation-turn-17'
    )
  })

  it('uses a conversation-turn ancestor as a stable message hint', () => {
    const message = el('div', { 'data-message-author-role': 'assistant' }, [], 'hello')
    const turn = el('article', { 'data-testid': 'conversation-turn-42' }, [message])
    const doc = fakeDocument([turn])

    expect(readMessages(doc as unknown as Document)[0]?.stableHint).toBe(
      'conversation-turn:conversation-turn-42'
    )
  })
})

class FakeElement {
  readonly parent?: FakeElement
  scrollHeight = 0
  clientHeight = 0
  scrollTop = 0
  readonly style: { overflowY?: string } = {}

  constructor(
    readonly tagName: string,
    private readonly attrs: Record<string, string>,
    readonly children: FakeElement[] = [],
    readonly textContent = ''
  ) {
    for (const child of children) {
      Object.defineProperty(child, 'parent', { value: this })
    }
  }

  get id(): string {
    return this.attrs.id ?? ''
  }

  get innerText(): string {
    const childText = this.children.map((child) => child.innerText).join('')
    return `${this.textContent}${childText}`
  }

  get value(): string {
    return this.attrs.value ?? this.textContent
  }

  get href(): string {
    return this.attrs.href ?? ''
  }

  get attributes(): Array<{ name: string; value: string }> {
    return Object.entries(this.attrs).map(([name, value]) => ({ name, value }))
  }

  get parentElement(): FakeElement | undefined {
    return this.parent
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null
  }

  hasAttribute(name: string): boolean {
    return Object.hasOwn(this.attrs, name)
  }

  contains(other: FakeElement): boolean {
    return this === other || this.children.some((child) => child.contains(other))
  }

  matches(selector: string): boolean {
    return selector.split(',').some((part) => matchesSingleSelector(this, part.trim()))
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null
  }

  querySelectorAll(selector: string): FakeElement[] {
    return descendantsOf(this).filter((element) => element.matches(selector))
  }
}

class FakeDocument {
  readonly title = ''
  readonly body: FakeElement

  constructor(children: FakeElement[]) {
    this.body = el('body', {}, children)
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null
  }

  querySelectorAll(selector: string): FakeElement[] {
    return descendantsOf(this.body).filter((element) => element.matches(selector))
  }
}

function fakeDocument(children: FakeElement[]): FakeDocument {
  return new FakeDocument(children)
}

function el(
  tagName: string,
  attrs: Record<string, string> = {},
  children: FakeElement[] = [],
  textContent = ''
): FakeElement {
  return new FakeElement(tagName.toUpperCase(), attrs, children, textContent)
}

function descendantsOf(root: FakeElement): FakeElement[] {
  return root.children.flatMap((child) => [child, ...descendantsOf(child)])
}

function matchesSingleSelector(element: FakeElement, selector: string): boolean {
  if (selector.startsWith('#')) return element.id === selector.slice(1)
  const tagWithAttribute = selector.match(/^([a-zA-Z0-9-]+)(\[.+\])$/)
  if (tagWithAttribute?.[1] && tagWithAttribute[2]) {
    return (
      element.tagName.toLowerCase() === tagWithAttribute[1].toLowerCase() &&
      matchesSingleSelector(element, tagWithAttribute[2])
    )
  }
  if (!selector.startsWith('[')) return element.tagName.toLowerCase() === selector.toLowerCase()

  const exact = selector.match(/^\[([^=\]]+)="([^"]+)"(?: i)?\]$/)
  if (exact?.[1] && exact[2]) {
    return (element.getAttribute(exact[1]) ?? '').toLowerCase() === exact[2].toLowerCase()
  }

  const contains = selector.match(/^\[([^\]]+)\*="([^"]+)"(?: i)?\]$/)
  if (contains?.[1] && contains[2]) {
    return (element.getAttribute(contains[1]) ?? '').toLowerCase().includes(contains[2].toLowerCase())
  }

  const exists = selector.match(/^\[([^\]]+)\]$/)
  return Boolean(exists?.[1] && element.hasAttribute(exists[1]))
}
