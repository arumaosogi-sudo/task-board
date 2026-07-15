import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import { json, urlencoded } from 'express'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { validateAuthSecrets } from './config/validate-secrets'

/** Parse a comma-separated origin allowlist from env, trimming blanks. */
function parseOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS || process.env.WEB_URL || 'http://localhost:5173'
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Fail fast on a missing/weak/default JWT secret before serving any traffic.
  validateAuthSecrets(app.get(ConfigService))

  app.use(cookieParser())

  // Raise the JSON/urlencoded body limit above Express's ~100KB default. The
  // PUT :fileId/content mirror can carry legacy base64 images (root cause of the
  // 413 the editor hit on save); the real gate lives at the DTO (@MaxLength → 400
  // with a clear code instead of a raw 413). Multipart image uploads bypass this
  // (multer handles them with its own fileSize limit). See ADR 0004 Decision 4.
  app.use(json({ limit: '10mb' }))
  app.use(urlencoded({ extended: true, limit: '10mb' }))

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
