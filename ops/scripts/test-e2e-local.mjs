#!/usr/bin/env node
// One-command local E2E run: bring up an ISOLATED test-db + test-mailpit
// (docker-compose.test.yml, ports 5433/2025/8026 — never the dev stack's
// 5432/1025/8025), prepare the schema, boot api+web dev servers against that
// isolated stack, run Playwright, then always tear everything back down.
//
// Prereqs (documented in ops/RUNBOOK.md "Test sandbox"):
//   - Docker Desktop running
//   - `npx playwright install chromium` run at least once in apps/web
//   - Ports 3001/3002/5173 free — this starts real api/web dev servers on the
//     SAME ports `npm run dev` uses, so stop any running dev session first.
//
// Usage:
//   npm run test:e2e:local
//   npm run test:e2e:local -- --keep   # leave containers + dev servers up
//                                       # after the run for manual poking
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { run, spawnBg, killTree, waitForHttp, teardownAll } from './lib/proc.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
const composeFile = path.join(repoRoot, 'docker-compose.test.yml')
const rolesSql = path.join(__dirname, 'sql', 'create-test-roles.sql')
const apiSchema = path.join(repoRoot, 'apps', 'api', 'prisma', 'schema.prisma')
const keep = process.argv.includes('--keep')

const TEST_DATABASE_URL = 'postgresql://taskboard_test:taskboard_test@localhost:5433/taskboard_test'
const API_URL = 'http://localhost:3001'
const WEB_URL = 'http://localhost:5173'
const MAILPIT_HTTP = 'http://localhost:8026'

// Same shape as docker-compose.yml's api service, pointed at the isolated
// test-db/test-mailpit instead. NODE_ENV must NOT be "production" — the auth
// controller only sets non-secure cookies when it isn't, and Playwright talks
// to plain http://localhost. Secrets are dev-only stand-ins (see
// apps/api/src/config/validate-secrets.ts for why they can't be "change-me...").
const apiEnv = {
  ...process.env,
  NODE_ENV: 'development',
  PORT: '3001',
  DATABASE_URL: TEST_DATABASE_URL,
  DIRECT_URL: TEST_DATABASE_URL,
  WEB_URL,
  CORS_ORIGINS: WEB_URL,
  JWT_SECRET: 'local-e2e-sandbox-jwt-access-secret-not-for-prod',
  JWT_REFRESH_SECRET: 'local-e2e-sandbox-jwt-refresh-secret-not-for-prod',
  JWT_ACCESS_EXPIRES: '15m',
  JWT_REFRESH_EXPIRES: '30d',
  SMTP_HOST: 'localhost',
  SMTP_PORT: '2025',
  SMTP_SECURE: 'false',
  EMAIL_FROM: 'noreply@taskboard.local',
}

const webEnv = {
  ...process.env,
  VITE_API_URL: API_URL,
  // Collab shares the API's own port/server now (see CollabService).
  VITE_COLLAB_URL: 'ws://localhost:3001',
}

let apiProc
let webProc

async function main() {
  console.log('[test:e2e:local] starting isolated test-db + test-mailpit (docker-compose.test.yml)...')
  await run('docker', ['compose', '-f', composeFile, 'up', '-d', '--wait'], { cwd: repoRoot })
  await waitForHttp(`${MAILPIT_HTTP}/api/v1/info`, { label: 'test-mailpit HTTP API', timeoutMs: 30_000 })

  console.log('[test:e2e:local] preparing schema on the test db (roles + migrate deploy)...')
  await run('npx', ['prisma', 'db', 'execute', '--url', TEST_DATABASE_URL, '--file', rolesSql], { cwd: repoRoot })
  await run('npx', ['prisma', 'migrate', 'deploy', '--schema', apiSchema], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL, DIRECT_URL: TEST_DATABASE_URL },
  })

  console.log('[test:e2e:local] starting api dev server on :3001 (+ collab :3002)...')
  apiProc = spawnBg('npm', ['run', 'dev', '--workspace', '@task-board/api'], { cwd: repoRoot, env: apiEnv, detached: process.platform !== 'win32' })
  await waitForHttp(`${API_URL}/health`, { label: 'api :3001/health', timeoutMs: 60_000 })

  console.log('[test:e2e:local] starting web dev server on :5173...')
  webProc = spawnBg('npm', ['run', 'dev', '--workspace', '@task-board/web'], { cwd: repoRoot, env: webEnv, detached: process.platform !== 'win32' })
  await waitForHttp(WEB_URL, { label: 'web :5173', timeoutMs: 60_000 })

  console.log('[test:e2e:local] running Playwright...')
  await run('npx', ['playwright', 'test'], {
    cwd: repoRoot,
    env: { ...process.env, E2E_WEB_URL: WEB_URL, E2E_MAILPIT_URL: MAILPIT_HTTP },
  })
}

let exitCode = 0
try {
  await main()
  console.log('[test:e2e:local] PASS')
} catch (err) {
  exitCode = 1
  console.error('[test:e2e:local] FAIL:', err.message ?? err)
} finally {
  if (keep) {
    console.log('[test:e2e:local] --keep passed — leaving api/web + containers running. Tear down with:')
    console.log('  (stop the api/web processes yourself, e.g. Ctrl+C or Task Manager)')
    console.log(`  docker compose -f "${composeFile}" down -v`)
  } else {
    await teardownAll([
      () => {
        console.log('[test:e2e:local] stopping web dev server...')
        killTree(webProc)
      },
      () => {
        console.log('[test:e2e:local] stopping api dev server...')
        killTree(apiProc)
      },
      async () => {
        console.log('[test:e2e:local] tearing down test-db + test-mailpit...')
        await run('docker', ['compose', '-f', composeFile, 'down', '-v'], { cwd: repoRoot })
      },
    ])
  }
}
process.exit(exitCode)
