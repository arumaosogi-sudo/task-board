// Account & settings API client + React Query mutations.
import { useMutation } from '@tanstack/react-query'
import { api } from './api'
import type { AuthUser, UserSetting } from './auth'

export type SettingPatch = Partial<Omit<UserSetting, never>>

export const AccountApi = {
  updateSetting: (patch: SettingPatch) =>
    api.patch<UserSetting>('/auth/me/setting', patch).then((r) => r.data),
  updateProfile: (body: { username?: string; email?: string }) =>
    api.patch<AuthUser>('/auth/me/profile', body).then((r) => r.data),
  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    api.post<{ message: string }>('/auth/me/change-password', body).then((r) => r.data),
  deleteAccount: (body: { password?: string }) =>
    api.delete<{ message: string }>('/auth/me', { data: body }).then((r) => r.data),
}

export function useUpdateSetting() {
  return useMutation({ mutationFn: (patch: SettingPatch) => AccountApi.updateSetting(patch) })
}

export function useUpdateProfile() {
  return useMutation({ mutationFn: AccountApi.updateProfile })
}

export function useChangePassword() {
  return useMutation({ mutationFn: AccountApi.changePassword })
}

export function useDeleteAccount() {
  return useMutation({ mutationFn: AccountApi.deleteAccount })
}
