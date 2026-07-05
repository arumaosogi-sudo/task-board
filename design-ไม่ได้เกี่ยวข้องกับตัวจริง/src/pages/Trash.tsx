// NEW SCREEN — Trash (/trash)
// Soft-deleted items (projects + files) — restore or delete permanently
import { useState } from 'react'
import { Shell } from '../components/Shell'
import { Icon } from '../lib/icons'
import { Card, Button, EmptyState, Modal, Banner } from '../components/ui'
import { cn } from '../lib/cn'

type TrashTab = 'projects' | 'files'

interface TrashedProject {
  id: string; name: string; deletedBy: string; deletedAt: string; expiresAt: string
}
interface TrashedFile {
  id: string; name: string; project: string; deletedBy: string; deletedAt: string; expiresAt: string
}

const trashedProjects: TrashedProject[] = [
  { id: '1', name: 'Q2 Report (Draft)', deletedBy: 'Me', deletedAt: '2026-06-15', expiresAt: '2026-07-15' },
  { id: '2', name: 'Old Onboarding', deletedBy: 'Nicha', deletedAt: '2026-06-10', expiresAt: '2026-07-10' },
]
const trashedFiles: TrashedFile[] = [
  { id: 'f1', name: 'บทสรุปเก่า.doc', project: 'Q3 Marketing Report', deletedBy: 'Me', deletedAt: '2026-06-20', expiresAt: '2026-07-20' },
  { id: 'f2', name: 'Draft v1', project: 'Onboarding Handbook', deletedBy: 'Praew', deletedAt: '2026-06-18', expiresAt: '2026-07-18' },
]

function daysLeft(expiresAt: string) {
  const diff = Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000)
  return diff
}

export default function Trash() {
  const [tab, setTab] = useState<TrashTab>('projects')
  const [projects, setProjects] = useState(trashedProjects)
  const [files, setFiles] = useState(trashedFiles)
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'project' | 'file'; id: string; name: string } | null>(null)

  function restoreProject(id: string) { setProjects((p) => p.filter((x) => x.id !== id)) }
  function restoreFile(id: string) { setFiles((f) => f.filter((x) => x.id !== id)) }
  function permanentDelete() {
    if (!confirmDelete) return
    if (confirmDelete.type === 'project') setProjects((p) => p.filter((x) => x.id !== confirmDelete.id))
    else setFiles((f) => f.filter((x) => x.id !== confirmDelete.id))
    setConfirmDelete(null)
  }

  const tabs: { id: TrashTab; label: string; count: number }[] = [
    { id: 'projects', label: 'Project ที่ลบ', count: projects.length },
    { id: 'files', label: 'ไฟล์ที่ลบ', count: files.length },
  ]

  return (
    <Shell title="ถังขยะ">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5">
          <h1 className="font-heading text-2xl font-semibold">ถังขยะ</h1>
          <p className="text-sm text-muted">รายการที่ถูกลบจะอยู่ที่นี่ 30 วันก่อนถูกลบถาวร</p>
        </div>

        {/* tabs */}
        <div className="mb-4 flex gap-1 border-b border-line">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('flex items-center gap-1.5 rounded-t-lg px-4 py-2.5 text-[13.5px] font-medium transition-colors',
                tab === t.id ? 'border-b-2 border-primary text-primary' : 'text-muted hover:text-ink')}>
              {t.label}
              {t.count > 0 && (
                <span className={cn('rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                  tab === t.id ? 'bg-primary-soft text-primary' : 'bg-line text-muted')}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Projects tab */}
        {tab === 'projects' && (
          projects.length === 0
            ? <EmptyState icon={<Icon.trash width={24} height={24} />} title="ถังขยะว่างเปล่า" body="ไม่มี project ที่ถูกลบ" />
            : <div className="space-y-3">
                {projects.map((p) => {
                  const days = daysLeft(p.expiresAt)
                  return (
                    <Card key={p.id} className="flex items-center gap-4 p-4">
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-line">
                        <Icon.folder width={18} height={18} className="text-muted" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink/70 line-through">{p.name}</p>
                        <p className="text-[12px] text-muted">
                          ลบโดย {p.deletedBy} · {p.deletedAt}
                          <span className={cn('ml-2 font-medium', days <= 7 ? 'text-danger' : 'text-muted')}>
                            · หมดอายุใน {days} วัน
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="secondary" size="sm" onClick={() => restoreProject(p.id)}>
                          <Icon.undo width={14} height={14} /> กู้คืน
                        </Button>
                        <Button variant="ghost" size="sm"
                          className="text-danger hover:bg-danger/10"
                          onClick={() => setConfirmDelete({ type: 'project', id: p.id, name: p.name })}>
                          <Icon.trash width={14} height={14} /> ลบถาวร
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
        )}

        {/* Files tab */}
        {tab === 'files' && (
          files.length === 0
            ? <EmptyState icon={<Icon.trash width={24} height={24} />} title="ถังขยะว่างเปล่า" body="ไม่มีไฟล์ที่ถูกลบ" />
            : <div className="space-y-3">
                {files.map((f) => {
                  const days = daysLeft(f.expiresAt)
                  return (
                    <Card key={f.id} className="flex items-center gap-4 p-4">
                      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-line">
                        <Icon.file width={18} height={18} className="text-muted" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-ink/70 line-through">{f.name}</p>
                        <p className="text-[12px] text-muted">
                          {f.project} · ลบโดย {f.deletedBy}
                          <span className={cn('ml-2 font-medium', days <= 7 ? 'text-danger' : 'text-muted')}>
                            · หมดอายุใน {days} วัน
                          </span>
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="secondary" size="sm" onClick={() => restoreFile(f.id)}>
                          <Icon.undo width={14} height={14} /> กู้คืน
                        </Button>
                        <Button variant="ghost" size="sm"
                          className="text-danger hover:bg-danger/10"
                          onClick={() => setConfirmDelete({ type: 'file', id: f.id, name: f.name })}>
                          <Icon.trash width={14} height={14} /> ลบถาวร
                        </Button>
                      </div>
                    </Card>
                  )
                })}
              </div>
        )}
      </div>

      {/* Permanent Delete Confirm */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="ลบถาวร?"
        footer={
          <><Button variant="ghost" onClick={() => setConfirmDelete(null)}>ยกเลิก</Button>
          <Button className="bg-danger hover:bg-danger/90" onClick={permanentDelete}>ลบถาวร</Button></>
        }>
        <div className="mb-3"><Banner tone="error">การกระทำนี้ไม่สามารถย้อนกลับได้</Banner></div>
        <p className="text-sm text-muted">
          <strong className="text-ink">{confirmDelete?.name}</strong> จะถูกลบออกอย่างถาวรและไม่สามารถกู้คืนได้
        </p>
      </Modal>
    </Shell>
  )
}
