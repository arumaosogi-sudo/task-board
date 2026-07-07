// Phase 5 — cross-project revision feeds: API client + React Query hooks.
import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export type UpdatesRange = '7d' | '30d' | 'all'

/** One row in the "My Edits" feed (revisions the current user authored). */
export interface MyUpdateItem {
  id: string
  projectId: string
  projectName: string
  fileId: string
  fileName: string
  scope: 'owner' | 'member'
  label: string | null
  createdAt: string
}

/** One row in the "Changes" feed (revisions by anyone in the user's projects). */
export interface ProjectChangeItem {
  id: string
  projectId: string
  projectName: string
  fileId: string
  fileName: string
  authorId: string
  authorName: string
  label: string | null
  createdAt: string
}

export const updateKeys = {
  myUpdates: (range: UpdatesRange, projectId: string | null) =>
    ['updates', 'mine', range, projectId ?? 'all'] as const,
  projectChanges: (range: UpdatesRange, projectId: string | null, authorId: string | null) =>
    ['updates', 'changes', range, projectId ?? 'all', authorId ?? 'all'] as const,
}

const UpdatesApi = {
  myUpdates: (range: UpdatesRange, projectId: string | null) =>
    api
      .get<MyUpdateItem[]>('/me/updates', { params: { range, projectId: projectId ?? undefined } })
      .then((r) => r.data),
  projectChanges: (range: UpdatesRange, projectId: string | null, authorId: string | null) =>
    api
      .get<ProjectChangeItem[]>('/me/project-changes', {
        params: { range, projectId: projectId ?? undefined, authorId: authorId ?? undefined },
      })
      .then((r) => r.data),
}

export function useMyUpdates(range: UpdatesRange, projectId: string | null) {
  return useQuery({
    queryKey: updateKeys.myUpdates(range, projectId),
    queryFn: () => UpdatesApi.myUpdates(range, projectId),
  })
}

export function useProjectChanges(range: UpdatesRange, projectId: string | null, authorId: string | null) {
  return useQuery({
    queryKey: updateKeys.projectChanges(range, projectId, authorId),
    queryFn: () => UpdatesApi.projectChanges(range, projectId, authorId),
  })
}

export { UpdatesApi }
