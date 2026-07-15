import { generateOpaqueToken, hashToken } from './token.util'

// Smoke test #1 (API): pure crypto helpers, zero DB / Nest DI needed.
// Proves the Jest + @swc/jest toolchain runs and that these security-critical
// primitives behave as their callers (refresh / email-verify / reset) assume.
describe('token.util', () => {
  describe('generateOpaqueToken', () => {
    it('returns 64 lowercase hex chars (32 random bytes)', () => {
      const token = generateOpaqueToken()
      expect(token).toMatch(/^[0-9a-f]{64}$/)
    })

    it('is effectively unique across calls', () => {
      const tokens = new Set(Array.from({ length: 100 }, () => generateOpaqueToken()))
      expect(tokens.size).toBe(100)
    })
  })

  describe('hashToken', () => {
    it('is deterministic — same input yields same hash (enables O(1) DB lookup)', () => {
      expect(hashToken('hello-token')).toBe(hashToken('hello-token'))
    })

    it('produces a 64-char SHA-256 hex digest', () => {
      expect(hashToken('anything')).toMatch(/^[0-9a-f]{64}$/)
    })

    it('matches the known SHA-256 vector for "abc"', () => {
      expect(hashToken('abc')).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      )
    })

    it('differs for different inputs', () => {
      expect(hashToken('token-a')).not.toBe(hashToken('token-b'))
    })
  })
})
