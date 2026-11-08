export type AttemptRecord = {
  attemptedAt: number
  success: boolean
}

export type RateLimitResult = {
  allowed: boolean
  retryAfterSeconds: number
  remaining: number
}

const WINDOW_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

export function evaluateUnlockAttempts(
  attempts: AttemptRecord[],
  now = Date.now(),
): RateLimitResult {
  const recent = attempts.filter((attempt) => now - attempt.attemptedAt < WINDOW_MS)
  const failures = recent.filter((attempt) => !attempt.success)
  if (failures.length < MAX_ATTEMPTS) {
    return { allowed: true, retryAfterSeconds: 0, remaining: MAX_ATTEMPTS - failures.length }
  }
  const oldestFailure = Math.min(...failures.map((attempt) => attempt.attemptedAt))
  const retryAfterSeconds = Math.max(1, Math.ceil((oldestFailure + WINDOW_MS - now) / 1000))
  return { allowed: false, retryAfterSeconds, remaining: 0 }
}
