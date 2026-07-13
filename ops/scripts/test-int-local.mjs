#!/usr/bin/env node
// One-command local integration test run: bring up an ISOLATED throwaway
// Postgres (docker-compose.test.yml → test-db, port 5433 — never the port
// `npm run dev` / `docker compose up` use), point the existing integration
// suite at it, run it, then always tear the container back down.
//
// Deliberately does NOT re-implement role bootstrap / `prisma migrate deploy`
// here — apps/api/jest.integration.config.js already does that once via its
// `globalSetup` (apps/api/src/testing/int/global-setup.ts) the moment
// TEST_DATABASE_URL is set. This script's only job is: give it a safe,
// disposable database to point at, and clean up after.
//
// Usage:
//   npm run test:int:local            # up → test → down
//   npm run test:int:local -- --keep  # leave the test-db container running
//                                      # after the run, for poking around with
//                                      # `psql`/a GUI client (you tear it down
//                                      # yourself: docker compose -f
//                                      # docker-compose.test.yml down -v)
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { run, teardownAll } from './lib/proc.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
const composeFile = path.join(repoRoot, 'docker-compose.test.yml')
const keep = process.argv.includes('--keep')

const TEST_DATABASE_URL = 'postgresql://taskboard_test:taskboard_test@localhost:5433/taskboard_test'

async function main() {
  console.log('[test:int:local] starting isolated test-db (docker-compose.test.yml)...')
  await run('docker', ['compose', '-f', composeFile, 'up', '-d', '--wait', 'test-db'], { cwd: repoRoot })

  console.log(`[test:int:local] running integration suite against ${TEST_DATABASE_URL}`)
  await run('npm', ['run', 'test:int', '--workspace', '@task-board/api'], {
    cwd: repoRoot,
    env: { ...process.env, TEST_DATABASE_URL },
  })
}

let exitCode = 0
try {
  await main()
  console.log('[test:int:local] PASS')
} catch (err) {
  exitCode = 1
  console.error('[test:int:local] FAIL:', err.message ?? err)
} finally {
  if (keep) {
    console.log('[test:int:local] --keep passed — leaving test-db running. Tear down with:')
    console.log(`  docker compose -f "${composeFile}" down -v`)
  } else {
    await teardownAll([
      async () => {
        console.log('[test:int:local] tearing down test-db...')
        await run('docker', ['compose', '-f', composeFile, 'down', '-v'], { cwd: repoRoot })
      },
    ])
  }
}
process.exit(exitCode)
