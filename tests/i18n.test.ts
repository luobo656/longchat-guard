import { describe, expect, it } from 'vitest'
import en from '../public/_locales/en/messages.json'
import zhCN from '../public/_locales/zh_CN/messages.json'
import zhTW from '../public/_locales/zh_TW/messages.json'
import { t } from '../src/content/i18n'

describe('extension localization', () => {
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

  it('ships a structured continuation prompt in every locale', () => {
    expect(en.continuationPrompt.message).toContain('confirmed facts')
    expect(en.continuationPrompt.message).toContain('Continue execution')
    expect(zhCN.continuationPrompt.message).toContain('已确认事实')
    expect(zhCN.continuationPrompt.message).toContain('继续执行指令')
    expect(zhTW.continuationPrompt.message).toContain('已確認事實')
    expect(zhTW.continuationPrompt.message).toContain('繼續執行指令')
  })

  it('uses explicit fallback copy outside the extension i18n runtime', () => {
    expect(t('missingMessage', 'Fallback copy')).toBe('Fallback copy')
  })
})
