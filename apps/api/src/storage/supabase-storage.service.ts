import { Injectable, Logger, OnModuleInit, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Sanitize an env value pasted through a hosting dashboard (Railway, etc.). Those
 * UIs store the raw string verbatim, so a value copy/pasted from a `.env` file
 * arrives WITH its surrounding quotes (`"https://x.supabase.co"` → the quotes
 * become part of the value) and copy/paste routinely adds leading/trailing
 * whitespace or a stray newline. `new URL('"https://…"')` inside supabase-js then
 * throws synchronously — which, unguarded, surfaced as a blank HTTP 500 in prod.
 *
 * Trims whitespace and strips ONE matched pair of surrounding single/double
 * quotes. Returns `undefined` when nothing meaningful remains so a
 * quotes-only / whitespace-only value counts as "unconfigured".
 */
export function sanitizeEnv(raw: string | undefined | null): string | undefined {
  if (raw == null) return undefined
  let v = raw.trim()
  if (v.length >= 2) {
    const first = v[0]
    const last = v[v.length - 1]
    if ((first === '"' || first === "'") && last === first) {
      v = v.slice(1, -1).trim()
    }
  }
  return v.length > 0 ? v : undefined
}

/**
 * URL-specific sanitizing: apply {@link sanitizeEnv}, then strip trailing slashes
 * (Supabase's project URL must have no path; a trailing `/` breaks storage path
 * joining). Returns `undefined` when nothing meaningful remains.
 */
export function sanitizeUrl(raw: string | undefined | null): string | undefined {
  const v = sanitizeEnv(raw)
  if (!v) return undefined
  const trimmed = v.replace(/\/+$/, '')
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Thin wrapper over Supabase Storage for editor image assets (ADR 0004).
 *
 * The client is created lazily on first use so the API still boots when storage
 * isn't configured — only the upload route degrades (503), mirroring GoogleGuard's
 * "feature unconfigured → 503, never a confusing 500" posture. The service-role key
 * is server-side only and MUST never reach the frontend.
 */
@Injectable()
export class SupabaseStorageService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseStorageService.name)
  private client: SupabaseClient | null = null

  constructor(private readonly config: ConfigService) {}

  /** Sanitized project URL, or undefined when unusable. */
  private get url(): string | undefined {
    return sanitizeUrl(this.config.get<string>('SUPABASE_URL'))
  }

  /** Sanitized service-role key, or undefined when unusable. Never logged. */
  private get serviceRoleKey(): string | undefined {
    return sanitizeEnv(this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY'))
  }

  /**
   * True when both the URL and the service-role key are present AFTER sanitizing —
   * a value that is only quotes/whitespace sanitizes to nothing and counts as
   * unconfigured, so we degrade to a clean 503 instead of trying to build a client.
   */
  isConfigured(): boolean {
    return Boolean(this.url && this.serviceRoleKey)
  }

  /**
   * Boot-time observability probe. Fire-and-forget: NestJS awaits onModuleInit
   * hooks before app.listen(), so awaiting a network call here would let a slow/
   * unreachable dependency stall the entire boot (the process loads, never binds
   * the port, and the platform reports 502 — a mistake we already hit with the
   * mail verify). Runs in the background instead. See {@link MailService}.
   */
  onModuleInit(): void {
    void this.verifyStorage()
  }

  /**
   * Log a single, greppable line describing storage health at boot: unconfigured,
   * or configured + whether the client initializes (and a cheap background bucket
   * reachability check). The URL is not a secret and may be logged; the
   * service-role key MUST never be. Awaitable directly in tests.
   */
  async verifyStorage(): Promise<void> {
    if (!this.isConfigured()) {
      this.logger.warn(
        'Storage probe: UNCONFIGURED — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing or empty after sanitizing; image uploads will 503 (storage-unconfigured)',
      )
      return
    }
    const url = this.url
    let client: SupabaseClient
    try {
      client = this.getClient() // triggers URL validation + client construction (no network)
    } catch {
      // getClient() already logged the real underlying error (storage-init-failed).
      this.logger.error(
        `Storage probe: configured but client init FAILED for "${url}"; image uploads will 503 (storage-init-failed)`,
      )
      return
    }
    this.logger.log(`Storage probe: client initialized OK for ${url} (bucket "${this.bucket}")`)
    // Cheap, non-blocking bucket reachability check (already off the boot await
    // path via onModuleInit's `void`). Confirms the credentials actually work.
    try {
      const { error } = await client.storage.from(this.bucket).list('', { limit: 1 })
      if (error) {
        this.logger.warn(
          `Storage probe: bucket "${this.bucket}" not reachable with current credentials: ${error.message}`,
        )
      } else {
        this.logger.log(`Storage probe: bucket "${this.bucket}" reachable — image uploads ready`)
      }
    } catch (err) {
      this.logger.warn(`Storage probe: bucket check threw: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  get bucket(): string {
    return this.config.get<string>('SUPABASE_STORAGE_BUCKET') || 'file-assets'
  }

  /** Signed-URL lifetime in seconds. Defaults to 10 years (private bucket, long-lived <img src>). */
  private get signedTtl(): number {
    const raw = parseInt(this.config.get<string>('SUPABASE_SIGNED_URL_TTL') || '', 10)
    return Number.isFinite(raw) && raw > 0 ? raw : 60 * 60 * 24 * 365 * 10
  }

  private getClient(): SupabaseClient {
    const url = this.url
    const key = this.serviceRoleKey
    if (!url || !key) {
      throw new ServiceUnavailableException({
        code: 'storage-unconfigured',
        message: 'ที่เก็บไฟล์รูปภาพยังไม่ได้ตั้งค่า (ต้องมี SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY)',
      })
    }
    if (!this.client) {
      // Validate the sanitized URL and guard client construction: a malformed URL
      // (or one whose bad value survived sanitizing) makes supabase-js's internal
      // `new URL()` throw synchronously. Unguarded, that escaped as a blank HTTP
      // 500 in production; here we convert it into a clean, stable 503 so the
      // client gets an actionable code instead of "Internal server error".
      try {
        // Throws TypeError for an invalid URL — caught below, never propagated raw.
        new URL(url)
        this.client = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
      } catch (err) {
        // Log the REAL underlying error server-side for diagnosis. The URL is not
        // a secret and is logged to help pinpoint a quoted/typo'd value; the
        // service-role key is deliberately never included.
        this.logger.error(
          `Supabase client init failed for URL "${url}": ${err instanceof Error ? err.message : String(err)}`,
        )
        throw new ServiceUnavailableException({
          code: 'storage-init-failed',
          message: 'ที่เก็บไฟล์รูปภาพตั้งค่าไม่ถูกต้อง',
        })
      }
    }
    return this.client
  }

  /**
   * Upload a buffer to `<bucket>/<path>` and return a signed URL to render it.
   * Private bucket → we hand back a long-lived signed URL (stored in the doc).
   */
  async upload(path: string, body: Buffer, contentType: string): Promise<{ url: string }> {
    const storage = this.getClient().storage.from(this.bucket)

    const { error: upErr } = await storage.upload(path, body, { contentType, upsert: false })
    if (upErr) {
      this.logger.error(`Supabase upload failed for ${path}: ${upErr.message}`)
      throw new ServiceUnavailableException({
        code: 'storage-upload-failed',
        message: 'อัปโหลดรูปภาพไปยังที่เก็บไฟล์ไม่สำเร็จ',
      })
    }

    const { data, error: signErr } = await storage.createSignedUrl(path, this.signedTtl)
    if (signErr || !data?.signedUrl) {
      this.logger.error(`Supabase signed-url failed for ${path}: ${signErr?.message}`)
      throw new ServiceUnavailableException({
        code: 'storage-url-failed',
        message: 'สร้างลิงก์รูปภาพไม่สำเร็จ',
      })
    }
    return { url: data.signedUrl }
  }

  /**
   * Download an object's bytes for the share asset-proxy (ADR 0006). Streaming the
   * image through the API — instead of handing out a Supabase signed URL — keeps the
   * bucket private and decouples image validity from the FileAsset's signed-URL TTL.
   *
   * Returns `null` (never throws) when the object is missing or storage is
   * unreachable, so the public route can degrade to a 404 / broken-image rather than a
   * 500 (NFR "Reliability"). Images are ≤3MB (upload cap), so buffering is acceptable.
   */
  async download(path: string): Promise<Buffer | null> {
    if (!this.isConfigured()) return null
    try {
      const { data, error } = await this.getClient().storage.from(this.bucket).download(path)
      if (error || !data) {
        this.logger.warn(`Supabase download failed for ${path}: ${error?.message ?? 'no data'}`)
        return null
      }
      return Buffer.from(await data.arrayBuffer())
    } catch (err) {
      this.logger.warn(`Supabase download threw for ${path}: ${(err as Error).message}`)
      return null
    }
  }
}
