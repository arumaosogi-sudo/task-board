import type { SVGProps } from 'react'

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const, ...p,
})

export const Icon = {
  search: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>),
  bell: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>),
  plus: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>),
  dots: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="5" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="12" cy="19" r="1.4" /></svg>),
  pin: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M9 4h6l-1 6 3 3H7l3-3-1-6Z" /><path d="M12 16v4" /></svg>),
  gear: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>),
  eye: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>),
  eyeOff: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M9.9 5.2A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3 3.8M6.2 6.2A18 18 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 4-.8" /><path d="M3 3l18 18M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>),
  check: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M20 6 9 17l-5-5" /></svg>),
  x: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M18 6 6 18M6 6l12 12" /></svg>),
  chevronR: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="m9 6 6 6-6 6" /></svg>),
  chevronD: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="m6 9 6 6 6-6" /></svg>),
  file: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M14 3v5h5" /><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /></svg>),
  folder: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></svg>),
  star: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.78L12 16.77l-5.2 2.73.99-5.78-4.21-4.1 5.82-.85L12 3.5Z" /></svg>),
  grid: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>),
  edit: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>),
  pencil: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="m3 21 3.5-.8L19 7.7a2 2 0 0 0 0-2.8l-.9-.9a2 2 0 0 0-2.8 0L2.8 16.5Z" /></svg>),
  highlighter: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M9 11l-4 4v3h3l4-4" /><path d="M13 7l4 4 4-4-4-4-4 4Z" /><path d="m13 7-4 4" /></svg>),
  eraser: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 15 12 7l5 5-6 6H7l-3-3Z" /><path d="M8.5 10.5 14 16M9 21h11" /></svg>),
  image: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>),
  box: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="m3 8 9 5 9-5M12 13v8" /></svg>),
  bold: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M6 4h7a4 4 0 0 1 0 8H6zM6 12h8a4 4 0 0 1 0 8H6z" /></svg>),
  italic: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M19 4h-9M14 20H5M15 4 9 20" /></svg>),
  underline: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M6 4v6a6 6 0 0 0 12 0V4M4 21h16" /></svg>),
  list: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>),
  checklist: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 5.5 4.5 7 7 4M3 12l1.5 1.5L7 11M3 18.5 4.5 20 7 17M11 6h10M11 12h10M11 18h10" /></svg>),
  table: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></svg>),
  alignLeft: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 6h16M4 12h10M4 18h13" /></svg>),
  alignCenter: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 6h16M7 12h10M6 18h12" /></svg>),
  alignRight: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 6h16M10 12h10M7 18h13" /></svg>),
  undo: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>),
  redo: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h3" /></svg>),
  clock: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>),
  download: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 21h16" /></svg>),
  trash: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>),
  invite: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><circle cx="9" cy="8" r="3.5" /><path d="M3 20a6 6 0 0 1 12 0M18 8v6M15 11h6" /></svg>),
  comment: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-9a8 8 0 0 1 8-8h2a8 8 0 0 1 8 6Z" /></svg>),
  reply: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M9 17 4 12l5-5" /><path d="M4 12h11a5 5 0 0 1 5 5v1" /></svg>),
  logout: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11" /></svg>),
  warning: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M12 3 2 20h20L12 3Z" /><path d="M12 10v4M12 17h.01" /></svg>),
  arrowLeft: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M19 12H5M12 19l-7-7 7-7" /></svg>),
  menu: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 6h18M3 12h18M3 18h18" /></svg>),
  sliders: (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>),
  google: (p: SVGProps<SVGSVGElement>) => (
    <svg width={18} height={18} viewBox="0 0 24 24" {...p}>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  ),
}
