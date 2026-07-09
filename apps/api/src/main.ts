import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { AppModule } from './app.module'

/** Parse a comma-separated origin allowlist from env, trimming blanks. */
function parseOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS || process.env.WEB_URL || 'http://localhost:5173'
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

const MIN_SECRET_LENGTH = 32

/**
 * Reject a secret that is missing, too short, or still the shipped placeholder.
 * A weak/default JWT_SECRET lets an attacker forge access tokens (and the collab
 * WS auth uses the same secret), so we fail fast at boot rather than run insecure.
 */
function assertStrongSecret(name: string, value: string | undefined): void {
  if (!value || value.length < MIN_SECRET_LENGTH || value.startsWith('change-me')) {
    throw new Error(
      `${name} must be a strong, non-default value ` +
        `(>= ${MIN_SECRET_LENGTH} chars, not the "change-me…" placeholder). ` +
        `Set a random secret in the environment before starting the API.`,
    )
  }
}

/**
 * Validate auth secrets before the app accepts traffic. Read via ConfigService
 * (not raw process.env) so values loaded from the .env file by ConfigModule are
 * seen — otherwise a local-dev secret in .env would look "missing".
 * JWT_SECRET is required (signs access tokens + collab auth). JWT_REFRESH_SECRET
 * is validated only when present — refresh tokens are opaque (not JWTs) so it is
 * not currently read, but if an operator sets it we still reject weak/default values.
 */
function validateAuthSecrets(config: ConfigService): void {
  assertStrongSecret('JWT_SECRET', config.get<string>('JWT_SECRET'))
  const refresh = config.get<string>('JWT_REFRESH_SECRET')
  if (refresh !== undefined) {
    assertStrongSecret('JWT_REFRESH_SECRET', refresh)
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Fail fast on a missing/weak/default JWT secret before serving any traffic.
  validateAuthSecrets(app.get(ConfigService))

  app.use(cookieParser())

  // Secure HTTP headers. The API serves JSON only (no HTML), so the strict CSP
  // that would otherwise need per-page tuning is unnecessary; keep the rest.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  )

  const allowedOrigins = parseOrigins()
  app.enableCors({
    // Reflect only whitelisted origins; allow same-origin/curl (no Origin header).
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
      return callback(new Error(`Origin ${origin} not allowed by CORS`), false)
    },
    credentials: true, // allow the refresh cookie to be sent/received
  })

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip unknown properties
      forbidNonWhitelisted: true, // 400 on unexpected properties
      transform: true, // coerce payloads to DTO types (e.g. fontSize -> number)
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  // Wire NestJS lifecycle hooks to process signals (SIGTERM/SIGINT) so that on
  // shutdown onModuleDestroy runs — CollabService closes Hocuspocus WS gracefully
  // and PrismaService disconnects. Requires node to be PID 1 in the container.
  app.enableShutdownHooks()

  const port = parseInt(process.env.PORT || '3001', 10)
  await app.listen(port)
  console.log(`Task Board API running on http://localhost:${port}`)
  console.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`)
}
bootstrap()
