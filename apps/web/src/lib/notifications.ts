// Notifications API client + React Query hooks.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'

export type NotificationType = 'ProjectInvite' | 'Mention' | 'Revision'

export interface NotificationPayload {
  actorName?: string
  projectId?: string
  projectName?: string
  fileId?: string
  fileName?: string
  revisionLabel?: string | null
}

export interface NotificationItem {
  id: string
  type: NotificationType
  payload: NotificationPayload
  read: boolean
  createdAt: string
}

export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
  unread: () => [...notificationKeys.all, 'unread'] as const,
}

const NotificationsApi = {
  list: () => api.get<NotificationItem[]>('/notifications').then((r) => r.data),
  unreadCount: () => api.get<{ count: number }>('/notifications/unread-count').then((r) => r.data.count),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.patch('/notifications/read-all').then((r) => r.data),
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.list(),
    queryFn: NotificationsApi.list,
    enabled,
  })
}

/** Lightweight poll for the unread badge (every 20s) — snappier near-real-time badge. */
export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: notificationKeys.unread(),
    queryFn: NotificationsApi.unreadCount,
    enabled,
    refetchInterval: 20_000,
    staleTime: 30_000,
  })
}

export function useMarkNotificationRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => NotificationsApi.markRead(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.list() })
      qc.invalidateQueries({ queryKey: notificationKeys.unread() })
    },
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => NotificationsApi.markAllRead(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: notificationKeys.list() })
      qc.invalidateQueries({ queryKey: notificationKeys.unread() })
    },
  })
}
