import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserInfo, MenuItem } from '../api/user'

interface AuthState {
  token: string
  refreshToken: string
  user: UserInfo | null
  permissions: string[]
  menus: MenuItem[]

  setAuth: (payload: {
    token: string
    refreshToken: string
    user: UserInfo
    permissions: string[]
    menus: MenuItem[]
  }) => void
  clearAuth: () => void
  hasPermission: (permission: string) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: '',
      refreshToken: '',
      user: null,
      permissions: [],
      menus: [],

      setAuth: ({ token, refreshToken, user, permissions, menus }) =>
        set({ token, refreshToken, user, permissions, menus }),

      clearAuth: () =>
        set({ token: '', refreshToken: '', user: null, permissions: [], menus: [] }),

      hasPermission: (permission: string) =>
        get().permissions.includes(permission),
    }),
    {
      name: 'auth-storage', // localStorage key
      partialize: (state) => ({
        token: state.token,
        refreshToken: state.refreshToken,
        user: state.user,
        permissions: state.permissions,
        menus: state.menus,
      }),
    }
  )
)
