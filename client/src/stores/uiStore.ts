import { create } from 'zustand';

export interface Toast {
  id: string;
  message: string;
  variant: 'info' | 'success' | 'warn';
  createdAt: number;
}

interface UIState {
  activeModal: string | null;
  isLeftPanelCollapsed: boolean;
  isRightPanelCollapsed: boolean;
  toasts: Toast[];

  openModal: (id: string) => void;
  closeModal: () => void;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  showToast: (message: string, variant?: Toast['variant']) => void;
  dismissToast: (id: string) => void;
}

let toastCounter = 0;
const MAX_TOASTS = 5;

export const useUIStore = create<UIState>((set) => ({
  activeModal: null,
  isLeftPanelCollapsed: false,
  isRightPanelCollapsed: false,
  toasts: [],

  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),
  toggleLeftPanel: () => set((s) => ({ isLeftPanelCollapsed: !s.isLeftPanelCollapsed })),
  toggleRightPanel: () => set((s) => ({ isRightPanelCollapsed: !s.isRightPanelCollapsed })),

  showToast: (message, variant = 'info') => {
    const toast: Toast = {
      id: `t_${Date.now()}_${++toastCounter}`,
      message,
      variant,
      createdAt: Date.now(),
    };
    set((s) => {
      const next = [...s.toasts, toast];
      // 超过 MAX_TOASTS 移除最旧的
      return { toasts: next.slice(-MAX_TOASTS) };
    });
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
