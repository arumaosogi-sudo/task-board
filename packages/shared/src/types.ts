// Shared types between api and web. Populated incrementally per Phase.

export type Role = 'Owner' | 'Editor' | 'Viewer'
export type ThemeColor = 'violet' | 'ocean' | 'forest' | 'sunset' | 'rose' | 'amber'
export type ThemeMode = 'light' | 'dark'
export type Language = 'th' | 'en'

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  pageSize: number
}

/* ------------------------------- Auth (Phase 1) ------------------------------ */

export interface PublicUser {
  id: string
  username: string
  email: string
  emailVerified: boolean
  createdAt: string
}

export interface UserSettingDto {
  themeColor: ThemeColor
  themeMode: ThemeMode
  language: Language
  fontSize: number
  notifyInvite: boolean
  notifyMention: boolean
  notifyRevision: boolean
}

/** Response of POST /auth/login (refresh token is delivered as an httpOnly cookie). */
export interface LoginResponse {
  user: PublicUser
  accessToken: string
}

/** Response of GET /auth/me. */
export interface MeResponse extends PublicUser {
  setting: UserSettingDto | null
}

export interface CheckUsernameResponse {
  available: boolean
}

/* ----------------------------- Projects (Phase 2) ---------------------------- */

export interface ProjectOwnerRef {
  id: string
  username: string
  email: string
}

export interface ProjectSummary {
  id: string
  name: string
  description: string
  owner: ProjectOwnerRef
  myRole: Role
  memberCount: number
  pinned: boolean
  createdAt: string
  updatedAt: string
  deletedAt: string | null
}

export interface ProjectMember {
  userId: string
  username: string
  email: string
  role: Role
  joinedAt: string
}

export interface ProjectDetail extends ProjectSummary {
  members: ProjectMember[]
}

/* --------------------------- Notifications (Phase 5) ------------------------- */

export type NotificationType = 'ProjectInvite' | 'Mention' | 'Revision'

export interface NotificationPayload {
  actorName?: string
  projectId?: string
  projectName?: string
  fileId?: string
  fileName?: string
  revisionLabel?: string | null
}

export interface NotificationDto {
  id: string
  type: NotificationType
  payload: NotificationPayload
  read: boolean
  createdAt: string
}

/* ------------------------------ Search (Phase 5) ---------------------------- */

export interface SearchProjectHit {
  id: string
  name: string
  description: string
}
export interface SearchFileHit {
  fileId: string
  fileName: string
  projectId: string
  projectName: string
}
export interface SearchContentHit extends SearchFileHit {
  snippet: string
}
export interface SearchResults {
  projects: SearchProjectHit[]
  files: SearchFileHit[]
  contents: SearchContentHit[]
}
