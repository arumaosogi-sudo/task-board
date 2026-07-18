import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import { json, urlencoded } from 'express'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { validateAuthSecrets } from './config/validate-secrets'
import { buildCorsOrigin } from './config/cors'
import { CollabService } from './collab/collab.service'

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

  // Secure HTTP headers. The API serves JSON only (never HTML/scripts/styles), so
  // we lock the CSP all the way down to `default-src 'none'` — nothing is ever meant
  // to load. It costs nothing for JSON responses yet adds a defense-in-depth layer:
  // if an error page, docs route, or any future HTML surface is introduced, a browser
  // rendering it cannot pull scripts/frames/forms from anywhere. `frame-ancestors`
  // also blocks clickjacking (complements X-Frame-Options).
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          'default-src': ["'none'"],
          'base-uri': ["'none'"],
          'form-action': ["'none'"],
          'frame-ancestors': ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  )

  const allowedOrigins = parseOrigins()
  app.enableCors({
    // Reflect only whitelisted origins; allow same-origin/curl (no Origin header).
    // A disallowed origin is rejected via `(null, false)` (see buildCorsOrigin) so
    // it gets a clean CORS block instead of a thrown Error → raw 500.
    origin: buildCorsOrigin(allowedOrigins),
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

  // Collab (Hocuspocus) shares this same HTTP server/port — see the class doc
  // on CollabService for why a second port isn't viable in production.
  app.get(CollabService).attachToHttpServer(app.getHttpServer())

  console.log(`Task Board API running on http://localhost:${port}`)
  console.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`)
}
bootstrap()
