import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

interface UserInfo {
  nickname: string
  avatar: string // base64 or url
}

interface UserContextType {
  user: UserInfo
  updateUser: (info: Partial<UserInfo>) => void
}

const UserContext = createContext<UserContextType | null>(null)

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserInfo>({ nickname: '张三', avatar: '' })

  const updateUser = (info: Partial<UserInfo>) =>
    setUser((prev) => ({ ...prev, ...info }))

  return (
    <UserContext.Provider value={{ user, updateUser }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (!ctx) throw new Error('useUser must be used within UserProvider')
  return ctx
}
