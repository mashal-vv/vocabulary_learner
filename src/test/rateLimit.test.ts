import { evaluateUnlockAttempts } from '@/lib/rateLimit'

const NOW = Date.now()
const WINDOW_MS = 15 * 60 * 1000

describe('evaluateUnlockAttempts', () => {
  it('allows access with no prior attempts', () => {
    const result = evaluateUnlockAttempts([], NOW)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(5)
    expect(result.retryAfterSeconds).toBe(0)
  })

  it('allows up to 4 failed attempts', () => {
    const attempts = Array.from({ length: 4 }, (_, i) => ({
      attemptedAt: NOW - i * 1000,
      success: false,
    }))
    const result = evaluateUnlockAttempts(attempts, NOW)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(1)
  })

  it('blocks after 5 failed attempts within the window', () => {
    const attempts = Array.from({ length: 5 }, (_, i) => ({
      attemptedAt: NOW - i * 1000,
      success: false,
    }))
    const result = evaluateUnlockAttempts(attempts, NOW)
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
    expect(result.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('allows access if 5 failures are outside the 15-minute window', () => {
    const attempts = Array.from({ length: 5 }, (_, i) => ({
      attemptedAt: NOW - WINDOW_MS - (i + 1) * 1000,
      success: false,
    }))
    const result = evaluateUnlockAttempts(attempts, NOW)
    expect(result.allowed).toBe(true)
  })

  it('does not count successful attempts toward the failure limit', () => {
    const attempts = [
      { attemptedAt: NOW - 5000, success: true },
      { attemptedAt: NOW - 4000, success: true },
      { attemptedAt: NOW - 3000, success: true },
      { attemptedAt: NOW - 2000, success: false },
      { attemptedAt: NOW - 1000, success: false },
    ]
    const result = evaluateUnlockAttempts(attempts, NOW)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(3)
  })
})
