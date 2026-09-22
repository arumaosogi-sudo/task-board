// Turn an API failure into a message in the user's language.
//
// The API answers with a structured `{ code, message }` (see apiError in ./api), but its
// `message` is authored in Thai only — showing it verbatim meant an English UI printed Thai
// for the most common auth failures. Codes that have a translation are resolved here; the
// rest still fall back to the server's own wording, which is better than a generic string.
import type { TFunction } from 'i18next'
import { apiError } from './api'

/** Server `code` → i18n key. Extend as more codes get user-facing copy. */
const CODE_KEYS: Record<string, string> = {
  'username-taken': 'errors.usernameTaken',
  'email-taken': 'errors.emailTaken',
  'invalid-credentials': 'errors.wrongPassword',
}

/**
 * Resolution order: a translated code → the server's own message → `fallback` (a
 * caller-supplied, context-specific string) → the generic catch-all.
 */
export function errorMessage(err: unknown, t: TFunction, fallback?: string): string {
  const { code, message } = apiError(err)
  const key = code ? CODE_KEYS[code] : undefined
  if (key) return t(key)
  return message || fallback || t('errors.generic')
}
