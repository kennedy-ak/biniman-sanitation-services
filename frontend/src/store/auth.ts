import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ACCESS_KEY, REFRESH_KEY } from '@/api/client'
import type { AuthTokens, User } from '@/types'

interface AuthState {
  user: User | null
  hydrated: boolean
  setUser: (user: User | null) => void
  setSession: (user: User, tokens: AuthTokens) => void
  setHydrated: (v: boolean) => void
  logout: () => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      hydrated: false,
      setUser: (user) => set({ user }),
      setSession: (user, tokens) => {
        localStorage.setItem(ACCESS_KEY, tokens.access)
        localStorage.setItem(REFRESH_KEY, tokens.refresh)
        set({ user })
      },
      setHydrated: (v) => set({ hydrated: v }),
      logout: () => {
        localStorage.removeItem(ACCESS_KEY)
        localStorage.removeItem(REFRESH_KEY)
        set({ user: null })
      },
    }),
    {
      name: 'biniman.auth',
      partialize: (s) => ({ user: s.user }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true)
      },
    },
  ),
)
