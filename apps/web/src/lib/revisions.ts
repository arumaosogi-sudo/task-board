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

// Max label length — mirrors CreateRevisionDto's @MaxLength(120) on the API.
export const REVISION_LABEL_MAX = 120

// Normalize a manual-commit message into the DTO's `label`: trim, cap at the server limit,
// and collapse an all-whitespace / empty message to `undefined` (a labelless auto-style
// snapshot) so the History timeline only badges genuinely-labeled commits.
export function normalizeCommitLabel(input: string | null | undefined): string | undefined {
  const trimmed = (input ?? '').trim()
  if (!trimmed) return undefined
  return trimmed.slice(0, REVISION_LABEL_MAX)
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
