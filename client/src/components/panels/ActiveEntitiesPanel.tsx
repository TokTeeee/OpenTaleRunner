import { useState, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { APIClient } from '../../services/sync/APIClient';
import { useCharacterStore } from '../../stores/characterStore';

interface ActivityEntity {
  entityId: string;
  entityType: 'player' | 'auto_play' | 'ai_npc';
  entityName: string;
  currentAction: string;
  actionType: string;
  location: { region: string; subRegion: string };
  worldDay: number;
  isOnline: boolean;
  lastActive: string;
}

function timeAgo(iso: string): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return '刚刚';
  if (sec < 3600) return `${Math.floor(sec / 60)}分钟前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}小时前`;
  return `${Math.floor(sec / 86400)}天前`;
}

export function ActiveEntitiesPanel() {
  const [entities, setEntities] = useState<ActivityEntity[]>([]);
  const [collapsed, setCollapsed] = useState(true);
  const characterId = useCharacterStore((s) => s.character?.characterId);
  const serverEndpoint = useSettingsStore((s) => s.server.endpoint);

  const fetchEntities = useCallback(async () => {
    try {
      const api = new APIClient(serverEndpoint);
      const data = await api.getActiveActivities({ isOnline: true }) as { entities: ActivityEntity[] };
      if (data?.entities) {
        setEntities(data.entities.filter(e => e.entityId !== characterId));
      }
    } catch {
      // 服务器不可用时静默
    }
  }, [serverEndpoint, characterId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial mount + interval-driven poll; refactor to subscription in v0.4
    fetchEntities();
    const timer = setInterval(fetchEntities, 30000);
    return () => clearInterval(timer);
  }, [fetchEntities]);

  const onlinePlayers = entities.filter(e => e.entityType === 'player' && e.isOnline);
  const autoPlayers = entities.filter(e => e.entityType === 'auto_play');
  const aiNPCs = entities.filter(e => e.entityType === 'ai_npc');

  const hasContent = onlinePlayers.length > 0 || autoPlayers.length > 0 || aiNPCs.length > 0;

  if (!hasContent && collapsed) return null;

  return (
    <div className="border-t border-white/[.04]">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] text-gray-500 uppercase tracking-wider hover:text-gray-300 transition-colors"
      >
        <span>冒险者 ({entities.length})</span>
        <span className="text-gray-600">{collapsed ? '▶' : '▼'}</span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-2 max-h-48 overflow-y-auto">
          {!hasContent && (
            <div className="text-[10px] text-gray-600 text-center py-2">暂无其他活跃冒险者</div>
          )}

          {onlinePlayers.map((e) => (
            <div key={e.entityId} className="flex items-center gap-2 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-gray-300">{e.entityName}</span>
                <span className="text-gray-600 ml-1">· {timeAgo(e.lastActive)}</span>
                <div className="text-gray-600 truncate">{e.currentAction}</div>
              </div>
            </div>
          ))}

          {autoPlayers.map((e) => (
            <div key={e.entityId} className="flex items-center gap-2 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-gray-300">{e.entityName}</span>
                <span className="text-gray-500 ml-1">[AUTO]</span>
                <div className="text-gray-600 truncate">{e.currentAction}</div>
              </div>
            </div>
          ))}

          {aiNPCs.map((e) => (
            <div key={e.entityId} className="flex items-center gap-2 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-purple-300/80">{e.entityName}</span>
                <span className="text-gray-500 ml-1">[NPC]</span>
                <div className="text-gray-600 truncate">{e.currentAction}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}