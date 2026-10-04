export interface TextFingerprinter {
  fingerprint(text: string): Promise<string>
}

const ANONYMOUS_CONVERSATION_KEY_PREFIX = 'lcg:'
const ANONYMOUS_CONVERSATION_KEY_PATTERN = /^lcg:[0-9a-f]{64}$/

export function isAnonymousConversationKey(value: string): boolean {
  return ANONYMOUS_CONVERSATION_KEY_PATTERN.test(value)
}

export async function anonymizeConversationKey(
  value: string,
  installSalt: string
): Promise<string> {
  if (isAnonymousConversationKey(value)) return value
  const fingerprinter = new WebCryptoFingerprinter(installSalt)
  const digest = await fingerprinter.fingerprint(`conversation\u001f${value}`)
  return `${ANONYMOUS_CONVERSATION_KEY_PREFIX}${digest}`
}

export function createInstallSalt(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return bytesToHex(bytes)
}

export class WebCryptoFingerprinter implements TextFingerprinter {
  constructor(private readonly installSalt: string) {}

  async fingerprint(text: string): Promise<string> {
    const encoded = new TextEncoder().encode(`${this.installSalt}\u001f${text}`)
    const digest = await crypto.subtle.digest('SHA-256', encoded)
    return bytesToHex(new Uint8Array(digest))
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
