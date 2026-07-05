import { type ReactNode } from 'react'
import { ThemeSwitcher } from './ThemeSwitcher'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-paper">
      <header className="flex h-16 items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-[10px] bg-primary text-primary-fg font-heading font-bold">T</span>
          <span className="font-heading text-[15px] font-semibold">Task Board</span>
        </div>
        <div className="hidden sm:block"><ThemeSwitcher inline /></div>
      </header>
      <div className="grid place-items-center px-4 pb-16 pt-6 sm:pt-12">
        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </div>
  )
}
