import { describe, expect, it } from 'vitest'
import {
  anonymizeConversationKey,
  isAnonymousConversationKey,
  WebCryptoFingerprinter
} from '../src/core/fingerprinter'

describe('local salted fingerprinter', () => {
  it('is stable for the same install salt', async () => {
    const fingerprinter = new WebCryptoFingerprinter('install-a')

    await expect(fingerprinter.fingerprint('same message')).resolves.toBe(
      await fingerprinter.fingerprint('same message')
    )
  })

  it('changes when the install salt changes', async () => {
    const first = await new WebCryptoFingerprinter('install-a').fingerprint('same message')
    const second = await new WebCryptoFingerprinter('install-b').fingerprint('same message')

    expect(first).not.toBe(second)
  })

  it('anonymizes conversation keys deterministically without retaining the raw id', async () => {
    const raw = 'chatgpt:abc123456789'
    const first = await anonymizeConversationKey(raw, 'install-a')
    const second = await anonymizeConversationKey(raw, 'install-a')
    const otherInstall = await anonymizeConversationKey(raw, 'install-b')

    expect(first).toBe(second)
    expect(first).not.toBe(otherInstall)
    expect(isAnonymousConversationKey(first)).toBe(true)
    expect(first).not.toContain('abc123456789')
  })

  it('does not hash an already anonymous conversation key again', async () => {
    const anonymous = await anonymizeConversationKey('chatgpt:abc123456789', 'install-a')
    await expect(anonymizeConversationKey(anonymous, 'install-b')).resolves.toBe(anonymous)
  })
})
