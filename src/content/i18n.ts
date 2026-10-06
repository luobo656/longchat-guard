import en from '../../public/_locales/en/messages.json'
import zhCN from '../../public/_locales/zh_CN/messages.json'
import zhTW from '../../public/_locales/zh_TW/messages.json'

type FallbackLocale = 'en' | 'zh_CN' | 'zh_TW'
type MessageCatalog = Record<string, { message?: string }>

const catalogs: Record<FallbackLocale, MessageCatalog> = {
  en,
  zh_CN: zhCN,
  zh_TW: zhTW
}

const messageCache = new Map<string, string>()

export function t(key: string, fallback: string): string {
  const cached = messageCache.get(key)
  if (cached) return cached

  try {
    if (typeof chrome !== 'undefined' && chrome.i18n?.getMessage) {
      const localized = chrome.i18n.getMessage(key)
      if (localized) {
        messageCache.set(key, localized)
        return localized
      }
    }
  } catch {
    // A reloaded unpacked extension can invalidate the old content-script
    // i18n bridge. Fall through to the bundled locale catalog instead of
    // switching visible UI copy back to English.
  }

  const locale = resolveFallbackLocale([
    readChromeUiLanguage(),
    readDocumentLanguage(),
    readNavigatorLanguage()
  ])
  const localizedFallback = catalogs[locale][key]?.message
  if (localizedFallback) {
    messageCache.set(key, localizedFallback)
    return localizedFallback
  }

  return fallback
}

export function resolveFallbackLocale(
  candidates: Array<string | undefined>
): FallbackLocale {
  for (const candidate of candidates) {
    const normalized = candidate?.trim().replace('_', '-').toLowerCase()
    if (!normalized) continue
    if (
      normalized === 'zh-tw' ||
      normalized === 'zh-hk' ||
      normalized === 'zh-mo' ||
      normalized.startsWith('zh-hant')
    ) {
      return 'zh_TW'
    }
    if (
      normalized === 'zh' ||
      normalized === 'zh-cn' ||
      normalized === 'zh-sg' ||
      normalized.startsWith('zh-hans')
    ) {
      return 'zh_CN'
    }
    if (normalized.startsWith('en')) return 'en'
  }
  return 'en'
}

export function resetI18nCacheForTests(): void {
  messageCache.clear()
}

function readChromeUiLanguage(): string | undefined {
  try {
    if (
      typeof chrome !== 'undefined' &&
      chrome.i18n?.getUILanguage
    ) {
      return chrome.i18n.getUILanguage()
    }
  } catch {
    // Extension context may have been invalidated by a development reload.
  }
  return undefined
}

function readDocumentLanguage(): string | undefined {
  try {
    return typeof document !== 'undefined'
      ? document.documentElement?.lang
      : undefined
  } catch {
    return undefined
  }
}

function readNavigatorLanguage(): string | undefined {
  try {
    return typeof navigator !== 'undefined'
      ? navigator.language
      : undefined
  } catch {
    return undefined
  }
}
