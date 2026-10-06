import { afterEach, describe, expect, it, vi } from 'vitest'
import en from '../public/_locales/en/messages.json'
import zhCN from '../public/_locales/zh_CN/messages.json'
import zhTW from '../public/_locales/zh_TW/messages.json'
import {
  resetI18nCacheForTests,
  resolveFallbackLocale,
  t
} from '../src/content/i18n'

describe('extension localization', () => {
  afterEach(() => {
    resetI18nCacheForTests()
    vi.unstubAllGlobals()
  })
  it('keeps one canonical brand while using the approved localized display names', () => {
    expect(en.extensionName.message).toBe('LongChat Guard')
    expect(zhCN.extensionName.message).toBe('LongChat Guard · 长会话预警')
    expect(zhTW.extensionName.message).toBe('LongChat Guard · 長對話預警')

    for (const locale of [en, zhCN, zhTW]) {
      expect(locale.actionTitle.message).toBe('LongChat Guard')
      expect(locale.extensionName.message).not.toContain('龙查卫队')
      expect(locale.extensionName.message.length).toBeLessThanOrEqual(45)
    }
  })

  it('keeps all declared locales structurally aligned', () => {
    const expectedKeys = Object.keys(en).sort()
    expect(Object.keys(zhCN).sort()).toEqual(expectedKeys)
    expect(Object.keys(zhTW).sort()).toEqual(expectedKeys)
  })

  it('ships a direct handoff meta-prompt in every locale', () => {
    expect(en.continuationPrompt.message).toContain('confirmed facts')
    expect(en.continuationPrompt.message).toContain(
      'Do not generate a second-level prompt'
    )
    expect(en.continuationPrompt.message).toContain(
      'Output the final continuation context directly'
    )
    expect(zhCN.continuationPrompt.message).toContain('已确认的事实')
    expect(zhCN.continuationPrompt.message).toContain('不要生成二级提示词')
    expect(zhCN.continuationPrompt.message).toContain(
      '直接输出最终续接上下文'
    )
    expect(zhTW.continuationPrompt.message).toContain('已確認的事實')
    expect(zhTW.continuationPrompt.message).toContain('不要產生二級提示詞')
    expect(zhTW.continuationPrompt.message).toContain(
      '直接輸出最終續接上下文'
    )
  })

  it('normalizes simplified and traditional Chinese fallback locales', () => {
    expect(resolveFallbackLocale(['zh-CN'])).toBe('zh_CN')
    expect(resolveFallbackLocale(['zh-Hans-CN'])).toBe('zh_CN')
    expect(resolveFallbackLocale(['zh-TW'])).toBe('zh_TW')
    expect(resolveFallbackLocale(['zh-Hant-HK'])).toBe('zh_TW')
    expect(resolveFallbackLocale(['en-US'])).toBe('en')
  })

  it('keeps localized UI copy when the extension i18n bridge is unavailable', () => {
    vi.stubGlobal('chrome', undefined)
    vi.stubGlobal('document', {
      documentElement: { lang: 'zh-CN' }
    })
    expect(t('statusUnknown', 'Unable to assess')).toBe('暂无法判断')
    expect(t('labelStatus', 'Status')).toBe('状态')
  })

  it('uses explicit fallback copy outside the extension i18n runtime', () => {
    expect(t('missingMessage', 'Fallback copy')).toBe('Fallback copy')
  })
})
