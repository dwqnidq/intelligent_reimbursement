import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserInfo, MenuItem } from '../api/user'

interface AuthState {
  token: string
  user: UserInfo | null
  permissions: string[]
  menus: MenuItem[]

  setAuth: (payload: { token: string; user: UserInfo; permissions: string[]; menus: MenuItem[] }) => void
  clearAuth: () => void
  hasPermission: (permission: string) => boolean
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: '',
      user: null,
      permissions: [],
      menus: [],

      setAuth: ({ token, user, permissions, menus }) =>
        set({ token, user, permissions, menus }),

      clearAuth: () =>
        set({ token: '', user: null, permissions: [], menus: [] }),

      hasPermission: (permission: string) =>
        get().permissions.includes(permission),
    }),
    {
      name: 'auth-storage', // localStorage key
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        permissions: state.permissions,
        menus: state.menus,
      }),
    }
  )
)
