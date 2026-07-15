// setupFiles for the integration project — runs once per test file, BEFORE the
// test module (and its imports, e.g. the Prisma client) are evaluated.
//
// Responsibilities:
//   1. reflect-metadata polyfill (Nest-decorated classes emit Reflect.metadata()
//      at class-definition time — same as the unit config's setupFiles).
//   2. Fail fast, with a loud message, if TEST_DATABASE_URL is missing or looks
//      like the app/prod database — integration tests are destructive (TRUNCATE).
import 'reflect-metadata'

const testUrl = process.env.TEST_DATABASE_URL

if (!testUrl) {
  throw new Error(
    'TEST_DATABASE_URL is not set. Integration tests need an isolated, disposable Postgres.\n' +
      'Local:  docker compose up -d db  →  export TEST_DATABASE_URL=postgresql://taskboard:taskboard@localhost:5432/taskboard\n' +
      'Never point this at DATABASE_URL / Supabase — these tests TRUNCATE every table.',
  )
}

if (/supabase\.(co|com)/i.test(testUrl)) {
  throw new Error('TEST_DATABASE_URL points at a Supabase host — refusing to run destructive integration tests against it.')
}

if (process.env.DATABASE_URL && process.env.DATABASE_URL === testUrl) {
  throw new Error('TEST_DATABASE_URL must differ from DATABASE_URL — refusing to run integration tests against the app database.')
}
