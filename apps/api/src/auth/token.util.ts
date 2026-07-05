import { createHash, randomBytes } from 'crypto'

/** High-entropy opaque token (used for refresh / email-verify / password-reset). */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Deterministic SHA-256 hash. We store this (not the raw token) in the DB so that
 * a DB leak does not expose usable tokens, while still allowing O(1) lookup by hash
 * (unlike bcrypt, which is non-deterministic and can't be queried directly).
 */
export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}
