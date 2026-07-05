// NEW SCREEN — Project Settings (/project/:id/settings)
// Owner only: Members + Rename + Transfer + Leave + Delete
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Shell } from '../components/Shell'
import { Icon } from '../lib/icons'
import { Card, Button, Input, Field, Avatar, Tag, Modal, Banner } from '../components/ui'
import { cn } from '../lib/cn'

const PROJECT_NAME = 'Q3 Marketing Report'

type Role = 'Owner' | 'Editor' | 'Viewer'
interface Member { id: string; name: string; email: string; role: Role; ck: string }

const members: Member[] = [
  { id: '1', name: 'Me', email: 'me@example.com', role: 'Owner', ck: 'E' },
  { id: '2', name: 'Nicha', email: 'nicha@example.com', role: 'Editor', ck: 'A' },
  { id: '3', name: 'Praew', email: 'praew@example.com', role: 'Viewer', ck: 'C' },
]

const roleColors: Record<Role, string> = {
  Owner: 'primary',
  Editor: 'neutral',
  Viewer: 'neutral',
}

const sections = [
  { id: 'members', label: 'สมาชิก' },
  { id: 'general', label: 'ทั่วไป' },
  { id: 'danger', label: 'Danger zone' },
]

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className={cn(
      'rounded-md px-2 py-0.5 text-[11px] font-semibold',
      role === 'Owner' ? 'bg-primary-soft text-primary' : 'bg-line text-muted'
    )}>
      {role}
    </span>
  )
}

export default function ProjectSettings() {
  const [active, setActive] = useState('members')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'Editor' | 'Viewer'>('Editor')
  const [memberList, setMemberList] = useState(members)
  const [projectName, setProjectName] = useState(PROJECT_NAME)
  const [transferModal, setTransferModal] = useState(false)
  const [leaveModal, setLeaveModal] = useState(false)
  const [deleteModal, setDeleteModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [saved, setSaved] = useState(false)

  function handleRemove(id: string) {
    setMemberList((m) => m.filter((mb) => mb.id !== id))
  }

  function handleRoleChange(id: string, role: Role) {
    setMemberList((m) => m.map((mb) => mb.id === id ? { ...mb, role } : mb))
  }

  function handleSaveName() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <Shell title="ตั้งค่า Project">
      <div className="mx-auto max-w-5xl">
        {/* breadcrumb */}
        <div className="mb-4 flex items-center gap-2 text-[13px] text-muted">
          <Link to="/home" className="hover:text-ink">Project ทั้งหมด</Link>
          <Icon.chevronR width={14} height={14} />
          <Link to="/work" className="hover:text-ink">{projectName}</Link>
          <Icon.chevronR width={14} height={14} />
          <span className="text-ink">ตั้งค่า</span>
        </div>

        <h1 className="mb-5 font-heading text-2xl font-semibold">ตั้งค่า Project</h1>

        <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
          {/* section nav */}
          <nav className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
            {sections.map((s) => (
              <button key={s.id} onClick={() => setActive(s.id)}
                className={cn('whitespace-nowrap rounded-xl px-3 py-2 text-left text-[13.5px] font-medium transition',
                  active === s.id
                    ? s.id === 'danger' ? 'bg-danger/10 text-danger' : 'bg-primary-soft text-primary'
                    : s.id === 'danger' ? 'text-danger/80 hover:bg-danger/5' : 'text-muted hover:bg-ink/5 hover:text-ink',
                )}>
                {s.label}
              </button>
            ))}
          </nav>

          <div className="space-y-5">
            {/* Members */}
            {active === 'members' && (
              <Card className="p-5">
                <h2 className="mb-4 font-heading text-lg font-semibold">สมาชิก ({memberList.length})</h2>

                {/* member list */}
                <div className="divide-y divide-line">
                  {memberList.map((m) => (
                    <div key={m.id} className="flex items-center gap-3 py-3">
                      <Avatar initial={m.name[0]} ck={m.ck} size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-ink">{m.name}</p>
                        <p className="text-[12px] text-muted">{m.email}</p>
                      </div>
                      <RoleBadge role={m.role} />
                      {m.role !== 'Owner' && (
                        <button
                          onClick={() => handleRemove(m.id)}
                          className="grid size-8 place-items-center rounded-lg text-subtle hover:bg-danger/10 hover:text-danger"
                          title="นำออก"
                        >
                          <Icon.x width={15} height={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* invite */}
                <div className="mt-4 space-y-3 border-t border-line pt-4">
                  <p className="text-[13px] font-semibold text-ink">เชิญสมาชิกใหม่</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="email@example.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="flex-1"
                    />
                    <div className="flex overflow-hidden rounded-xl border border-line">
                      {(['Editor', 'Viewer'] as const).map((r) => (
                        <button key={r} onClick={() => setInviteRole(r)}
                          className={cn('px-3 py-2 text-[13px] font-medium transition',
                            inviteRole === r ? 'bg-primary text-primary-fg' : 'bg-card text-muted hover:bg-ink/5')}>
                          {r}
                        </button>
                      ))}
                    </div>
                    <Button disabled={!inviteEmail}>ส่งคำเชิญ</Button>
                  </div>
                  <p className="text-[12px] text-muted">
                    ถ้ายังไม่มีบัญชี ระบบจะส่งคำเชิญให้สมัครแล้วเข้า project อัตโนมัติ
                  </p>
                </div>
              </Card>
            )}

            {/* General */}
            {active === 'general' && (
              <Card className="p-5">
                <h2 className="mb-4 font-heading text-lg font-semibold">ทั่วไป</h2>
                {saved && <div className="mb-4"><Banner tone="success">บันทึกสำเร็จแล้ว</Banner></div>}
                <div className="space-y-4">
                  <Field label="ชื่อ Project" htmlFor="pname">
                    <Input id="pname" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
                  </Field>
                  <Button onClick={handleSaveName}>บันทึก</Button>
                </div>
              </Card>
            )}

            {/* Danger zone */}
            {active === 'danger' && (
              <Card className="divide-y divide-line p-5">
                <h2 className="mb-4 font-heading text-lg font-semibold text-danger">Danger zone</h2>

                <div className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-ink">โอนความเป็นเจ้าของ</p>
                    <p className="text-[12px] text-muted">ส่งมอบสิทธิ์ Owner ให้สมาชิกคนอื่น</p>
                  </div>
                  <Button variant="secondary" onClick={() => setTransferModal(true)}>โอนสิทธิ์…</Button>
                </div>

                <div className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-ink">ออกจาก Project</p>
                    <p className="text-[12px] text-muted">คุณจะไม่สามารถเข้าถึง project นี้อีก</p>
                  </div>
                  <Button variant="secondary" onClick={() => setLeaveModal(true)}>ออกจาก Project…</Button>
                </div>

                <div className="flex items-center justify-between gap-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-danger">ลบ Project</p>
                    <p className="text-[12px] text-muted">ลบ project และไฟล์ทั้งหมด (เก็บไว้ 30 วัน)</p>
                  </div>
                  <Button variant="ghost" className="text-danger hover:bg-danger/10" onClick={() => setDeleteModal(true)}>
                    ลบ Project…
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Transfer Ownership Modal */}
      <Modal open={transferModal} onClose={() => setTransferModal(false)} title="โอนความเป็นเจ้าของ"
        footer={<><Button variant="ghost" onClick={() => setTransferModal(false)}>ยกเลิก</Button><Button>โอนสิทธิ์</Button></>}>
        <p className="mb-4 text-sm text-muted">เลือกสมาชิกที่จะรับสิทธิ์ Owner</p>
        <div className="space-y-1">
          {memberList.filter((m) => m.role !== 'Owner').map((m) => (
            <label key={m.id} className="flex items-center gap-3 rounded-xl p-3 hover:bg-ink/5 cursor-pointer">
              <input type="radio" name="transfer" className="accent-primary" />
              <Avatar initial={m.name[0]} ck={m.ck} size={32} />
              <div>
                <p className="text-sm font-medium text-ink">{m.name}</p>
                <p className="text-[12px] text-muted">{m.email}</p>
              </div>
            </label>
          ))}
        </div>
      </Modal>

      {/* Leave Modal */}
      <Modal open={leaveModal} onClose={() => setLeaveModal(false)} title="ออกจาก Project?"
        footer={<><Button variant="ghost" onClick={() => setLeaveModal(false)}>ยกเลิก</Button><Button className="bg-danger hover:bg-danger/90">ออกจาก Project</Button></>}>
        <p className="text-sm text-muted">
          คุณจะไม่สามารถเข้าถึง <strong className="text-ink">{projectName}</strong> ได้อีก
          จนกว่าจะได้รับคำเชิญใหม่
        </p>
      </Modal>

      {/* Delete Modal */}
      <Modal open={deleteModal} onClose={() => setDeleteModal(false)} title="ลบ Project?"
        footer={
          <><Button variant="ghost" onClick={() => setDeleteModal(false)}>ยกเลิก</Button>
          <Button className="bg-danger hover:bg-danger/90" disabled={deleteConfirm !== PROJECT_NAME}>
            ลบถาวร
          </Button></>
        }>
        <div className="space-y-3">
          <Banner tone="error">การกระทำนี้ไม่สามารถย้อนกลับได้ ไฟล์ทั้งหมดจะถูกลบใน 30 วัน</Banner>
          <p className="text-sm text-muted">
            พิมพ์ <strong className="font-mono text-ink">{PROJECT_NAME}</strong> เพื่อยืนยัน
          </p>
          <Input placeholder={PROJECT_NAME} value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} />
        </div>
      </Modal>
    </Shell>
  )
}
