import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Thin wrapper over Supabase Storage for editor image assets (ADR 0004).
 *
 * The client is created lazily on first use so the API still boots when storage
 * isn't configured — only the upload route degrades (503), mirroring GoogleGuard's
 * "feature unconfigured → 503, never a confusing 500" posture. The service-role key
 * is server-side only and MUST never reach the frontend.
 */
@Injectable()
export class SupabaseStorageService {
  private readonly logger = new Logger(SupabaseStorageService.name)
  private client: SupabaseClient | null = null

  constructor(private readonly config: ConfigService) {}

  /** True when both the URL and the service-role key are present. */
  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('SUPABASE_URL') && this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY'),
    )
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
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'storage-unconfigured',
        message: 'ที่เก็บไฟล์รูปภาพยังไม่ได้ตั้งค่า (ต้องมี SUPABASE_URL และ SUPABASE_SERVICE_ROLE_KEY)',
      })
    }
    if (!this.client) {
      this.client = createClient(
        this.config.get<string>('SUPABASE_URL')!,
        this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      )
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
}
