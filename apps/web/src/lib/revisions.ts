// Phase 4.5 — document version-history API client + React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

export interface RevisionMeta {
  id: string
  label: string | null
  authorId: string
  authorName: string
  createdAt: string
}
export interface RevisionDetail extends RevisionMeta {
  content: string
}

export const revisionKeys = {
  list: (projectId: string, fileId: string) => ['revisions', projectId, fileId] as const,
  detail: (projectId: string, fileId: string, revisionId: string) =>
    ['revisions', projectId, fileId, revisionId] as const,
}

const RevisionsApi = {
  list: (pid: string, fid: string) =>
    api.get<RevisionMeta[]>(`/projects/${pid}/files/${fid}/revisions`).then((r) => r.data),
  get: (pid: string, fid: string, rid: string) =>
    api.get<RevisionDetail>(`/projects/${pid}/files/${fid}/revisions/${rid}`).then((r) => r.data),
  create: (pid: string, fid: string, body: { label?: string; content?: string }) =>
    api.post<RevisionMeta>(`/projects/${pid}/files/${fid}/revisions`, body).then((r) => r.data),
}

export function useRevisions(projectId: string, fileId: string | null, enabled = true) {
  return useQuery({
    queryKey: revisionKeys.list(projectId, fileId ?? ''),
    queryFn: () => RevisionsApi.list(projectId, fileId!),
    enabled: !!projectId && !!fileId && enabled,
  })
}

export function useRevision(projectId: string, fileId: string | null, revisionId: string | null) {
  return useQuery({
    queryKey: revisionKeys.detail(projectId, fileId ?? '', revisionId ?? ''),
    queryFn: () => RevisionsApi.get(projectId, fileId!, revisionId!),
    enabled: !!projectId && !!fileId && !!revisionId,
  })
}

export function useCreateRevision(projectId: string, fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { label?: string; content?: string }) => RevisionsApi.create(projectId, fileId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: revisionKeys.list(projectId, fileId) }),
  })
}

export { RevisionsApi }
