/**
 * Build-time deployment switches.
 *
 * Vite inlines `import.meta.env.*` at build time, so flipping one of these
 * means rebuilding the bundle, not just restarting a server.
 */

/**
 * Hide every route into public sign-up. Set on the public demo, where the API
 * refuses `POST /auth/register` for the same reason (SIGNUP_DISABLED there):
 * with no mail provider a new account can never clear the emailVerified gate,
 * so offering the form only leads the visitor to a dead end.
 *
 * The API is the actual gate — this flag only keeps the UI honest about it.
 */
export const SIGNUP_DISABLED = import.meta.env.VITE_SIGNUP_DISABLED === 'true'

/**
 * Optional one-line hint shown on the sign-in page, e.g. the shared credentials
 * of a demo account. Kept as free text in the environment so no deployment's
 * specific account details end up in the source.
 */
export const DEMO_HINT: string = import.meta.env.VITE_DEMO_HINT ?? ''
