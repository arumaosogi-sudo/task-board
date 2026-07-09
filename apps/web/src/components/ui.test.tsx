import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest' // augments `expect` with DOM matcher types for tsc
import { render, screen } from '@testing-library/react'
import { Button } from './ui'

// Smoke test #2 (web): proves React Testing Library + jsdom render a real
// component from the UI kit. Explicit vitest imports keep `npm run typecheck`
// green without needing global test types in the app tsconfig.
describe('<Button />', () => {
  it('renders its children as the accessible button label', () => {
    render(<Button>บันทึก</Button>)
    expect(screen.getByRole('button', { name: 'บันทึก' })).toBeInTheDocument()
  })

  it('is disabled while loading', () => {
    render(<Button loading>ส่ง</Button>)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('applies the danger variant class', () => {
    render(<Button variant="danger">ลบ</Button>)
    expect(screen.getByRole('button').className).toContain('bg-danger')
  })
})
