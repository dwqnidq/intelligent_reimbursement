import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserInfo, MenuItem } from '../api/user'

interface AuthState {
  token: string
  refreshToken: string
  user: UserInfo | null
  permissions: string[]
  roles: string[]
  menus: MenuItem[]

  setAuth: (payload: {
    token: string
    refreshToken: string
    user: UserInfo
    permissions: string[]
    roles: string[]
    menus: MenuItem[]
  }) => void
  clearAuth: () => void
  hasPermission: (permission: string) => boolean
  hasRole: (role: string) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: '',
      refreshToken: '',
      user: null,
      permissions: [],
      roles: [],
      menus: [],

      setAuth: ({ token, refreshToken, user, permissions, roles, menus }) =>
        set({ token, refreshToken, user, permissions, roles, menus }),

      clearAuth: () =>
        set({
          token: '',
          refreshToken: '',
          user: null,
          permissions: [],
          roles: [],
          menus: [],
        }),

      hasPermission: (permission: string) =>
        get().permissions.includes(permission),

      hasRole: (role: string) => get().roles.includes(role),
    }),
    {
      name: 'auth-storage', // localStorage key
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
        permissions: state.permissions,
        roles: state.roles,
        menus: state.menus,
      }),
    }
  )
)
