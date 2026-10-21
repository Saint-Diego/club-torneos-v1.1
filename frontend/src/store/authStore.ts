import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser, Session } from '../types';

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  setSession: (session: Session) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setSession: ({ token, user }) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    { name: 'club-auth' },
  ),
);
