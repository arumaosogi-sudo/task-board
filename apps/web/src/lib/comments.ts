// Sprint 4 — Comments API client + React Query hooks.
//
// Consumes the backend shipped in commit 7e88320 (apps/api/src/comments). Routes are
// nested under a project + file so the server's ProjectRoleGuard enforces membership:
//   GET    /projects/:id/files/:fileId/comments               → roots-with-replies
//   POST   /projects/:id/files/:fileId/comments               → create root or reply
//   PATCH  /projects/:id/files/:fileId/comments/:commentId     → edit body (author only)
//   DELETE /projects/:id/files/:fileId/comments/:commentId     → author or project Owner
//   PATCH  .../:commentId/resolve | /reopen                    → Owner/Editor, root only
//
// Comments are NOT real-time (SRS Assumption #2): the list refetches on mutation, mirroring
// the Revision/Notification pattern. Anchors are opaque serialized Yjs RelativePositions.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

/** Mirrors CommentsService.CommentDto on the API. Roots carry a `replies` array. */
export interface CommentDto {
  id: string
  fileId: string
  authorId: string
  authorName: string
  parentId: string | null
  body: string
  /** Serialized Yjs RelativePosition (JSON) of the highlight start/end — null on replies. */
  anchorFrom: unknown | null
  anchorTo: unknown | null
  /** Plain-text snapshot of the highlighted range at creation (orphan fallback label). */
  anchorText: string | null
  sourceRevisionId: string | null
  resolved: boolean
  resolvedAt: string | null
  resolvedById: string | null
  resolvedByName: string | null
  createdAt: string
  updatedAt: string
  replies?: CommentDto[]
}

export interface CreateCommentBody {
  body: string
  parentId?: string | null
  anchorFrom?: unknown
  anchorTo?: unknown
  anchorText?: string
  sourceRevisionId?: string | null
}

export const commentKeys = {
  list: (projectId: string, fileId: string) => ['comments', projectId, fileId] as const,
}

function base(pid: string, fid: string) {
  return `/projects/${pid}/files/${fid}/comments`
}

export const CommentsApi = {
  list: (pid: string, fid: string) =>
    api.get<CommentDto[]>(base(pid, fid)).then((r) => r.data),
  create: (pid: string, fid: string, body: CreateCommentBody) =>
    api.post<CommentDto>(base(pid, fid), body).then((r) => r.data),
  update: (pid: string, fid: string, commentId: string, body: string) =>
    api.patch<CommentDto>(`${base(pid, fid)}/${commentId}`, { body }).then((r) => r.data),
  remove: (pid: string, fid: string, commentId: string) =>
    api.delete<{ message: string }>(`${base(pid, fid)}/${commentId}`).then((r) => r.data),
  setResolved: (pid: string, fid: string, commentId: string, resolved: boolean) =>
    api
      .patch<CommentDto>(`${base(pid, fid)}/${commentId}/${resolved ? 'resolve' : 'reopen'}`)
      .then((r) => r.data),
}

export function useComments(projectId: string, fileId: string | null, enabled = true) {
  return useQuery({
    queryKey: commentKeys.list(projectId, fileId ?? ''),
    queryFn: () => CommentsApi.list(projectId, fileId!),
    enabled: !!projectId && !!fileId && enabled,
  })
}

export function useCreateComment(projectId: string, fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateCommentBody) => CommentsApi.create(projectId, fileId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: commentKeys.list(projectId, fileId) }),
  })
}

export function useUpdateComment(projectId: string, fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ commentId, body }: { commentId: string; body: string }) =>
      CommentsApi.update(projectId, fileId, commentId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: commentKeys.list(projectId, fileId) }),
  })
}

export function useDeleteComment(projectId: string, fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (commentId: string) => CommentsApi.remove(projectId, fileId, commentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: commentKeys.list(projectId, fileId) }),
  })
}

export function useSetResolved(projectId: string, fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ commentId, resolved }: { commentId: string; resolved: boolean }) =>
      CommentsApi.setResolved(projectId, fileId, commentId, resolved),
    onSuccess: () => qc.invalidateQueries({ queryKey: commentKeys.list(projectId, fileId) }),
  })
}
