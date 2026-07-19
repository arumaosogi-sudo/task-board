#!/usr/bin/env node
// @ts-nocheck
/**
 * One-time Gmail API OAuth setup — mints the GMAIL_REFRESH_TOKEN the API needs to
 * send mail over HTTPS (see ADR 0009). Plain Node, zero dependencies.
 *
 * WHAT IT DOES
 *   1. Reads GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (or GMAIL_OAUTH_CLIENT_ID /
 *      GMAIL_OAUTH_CLIENT_SECRET) from apps/api/.env, else from env vars / argv.
 *   2. Spins up a localhost server on :8765, prints the Google consent URL.
 *   3. You open it, grant the gmail.send scope; Google redirects back with a code.
 *   4. It exchanges the code and prints the refresh token + the exact env lines.
 *
 * PREREQUISITE (one-time, in Google Cloud Console for this OAuth client):
 *   APIs & Services → Credentials → your OAuth 2.0 Client (Web application) →
 *   Authorized redirect URIs → ADD:  http://localhost:8765/oauth2callback
 *   Also ensure the OAuth consent screen has scope
 *   https://www.googleapis.com/auth/gmail.send (Testing mode with the owner as a
 *   test user is fine), and the Gmail API is enabled for the project.
 *
 * USAGE
 *   node ops/scripts/gmail-oauth-setup.mjs
 *   # or pass creds explicitly:
 *   node ops/scripts/gmail-oauth-setup.mjs --client-id=XXX --client-secret=YYY
 */

import http from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const PORT = 8765
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`
const SCOPE = 'https://www.googleapis.com/auth/gmail.send'
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ENV_PATH = resolve(__dirname, '../../apps/api/.env')

/** Minimal .env parser — just enough to pull the client id/secret. No deps. */
function readEnvFile(path) {
  const out = {}
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return out
  }
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let value = m[2].trim()
    // Strip surrounding quotes.
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[m[1]] = value
  }
  return out
}

/** Parse `--key=value` and `--key value` from argv. */
function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const eq = a.match(/^--([^=]+)=(.*)$/)
    if (eq) {
      out[eq[1]] = eq[2]
    } else if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next && !next.startsWith('--')) {
        out[key] = next
        i++
      } else {
        out[key] = 'true'
      }
    }
  }
  return out
}

function resolveCredentials() {
  const args = parseArgs(process.argv.slice(2))
  const env = readEnvFile(ENV_PATH)
  const clientId =
    args['client-id'] ||
    process.env.GMAIL_OAUTH_CLIENT_ID ||
    process.env.GOOGLE_CLIENT_ID ||
    env.GMAIL_OAUTH_CLIENT_ID ||
    env.GOOGLE_CLIENT_ID
  const clientSecret =
    args['client-secret'] ||
    process.env.GMAIL_OAUTH_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    env.GMAIL_OAUTH_CLIENT_SECRET ||
    env.GOOGLE_CLIENT_SECRET
  return { clientId, clientSecret }
}

function buildConsentUrl(clientId) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',
    // Force a consent prompt so Google always returns a refresh_token (it omits
    // it on repeat authorisations otherwise).
    prompt: 'consent',
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

async function exchangeCodeForTokens(code, clientId, clientSecret) {
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
  })
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`Token exchange failed: HTTP ${res.status} ${text}`)
  }
  return JSON.parse(text)
}

function htmlPage(title, message) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;max-width:520px;margin:64px auto;padding:0 24px;color:#1d2333">
<h1 style="font-size:20px">${title}</h1><p style="line-height:1.6;color:#4b5167">${message}</p>
</body></html>`
}

function main() {
  const { clientId, clientSecret } = resolveCredentials()

  if (!clientId || !clientSecret) {
    console.error(
      [
        'ERROR: could not find OAuth client credentials.',
        '',
        'Provide them one of these ways:',
        `  • put GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in ${ENV_PATH}`,
        '  • export GMAIL_OAUTH_CLIENT_ID / GMAIL_OAUTH_CLIENT_SECRET',
        '  • pass --client-id=... --client-secret=...',
      ].join('\n'),
    )
    process.exit(1)
  }

  const consentUrl = buildConsentUrl(clientId)

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`)
    if (url.pathname !== '/oauth2callback') {
      res.writeHead(404).end('Not found')
      return
    }

    const error = url.searchParams.get('error')
    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(htmlPage('Authorization failed', `Google returned an error: <code>${error}</code>. You can close this tab and re-run the script.`))
      console.error(`\nAuthorization failed: ${error}`)
      server.close()
      process.exit(1)
    }

    const code = url.searchParams.get('code')
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(htmlPage('Missing code', 'No authorization code was present in the callback.'))
      return
    }

    try {
      const tokens = await exchangeCodeForTokens(code, clientId, clientSecret)
      if (!tokens.refresh_token) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(
          htmlPage(
            'No refresh token returned',
            'Google did not return a refresh_token. Revoke the app at myaccount.google.com/permissions and re-run this script (it forces prompt=consent).',
          ),
        )
        console.error(
          '\nNo refresh_token returned. Revoke prior access at https://myaccount.google.com/permissions and re-run.',
        )
        server.close()
        process.exit(1)
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(htmlPage('All set — you can close this tab', 'The refresh token was printed in your terminal. Copy the env lines into Railway.'))

      console.log('\n================ SUCCESS ================\n')
      console.log('Add these to Railway (Variables) — or apps/api/.env for local:\n')
      console.log(`GMAIL_OAUTH_CLIENT_ID="${clientId}"`)
      console.log(`GMAIL_OAUTH_CLIENT_SECRET="${clientSecret}"`)
      console.log(`GMAIL_REFRESH_TOKEN="${tokens.refresh_token}"`)
      console.log('\n# EMAIL_FROM MUST be the Gmail account you just authorised (DMARC alignment):')
      console.log('# EMAIL_FROM="you@gmail.com"')
      console.log('\n=========================================\n')

      server.close()
      process.exit(0)
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(htmlPage('Token exchange failed', 'See the terminal for details.'))
      console.error(`\n${err instanceof Error ? err.message : String(err)}`)
      server.close()
      process.exit(1)
    }
  })

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.error(`\nPort ${PORT} is already in use. Close whatever is using it and re-run.`)
    } else {
      console.error(`\nServer error: ${err instanceof Error ? err.message : String(err)}`)
    }
    process.exit(1)
  })

  server.listen(PORT, () => {
    console.log('\nGmail API OAuth setup')
    console.log('---------------------')
    console.log(`Redirect URI (must be whitelisted in the OAuth client): ${REDIRECT_URI}`)
    console.log('\n1) Make sure the redirect URI above is added to your OAuth client in')
    console.log('   Google Cloud Console → Credentials, and the Gmail API is enabled.')
    console.log('2) Open this URL in your browser and grant access:\n')
    console.log(`   ${consentUrl}\n`)
    console.log('Waiting for the Google redirect on localhost…')
  })
}

main()
