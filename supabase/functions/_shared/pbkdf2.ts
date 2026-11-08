/**
 * PBKDF2 utilities for Deno (Web Crypto API).
 *
 * Key derivation uses domain separation: the purpose string is appended to
 * the raw salt bytes before PBKDF2 runs. This ensures keys derived for
 * different purposes (auth, encryption, etc.) cannot collide even if the
 * same passphrase + random salt is used.
 */

const encoder = new TextEncoder()

/**
 * Derives a 32-byte key from passphrase + salt using PBKDF2-SHA-256.
 * @param passphrase  Raw passphrase (UTF-8 encoded internally).
 * @param saltBytes   Random salt (should be 32 bytes, generated once per vault).
 * @param purpose     Domain string — appended to salt for key separation.
 * @param iterations  PBKDF2 iteration count (use ≥ 600_000 for auth keys).
 */
export async function pbkdf2Derive(
  passphrase: string,
  saltBytes: Uint8Array,
  purpose: string,
  iterations: number,
): Promise<Uint8Array> {
  const purposeBytes = encoder.encode(purpose)
  // combined salt = saltBytes || purposeBytes
  const combinedSalt = new Uint8Array(saltBytes.length + purposeBytes.length)
  combinedSalt.set(saltBytes, 0)
  combinedSalt.set(purposeBytes, saltBytes.length)

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: combinedSalt, iterations },
    keyMaterial,
    256,
  )
  return new Uint8Array(bits)
}

/** Encodes a Uint8Array to a lowercase hex string. */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** Decodes a hex string to a Uint8Array. */
export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string')
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

/** Generates n cryptographically random bytes. */
export function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  return bytes
}

/**
 * Constant-time comparison of two byte arrays.
 * Returns true only if both have the same length and identical content.
 */
export function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}
