const ITERATIONS = 310_000

function bytesToB64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function b64ToBytes(value: string) {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export async function randomSalt(length = 16) {
  const salt = new Uint8Array(length)
  crypto.getRandomValues(salt)
  return salt
}

export async function hashPassphrase(passphrase: string, salt: Uint8Array) {
  const encoded = new TextEncoder().encode(passphrase)
  const keyMaterial = await crypto.subtle.importKey('raw', encoded, 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt.buffer as ArrayBuffer, iterations: ITERATIONS },
    keyMaterial,
    256,
  )
  return new Uint8Array(bits)
}

export async function encodePassphraseRecord(passphrase: string) {
  const salt = await randomSalt()
  const hash = await hashPassphrase(passphrase, salt)
  return `${bytesToB64(salt)}:${bytesToB64(hash)}`
}

export async function verifyPassphrase(passphrase: string, record: string) {
  const [saltB64, hashB64] = record.split(':')
  if (!saltB64 || !hashB64) return false
  const salt = b64ToBytes(saltB64)
  const expected = b64ToBytes(hashB64)
  const actual = await hashPassphrase(passphrase, salt)
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i += 1) diff |= (actual[i] ?? 0) ^ (expected[i] ?? 0)
  return diff === 0
}

export async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
