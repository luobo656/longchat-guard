import { describe, expect, it } from 'vitest'
import { WebCryptoFingerprinter } from '../src/core/fingerprinter'

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
})
