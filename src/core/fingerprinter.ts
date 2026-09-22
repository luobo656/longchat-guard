export interface TextFingerprinter {
  fingerprint(text: string): Promise<string>
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
