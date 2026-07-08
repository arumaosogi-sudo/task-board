/** @type {import('tailwindcss').Config} */
const withVar = (name) => `rgb(var(${name}) / <alpha-value>)`

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['class', '[data-mode="dark"]'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: withVar('--c-primary'),
          fg: withVar('--c-primary-fg'),
          soft: withVar('--c-primary-soft'),
          hover: withVar('--c-primary-hover'),
        },
        ink: withVar('--c-ink'),
        nav: withVar('--c-nav'),
        'nav-fg': withVar('--c-nav-fg'),
        paper: withVar('--c-paper'),
        card: withVar('--c-card'),
        line: withVar('--c-line'),
        muted: withVar('--c-muted'),
        subtle: withVar('--c-subtle'),
        'add-fg': withVar('--c-add-fg'),
        'add-bg': withVar('--c-add-bg'),
        'del-fg': withVar('--c-del-fg'),
        'del-bg': withVar('--c-del-bg'),
        warn: withVar('--c-warn'),
        danger: withVar('--c-danger'),
        success: withVar('--c-success'),
      },
      fontFamily: {
        heading: ['Sora', 'Noto Sans Thai', 'sans-serif'],
        body: ['Inter', 'Noto Sans Thai', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        thai: ['"Noto Sans Thai"', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '14px',
        lg: '14px',
        xl: '18px',
        '2xl': '22px',
      },
      boxShadow: {
        soft: '0 1px 2px rgb(29 35 51 / 0.04), 0 4px 16px rgb(29 35 51 / 0.06)',
        pop: '0 8px 30px rgb(29 35 51 / 0.14)',
        card: '0 1px 3px rgb(29 35 51 / 0.05), 0 6px 24px rgb(29 35 51 / 0.07)',
        fab: '0 6px 20px rgb(109 91 208 / 0.35)',
      },
      keyframes: {
        pop: {
          '0%': { opacity: '0', transform: 'translateY(6px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        fade: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        blink: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0' } },
      },
      animation: {
        // `both` = animation-fill-mode: both — retain the 100% (opacity:1) end state.
        // Without it, if the animation is suppressed (e.g. prefers-reduced-motion forces
        // duration ~0), the element can settle on the 0% keyframe (opacity:0) and render
        // invisible — a cause of the "blank screen" when opening the drawing modal.
        pop: 'pop 0.16s ease-out both',
        fade: 'fade 0.2s ease-out both',
        blink: 'blink 1s step-end infinite',
      },
    },
  },
  plugins: [],
}
