// Public share links (Sprint 4, ADR 0006).
//  - Management (create / list / publish / revoke) is Owner-only and goes through the
//    authenticated axios instance.
//  - The public read path uses a BARE axios client with NO credentials and NO refresh
//    interceptor, so the anonymous viewer never touches the auth/session surface.
import axios from 'axios'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

export interface ShareLink {
  id: string
  fileId: string
  createdByUsername: string
  publishedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  lastAccessedAt: string | null
  accessCount: number
  createdAt: string
}

export interface CreateShareLinkResponse {
  link: ShareLink
  token: string
  url: string
}

export interface PublicShareContent {
  fileName: string
  contentHtml: string
  publishedAt: string
}

export interface CreateShareLinkBody {
  expiresInDays?: 7 | 30 | 90
  noExpiry?: boolean
}

/* ------------------------------ public (anon) ---------------------------- */

// Deliberately separate from `api`: no `withCredentials`, no interceptors. Nothing
// here can send the refresh cookie or trigger a token refresh.
const publicClient = axios.create({ baseURL: API_URL })

export function fetchPublicShare(token: string): Promise<PublicShareContent> {
  return publicClient
    .get<PublicShareContent>(`/public/share/${encodeURIComponent(token)}`)
    .then((r) => r.data)
}

/** Absolute asset-proxy prefix for this token, scoped to the guarded public route. */
export function assetProxyPrefix(token: string): string {
  return `${API_URL}/public/share/${encodeURIComponent(token)}/assets/`
}

/**
 * Swap the stored `tbasset:<id>` placeholders for real, token-scoped asset-proxy URLs.
 * The server never stores the plaintext token, so this final assembly happens client
 * side, where the token is already known from the route.
 */
export function resolveShareAssets(html: string, token: string): string {
  return html.split('tbasset:').join(assetProxyPrefix(token))
}

/* --------------------------- management (Owner) -------------------------- */

const base = (pid: string, fid: string) => `/projects/${pid}/files/${fid}/share-links`

export const ShareApi = {
  list: (pid: string, fid: string) => api.get<ShareLink[]>(base(pid, fid)).then((r) => r.data),
  create: (pid: string, fid: string, body: CreateShareLinkBody) =>
    api.post<CreateShareLinkResponse>(base(pid, fid), body).then((r) => r.data),
  publish: (pid: string, fid: string, id: string) =>
    api.patch<ShareLink>(`${base(pid, fid)}/${id}/publish`, {}).then((r) => r.data),
  revoke: (pid: string, fid: string, id: string) =>
    api.delete<{ message: string }>(`${base(pid, fid)}/${id}`).then((r) => r.data),
}

export const shareKeys = {
  list: (pid: string, fid: string) => ['share-links', pid, fid] as const,
}

export function useShareLinks(projectId: string, fileId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: shareKeys.list(projectId, fileId ?? ''),
    queryFn: () => ShareApi.list(projectId, fileId!),
    enabled: enabled && !!projectId && !!fileId,
  })
}

export function useCreateShareLink(projectId: string, fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateShareLinkBody) => ShareApi.create(projectId, fileId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: shareKeys.list(projectId, fileId) }),
  })
}

export function usePublishShareLink(projectId: string, fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => ShareApi.publish(projectId, fileId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: shareKeys.list(projectId, fileId) }),
  })
}

export function useRevokeShareLink(projectId: string, fileId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => ShareApi.revoke(projectId, fileId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: shareKeys.list(projectId, fileId) }),
  })
}
