/**
 * Create (or reset) the pre-verified demo account for the public deploy.
 *
 * Why this exists: login rejects any user whose emailVerified is false
 * (apps/api/src/auth/auth.service.ts), and the demo deploy has no mail
 * provider configured, so a normally-registered account could never be
 * verified. This writes the user straight to the database with
 * emailVerified already true.
 *
 * Usage (from the repo root, against the deployed database):
 *   DATABASE_URL="postgresql://…"  node ops/scripts/create-demo-user.mjs
 *
 * Optional overrides: DEMO_EMAIL, DEMO_USERNAME, DEMO_PASSWORD.
 * Re-running is safe: it updates the existing row instead of failing.
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcrypt'

const EMAIL = process.env.DEMO_EMAIL ?? 'demo@task-board.app'
const USERNAME = process.env.DEMO_USERNAME ?? 'demo'
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo-task-board-2026'

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Point it at the deployed database and retry.')
  process.exit(1)
}

const prisma = new PrismaClient()

try {
  // Same cost factor the app uses when it hashes a real signup
  // (BCRYPT_ROUNDS in apps/api/src/auth/auth.service.ts).
  const passwordHash = await bcrypt.hash(PASSWORD, 12)

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: { passwordHash, emailVerified: true, username: USERNAME },
    create: { email: EMAIL, username: USERNAME, passwordHash, emailVerified: true },
    select: { id: true, email: true, username: true, emailVerified: true },
  })

  console.log('Demo account ready:')
  console.log('  email    ', user.email)
  console.log('  username ', user.username)
  console.log('  password ', PASSWORD)
  console.log('  verified ', user.emailVerified)
} catch (err) {
  console.error('Failed to create the demo user:', err.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
