/**
 * MemoryModal — 记忆总览 (三栏: scope sidebar + 网格 + 详情)。
 * 跟 CodexModal 同款布局, 复用设计语言。
 */
import { useMemo, useState } from 'react';
import { useMemoryRecords } from '../../hooks/useMemory';
import { MemoryManager } from '../../services/memory/MemoryManager';
import type { MemoryScope } from '../../types/memory';
import { MemoryEntry } from '../items/MemoryEntry';

const SCOPES: Array<{ key: MemoryScope | 'all'; label: string; icon: string }> = [
  { key: 'all', label: '全部', icon: '🧠' },
  { key: 'npc', label: 'NPC', icon: '🎭' },
  { key: 'item', label: '物品', icon: '⚔️' },
  { key: 'event', label: '事件', icon: '📅' },
  { key: 'player', label: '玩家', icon: '🧑' },
  { key: 'location', label: '地点', icon: '🗺️' },
  { key: 'lore', label: '传说', icon: '📜' },
];

export function MemoryModal({ onClose }: { onClose: () => void }) {
  const allRecords = useMemoryRecords();

  const [scope, setScope] = useState<MemoryScope | 'all'>('all');
  const [searchText, setSearchText] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sorted = useMemo(
    () => allRecords.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    ),
    [allRecords],
  );

  const filteredRecords = useMemo(() => {
    return sorted.filter((r) => {
      if (scope !== 'all' && r.scope !== scope) return false;
      if (searchText && !r.content.toLowerCase().includes(searchText.toLowerCase())
          && !r.content.includes(searchText)) {
        return false;
      }
      return true;
    });
  }, [sorted, scope, searchText]);

  const selected = selectedId ? allRecords.find((r) => r.id === selectedId) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
      data-testid="memory-modal"
    >
      <div
        className="bg-ink-900 border border-ink-700/50 rounded-2xl w-[min(1100px,95vw)] h-[80vh] flex overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scope sidebar */}
        <div className="w-[120px] shrink-0 border-r border-white/[.04] p-2 space-y-1">
          {SCOPES.map((s) => (
            <button
              key={s.key}
              onClick={() => setScope(s.key)}
              data-testid={`memory-scope-${s.key}`}
              className={[
                'w-full text-left text-[11px] px-2 py-2 rounded-lg flex items-center gap-2 transition-all',
                scope === s.key
                  ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-400/30'
                  : 'text-ink-300 hover:bg-white/[.04] border border-transparent',
              ].join(' ')}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {/* Grid + search */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex items-center gap-2 p-3 border-b border-white/[.04]">
            <h2 className="text-base font-display text-ink-100 mr-auto">🧠 长期记忆</h2>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="搜索关键词..."
              data-testid="memory-search"
              className="bg-white/[.04] border border-white/[.06] rounded-lg px-3 py-1.5 text-xs text-ink-200 placeholder:text-ink-500 w-48 focus:outline-none focus:border-cyan-500/40"
            />
            <button
              onClick={onClose}
              data-testid="memory-modal-close"
              className="text-ink-400 hover:text-ink-100 transition-colors text-xl px-2"
            >
              ✕
            </button>
          </div>
          <div
            data-testid="memory-grid"
            className="flex-1 overflow-y-auto p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2"
          >
            {filteredRecords.length === 0 ? (
              <div className="col-span-full text-center text-ink-500 text-sm py-12">
                {sorted.length === 0 ? '尚无记忆, 多玩几轮后这里会有内容' : '没有匹配的记忆'}
              </div>
            ) : (
              filteredRecords.map((r) => (
                <MemoryEntry
                  key={r.id}
                  record={r}
                  selected={r.id === selectedId}
                  onClick={setSelectedId}
                />
              ))
            )}
          </div>
        </div>

        {/* Detail sidebar */}
        <div className="w-[320px] shrink-0 border-l border-white/[.04] p-4 overflow-y-auto">
          {selected ? (
            <div className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-cyan-400/70 mb-1">
                  {selected.scope}
                </div>
                <div className="text-sm text-ink-100 font-sans leading-relaxed">
                  {selected.content}
                </div>
              </div>
              <div className="space-y-1.5 text-[11px] text-ink-400 font-sans">
                <div>📅 第 {selected.metadata.worldDay} 天</div>
                {selected.metadata.region && <div>🗺️ {selected.metadata.region}</div>}
                <div>📊 重要性 {selected.metadata.importance.toFixed(2)}</div>
                {selected.entityId && <div>🔗 {selected.entityId}</div>}
                <div>🕐 {new Date(selected.createdAt).toLocaleString()}</div>
              </div>
              <button
                onClick={() => {
                  void MemoryManager.forget(selected.id, 'user-deleted');
                  setSelectedId(null);
                }}
                data-testid="memory-entry-delete"
                className="w-full text-[11px] py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 hover:bg-rose-500/20 transition-all"
              >
                删除此记忆
              </button>
            </div>
          ) : (
            <div className="text-center text-ink-500 text-xs py-12">
              ← 点击左侧记忆查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
