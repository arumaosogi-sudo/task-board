# Interaction Specs — key flows

Deliverable 3. Describes the primary flows, the diff open, project/file creation,
and invite-with-permission. Motion budget is deliberately small: hover
micro-interactions, modal pop (160ms), soft page transitions; all collapse under
`prefers-reduced-motion`.

## 1. Login → Home → Work → Editor
1. **Login** (`/`). Submit → button enters `loading` (spinner, disabled). On
   success route to **Home**; on failure show inline error banner + field-level
   error, keep input values, focus the password field. "Remember me" sets a 30-day
   session vs 7-day default.
2. **Home** (`/home`). Cards load via skeleton grid → content. Click a card →
   **Work Page** for that project.
3. **Work Page** (`/work`). Pick a file in the tree, or a thumbnail in the grid →
   **Editor**.
4. **Editor** (`/editor`). Opens on the document; autosave indicator reads
   "บันทึกแล้ว"; presence avatars + live cursors animate in.

## 2. Open a diff (pages 5/6)
- A row in My Updates / Project Changes is a single click target.
- Click → a right-side **drawer** slides in (`translate-x`) with the GitHub-style
  `DiffView` (gutter numbers, +/− markers, green/red, monospace) and a header
  showing project · file · author · timestamp.
- Esc or backdrop click closes; "เปิดไฟล์" deep-links to the exact file in the editor.
- Page 6 adds a per-person filter; rows carry `BY: [person]` + colored avatar.

## 3. Create a project
- FAB (bottom-right, `shadow-fab`) → **Create modal**.
- Fields: name (required, autofocus), description (optional), invite by Gmail,
  and an **Editor/Viewer** permission segmented control for invitees.
- Submit closes the modal; the new card animates into the grid (pop).
- Empty state's primary action opens the same modal.

## 4. Create / import a file (Work Page)
- "+ ใหม่" menu: File แม่ / File ลูก / Quick file / นำรูปภาพ / ถ่ายภาพ / นำเข้า PDF·Word.
- The first three open the **Create-file dialog**: paper size (A4/A5/Letter),
  orientation (Portrait/Landscape) segmented controls, plus a drag-and-drop import
  zone (PDF/.docx ≤ 25 MB). "สร้างและเปิด" routes to the editor.
- File context menu (3-dot, hover-revealed): Rename / Duplicate / Move / Delete.

## 5. Invite with permission
- From a project card's 3-dot menu ("เชิญสมาชิก…") or the create modal.
- Enter a Gmail address; choose **Editor** (edit content) or **Viewer** (read-only).
  Owner is implicit and manages members.
- If the invitee has no account, the system sends an invite to sign up and
  auto-joins them to the project on completion (copy stated in the field hint).

## Roles (UI affordances)
- **Owner** — full controls (invite, delete, transfer, manage members).
- **Editor** — edits documents; no member management.
- **Viewer** — read-only; edit/format controls are hidden/disabled.
Server-side authorization is assumed; the UI only mirrors permissions.
