// Placeholder mock data — replaced with real API calls in Phase 1+

export const presenceColors: Record<string, string> = {
  A: '#f08a8a', B: '#e9c46a', C: '#82d178', D: '#5fc9d6', E: '#6d5bd0', F: '#e08ad0',
}

export type Project = {
  id: string
  name: string
  about: string
  owner: string
  ownerInitial: string
  members: { initial: string; key: string }[]
  updatedAt: string
  pinned?: boolean
  mine?: boolean
}

export const projects: Project[] = []

export type Update = {
  id: string
  project: string
  file: string
  summary: string
  by?: string
  byKey?: string
  timestamp: string
  added: number
  removed: number
  scope?: 'owner' | 'member'
}

export const myUpdates: Update[] = []
export const projectChanges: Update[] = []

export const diffSample = {
  file: 'document.tbx',
  hunks: [] as Array<{ header: string; lines: Array<{ type: string; n1?: number; n2?: number; text: string }> }>,
}

export type FileNode = {
  id: string
  name: string
  kind: 'parent' | 'kid' | 'box'
  orientation?: 'portrait' | 'landscape'
  updated?: string
  children?: FileNode[]
}

export const fileTree: FileNode[] = []

export const notifications: Array<{
  id: string; key: string; who: string; text: string; time: string; unread: boolean
}> = []
