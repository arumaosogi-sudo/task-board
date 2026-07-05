import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { AuthLayout } from '../components/AuthLayout'
import { Card, Button, Input, Field, Banner } from '../components/ui'
import { Icon } from '../lib/icons'
import { cn } from '../lib/cn'
import { api, apiError } from '../lib/api'

type Strength = 'none' | 'weak' | 'ok' | 'strong'

function getStrength(pw: string): Strength {
  if (!pw) return 'none'
  const hasLong = pw.length >= 15
  const hasMix = pw.length >= 8 && /[0-9]/.test(pw) && /[a-z]/.test(pw)
  const hasSpecial = /[^a-z0-9]/i.test(pw)
  if (hasLong || (hasMix && hasSpecial)) return 'strong'
  if (hasMix) return 'ok'
  return 'weak'
}

function StrengthBar({ strength, t }: { strength: Strength; t: TFunction }) {
  const fill = { none: 0, weak: 1, ok: 2, strong: 3 }[strength]
  const color = strength === 'weak' ? 'bg-danger' : strength === 'ok' ? 'bg-warn' : 'bg-success'
  const label = {
    none: '',
    weak: t('auth.strengthWeak'),
    ok: t('auth.strengthOk'),
    strong: t('auth.strengthStrong'),
  }[strength]
  const labelColor = { none: '', weak: 'text-danger', ok: 'text-warn', strong: 'text-success' }[strength]
  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i < fill ? color : 'bg-line')} />
        ))}
      </div>
      {strength !== 'none' && <p className={cn('text-[11px] font-medium', labelColor)}>{t('auth.passwordStrength', { level: label })}</p>}
    </div>
  )
}

export default function ResetPassword() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [state, setState] = useState<'default' | 'loading' | 'success'>('default')
  const [error, setError] = useState('')

  const strength = getStrength(password)
  const mismatch = confirm.length > 0 && password !== confirm
  // API requires >= 8 chars; UI nudges toward 'ok' strength (8 + digit + lowercase).
  const canSubmit = password.length >= 8 && password === confirm && !!token

  async function submit() {
    setError('')
    setState('loading')
    try {
      await api.post('/auth/reset-password', { token, password })
      setState('success')
    } catch (err) {
      setState('default')
      setError(apiError(err).message || t('auth.resetFailed'))
    }
  }

  if (!token) {
    return (
      <AuthLayout>
        <Card className="p-6 sm:p-7">
          <div className="space-y-4 text-center">
            <h1 className="font-heading text-xl font-semibold">{t('auth.invalidLink')}</h1>
            <p className="text-sm text-muted">{t('auth.noResetToken')}</p>
            <Link to="/forgot-password"><Button full>{t('auth.requestNewResetLink')}</Button></Link>
          </div>
        </Card>
      </AuthLayout>
    )
  }

  if (state === 'success') {
    return (
      <AuthLayout>
        <Card className="p-6 sm:p-7">
          <div className="flex flex-col items-center gap-5 py-2 text-center">
            <div className="grid size-16 place-items-center rounded-2xl bg-success/10">
              <Icon.check width={28} height={28} className="text-success" />
            </div>
            <div className="space-y-1">
              <h1 className="font-heading text-xl font-semibold">{t('auth.resetSuccess')}</h1>
              <p className="text-sm text-muted">{t('auth.resetSuccessDesc')}</p>
            </div>
            <Link to="/" className="w-full"><Button full>{t('auth.backToSignInButton')}</Button></Link>
          </div>
        </Card>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <Card className="p-6 sm:p-7">
        <div className="mb-6 text-center">
          <h1 className="font-heading text-[22px] font-semibold">{t('auth.setNewPassword')}</h1>
          <p className="mt-1 text-sm text-muted">{t('auth.passwordRule')}</p>
        </div>

        {error && <div className="mb-4"><Banner tone="error">{error}</Banner></div>}

        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (canSubmit) void submit() }}>
          <Field label={t('auth.newPassword')} htmlFor="pw">
            <div className="relative">
              <Input id="pw" type={showPw ? 'text' : 'password'} placeholder="••••••••" value={password}
                onChange={(e) => setPassword(e.target.value)} autoFocus />
              <button type="button" onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle hover:text-ink">
                {showPw ? <Icon.eyeOff width={16} height={16} /> : <Icon.eye width={16} height={16} />}
              </button>
            </div>
            <StrengthBar strength={strength} t={t} />
          </Field>

          <Field label={t('auth.confirmPasswordShort')} htmlFor="confirm" error={mismatch ? t('auth.passwordMismatch') : undefined}>
            <Input id="confirm" type="password" placeholder="••••••••" value={confirm}
              onChange={(e) => setConfirm(e.target.value)} state={mismatch ? 'error' : 'default'} />
          </Field>

          <Button type="submit" full size="lg" loading={state === 'loading'} disabled={!canSubmit || state === 'loading'}>
            {t('auth.saveNewPassword')}
          </Button>
        </form>
      </Card>
    </AuthLayout>
  )
}
