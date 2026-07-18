import { Logger } from '@nestjs/common'

/** The `cors` package's CustomOrigin callback shape. */
export type CorsOriginCallback = (err: Error | null, allow?: boolean) => void

const logger = new Logger('Cors')

/**
 * Builds the CORS `origin` resolver for the given allowlist.
 *
 * Requests with no `Origin` header (same-origin, curl, server-to-server) and
 * whitelisted origins are allowed. A disallowed origin is rejected by calling
 * back with `(null, false)` — NOT by throwing. Passing an `Error` to the cors
 * callback makes `cors` invoke `next(err)`, which surfaces as a raw HTTP 500 to
 * the caller; `(null, false)` instead simply omits the CORS headers so the
 * browser blocks the response, and the request completes normally (no 500, no
 * noisy stack trace). Blocked origins are logged at debug for observability.
 */
export function buildCorsOrigin(
  allowedOrigins: string[],
): (origin: string | undefined, callback: CorsOriginCallback) => void {
  return (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    logger.debug(`Blocked CORS origin: ${origin}`)
    return callback(null, false)
  }
}
