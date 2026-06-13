import { useRef, useState } from 'react';
import { useCharacterStore } from '../../stores/characterStore';
import { usePMEngine } from '../../hooks/usePMEngine';
import type { Item } from '../../types/item';
import { ItemCompareTooltip } from './ItemCompareTooltip';
import { ItemCardRow } from '../items/ItemCardRow';
import { ItemChip } from '../items/ItemChip';
import { ItemDetailPanel } from '../items/ItemDetailPanel';

interface Props {
  onClose: () => void;
}

const SLOT_LABELS = { weapon: '⚔武器', armor: '🛡防具', accessory: '💍饰品' } as const;
type EquipSlot = 'weapon' | 'armor' | 'accessory';

export function BackpackModal({ onClose }: Props) {
  const character = useCharacterStore((s) => s.character);
  const updateInventory = useCharacterStore((s) => s.updateInventory);
  const updateHP = useCharacterStore((s) => s.updateHP);
  const { submitCustom } = usePMEngine();
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [hoveredItem, setHoveredItem] = useState<Item | null>(null);
  const [hoveredAnchor, setHoveredAnchor] = useState<{ x: number; y: number } | null>(null);
  const containerElRef = useRef<HTMLDivElement | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleItemEnter = (item: Item, event: React.MouseEvent<HTMLElement>) => {
    // 只对可装备物品触发
    const cat = item.category || 'consumable';
    if (cat !== 'weapon' && cat !== 'armor' && cat !== 'accessory') return;
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    const target = event.currentTarget;
    const rect = target.getBoundingClientRect();
    hoverTimerRef.current = setTimeout(() => {
      setHoveredItem(item);
      setHoveredAnchor({ x: rect.right, y: rect.top + rect.height / 2 });
    }, 100);
  };

  const handleItemLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoveredItem(null);
    setHoveredAnchor(null);
  };

  if (!character) return null;
  const { backpack, equipped, currency } = character.inventory;
  /** 选中的是当前已装备的某槽位 */
  const selectedSlot: EquipSlot | null = selectedItem
    ? (['weapon', 'armor', 'accessory'] as const).find((s) => equipped[s]?.name === selectedItem.name) ?? null
    : null;

  const handleUseItem = (item: Item) => {
    if (!item.quantity || item.quantity <= 0) return;
    const isFood = item.subCategory === '食物' || (item.description || '').includes('食用') || (item.description || '').includes('饱');
    const verb = isFood ? '食用了' : '使用了';
    let actionText = `${verb}${item.name}`;
    const effectText = item.description || '';
    if (item.effects) {
      for (const eff of item.effects) {
        if (eff.type === 'hp_restore') {
          const heal = typeof eff.value === 'number' ? eff.value : 3;
          const newHp = Math.min(character.maxHp, character.hp + heal);
          updateHP(newHp);
          actionText += `，恢复了${heal}点HP`;
        } else if (eff.type === 'vital_restore') {
          actionText += `，${eff.description}`;
        }
      }
    }
    if (effectText.includes('恢复') && effectText.includes('HP') && !actionText.includes('HP')) {
      const hpMatch = effectText.match(/(\d+)/);
      const heal = hpMatch ? parseInt(hpMatch[1]) : 3;
      const newHp = Math.min(character.maxHp, character.hp + heal);
      updateHP(newHp);
      actionText += `，恢复了${heal}点HP`;
    }
    const newBackpack = backpack.map((bp) =>
      bp.name === item.name && bp.quantity ? { ...bp, quantity: bp.quantity - 1 } : bp,
    ).filter((bp) => (bp.quantity ?? 0) > 0);
    updateInventory({ ...character.inventory, backpack: newBackpack });
    setSelectedItem(null);
    onClose();
    setTimeout(() => submitCustom(`[${actionText}]`), 100);
  };

  const discardItem = (item: Item) => {
    if (item.quantity && item.quantity > 1) {
      const newBackpack = backpack.map((bp) =>
        bp.name === item.name && bp.quantity ? { ...bp, quantity: bp.quantity - 1 } : bp,
      );
      updateInventory({ ...character.inventory, backpack: newBackpack });
    } else {
      const newBackpack = backpack.filter((bp) => bp.name !== item.name);
      updateInventory({ ...character.inventory, backpack: newBackpack });
    }
    setSelectedItem(null);
    onClose();
    setTimeout(() => submitCustom(`[丢弃了${item.name}]`), 100);
  };

  /** 装备物品: 更新装备槽位, 属性加成通过纯计算体现 */
  const equipItem = (item: Item, slot: EquipSlot) => {
    const current = equipped[slot];

    const newBackpack = backpack.filter((b) => (b.itemId || b.name) !== (item.itemId || item.name));
    if (current) {
      newBackpack.push({ ...current, equipped: false, equipSlot: undefined });
    }
    const newEquipped = {
      ...equipped,
      [slot]: { ...item, equipped: true, equipSlot: slot, canBeEquipped: true },
    };
    updateInventory({ ...character.inventory, equipped: newEquipped, backpack: newBackpack });
    setSelectedItem(null);
  };

  /** 卸下装备: 移回背包 */
  const unequipItem = (slot: EquipSlot) => {
    const current = equipped[slot];
    if (!current) return;
    const newEquipped = { ...equipped, [slot]: null };
    const newBackpack = [...backpack, { ...current, equipped: false, equipSlot: undefined }];
    updateInventory({ ...character.inventory, equipped: newEquipped, backpack: newBackpack });
    setSelectedItem(null);
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        ref={containerElRef}
        className="bg-gray-900 border border-gray-700 rounded-xl w-[420px] max-h-[75vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="font-bold text-gray-200">🎒 背包</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Currency */}
          <div className="flex gap-3 text-xs">
            <span className="text-amber-400">🪙 {currency.gold}金</span>
            <span className="text-gray-400">🪙 {currency.silver}银</span>
            <span className="text-orange-400">🪙 {currency.copper}铜</span>
          </div>

          {/* Equipped - 改为可点击, 点击后下方显示详情 + 卸下 */}
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">装备中</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {(['weapon', 'armor', 'accessory'] as const).map((slot) => {
                const item = equipped[slot];
                const isSelected = selectedSlot === slot;
                return (
                  <ItemChip
                    key={slot}
                    item={item || null}
                    variant="equipped"
                    slot={slot}
                    selected={isSelected}
                    onClick={() => setSelectedItem(item ? { ...item, equipped: true, equipSlot: slot } : null)}
                  />
                );
              })}
            </div>
          </div>

          {/* Backpack items - 点击展开详情 */}
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">物品 ({backpack.length})</div>
            {backpack.length === 0 ? (
              <div className="text-center text-xs text-gray-600 py-4">背包空空如也</div>
            ) : (
              <div className="space-y-1">
                {backpack.map((item, i) => {
                  const isSelected = selectedItem?.name === item.name && !selectedSlot;
                  return (
                    <ItemCardRow
                      key={i}
                      item={item}
                      selected={isSelected}
                      onClick={() => setSelectedItem(isSelected ? null : item)}
                      onMouseEnter={(e) => handleItemEnter(item, e)}
                      onMouseLeave={handleItemLeave}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* 物品详情面板 - 选中物品后展示 */}
        {selectedItem && <ItemDetailPanel item={selectedItem} onClose={() => setSelectedItem(null)} />}

        {/* 操作按钮 - 选中物品时显示 */}
        {selectedItem && (
          <div className="border-t border-gray-700 p-3 space-y-2">
            <div className="flex gap-2 flex-wrap">
              {selectedSlot ? (
                // 已装备物品: 显示卸下按钮
                <button
                  onClick={() => unequipItem(selectedSlot)}
                  className="flex-1 text-[11px] py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20"
                >
                  ⬇ 卸下 {SLOT_LABELS[selectedSlot]}
                </button>
              ) : (
                <>
                  {(selectedItem.category === 'consumable' || selectedItem.canBeUsed) && (
                    <button
                      onClick={() => handleUseItem(selectedItem)}
                      className="flex-1 text-[11px] py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20"
                    >
                      {selectedItem.subCategory === '食物' || (selectedItem.description || '').includes('食') ? '🍞 食用' : '🧪 使用'}
                    </button>
                  )}
                  {selectedItem.category !== 'consumable' && selectedItem.category !== 'material' && (
                    <button
                      onClick={() => {
                        const slot: EquipSlot = selectedItem.category === 'armor' ? 'armor' : selectedItem.category === 'accessory' ? 'accessory' : 'weapon';
                        equipItem(selectedItem, slot);
                      }}
                      className="flex-1 text-[11px] py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20"
                    >
                      {selectedItem.category === 'armor' ? '🛡 装备' : selectedItem.category === 'accessory' ? '💍 装备' : '⚔ 装备为武器'}
                    </button>
                  )}
                </>
              )}
              {!selectedSlot && (
                <button
                  onClick={() => discardItem(selectedItem)}
                  className="flex-1 text-[11px] py-1.5 rounded-lg bg-rose-500/5 border border-rose-500/10 text-rose-400/70 hover:bg-rose-500/10"
                >
                  🗑 丢弃
                </button>
              )}
            </div>
          </div>
        )}
        {/* 装备对比浮窗 (hover 触发) */}
        {hoveredItem && hoveredAnchor && (
          <ItemCompareTooltip
            current={(() => {
              const cat = hoveredItem.category || 'consumable';
              if (cat === 'weapon') return equipped.weapon;
              if (cat === 'armor') return equipped.armor;
              if (cat === 'accessory') return equipped.accessory;
              return null;
            })()}
            candidate={hoveredItem}
            anchor={hoveredAnchor}
            containerBounds={containerElRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth || 1200, window.innerHeight || 800)}
          />
        )}
      </div>
    </div>
  );
}
