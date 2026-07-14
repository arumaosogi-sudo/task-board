import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Request, Response } from 'express'

/**
 * Catches anything thrown while handling the Google OAuth routes and, instead of
 * letting Nest render raw JSON (which the browser would show as a bare
 * `{"statusCode":500,...}` page — a dead end for the user mid-login), bounces the
 * user back to the web login with a machine-readable `?error=` code the SPA turns
 * into a localized banner.
 *
 * Scoped to the two /auth/google routes via @UseFilters so the JSON-returning
 * auth endpoints (login/register/…) keep their normal error contract.
 */
@Catch()
export class GoogleOAuthExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GoogleOAuth')

  constructor(private readonly config: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp()
    const req = http.getRequest<Request>()
    const res = http.getResponse<Response>()

    const webUrl = this.config.get<string>('WEB_URL', 'http://localhost:5173')
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR

    // Map the failure to a stable code the web login understands.
    let code = 'google-failed'
    if (status === HttpStatus.SERVICE_UNAVAILABLE) {
      code = 'google-unconfigured'
    }
    // The user declined consent on Google's screen: Google redirects back to the
    // callback with ?error=access_denied. That isn't a system fault — say so.
    if (typeof req.query.error === 'string' && req.query.error === 'access_denied') {
      code = 'google-cancelled'
    }

    // A 5xx is a real backend fault (or an unexpected passport error) — log it so
    // it's diagnosable, even though the user only ever sees the friendly redirect.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `Google OAuth failed (${status}): ${
          exception instanceof Error ? exception.stack ?? exception.message : String(exception)
        }`,
      )
    }

    res.redirect(`${webUrl}/login?error=${code}`)
  }
}
