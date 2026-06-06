/**
 * 认证会话状态 — 独立于设置存储的 token 管理。
 * token 同样经过加密存储，不被 settingsStore 漂移访问。
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createSecureStorage } from '../services/crypto/CryptoService';

interface AuthState {
  token: string;
  setToken: (token: string) => void;
  clearToken: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: '',
      setToken: (token) => set({ token }),
      clearToken: () => set({ token: '' }),
    }),
    {
      name: 'aeslan-auth',
      storage: createSecureStorage(),
      partialize: (s) => ({ token: s.token }),
    },
  ),
);
