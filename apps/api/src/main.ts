import 'reflect-metadata'
import { ValidationPipe } from '@nestjs/common'
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

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

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

  const port = parseInt(process.env.PORT || '3001', 10)
  await app.listen(port)
  console.log(`Task Board API running on http://localhost:${port}`)
  console.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`)
}
bootstrap()
