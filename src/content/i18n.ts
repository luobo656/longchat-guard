export function t(key: string, fallback: string): string {
  try {
    if (typeof chrome !== 'undefined' && chrome.i18n?.getMessage) {
      const localized = chrome.i18n.getMessage(key)
      if (localized) return localized
    }
  } catch {
    // Tests and non-extension environments use the explicit fallback.
  }
  return fallback
}
