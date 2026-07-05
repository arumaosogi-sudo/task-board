// Mobile + iPad preview: renders any screen inside a real device frame via an
// iframe at the device's CSS width, so the responsive layout is visible as a
// "mobile / tablet version". Color + light/dark mode apply globally.
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Icon } from '../lib/icons'
import { cn } from '../lib/cn'
import { ThemeSwitcher } from '../components/ThemeSwitcher'

const screens = [
  { id: '#/', label: 'Login' },
  { id: '#/signup', label: 'Sign up' },
  { id: '#/home', label: 'Home' },
  { id: '#/my-projects', label: 'My Projects' },
  { id: '#/my-updates', label: 'My Updates' },
  { id: '#/project-changes', label: 'Project Changes' },
  { id: '#/settings', label: 'Settings' },
  { id: '#/work', label: 'Work Page' },
  { id: '#/editor', label: 'Editor' },
]

type Device = 'phone' | 'tablet'
const sizes: Record<Device, { w: number; h: number; label: string; radius: number }> = {
  phone: { w: 390, h: 844, label: 'iPhone · 390×844', radius: 44 },
  tablet: { w: 820, h: 1180, label: 'iPad · 820×1180', radius: 26 },
}

function Frame({ device, src, landscape, scale }: { device: Device; src: string; landscape: boolean; scale: number }) {
  const base = sizes[device]
  const w = landscape ? base.h : base.w
  const h = landscape ? base.w : base.h
  return (
    <div className="shrink-0" style={{ width: w * scale, height: h * scale }}>
      <div
        className="relative bg-ink shadow-pop"
        style={{
          width: w, height: h, borderRadius: base.radius, padding: 12,
          transform: `scale(${scale})`, transformOrigin: 'top left',
        }}
      >
        <iframe
          title={`${device} ${src}`}
          src={`${import.meta.env.BASE_URL}${src}`}
          style={{ width: '100%', height: '100%', border: 0, borderRadius: base.radius - 12, background: 'white' }}
        />
      </div>
    </div>
  )
}

export default function Responsive() {
  const [device, setDevice] = useState<Device>('phone')
  const [screen, setScreen] = useState('#/home')
  const [landscape, setLandscape] = useState(false)
  const [scale, setScale] = useState(0.7)

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-line bg-card/85 px-5 py-3 backdrop-blur">
        <Link to="/gallery" className="grid size-9 place-items-center rounded-lg hover:bg-ink/5"><Icon.arrowLeft /></Link>
        <h1 className="font-heading text-[15px] font-semibold">Responsive — มือถือ &amp; iPad</h1>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* device */}
          <div className="inline-flex rounded-xl border border-line bg-card p-0.5">
            {(['phone', 'tablet'] as Device[]).map((d) => (
              <button key={d} onClick={() => setDevice(d)}
                className={cn('h-8 rounded-lg px-3 text-[12px] font-medium', device === d ? 'bg-primary text-primary-fg' : 'text-muted')}>
                {d === 'phone' ? 'มือถือ' : 'iPad'}
              </button>
            ))}
          </div>
          <button onClick={() => setLandscape((v) => !v)}
            className="h-9 rounded-xl border border-line px-3 text-[12px] font-medium text-muted hover:text-ink">
            {landscape ? 'แนวตั้ง' : 'แนวนอน'}
          </button>
          {/* scale */}
          <div className="inline-flex rounded-xl border border-line bg-card p-0.5">
            {[0.5, 0.7, 1].map((s) => (
              <button key={s} onClick={() => setScale(s)}
                className={cn('h-8 rounded-lg px-2.5 text-[12px] font-medium', scale === s ? 'bg-primary text-primary-fg' : 'text-muted')}>
                {s * 100}%
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex gap-6 px-5 py-5">
        {/* screen picker */}
        <aside className="hidden w-44 shrink-0 space-y-1 sm:block">
          {screens.map((s) => (
            <button key={s.id} onClick={() => setScreen(s.id)}
              className={cn('w-full rounded-lg px-3 py-2 text-left text-[13px] font-medium transition',
                screen === s.id ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-ink/5 hover:text-ink')}>
              {s.label}
            </button>
          ))}
          <div className="mt-4 rounded-xl border border-line p-3"><ThemeSwitcher inline /></div>
        </aside>

        {/* frame */}
        <main className="scroll-thin min-w-0 flex-1 overflow-auto">
          <p className="mb-3 text-[12px] text-subtle">{sizes[device].label}{landscape ? ' · แนวนอน' : ''}</p>
          <Frame device={device} src={screen} landscape={landscape} scale={scale} />
        </main>
      </div>
    </div>
  )
}
