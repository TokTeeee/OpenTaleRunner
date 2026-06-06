/**
 * MemoryEntry — 单条记忆的卡片 (网格单元), 跟 CodexEntry 同款。
 */
import type { MemoryRecord, MemoryScope } from '../../types/memory';

const SCOPE_ICONS: Record<MemoryScope, string> = {
  npc: '🎭',
  item: '⚔️',
  event: '📅',
  player: '🧑',
  location: '🗺️',
  lore: '📜',
};

export interface MemoryEntryProps {
  record: MemoryRecord;
  selected?: boolean;
  onClick?: (id: string) => void;
}

export function MemoryEntry({ record, selected, onClick }: MemoryEntryProps) {
  const icon = SCOPE_ICONS[record.scope];
  return (
    <button
      type="button"
      onClick={() => onClick?.(record.id)}
      data-testid="memory-entry"
      data-scope={record.scope}
      data-selected={selected ? 'true' : 'false'}
      className={[
        'w-full text-left p-3 rounded-xl border transition-all',
        selected
          ? 'border-cyan-400/50 bg-cyan-500/10 shadow-[0_0_12px_rgba(34,211,238,0.15)]'
          : 'border-white/[.04] bg-white/[.02] hover:bg-white/[.04] hover:border-cyan-500/20',
      ].join(' ')}
    >
      <div className="flex items-start gap-2">
        <span data-testid="memory-entry-icon" className="text-lg shrink-0">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-ink-100 line-clamp-2 font-sans">
            {record.content}
          </div>
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-ink-400 font-sans">
            <span>第 {record.metadata.worldDay} 天</span>
            <span>·</span>
            <span>重要性 {record.metadata.importance.toFixed(1)}</span>
            {record.entityId && (
              <>
                <span>·</span>
                <span className="text-cyan-400/70">{record.entityId}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
