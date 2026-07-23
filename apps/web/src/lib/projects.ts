// Projects API client + React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

export type Role = 'Owner' | 'Editor' | 'Viewer'

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

export const projectKeys = {
  all: ['projects'] as const,
  list: () => [...projectKeys.all, 'list'] as const,
  trash: () => [...projectKeys.all, 'trash'] as const,
  detail: (id: string) => [...projectKeys.all, 'detail', id] as const,
}

/* --------------------------------- raw calls -------------------------------- */
const ProjectsApi = {
  list: () => api.get<ProjectSummary[]>('/projects').then((r) => r.data),
  detail: (id: string) => api.get<ProjectDetail>(`/projects/${id}`).then((r) => r.data),
  create: (body: { name: string; description?: string }) =>
    api.post<ProjectDetail>('/projects', body).then((r) => r.data),
  update: (id: string, body: { name?: string; description?: string }) =>
    api.patch<ProjectDetail>(`/projects/${id}`, body).then((r) => r.data),
  remove: (id: string) => api.delete(`/projects/${id}`).then((r) => r.data),
  restore: (id: string) => api.post<ProjectDetail>(`/projects/${id}/restore`).then((r) => r.data),
  permanent: (id: string) => api.delete(`/projects/${id}/permanent`).then((r) => r.data),
  pin: (id: string) => api.post(`/projects/${id}/pin`).then((r) => r.data),
  unpin: (id: string) => api.delete(`/projects/${id}/pin`).then((r) => r.data),
  trash: () => api.get<ProjectSummary[]>('/projects/trash').then((r) => r.data),
  members: (id: string) => api.get<ProjectMember[]>(`/projects/${id}/members`).then((r) => r.data),
  invite: (id: string, body: { email: string; role: Exclude<Role, 'Owner'> }) =>
    api.post(`/projects/${id}/invitations`, body).then((r) => r.data),
  updateRole: (id: string, userId: string, role: Exclude<Role, 'Owner'>) =>
    api.patch<ProjectMember>(`/projects/${id}/members/${userId}`, { role }).then((r) => r.data),
  removeMember: (id: string, userId: string) =>
    api.delete(`/projects/${id}/members/${userId}`).then((r) => r.data),
  transfer: (id: string, userId: string) =>
    api.post<ProjectDetail>(`/projects/${id}/transfer`, { userId }).then((r) => r.data),
  leave: (id: string) => api.post(`/projects/${id}/leave`).then((r) => r.data),
}

/* ----------------------------------- hooks ---------------------------------- */
export function useProjects() {
  return useQuery({ queryKey: projectKeys.list(), queryFn: ProjectsApi.list })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ProjectsApi.create,
    onSuccess: (created) => {
      // Show the new project card immediately (create returns the full detail, a
      // superset of the summary) instead of leaving the list stale until a refetch
      // round-trip lands — the invalidate below reconciles ordering in the background.
      qc.setQueryData<ProjectSummary[]>(projectKeys.list(), (old) =>
        old ? [created, ...old.filter((p) => p.id !== created.id)] : old,
      )
      qc.invalidateQueries({ queryKey: projectKeys.list() })
    },
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => ProjectsApi.remove(id),
    // Soft delete moves the project into trash — refresh both lists so Trash isn't stale.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.list() })
      qc.invalidateQueries({ queryKey: projectKeys.trash() })
    },
  })
}

export function useTogglePin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) =>
      pinned ? ProjectsApi.unpin(id) : ProjectsApi.pin(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.list() }),
  })
}

export function useProject(id: string) {
  return useQuery({ queryKey: projectKeys.detail(id), queryFn: () => ProjectsApi.detail(id), enabled: !!id })
}

export function useTrash() {
  // Always refetch on mount: trash is visited rarely and a stale/empty cache here is
  // confusing (the global 30s staleTime would otherwise serve a stale list).
  return useQuery({ queryKey: projectKeys.trash(), queryFn: ProjectsApi.trash, refetchOnMount: 'always' })
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { name?: string; description?: string }) => ProjectsApi.update(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(id) })
      qc.invalidateQueries({ queryKey: projectKeys.list() })
    },
  })
}

export function useRestoreProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => ProjectsApi.restore(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.trash() })
      qc.invalidateQueries({ queryKey: projectKeys.list() })
    },
  })
}

export function usePermanentDelete() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => ProjectsApi.permanent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.trash() }),
  })
}

/** Member mutations all refresh the project detail (and list, since memberCount changes). */
function useMemberMutation<TArgs>(id: string, fn: (args: TArgs) => Promise<unknown>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: projectKeys.detail(id) })
      qc.invalidateQueries({ queryKey: projectKeys.list() })
    },
  })
}

export function useInviteMember(id: string) {
  return useMemberMutation(id, (body: { email: string; role: Exclude<Role, 'Owner'> }) =>
    ProjectsApi.invite(id, body))
}

export function useUpdateMemberRole(id: string) {
  return useMemberMutation(id, ({ userId, role }: { userId: string; role: Exclude<Role, 'Owner'> }) =>
    ProjectsApi.updateRole(id, userId, role))
}

export function useRemoveMember(id: string) {
  return useMemberMutation(id, (userId: string) => ProjectsApi.removeMember(id, userId))
}

export function useTransferOwnership(id: string) {
  return useMemberMutation(id, (userId: string) => ProjectsApi.transfer(id, userId))
}

export function useLeaveProject(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => ProjectsApi.leave(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: projectKeys.list() }),
  })
}

export { ProjectsApi }
