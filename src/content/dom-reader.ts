import {
  parseConversationIdFromUrl,
  type PageAdapterSnapshot,
  type PageMessageSnapshot
} from '../core/page-adapter'

export function readPageSnapshot(
  doc: Document,
  url: string,
  coverageEvidence: PageAdapterSnapshot['coverageEvidence']
): PageAdapterSnapshot {
  return {
    url,
    title: doc.title,
    documentText: '',
    conversationIdHints: readConversationHints(doc, url),
    messages: readMessages(doc),
    composerText: readComposerText(doc),
    visibleErrors: readVisibleErrors(doc),
    generationState: readGenerationState(doc),
    coverageEvidence,
    tailEvidence: readTailEvidence(doc)
  }
}

export function readConversationHints(doc: Document, url: string): string[] {
  const hints: string[] = []
  const pathId = parseConversationIdFromUrl(url)
  if (pathId) hints.push(pathId)

  const canonical = doc.querySelector<HTMLAnchorElement>('link[rel="canonical"]')
  if (canonical?.href) {
    const canonicalId = parseConversationIdFromUrl(canonical.href)
    if (canonicalId) hints.push(canonicalId)
  }

  for (const element of doc.querySelectorAll<HTMLElement>('[data-conversation-id]')) {
    const value = element.getAttribute('data-conversation-id')?.trim()
    if (value) hints.push(value)
  }

  return Array.from(new Set(hints))
}

export function readMessages(doc: Document): PageMessageSnapshot[] {
  const primary = Array.from(doc.querySelectorAll<HTMLElement>('[data-message-author-role]'))
  const candidates =
    primary.length > 0
      ? primary
      : Array.from(
          doc.querySelectorAll<HTMLElement>('article, [role="article"], [data-testid*="conversation-turn"]')
        )
  const deduped = removeNestedCandidates(candidates)
  const messages: PageMessageSnapshot[] = []

  deduped.forEach((element, index) => {
    const text = readText(element)
    if (!text) return
    const role = readRole(element)
    const semanticScore = semanticScoreFor(element, role, primary.length > 0)
    if (semanticScore < 0.35) return
    const messageSnapshot: PageMessageSnapshot = {
      role,
      text,
      ordinalHint: index,
      semanticScore,
      hasCode: element.querySelector('pre, code') !== null,
      attachmentCount: element.querySelectorAll('img, [data-testid*="attachment"]').length
    }
    const stableHint = readStableMessageHint(element)
    if (stableHint) messageSnapshot.stableHint = stableHint
    messages.push(messageSnapshot)
  })

  return messages
}

export function readComposerText(doc: Document): string {
  const selectors = [
    '#prompt-textarea',
    '[data-testid="prompt-textarea"]',
    '[aria-label*="Message ChatGPT" i]',
    '[aria-label*="Ask ChatGPT" i]'
  ]
  const prompt = doc.querySelector<HTMLElement>(selectors.join(', '))
  if (prompt) return readEditableText(prompt)

  const generic = Array.from(doc.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"], [role="textbox"]'))
    .find((element) => {
      const label = `${element.id} ${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('placeholder') ?? ''}`
      return /prompt|message chatgpt|ask chatgpt|send a message/i.test(label)
    })
  return generic ? readEditableText(generic) : ''
}

export function readVisibleErrors(doc: Document): string[] {
  return Array.from(doc.querySelectorAll<HTMLElement>('[role="alert"], [data-testid*="toast"]'))
    .map(readText)
    .filter(Boolean)
}

export function readGenerationState(doc: Document): 'generating' | 'idle' | 'unknown' {
  const controls = Array.from(
    doc.querySelectorAll<HTMLElement>('button, [role="button"], [data-testid]')
  )
  if (
    controls.some((element) => {
      const semantic = `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('data-testid') ?? ''} ${readText(element)}`
      return /stop generating|stop response|停止生成|停止回答/i.test(semantic)
    })
  ) {
    return 'generating'
  }
  return 'unknown'
}

export function readTailEvidence(doc: Document): 'at_tail' | 'not_tail' | 'unknown' {
  const messages = messageRootElements(doc)
  const lastMessage = messages.at(-1)
  if (!lastMessage) return 'unknown'
  return tailEvidenceFromMessageRoot(lastMessage)
}

export function tailEvidenceFromMessageRoot(messageRoot: HTMLElement): 'at_tail' | 'not_tail' | 'unknown' {
  const scrolling = findScrollableAncestor(messageRoot)
  if (!scrolling) return 'unknown'
  const remaining = scrolling.scrollHeight - scrolling.clientHeight - scrolling.scrollTop
  if (!Number.isFinite(remaining)) return 'unknown'
  return remaining <= 24 ? 'at_tail' : 'not_tail'
}

export function findScrollableAncestor(element: HTMLElement): HTMLElement | undefined {
  let current = element.parentElement
  while (current) {
    const scrollRange = current.scrollHeight - current.clientHeight
    if (scrollRange > 48 && isPotentiallyScrollable(current)) return current
    current = current.parentElement
  }
  return undefined
}

function messageRootElements(doc: Document): HTMLElement[] {
  const primary = Array.from(doc.querySelectorAll<HTMLElement>('[data-message-author-role]'))
  if (primary.length > 0) return removeNestedCandidates(primary)
  return removeNestedCandidates(
    Array.from(doc.querySelectorAll<HTMLElement>('article, [role="article"], [data-testid*="conversation-turn"]'))
  )
}

function isPotentiallyScrollable(element: HTMLElement): boolean {
  const style =
    typeof getComputedStyle === 'function'
      ? getComputedStyle(element)
      : undefined
  const overflowY = style?.overflowY ?? element.style?.overflowY ?? ''
  if (!overflowY) return true
  return /(auto|scroll|overlay)/i.test(overflowY)
}

function removeNestedCandidates(candidates: HTMLElement[]): HTMLElement[] {
  return candidates.filter((candidate) => {
    return !candidates.some((other) => other !== candidate && other.contains(candidate))
  })
}

function readRole(element: HTMLElement): 'user' | 'assistant' | 'unknown' {
  const authorRole = element.getAttribute('data-message-author-role')?.toLowerCase()
  const aria = element.getAttribute('aria-label')?.toLowerCase() ?? ''
  const testId = element.getAttribute('data-testid')?.toLowerCase() ?? ''
  const roleText = `${authorRole ?? ''} ${aria} ${testId}`
  if (/\buser\b|you|human/.test(roleText)) return 'user'
  if (/assistant|chatgpt|gpt/.test(roleText)) return 'assistant'
  return 'unknown'
}

function readStableMessageHint(element: HTMLElement): string | undefined {
  const direct =
    element.getAttribute('data-message-id') ??
    element.getAttribute('data-message-id-anon') ??
    undefined
  if (direct) return `data-message-id:${direct}`

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase()
    if (
      name.startsWith('data-') &&
      name.includes('message') &&
      name.includes('id') &&
      attribute.value.trim()
    ) {
      return `${name}:${attribute.value.trim()}`
    }
  }

  const id = element.id.trim()
  if (/message/i.test(id) && !/conversation-turn/i.test(id)) return `id:${id}`
  return undefined
}

function semanticScoreFor(
  element: HTMLElement,
  role: 'user' | 'assistant' | 'unknown',
  hasPrimaryCandidates: boolean
): number {
  let score = 0
  if (element.hasAttribute('data-message-author-role')) score += 0.65
  if (!hasPrimaryCandidates && element.matches('article, [role="article"]')) score += 0.35
  if (!hasPrimaryCandidates && element.getAttribute('data-testid')?.includes('conversation-turn')) score += 0.25
  if (role !== 'unknown') score += 0.2
  return Math.min(1, score)
}

function readEditableText(element: HTMLElement): string {
  const tagName = element.tagName.toLowerCase()
  if (tagName === 'textarea' || tagName === 'input') {
    return ((element as HTMLTextAreaElement | HTMLInputElement).value ?? '').trim()
  }
  return readText(element)
}

function readText(element: Element): string {
  return ((element as HTMLElement).innerText || element.textContent || '').trim()
}
