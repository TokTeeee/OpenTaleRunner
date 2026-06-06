/**
 * Toast 容器 — fixed top-right, 4 秒自动 dismiss, CSS 动画 (无 framer-motion)。
 * 最大 5 个同时显示, 超过移除最旧的。
 */
import { useEffect } from 'react';
import { useUIStore } from '../../stores/uiStore';

const TOAST_DURATION_MS = 4000;

export function ToastContainer() {
  const toasts = useUIStore((s) => s.toasts);
  const dismissToast = useUIStore((s) => s.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => dismissToast(t.id), TOAST_DURATION_MS)
    );
    return () => {
      for (const id of timers) clearTimeout(id);
    };
  }, [toasts, dismissToast]);

  if (toasts.length === 0) return null;

  return (
    <div
      data-testid="toast-container"
      className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          data-testid="toast"
          data-variant={t.variant}
          className={[
            'pointer-events-auto px-4 py-2 rounded-lg border shadow-lg min-w-[200px] max-w-[360px]',
            'animate-[toast-in_0.2s_ease-out]',
            t.variant === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
              : t.variant === 'warn'
                ? 'bg-amber-500/15 border-amber-500/30 text-amber-200'
                : 'bg-gray-800/90 border-gray-700 text-gray-200',
          ].join(' ')}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
