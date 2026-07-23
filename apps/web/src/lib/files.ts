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
  create: (pid: string, body: { name: string; kind: FileKind; parentId?: string | null; orientation?: 'portrait' | 'landscape'; content?: string }) =>
    api.post<FileDocument>(`/projects/${pid}/files`, body).then((r) => r.data),
  update: (pid: string, fid: string, body: { name?: string; parentId?: string | null; orientation?: string; order?: number }) =>
    api.patch<FileDocument>(`/projects/${pid}/files/${fid}`, body).then((r) => r.data),
  saveContent: (pid: string, fid: string, content: string) =>
    api.put<{ updatedAt: string }>(`/projects/${pid}/files/${fid}/content`, { content }).then((r) => r.data),
  remove: (pid: string, fid: string) => api.delete(`/projects/${pid}/files/${fid}`).then((r) => r.data),
  /**
   * Upload an editor image to Supabase Storage and get back the URL to embed as
   * `<img src>` (ADR 0004 — keeps base64 out of the Yjs CRDT). `onProgress` reports
   * 0..1 for the optimistic progress card; `signal` lets an unmounting editor abort.
   */
  uploadAsset: (
    pid: string,
    fid: string,
    file: Blob,
    opts: { filename?: string; onProgress?: (fraction: number) => void; signal?: AbortSignal } = {},
  ) => {
    const form = new FormData()
    form.append('file', file, opts.filename ?? 'image')
    return api
      .post<{ url: string }>(`/projects/${pid}/files/${fid}/assets`, form, {
        signal: opts.signal,
        onUploadProgress: (e) => {
          if (opts.onProgress && e.total) opts.onProgress(e.loaded / e.total)
        },
      })
      .then((r) => r.data)
  },
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
    mutationFn: (body: { name: string; kind: FileKind; parentId?: string | null; orientation?: 'portrait' | 'landscape'; content?: string }) => FilesApi.create(projectId, body),
    onSuccess: (created) => {
      // Seed the doc cache so opening the just-created document reads from cache
      // instead of paying a redundant GET (the create response already carries its
      // content). Folders have no doc view, so only seed Documents.
      if (created.kind === 'Document') {
        qc.setQueryData(fileKeys.doc(projectId, created.id), created)
      }
      qc.invalidateQueries({ queryKey: fileKeys.tree(projectId) })
    },
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
