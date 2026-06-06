/**
 * 物品图鉴主模态 — 三栏布局 (分类 sidebar + 物品网格 + 详情侧栏)。
 *
 * 状态: 分类/搜索/选中 (本地 useState)
 * 关闭: 调 onClose + useCodexStore.markAllSeen (清 ✨)
 */
import { useMemo, useState } from 'react';
import { useCodexStore, type DiscoveryRecord } from '../../stores/codexStore';
import { useItemRegistryStore } from '../../stores/itemRegistryStore';
import type { ItemCategory, Item } from '../../types/item';
import { CATEGORY_LABELS, CATEGORY_ICONS } from '../../types/item';
import { CodexEntry } from '../items/CodexEntry';
import { ItemDetailPanel } from '../items/ItemDetailPanel';

const CATEGORIES: Array<ItemCategory | 'all'> = [
  'all', 'weapon', 'armor', 'accessory', 'consumable', 'material', 'key_item', 'container',
];

function discoveryToItem(record: DiscoveryRecord): Item {
  // 优先用 firstSeenItemId 拉最新 WorldItem 转 Item
  const live = useItemRegistryStore.getState().get(record.firstSeenItemId);
  if (live) {
    // 去掉 WorldItem 独有字段 (holder/spawnInfo/updatedAt), 保留 history (ItemDetailPanel 用)
    const { holder: _holder, spawnInfo: _spawnInfo, updatedAt: _updatedAt, ...itemView } = live;
    return itemView as Item;
  }
  // fallback: 物品已被 destroy, 用 snapshot 构造 (无 history, 详情面板不显示历史)
  return {
    itemId: record.firstSeenItemId,
    name: record.name,
    category: record.category,
    quality: record.quality,
    effects: record.effects,
    description: '',
    quantity: 1,
  };
}

export function CodexModal({ onClose }: { onClose: () => void }) {
  const discoveries = useCodexStore((s) => s.discoveries);
  const markAllSeen = useCodexStore((s) => s.markAllSeen);

  const [selectedCategory, setSelectedCategory] = useState<ItemCategory | 'all'>('all');
  const [searchText, setSearchText] = useState('');
  const [selectedSignature, setSelectedSignature] = useState<string | null>(null);

  const allRecords = useMemo(() => Object.values(discoveries), [discoveries]);

  const filteredRecords = useMemo(() => {
    return allRecords.filter((r) => {
      if (selectedCategory !== 'all' && r.category !== selectedCategory) return false;
      if (searchText && !r.name.toLowerCase().includes(searchText.toLowerCase())) return false;
      return true;
    });
  }, [allRecords, selectedCategory, searchText]);

  // 分类计数
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allRecords.length };
    for (const r of allRecords) {
      counts[r.category] = (counts[r.category] ?? 0) + 1;
    }
    return counts;
  }, [allRecords]);

  const selectedRecord = selectedSignature ? discoveries[selectedSignature] : null;

  const handleClose = () => {
    markAllSeen();
    onClose();
  };

  return (
    <div
      data-testid="codex-modal"
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    >
      <div className="bg-ink-900 border border-gray-700 rounded-xl w-full max-w-[1100px] h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b border-gray-700">
          <h2 className="text-sm font-bold text-gray-200">📖 物品图鉴 ({allRecords.length})</h2>
          <div className="flex items-center gap-2">
            <input
              data-testid="codex-search"
              type="text"
              placeholder="搜索物品名..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="bg-gray-800/50 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 w-48 focus:outline-none focus:border-indigo-500/40"
            />
            <button
              type="button"
              onClick={handleClose}
              data-testid="codex-modal-close"
              className="text-gray-500 hover:text-gray-300 text-sm"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body: 三栏 */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar: 分类 */}
          <div className="w-32 border-r border-gray-700 p-2 overflow-y-auto">
            {CATEGORIES.map((cat) => {
              const count = categoryCounts[cat] ?? 0;
              const isActive = selectedCategory === cat;
              const label = cat === 'all' ? '全部' : `${CATEGORY_ICONS[cat]} ${CATEGORY_LABELS[cat]}`;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  data-testid={`codex-cat-${cat}`}
                  data-active={isActive}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs mb-1 ${
                    isActive
                      ? 'bg-indigo-500/20 text-indigo-200'
                      : 'text-gray-400 hover:bg-gray-800/50'
                  }`}
                >
                  {label} ({count})
                </button>
              );
            })}
          </div>

          {/* Grid: 物品 */}
          <div className="flex-1 p-3 overflow-y-auto" data-testid="codex-grid">
            {filteredRecords.length === 0 ? (
              <div className="text-center text-xs text-gray-500 py-8">
                {allRecords.length === 0 ? '尚未发现任何物品' : '当前筛选下无物品'}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {filteredRecords.map((r) => (
                  <CodexEntry
                    key={r.signature}
                    record={r}
                    selected={selectedSignature === r.signature}
                    onClick={() => setSelectedSignature(r.signature)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right: 详情 */}
          {selectedRecord && (
            <div className="w-80 border-l border-gray-700 overflow-y-auto">
              <div className="p-2 text-[10px] text-gray-500 uppercase tracking-wider">
                遇到 {selectedRecord.encounterCount} 次 · 首遇 {selectedRecord.firstSeenAt.slice(0, 10)}
              </div>
              <ItemDetailPanel item={discoveryToItem(selectedRecord)} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
