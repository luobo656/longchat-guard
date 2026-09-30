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
  const groupedRendererMessages = readTurnKeyMessages(doc)
  if (groupedRendererMessages.length > 0) return groupedRendererMessages

  const primary = Array.from(doc.querySelectorAll<HTMLElement>('[data-message-author-role]'))
  const candidates =
    primary.length > 0
      ? primary
      : Array.from(
          doc.querySelectorAll<HTMLElement>(
            '[data-turn="user"], [data-turn="assistant"], article, [role="article"], [data-testid*="conversation-turn"]'
          )
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

function readTurnKeyMessages(doc: Document): PageMessageSnapshot[] {
  const groups = Array.from(doc.querySelectorAll<HTMLElement>('[data-turn-key]'))
  if (groups.length === 0) return []

  const messages: PageMessageSnapshot[] = []
  for (const group of groups) {
    const key = group.getAttribute('data-turn-key')?.trim()
    if (!key) continue

    const user = group.querySelector<HTMLElement>('[data-user-message-bubble]')
    const userText = user ? readText(user) : ''
    if (user && userText) {
      messages.push(messageSnapshotFromRoots(
        'user',
        userText,
        messages.length,
        `turn-key:${key}:user`,
        [user]
      ))
    }

    const assistantRoots = Array.from(
      group.querySelectorAll<HTMLElement>('[data-markdown-text-style="assistant-message"]')
    ).filter((element) => readText(element))

    let roots = assistantRoots
    let assistantText = assistantRoots.map(readText).filter(Boolean).join('\n\n')

    if (!assistantText) {
      const explicit = group.querySelector<HTMLElement>(
        '[data-message-author-role="assistant"], [data-turn="assistant"]'
      )
      const explicitText = explicit ? readText(explicit) : ''
      if (explicit && explicitText) {
        roots = [explicit]
        assistantText = explicitText
      }
    }

    if (!assistantText) {
      const marker = group.querySelector<HTMLElement>(
        '[data-conversation-role="assistant"], [data-chatgpt-agent-turn-start]'
      )
      const contentUnit = marker ? closestContentUnit(marker, group) : undefined
      const contentText = contentUnit ? readText(contentUnit) : ''
      if (contentUnit && contentText) {
        roots = [contentUnit]
        assistantText = contentText
      }
    }

    if (assistantText) {
      messages.push(messageSnapshotFromRoots(
        'assistant',
        assistantText,
        messages.length,
        `turn-key:${key}:assistant`,
        roots
      ))
    }
  }

  return messages
}

function closestContentUnit(element: HTMLElement, group: HTMLElement): HTMLElement | undefined {
  let current: HTMLElement | null = element
  while (current && current !== group) {
    if (current.hasAttribute('data-content-search-unit-key')) return current
    current = current.parentElement
  }
  return undefined
}

function messageSnapshotFromRoots(
  role: 'user' | 'assistant',
  text: string,
  ordinalHint: number,
  stableHint: string,
  roots: HTMLElement[]
): PageMessageSnapshot {
  return {
    role,
    text,
    stableHint,
    ordinalHint,
    semanticScore: 1,
    hasCode: roots.some((root) => root.querySelector('pre, code') !== null),
    attachmentCount: roots.reduce(
      (total, root) => total + root.querySelectorAll('img, [data-testid*="attachment"]').length,
      0
    )
  }
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

export function findConversationScrollContainer(doc: Document): HTMLElement | undefined {
  const explicitRoots = Array.from(
    doc.querySelectorAll<HTMLElement>('[data-app-action-timeline-scroll], .thread-scroll-container')
  )
  for (const candidate of explicitRoots) {
    if (isScrollSurface(candidate) && scrollRange(candidate) > 48 && canProgrammaticallyScroll(candidate)) {
      return candidate
    }
  }

  const messages = messageRootElements(doc)
  const first = messages[0]
  const last = messages.at(-1)
  if (first && last) {
    const candidates = collectScrollCandidates(first, last)
    const movable = candidates.find(canProgrammaticallyScroll)
    if (movable) return movable
  }

  for (const candidate of [doc.scrollingElement, doc.documentElement, doc.body]) {
    if (
      isScrollSurface(candidate) &&
      scrollRange(candidate) > 48 &&
      canProgrammaticallyScroll(candidate)
    ) {
      return candidate
    }
  }
  return undefined
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
  let fallback: HTMLElement | undefined
  while (current) {
    const range = scrollRange(current)
    if (range > 48) {
      if (isPotentiallyScrollable(current)) return current
      fallback ??= current
    }
    current = current.parentElement
  }
  return fallback
}

function collectScrollCandidates(first: HTMLElement, last: HTMLElement): HTMLElement[] {
  const candidates = new Map<HTMLElement, number>()
  let depth = 0
  let current: HTMLElement | null = last.parentElement
  while (current) {
    const range = scrollRange(current)
    if (range > 48) {
      let score = Math.min(range, 1_000_000)
      if (current.contains(first) && current.contains(last)) score += 2_000_000
      if (isPotentiallyScrollable(current)) score += 1_000_000
      if (current.tagName.toLowerCase() === 'main' || current.getAttribute('role') === 'main') {
        score += 250_000
      }
      score += Math.max(0, 50_000 - depth * 2_000)
      candidates.set(current, Math.max(candidates.get(current) ?? 0, score))
    }
    current = current.parentElement
    depth += 1
  }

  depth = 0
  current = first.parentElement
  while (current) {
    const range = scrollRange(current)
    if (range > 48) {
      let score = Math.min(range, 1_000_000)
      if (current.contains(first) && current.contains(last)) score += 2_000_000
      if (isPotentiallyScrollable(current)) score += 1_000_000
      if (current.tagName.toLowerCase() === 'main' || current.getAttribute('role') === 'main') {
        score += 250_000
      }
      score += Math.max(0, 50_000 - depth * 2_000)
      candidates.set(current, Math.max(candidates.get(current) ?? 0, score))
    }
    current = current.parentElement
    depth += 1
  }

  return Array.from(candidates.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([element]) => element)
}

function scrollRange(element: { scrollHeight: number; clientHeight: number }): number {
  return Math.max(0, element.scrollHeight - element.clientHeight)
}

function isScrollSurface(element: Element | null | undefined): element is HTMLElement {
  return Boolean(
    element &&
      typeof (element as HTMLElement).scrollTop === 'number' &&
      typeof (element as HTMLElement).scrollHeight === 'number' &&
      typeof (element as HTMLElement).clientHeight === 'number'
  )
}

function canProgrammaticallyScroll(element: HTMLElement): boolean {
  const range = scrollRange(element)
  if (range <= 48) return false
  const originalTop = element.scrollTop
  const probes = [
    Math.min(range, originalTop + 16),
    originalTop - 16
  ].filter((value, index, values) =>
    Math.abs(value - originalTop) >= 1 && values.indexOf(value) === index
  )

  try {
    for (const probeTop of probes) {
      element.scrollTop = probeTop
      if (Math.abs(element.scrollTop - originalTop) >= 1) {
        element.scrollTop = originalTop
        return true
      }
    }
    element.scrollTop = originalTop
    return false
  } catch {
    try { element.scrollTop = originalTop } catch {}
    return false
  }
}

function messageRootElements(doc: Document): HTMLElement[] {
  const grouped = Array.from(doc.querySelectorAll<HTMLElement>('[data-turn-key]'))
  if (grouped.length > 0) return removeNestedCandidates(grouped)

  const primary = Array.from(doc.querySelectorAll<HTMLElement>('[data-message-author-role]'))
  if (primary.length > 0) return removeNestedCandidates(primary)
  return removeNestedCandidates(
    Array.from(
      doc.querySelectorAll<HTMLElement>(
        '[data-turn="user"], [data-turn="assistant"], article, [role="article"], [data-testid*="conversation-turn"]'
      )
    )
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
  const dataTurn = element.getAttribute('data-turn')?.toLowerCase()
  const aria = element.getAttribute('aria-label')?.toLowerCase() ?? ''
  const testId = element.getAttribute('data-testid')?.toLowerCase() ?? ''
  const roleText = `${authorRole ?? ''} ${dataTurn ?? ''} ${aria} ${testId}`
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

  const directTestId = element.getAttribute('data-testid')?.trim()
  if (directTestId && /conversation-turn-/i.test(directTestId)) {
    return `conversation-turn:${directTestId}`
  }

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

  let current = element.parentElement
  for (let depth = 0; current && depth < 5; depth += 1, current = current.parentElement) {
    const ancestorMessageId =
      current.getAttribute('data-message-id') ??
      current.getAttribute('data-message-id-anon')
    if (ancestorMessageId?.trim()) return `ancestor-message-id:${ancestorMessageId.trim()}`

    const testId = current.getAttribute('data-testid')?.trim()
    if (testId && /conversation-turn-/i.test(testId)) {
      return `conversation-turn:${testId}`
    }
  }
  return undefined
}

function semanticScoreFor(
  element: HTMLElement,
  role: 'user' | 'assistant' | 'unknown',
  hasPrimaryCandidates: boolean
): number {
  let score = 0
  if (element.hasAttribute('data-message-author-role')) score += 0.65
  if (!hasPrimaryCandidates && /^(user|assistant)$/i.test(element.getAttribute('data-turn') ?? '')) score += 0.35
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
