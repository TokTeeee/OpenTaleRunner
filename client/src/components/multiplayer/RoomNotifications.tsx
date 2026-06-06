import { useMultiplayerStore } from '../../stores/multiplayerStore';
import type { RoomNotification } from '../../types/multiplayer';

const EVENT_ICON: Record<RoomNotification['event'], string> = {
  spectator_joined: '\uD83D\uDEAA',
  character_created: '\u2728',
  player_introduced: '\uD83C\uDF89',
};

const EVENT_LABEL: Record<RoomNotification['event'], string> = {
  spectator_joined: '新观战者',
  character_created: '角色就绪',
  player_introduced: '正式加入',
};

function NotificationBubble({ note }: { note: RoomNotification }) {
  return (
    <div className="glass rounded-lg p-2.5 border border-white/[.04] animate-in">
      <div className="flex items-start gap-2">
        <span className="text-sm shrink-0">{EVENT_ICON[note.event] || '\u2139\uFE0F'}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-gray-600 uppercase tracking-wider">
            {EVENT_LABEL[note.event] || note.event}
          </div>
          <div className="text-[11px] text-gray-300 mt-0.5 leading-snug">
            {note.narrative}
          </div>
          {note.characterName && (
            <div className="text-[9px] text-gray-600 mt-0.5">
              {note.characterName}
              {note.characterBackground ? ` \u00B7 ${note.characterBackground.slice(0, 30)}` : ''}
            </div>
          )}
          <div className="text-[8px] text-gray-700 mt-1">
            第 {note.round} 轮
          </div>
        </div>
      </div>
    </div>
  );
}

export function RoomNotifications() {
  const notifications = useMultiplayerStore((s) => s.roomNotifications);
  const lastSeenIndex = useMultiplayerStore((s) => s.lastSeenNotificationIndex);
  const markSeen = useMultiplayerStore((s) => s.markNotificationsSeen);

  if (notifications.length === 0) return null;

  const unseenCount = Math.max(0, notifications.length - 1 - lastSeenIndex);
  const recent = notifications.slice(-8).reverse();

  return (
    <div>
      <button
        onClick={() => markSeen()}
        className="text-[10px] text-gray-600 uppercase tracking-wider mb-2 flex items-center gap-1.5 hover:text-gray-500 transition-colors"
        title="标记为已读"
      >
        <span>\uD83D\uDD14 房间通知</span>
        {unseenCount > 0 && (
          <span className="px-1.5 py-0.5 rounded-full text-[9px] bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
            {unseenCount}
          </span>
        )}
      </button>
      <div className="space-y-1.5">
        {recent.map((note, i) => (
          <NotificationBubble key={`${note.timestamp}-${i}`} note={note} />
        ))}
      </div>
    </div>
  );
}
