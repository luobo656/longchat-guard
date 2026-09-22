export interface TokenEstimator {
  estimate(text: string): number
}

/**
 * Conservative browser-local fallback estimator.
 * It intentionally does not claim model-exact token counts.
 */
export class HeuristicTokenEstimator implements TokenEstimator {
  estimate(text: string): number {
    if (!text) return 0

    let cjk = 0
    let asciiLike = 0
    let other = 0

    for (const char of text) {
      const code = char.codePointAt(0) ?? 0
      if (
        (code >= 0x3400 && code <= 0x4dbf) ||
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0x3040 && code <= 0x30ff) ||
        (code >= 0xac00 && code <= 0xd7af)
      ) {
        cjk += 1
      } else if (code <= 0x7f) {
        asciiLike += 1
      } else {
        other += 1
      }
    }

    // Tunable fallback defaults; never an official OpenAI token formula.
    return Math.max(1, Math.ceil(cjk * 1.05 + asciiLike / 3.6 + other / 2))
  }
}
