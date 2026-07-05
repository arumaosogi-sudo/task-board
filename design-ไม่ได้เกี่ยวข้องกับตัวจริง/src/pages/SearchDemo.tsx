// DEMO PAGE — Search Overlay demo (/search-demo)
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Shell } from '../components/Shell'
import { SearchOverlay } from '../components/SearchOverlay'
import { Button } from '../components/ui'
import { Icon } from '../lib/icons'

export default function SearchDemo() {
  const [open, setOpen] = useState(false)

  return (
    <Shell title="Search Overlay">
      <div className="flex flex-col items-center gap-6 py-20 text-center">
        <div className="grid size-16 place-items-center rounded-2xl bg-primary-soft">
          <Icon.search width={28} height={28} className="text-primary" />
        </div>
        <div className="space-y-1">
          <h1 className="font-heading text-2xl font-semibold">Global Search Overlay</h1>
          <p className="text-muted">ค้นหา project, ไฟล์ หรือเนื้อหาได้ทุกที่ด้วย Cmd+K</p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={() => setOpen(true)}>
            <Icon.search width={16} height={16} /> เปิด Search
          </Button>
          <kbd className="rounded-lg border border-line bg-card px-3 py-2 font-mono text-sm text-muted shadow-soft">
            ⌘K
          </kbd>
        </div>
        <p className="text-sm text-muted">
          ลองพิมพ์ "Q3", "บทสรุป" หรือ "ROI" เพื่อดูผลลัพธ์
        </p>
        <Link to="/new-screens" className="text-sm text-muted hover:text-ink">
          ← กลับ Gallery จอใหม่
        </Link>
      </div>
      <SearchOverlay open={open} onClose={() => setOpen(false)} />
    </Shell>
  )
}
