import { IsBoolean, IsIn, IsOptional } from 'class-validator'

/** Allowed TTLs offered in the UI (days). "No expiry" is a separate deliberate flag. */
export const SHARE_TTL_DAYS = [7, 30, 90] as const

export class CreateShareLinkDto {
  // One of `expiresInDays` (7/30/90) or `noExpiry: true` MUST be provided — the service
  // rejects an ambiguous request so "never expires" is always an intentional choice
  // (ADR 0006 §3.3 / SRS §4), never a silent default.
  @IsOptional()
  @IsIn(SHARE_TTL_DAYS)
  expiresInDays?: (typeof SHARE_TTL_DAYS)[number]

  @IsOptional()
  @IsBoolean()
  noExpiry?: boolean
}
