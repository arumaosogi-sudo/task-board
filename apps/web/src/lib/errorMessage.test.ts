import { describe, it, expect } from 'vitest'
import { AxiosError, AxiosHeaders } from 'axios'
import { errorMessage } from './errorMessage'

/** Stand-in for i18next's `t`: echoes the key so assertions stay readable. */
const t = ((key: string) => `t:${key}`) as never

/** An axios rejection shaped like a real API error response. */
function apiFailure(data: { code?: string; message?: string }): AxiosError {
  const err = new AxiosError('Request failed')
  err.response = {
    data,
    status: 400,
    statusText: 'Bad Request',
    headers: {},
    config: { headers: new AxiosHeaders() },
  }
  return err
}

describe('errorMessage', () => {
  it('translates a code that has a localized string', () => {
    expect(errorMessage(apiFailure({ code: 'username-taken', message: 'Username นี้ถูกใช้แล้ว' }), t))
      .toBe('t:errors.usernameTaken')
  })

  it('prefers the translation over the server wording for every mapped code', () => {
    const cases: [string, string][] = [
      ['username-taken', 't:errors.usernameTaken'],
      ['email-taken', 't:errors.emailTaken'],
      ['invalid-credentials', 't:errors.wrongPassword'],
    ]
    for (const [code, key] of cases) {
      expect(errorMessage(apiFailure({ code, message: 'ข้อความจากเซิร์ฟเวอร์' }), t)).toBe(key)
    }
  })

  it('falls back to the server message for an unmapped code', () => {
    expect(errorMessage(apiFailure({ code: 'invalid-move', message: 'ย้ายไฟล์เข้าไปในตัวเองไม่ได้' }), t))
      .toBe('ย้ายไฟล์เข้าไปในตัวเองไม่ได้')
  })

  it('uses the caller fallback when the response carries no message', () => {
    expect(errorMessage(apiFailure({ code: 'weird' }), t, 'ctx fallback')).toBe('ctx fallback')
  })

  it('ends at the generic string when there is no message and no fallback', () => {
    expect(errorMessage(apiFailure({}), t)).toBe('t:errors.generic')
  })

  it('handles a non-axios throw (apiError supplies its own default message)', () => {
    expect(errorMessage(new Error('boom'), t)).toBe('เกิดข้อผิดพลาดที่ไม่คาดคิด')
  })
})
