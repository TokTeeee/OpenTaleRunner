import { useEffect, useRef, useState } from 'react';
import { eventBus } from '../../services/event/EventBus';
import { EVENTS } from '../../services/event/events';
import { useGameStore } from '../../stores/gameStore';
import { generateId } from '../../utils/text';

interface SyncPayload {
  channel?: 'poll' | 'push';
  lastSyncTime?: string;
  newEncounterCount?: number;
  previousWorldDay?: number;
  reason?: string;
  worldDay?: number;
  worldDayChanged?: boolean;
}

interface ToastItem {
  id: string;
  title: string;
  detail: string;
  tone: 'indigo' | 'emerald' | 'amber';
}

const TONE_STYLES: Record<ToastItem['tone'], string> = {
  amber: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
  emerald: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
  indigo: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-200',
};

export function WorldSyncNotifications() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const announcedDaysRef = useRef<Set<number>>(new Set());
  const lastSyncToastRef = useRef<{ at: number; signature: string }>({ at: 0, signature: '' });

  useEffect(() => {
    const pushToast = (title: string, detail: string, tone: ToastItem['tone']) => {
      const id = generateId();
      setToasts((current) => [...current, { id, title, detail, tone }].slice(-3));
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, 3600);
    };

    const unsubscribe = eventBus.on(EVENTS.WORLD_SYNCED, (data: unknown) => {
      const payload = (data || {}) as SyncPayload;
      const now = Date.now();
      const channel = payload.channel === 'push' ? 'push' : 'poll';
      const syncSignature = `${channel}:${payload.worldDay ?? 0}:${payload.reason ?? 'sync'}`;

      if (lastSyncToastRef.current.signature !== syncSignature || now - lastSyncToastRef.current.at > 10000) {
        pushToast(
          '同步成功',
          channel === 'push' ? '已收到最新世界状态推送。' : '已拉取最新世界状态。',
          'indigo',
        );
        lastSyncToastRef.current = { at: now, signature: syncSignature };
      }

      if (payload.worldDayChanged && payload.worldDay && !announcedDaysRef.current.has(payload.worldDay)) {
        useGameStore.getState().addDayDivider(payload.worldDay);
        useGameStore.getState().addMessage({
          id: `sync_day_${payload.worldDay}_${now}`,
          type: 'system',
          content: `世界日推进至第${payload.worldDay}天。`,
          timestamp: now,
        });
        announcedDaysRef.current.add(payload.worldDay);
        pushToast('世界日跳变', `世界已推进至第${payload.worldDay}天。`, 'amber');
      }

      if ((payload.newEncounterCount ?? 0) > 0) {
        const encounterCount = payload.newEncounterCount ?? 0;
        useGameStore.getState().addMessage({
          id: `sync_encounter_${now}_${encounterCount}`,
          type: 'system',
          content: encounterCount === 1 ? '一条新奇遇已注入世界。' : `${encounterCount} 条新奇遇已注入世界。`,
          timestamp: now,
        });
        pushToast(
          '新奇遇注入',
          encounterCount === 1 ? '已有 1 条待处理奇遇到达。' : `已有 ${encounterCount} 条待处理奇遇到达。`,
          'emerald',
        );
      }
    });

    return unsubscribe;
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[320px] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`animate-in rounded-2xl border px-4 py-3 shadow-2xl shadow-black/30 backdrop-blur-md ${TONE_STYLES[toast.tone]}`}
        >
          <div className="text-xs font-semibold tracking-[0.18em] uppercase opacity-80">{toast.title}</div>
          <div className="mt-1 text-sm leading-relaxed text-white/90">{toast.detail}</div>
        </div>
      ))}
    </div>
  );
}