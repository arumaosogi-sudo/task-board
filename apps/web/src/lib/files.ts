// Files API client + React Query hooks (Work Page file tree + document content).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

export type FileKind = 'Folder' | 'Document'

export interface FileNode {
  id: string
  name: string
  kind: FileKind
  orientation: string | null
  parentId: string | null
  order: number
  updatedAt: string
  children: FileNode[]
}

export interface FileDocument {
  id: string
  projectId: string
  name: string
  kind: FileKind
  orientation: string | null
  parentId: string | null
  content: string
  updatedAt: string
}

export const fileKeys = {
  tree: (projectId: string) => ['files', projectId, 'tree'] as const,
  doc: (projectId: string, fileId: string) => ['files', projectId, 'doc', fileId] as const,
}

const FilesApi = {
  tree: (pid: string) => api.get<FileNode[]>(`/projects/${pid}/files`).then((r) => r.data),
  get: (pid: string, fid: string) => api.get<FileDocument>(`/projects/${pid}/files/${fid}`).then((r) => r.data),
  create: (pid: string, body: { name: string; kind: FileKind; parentId?: string | null; orientation?: 'portrait' | 'landscape' }) =>
    api.post<FileDocument>(`/projects/${pid}/files`, body).then((r) => r.data),
  update: (pid: string, fid: string, body: { name?: string; parentId?: string | null; orientation?: string; order?: number }) =>
    api.patch<FileDocument>(`/projects/${pid}/files/${fid}`, body).then((r) => r.data),
  saveContent: (pid: string, fid: string, content: string) =>
    api.put<{ updatedAt: string }>(`/projects/${pid}/files/${fid}/content`, { content }).then((r) => r.data),
  remove: (pid: string, fid: string) => api.delete(`/projects/${pid}/files/${fid}`).then((r) => r.data),
}

export function useFileTree(projectId: string) {
  return useQuery({ queryKey: fileKeys.tree(projectId), queryFn: () => FilesApi.tree(projectId), enabled: !!projectId })
}

export function useFile(projectId: string, fileId: string | null) {
  return useQuery({
    queryKey: fileKeys.doc(projectId, fileId ?? ''),
    queryFn: () => FilesApi.get(projectId, fileId!),
    enabled: !!projectId && !!fileId,
  })
}

export function useCreateFile(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name: string; kind: FileKind; parentId?: string | null }) => FilesApi.create(projectId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: fileKeys.tree(projectId) }),
  })
}

export function useUpdateFile(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ fileId, ...body }: { fileId: string; name?: string; parentId?: string | null }) =>
      FilesApi.update(projectId, fileId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: fileKeys.tree(projectId) }),
  })
}

export function useDeleteFile(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (fileId: string) => FilesApi.remove(projectId, fileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: fileKeys.tree(projectId) }),
  })
}

/** Autosave the document body; does not invalidate the open doc to avoid clobbering edits. */
export function useSaveContent(projectId: string, fileId: string) {
  return useMutation({
    mutationFn: (content: string) => FilesApi.saveContent(projectId, fileId, content),
  })
}

export { FilesApi }
