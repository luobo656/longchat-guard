export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(clamp(p, 0, 1) * sorted.length) - 1)
  )
  return sorted[index] ?? 0
}

export function expectedAssistantGrowth(
  recentAssistantTokenCounts: number[],
  fallback: number
): number {
  if (recentAssistantTokenCounts.length < 3) return fallback
  return percentile(recentAssistantTokenCounts.slice(-12), 0.9)
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
