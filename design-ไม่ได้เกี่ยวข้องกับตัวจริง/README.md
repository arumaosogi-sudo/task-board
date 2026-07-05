# Task Board — Design System & Screens

A themeable **React + TypeScript + Tailwind** design system and high-fidelity
prototype for **Task Board** — a real-time team report/collaboration app
(inspiration: GitHub diff + GoodNotes + Google Docs).

> Lives in `design/` inside this repo so it stays separate from the Unity project
> at the repo root. Self-contained — nothing here touches the game.

## Run

```bash
cd design
npm install
npm run dev      # http://localhost:5173  → opens the Login screen
npm run build    # type-check + production build
```

Start at **`/#/gallery`** for an index of every screen, or **`/#/design-system`**
for tokens + the component library. (Routing uses `HashRouter`, so the static
build also works by opening `dist/index.html` directly.)

## What's included

### 1. Design system (`/#/design-system`)
- **Tokens** as runtime CSS variables — `src/index.css` + portable `design-tokens.json`.
- **6 themes** (Violet, Ocean, Forest, Sunset, Rose, Midnight/dark) — switch live,
  persisted to `localStorage`. Add a theme by adding one `[data-theme]` block.
- **Component library** (`src/components/ui.tsx`): Button, Input/Password, Field,
  Card, Tag, Toggle, Avatar/AvatarStack, Menu, Modal, EmptyState, Skeleton,
  Segmented, Banner.

### 2. Nine screens — each with its states
| # | Screen | Route | States shown |
|---|--------|-------|--------------|
| 1 | Login | `/` | default · error · loading |
| 2 | Sign up | `/signup` | username check (idle/checking/available/taken) · terms gate |
| 3 | Home — all projects | `/home` | default · loading (skeleton) · empty · error · FAB · create modal |
| 4 | My Projects | `/my-projects` | same component as Home, owner filter |
| 5 | My Updates | `/my-updates` | list → diff drawer · default/loading/empty |
| 6 | Project Changes | `/project-changes` | adds `BY: person` + per-person filter |
| 7 | Settings | `/settings` | 2-column · live theme · danger zone |
| 8 | Work Page | `/work` | file tree · A4 thumbnails · "+ new" · create dialog · empty |
| 9 | Editor | `/editor` | tools · format bar · undo/redo · autosave · presence · live cursors · version history · export |

### 3. Diff view (signature)
`src/components/DiffView.tsx` — GitHub-style gutter line numbers, `+`/`−` markers,
green add / red remove, monospace. Used by pages 5/6 and the editor's version history.

## Design direction (summary)
- Clean workspace, warm paper background (`#f6f5f2`), disciplined purple accent (`#6d5bd0`).
- Type: **Sora** (headings) · **Inter** (body) · **Noto Sans Thai** (Thai) · **JetBrains Mono** (diff).
- `radius 14px`, soft shadows, clear type scale.
- Bilingual TH/EN microcopy throughout.

## Accessibility & responsiveness
- WCAG AA contrast targets; visible focus ring on every interactive element.
- Touch targets ≥ 44px (primary controls); tablet/stylus friendly.
- `prefers-reduced-motion` collapses animation/transition durations (`index.css`).
- Responsive: sidebar collapses to an off-canvas drawer; grids reflow to one column on mobile.

## File map
```
design/
├── design-tokens.json        # portable tokens for dev handoff
├── tailwind.config.js        # Tailwind ↔ CSS-variable mapping
├── src/
│   ├── index.css             # token definitions + 6 theme palettes
│   ├── lib/{cn,icons}.ts(x)  # helpers, theme switching, inline icon set
│   ├── data/mock.ts          # realistic bilingual mock content
│   ├── components/           # ui.tsx, Shell, ProjectCard, DiffView, …
│   └── pages/                # 9 screens + DesignSystem + Gallery
```
