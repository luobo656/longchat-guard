import type { PageMessageSnapshot } from '../core/page-adapter'
import type { EnvironmentSignature, UncertaintySource } from '../core/types'

export const PARSER_SCHEMA_VERSION = 'chatgpt-dom-2026-10-v3'
export const MEASUREMENT_SCHEMA_VERSION = 2

export function parserCanaryPasses(
  messages: PageMessageSnapshot[]
): boolean {
  if (messages.length === 0) return false
  const knownRoles = messages.filter(
    (message) =>
      message.role === 'user' || message.role === 'assistant'
  ).length
  const averageSemanticScore =
    messages.reduce(
      (total, message) => total + message.semanticScore,
      0
    ) / messages.length
  return (
    knownRoles / messages.length >= 0.9 &&
    averageSemanticScore >= 0.6
  )
}

export function readEnvironmentSignature(doc: Document): EnvironmentSignature {
  const modelHint = readModelHint(doc)
  return {
    parserSchemaVersion: PARSER_SCHEMA_VERSION,
    measurementSchemaVersion: MEASUREMENT_SCHEMA_VERSION,
    ...(modelHint ? { modelHint } : {})
  }
}

export function detectUncertaintySources(doc: Document): UncertaintySource[] {
  const sources = new Set<UncertaintySource>()

  if (
    doc.querySelector(
      '[data-testid*="attachment" i], [data-testid*="file-pill" i], [aria-label*="attached" i]'
    )
  ) {
    sources.add('attachment')
  }

  const toolText = Array.from(
    doc.querySelectorAll<HTMLElement>(
      '[data-message-author-role="tool"], [data-testid*="tool-result" i], [data-testid*="tool-call" i], [data-testid*="web-result" i], [data-testid*="search-result" i], [data-testid*="code-output" i], [data-testid*="voice-message" i], [data-testid*="generated-image" i]'
    )
  )
    .map((element) => `${element.getAttribute('data-testid') ?? ''} ${element.getAttribute('aria-label') ?? ''}`)
    .join(' ')

  if (/web.?search|browse|search/i.test(toolText)) sources.add('web_search')
  if (/code|python|analysis tool/i.test(toolText)) sources.add('code_execution')
  if (/voice|audio/i.test(toolText)) sources.add('voice')
  if (/image.?gen|generated.?image/i.test(toolText)) sources.add('generated_image')
  if (/tool/i.test(toolText)) sources.add('tool_result')

  return [...sources]
}

function readModelHint(doc: Document): string | undefined {
  const candidates = Array.from(
    doc.querySelectorAll<HTMLElement>(
      '[data-testid="model-switcher-dropdown-button"], [data-testid*="model-switcher" i]'
    )
  )
  for (const candidate of candidates) {
    const text = (candidate.innerText || candidate.textContent || '').trim()
    if (!text || text.length > 80) continue
    return text.replace(/\s+/g, ' ')
  }
  return undefined
}
