// Shared helpers for the local test-sandbox orchestration scripts
// (ops/scripts/test-int-local.mjs, test-e2e-local.mjs). Plain Node — no extra
// npm dependency added just for this, so `npm ci` in a fresh clone always has
// what it needs.
import { spawn, spawnSync } from 'node:child_process'

// On Windows, `npm`/`npx` are `.cmd` shims. Spawning a `.cmd` needs
// `shell: true` — since Node's CVE-2024-27980 fix, spawning it directly
// (shell: false, even naming the `.cmd` file explicitly) throws EINVAL rather
// than running it. `shell: true` triggers DEP0190 (args aren't escaped, only
// concatenated) — acceptable here because every arg passed through `run`/
// `spawnBg` in this repo is a static literal (workspace names, flags, absolute
// paths we built ourselves), never untrusted/user-supplied input. `docker` is
// a real .exe, so it never needs the shell.
function needsShell(cmd) {
  return process.platform === 'win32' && (cmd === 'npm' || cmd === 'npx')
}

/** Run a command to completion, streaming output; rejects on non-zero exit. */
export function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: needsShell(cmd), ...opts })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve(undefined)
      else reject(new Error(`${cmd} ${args.join(' ')} exited with code ${code}`))
    })
  })
}

/**
 * Start a long-running background process (api/web dev servers). Returns the
 * child so callers can killTree() it later.
 */
export function spawnBg(cmd, args, opts = {}) {
  const child = spawn(cmd, args, {
    stdio: 'inherit',
    shell: needsShell(cmd),
    ...opts,
  })
  child.on('error', (err) => {
    console.error(`[test-sandbox] background process "${cmd} ${args.join(' ')}" failed to start:`, err)
  })
  return child
}

/**
 * Kill a background process AND its descendants. Plain `child.kill()` only
 * signals the immediate PID — on both platforms that's the shell/npm wrapper,
 * not the ts-node-dev/vite process it spawned underneath, so the dev server
 * would keep the port bound after teardown. Uses OS-native tree-kill instead
 * of pulling in a package.
 */
export function killTree(child) {
  if (!child || child.pid == null || child.killed) return
  if (process.platform === 'win32') {
    // /T = kill the whole tree, /F = force. Ignore errors: the process may
    // have already exited on its own (e.g. crashed during the test run).
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'])
  } else {
    try {
      // Negative PID = signal the whole process group (child was spawned
      // with detached: true so it's its own group leader).
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      try {
        child.kill('SIGKILL')
      } catch {
        // already gone
      }
    }
  }
}

/** Poll a URL until it responds (any HTTP status = "up"), or throw on timeout. */
export async function waitForHttp(url, { timeoutMs = 60_000, intervalMs = 500, label = url } = {}) {
  const deadline = Date.now() + timeoutMs
  let lastErr
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) })
      // Any response (even 404/500) means the server is accepting connections.
      if (res) return
    } catch (err) {
      lastErr = err
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for ${label} to come up (${lastErr?.message ?? 'no response'})`)
}

/** Best-effort teardown runner: runs every step even if earlier ones throw. */
export async function teardownAll(steps) {
  for (const step of steps) {
    try {
      await step()
    } catch (err) {
      console.error('[test-sandbox] teardown step failed (continuing):', err.message ?? err)
    }
  }
}
