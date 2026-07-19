import { ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SupabaseStorageService, sanitizeEnv, sanitizeUrl } from './supabase-storage.service'

// Mock the supabase-js client factory so no real client/network is created. The
// factory returns a minimal storage chain that the caching + upload tests use.
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}))
import { createClient } from '@supabase/supabase-js'

const mockedCreateClient = createClient as jest.Mock

// Minimal ConfigService stand-in: only `get` is exercised by the service.
const cfg = (map: Record<string, string | undefined>): ConfigService =>
  ({ get: (key: string) => map[key] }) as unknown as ConfigService

const GOOD_URL = 'https://abc.supabase.co'
const GOOD_KEY = 'service-role-key-xyz'

describe('sanitizeEnv', () => {
  it('trims surrounding whitespace/newlines', () => {
    expect(sanitizeEnv('  hello \n')).toBe('hello')
  })
  it('strips one pair of surrounding double quotes', () => {
    expect(sanitizeEnv('"https://abc.supabase.co"')).toBe('https://abc.supabase.co')
  })
  it('strips one pair of surrounding single quotes', () => {
    expect(sanitizeEnv("'service-role-key'")).toBe('service-role-key')
  })
  it('strips quotes even with surrounding whitespace outside them', () => {
    expect(sanitizeEnv('  "value"  ')).toBe('value')
  })
  it('does not strip mismatched or inner quotes', () => {
    expect(sanitizeEnv('"value')).toBe('"value')
    expect(sanitizeEnv('a"b')).toBe('a"b')
  })
  it('returns undefined for null/undefined, empty, whitespace-only, and quotes-only values', () => {
    expect(sanitizeEnv(undefined)).toBeUndefined()
    expect(sanitizeEnv(null)).toBeUndefined()
    expect(sanitizeEnv('')).toBeUndefined()
    expect(sanitizeEnv('   ')).toBeUndefined()
    expect(sanitizeEnv('""')).toBeUndefined()
    expect(sanitizeEnv("''")).toBeUndefined()
  })
})

describe('sanitizeUrl', () => {
  it('strips trailing slashes', () => {
    expect(sanitizeUrl('https://abc.supabase.co/')).toBe('https://abc.supabase.co')
    expect(sanitizeUrl('https://abc.supabase.co///')).toBe('https://abc.supabase.co')
  })
  it('strips quotes and trailing slash together', () => {
    expect(sanitizeUrl('"https://abc.supabase.co/"')).toBe('https://abc.supabase.co')
  })
  it('returns undefined when only quotes/whitespace/slashes remain', () => {
    expect(sanitizeUrl('  "/"  ')).toBeUndefined()
    expect(sanitizeUrl(undefined)).toBeUndefined()
  })
})

describe('SupabaseStorageService', () => {
  beforeEach(() => {
    mockedCreateClient.mockReset()
    mockedCreateClient.mockReturnValue({ storage: { from: jest.fn() } })
  })

  describe('isConfigured', () => {
    it('is true when both values are present and clean', () => {
      const svc = new SupabaseStorageService(cfg({ SUPABASE_URL: GOOD_URL, SUPABASE_SERVICE_ROLE_KEY: GOOD_KEY }))
      expect(svc.isConfigured()).toBe(true)
    })
    it('is true when values arrive quoted (sanitized before the check)', () => {
      const svc = new SupabaseStorageService(
        cfg({ SUPABASE_URL: `"${GOOD_URL}/"`, SUPABASE_SERVICE_ROLE_KEY: `"${GOOD_KEY}"` }),
      )
      expect(svc.isConfigured()).toBe(true)
    })
    it('is false when a value is only quotes or only whitespace', () => {
      expect(new SupabaseStorageService(cfg({ SUPABASE_URL: '""', SUPABASE_SERVICE_ROLE_KEY: GOOD_KEY })).isConfigured()).toBe(false)
      expect(new SupabaseStorageService(cfg({ SUPABASE_URL: GOOD_URL, SUPABASE_SERVICE_ROLE_KEY: '   ' })).isConfigured()).toBe(false)
    })
    it('is false when a value is missing', () => {
      expect(new SupabaseStorageService(cfg({ SUPABASE_URL: GOOD_URL })).isConfigured()).toBe(false)
    })
  })

  describe('client construction via upload', () => {
    const okStorage = () => {
      const upload = jest.fn().mockResolvedValue({ error: null })
      const createSignedUrl = jest.fn().mockResolvedValue({ data: { signedUrl: 'https://signed/url.png' }, error: null })
      const from = jest.fn(() => ({ upload, createSignedUrl }))
      return { from }
    }

    it('constructs the client once and caches it across calls', async () => {
      mockedCreateClient.mockReturnValue({ storage: okStorage() })
      const svc = new SupabaseStorageService(
        cfg({ SUPABASE_URL: `"${GOOD_URL}/"`, SUPABASE_SERVICE_ROLE_KEY: `"${GOOD_KEY}"` }),
      )

      await svc.upload('a.png', Buffer.from('x'), 'image/png')
      await svc.upload('b.png', Buffer.from('y'), 'image/png')

      expect(mockedCreateClient).toHaveBeenCalledTimes(1)
      // The sanitized (unquoted, no trailing slash) URL + key reach supabase-js.
      expect(mockedCreateClient).toHaveBeenCalledWith(GOOD_URL, GOOD_KEY, expect.any(Object))
    })

    it('throws a clean 503 storage-init-failed (not a raw TypeError) when the URL is invalid', async () => {
      const svc = new SupabaseStorageService(
        cfg({ SUPABASE_URL: 'not-a-valid-url', SUPABASE_SERVICE_ROLE_KEY: GOOD_KEY }),
      )
      // isConfigured passes (both present) but `new URL()` throws → mapped to 503.
      expect(svc.isConfigured()).toBe(true)
      await expect(svc.upload('a.png', Buffer.from('x'), 'image/png')).rejects.toMatchObject({
        response: { code: 'storage-init-failed' },
      })
      expect(mockedCreateClient).not.toHaveBeenCalled()
    })

    it('throws 503 storage-unconfigured when a value sanitizes to nothing', async () => {
      const svc = new SupabaseStorageService(cfg({ SUPABASE_URL: '""', SUPABASE_SERVICE_ROLE_KEY: GOOD_KEY }))
      await expect(svc.upload('a.png', Buffer.from('x'), 'image/png')).rejects.toMatchObject({
        response: { code: 'storage-unconfigured' },
      })
    })
  })

  describe('verifyStorage (boot probe)', () => {
    it('logs unconfigured and never builds a client when values are missing', async () => {
      const svc = new SupabaseStorageService(cfg({}))
      const warn = jest.spyOn((svc as unknown as { logger: { warn: jest.Mock } }).logger, 'warn').mockImplementation()
      await svc.verifyStorage()
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('storage-unconfigured'))
      expect(mockedCreateClient).not.toHaveBeenCalled()
    })

    it('reports an init failure without throwing when the URL is invalid', async () => {
      const svc = new SupabaseStorageService(cfg({ SUPABASE_URL: 'not-a-url', SUPABASE_SERVICE_ROLE_KEY: GOOD_KEY }))
      const error = jest.spyOn((svc as unknown as { logger: { error: jest.Mock } }).logger, 'error').mockImplementation()
      await expect(svc.verifyStorage()).resolves.toBeUndefined()
      expect(error).toHaveBeenCalledWith(expect.stringContaining('storage-init-failed'))
    })

    it('probes bucket reachability when configured', async () => {
      const list = jest.fn().mockResolvedValue({ error: null })
      mockedCreateClient.mockReturnValue({ storage: { from: jest.fn(() => ({ list })) } })
      const svc = new SupabaseStorageService(cfg({ SUPABASE_URL: GOOD_URL, SUPABASE_SERVICE_ROLE_KEY: GOOD_KEY }))
      jest.spyOn((svc as unknown as { logger: { log: jest.Mock } }).logger, 'log').mockImplementation()
      await svc.verifyStorage()
      expect(list).toHaveBeenCalled()
    })
  })
})

describe('SupabaseStorageException codes are ServiceUnavailable (503)', () => {
  it('storage-unconfigured maps to a 503', async () => {
    mockedCreateClient.mockReset()
    const svc = new SupabaseStorageService(cfg({}))
    await svc.upload('a.png', Buffer.from('x'), 'image/png').catch((err) => {
      expect(err).toBeInstanceOf(ServiceUnavailableException)
    })
  })
})
