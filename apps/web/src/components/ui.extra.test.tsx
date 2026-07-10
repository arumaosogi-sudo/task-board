import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Card, Segmented, Skeleton, Tag, EmptyState } from './ui'

// Complements ui.test.tsx (<Button/> smoke) by covering the primitives the
// Activity page composes: Card's interactive/static split, Segmented toggle,
// Skeleton, Tag tones, and EmptyState.

describe('<Card />', () => {
  it('is a calm static container by default', () => {
    const { container } = render(<Card>body</Card>)
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('shadow-soft')
    expect(card.className).not.toContain('cursor-pointer')
  })

  it('adds hover/lift affordances when interactive', () => {
    const { container } = render(<Card interactive>body</Card>)
    const card = container.firstElementChild as HTMLElement
    expect(card.className).toContain('cursor-pointer')
    expect(card.className).toContain('hover:-translate-y-0.5')
  })
})

describe('<Segmented />', () => {
  it('highlights the selected option and reports changes on click', () => {
    const onChange = vi.fn()
    render(
      <Segmented<string>
        value="a"
        onChange={onChange}
        options={[{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]}
      />,
    )
    expect(screen.getByRole('button', { name: 'A' }).className).toContain('bg-primary')
    fireEvent.click(screen.getByRole('button', { name: 'B' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })
})

describe('<Skeleton />', () => {
  it('applies the shimmer class and merges custom classes', () => {
    const { container } = render(<Skeleton className="h-4 w-1/2" />)
    const el = container.firstElementChild as HTMLElement
    expect(el.className).toContain('skeleton')
    expect(el.className).toContain('h-4')
  })
})

describe('<Tag />', () => {
  it('applies tone-specific classes', () => {
    render(<Tag tone="primary">owner</Tag>)
    expect(screen.getByText('owner').className).toContain('bg-primary-soft')
  })
})

describe('<EmptyState />', () => {
  it('renders its title as a heading and shows the body copy', () => {
    render(<EmptyState title="Nothing here" body="come back later" />)
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument()
    expect(screen.getByText('come back later')).toBeInTheDocument()
  })
})
