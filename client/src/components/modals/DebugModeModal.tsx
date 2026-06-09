/**
 * 调试模式 Modal — 二级菜单: 战斗调试 + 物品调试
 *
 * 战斗调试: 预设战斗卡, 战斗结束自动重开
 * 物品调试: 生成法杖/圣印记/防具等, 验证 affix 池词条
 *
 * 自管理重开循环: 内部 internalShow state 控制显示, useEffect 监听
 * combatStore.phase 转 settled/idle 触发 reset + 自开. 父组件只需永远 mount.
 *
 * 0 改核心引擎. 通过 startDebugBattle 间接 dispatch startCombat.
 * 详细见 spec: docs/superpowers/specs/2026-06-04-combat-debug-design.md
 */
import { useEffect, useState, useRef, useCallback } from 'react';
import { DEBUG_BATTLES, type DebugBattle } from '../../data/debugPresets';
import { startDebugBattle } from '../../services/combat/debugCombatStarter';
import { useCombatStore, INITIAL_COMBAT_STATE } from '../../stores/combatStore';
import type { CombatPhase } from '../../services/combat/types';
import { useGameStore } from '../../stores/gameStore';
import { drawAffixes } from '../../data/affixPool';
import type { Item, ItemEffect } from '../../types/item';
import { useUIStore } from '../../stores/uiStore';

export interface DebugModeModalProps {
  open: boolean;
  onClose: () => void;
}

type DebugTab = 'combat' | 'item';

const DIFFICULTY_LABEL: Record<DebugBattle['difficulty'], string> = {
  trivial: 'EASY',
  normal: 'NORMAL',
  hard: 'HARD',
  deadly: 'DEADLY',
  ability: 'SPELL',
};

const DIFFICULTY_COLOR: Record<DebugBattle['difficulty'], string> = {
  trivial: 'bg-green-100 text-green-800 border-green-300',
  normal: 'bg-blue-100 text-blue-800 border-blue-300',
  hard: 'bg-orange-100 text-orange-800 border-orange-300',
  deadly: 'bg-red-100 text-red-800 border-red-300',
  ability: 'bg-purple-100 text-purple-800 border-purple-300',
};

// 物品调试: 预设物品模板
interface ItemTemplate {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
  readonly description: string;
  readonly category: 'weapon' | 'armor' | 'accessory';
  readonly subCategory?: string;
  readonly quality: Item['quality'];
  readonly baseName: string;
}

const ITEM_TEMPLATES: readonly ItemTemplate[] = [
  { id: 'staff', label: '生成法杖', icon: '🪄', description: '精良法杖, 含 INT/MP 词条 + 池词条', category: 'weapon', subCategory: 'staff', quality: '精良', baseName: '随机法杖' },
  { id: 'holy_symbol', label: '生成圣印记', icon: '✝️', description: '精良圣印记, 含 WIS/MP 词条 + 池词条', category: 'weapon', subCategory: 'holy_symbol', quality: '精良', baseName: '随机圣印记' },
  { id: 'sword', label: '生成剑', icon: '⚔️', description: '精良剑, 含攻击词条 + 池词条', category: 'weapon', quality: '精良', baseName: '随机长剑' },
  { id: 'armor_fire', label: '生成火抗甲', icon: '🔥', description: '稀有火抗皮甲, 火抗+40 + 池词条', category: 'armor', quality: '稀有', baseName: '火抗皮甲' },
  { id: 'armor_ice', label: '生成冰抗甲', icon: '❄️', description: '稀有冰抗皮甲, 冰抗+40 + 池词条', category: 'armor', quality: '稀有', baseName: '冰抗皮甲' },
  { id: 'armor_all', label: '生成全抗甲', icon: '🛡️', description: '史诗全抗板甲, 全抗+10 + 池词条', category: 'armor', quality: '史诗', baseName: '全抗板甲' },
  { id: 'acc_fire', label: '生成火抗饰品', icon: '💍', description: '精良火抗戒指, 火抗+15 + 池词条', category: 'accessory', quality: '精良', baseName: '火抗戒指' },
  { id: 'acc_all', label: '生成全抗饰品', icon: '👑', description: '传说全抗项链, 全抗+10 + 池词条', category: 'accessory', quality: '传说', baseName: '全抗项链' },
];

export function DebugModeModal({ open, onClose }: DebugModeModalProps) {
  const phase = useCombatStore((s) => s.phase);
  const [pendingReturn, setPendingReturn] = useState(false);
  const [internalShow, setInternalShow] = useState(open);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DebugTab>('combat');
  const [generatedItem, setGeneratedItem] = useState<Item | null>(null);
  const settledTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevPhaseRef = useRef<CombatPhase>('idle');
  const showToast = useUIStore((s) => s.showToast);

  // 同步外部 open prop 到 internalShow
  useEffect(() => {
    setInternalShow(open);
  }, [open]);

  // 监听战斗结束 → 自动重开 modal
  useEffect(() => {
    const prev = prevPhaseRef.current;
    const isStartReset = prev === 'idle' && phase === 'idle';
    if (
      pendingReturn &&
      !isStartReset &&
      (prev === 'active' || prev === 'resolving' || prev === 'initializing') &&
      phase === 'settled'
    ) {
      useCombatStore.setState({ ...INITIAL_COMBAT_STATE, phase: 'idle' });
      useGameStore.getState().setDebugMode(false);
      useGameStore.getState().setPhase('title');
      setPendingReturn(false);
      setError(null);
      setInternalShow(true);
    }
    prevPhaseRef.current = phase;
  }, [phase, pendingReturn]);

  // 30s 兜底
  useEffect(() => {
    if (pendingReturn && phase === 'settled') {
      settledTimerRef.current = setTimeout(() => {
        useCombatStore.setState({ ...INITIAL_COMBAT_STATE, phase: 'idle' });
        useGameStore.getState().setDebugMode(false);
        useGameStore.getState().setPhase('title');
        setPendingReturn(false);
        setError(null);
        setInternalShow(true);
      }, 30_000);
      return () => {
        if (settledTimerRef.current) {
          clearTimeout(settledTimerRef.current);
          settledTimerRef.current = null;
        }
      };
    }
    return undefined;
  }, [pendingReturn, phase]);

  const handleCardClick = useCallback(async (preset: DebugBattle) => {
    setError(null);
    setPendingReturn(true);
    setInternalShow(false);
    try {
      await startDebugBattle(preset);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '启动失败';
      setError(msg);
      setPendingReturn(false);
      setInternalShow(true);
    }
  }, []);

  const handleGenerateItem = useCallback((template: ItemTemplate) => {
    const poolEffects = drawAffixes(template.category, template.quality, undefined, template.subCategory);
    const now = Date.now();

    // 基础词条 (模板特定)
    const baseEffects: ItemEffect[] = [];
    if (template.id === 'staff') {
      baseEffects.push({ id: `base_${now}`, type: 'attribute_mod', value: { INT: 1 }, description: 'INT +1' });
      baseEffects.push({ id: `base_mp_${now}`, type: 'mp_bonus', value: 5, description: 'MP +5' });
    } else if (template.id === 'holy_symbol') {
      baseEffects.push({ id: `base_${now}`, type: 'attribute_mod', value: { WIS: 1 }, description: 'WIS +1' });
      baseEffects.push({ id: `base_mp_${now}`, type: 'mp_bonus', value: 5, description: 'MP +5' });
    } else if (template.id === 'sword') {
      baseEffects.push({ id: `base_${now}`, type: 'damage_bonus', value: 5, description: '+5 攻击' });
    } else if (template.id === 'armor_fire') {
      baseEffects.push({ id: `base_${now}`, type: 'elemental_resist', value: { fire: 40 }, description: '火抗 +40%' });
      baseEffects.push({ id: `base_def_${now}`, type: 'defense_bonus', value: 3, description: '+3 防御' });
    } else if (template.id === 'armor_ice') {
      baseEffects.push({ id: `base_${now}`, type: 'elemental_resist', value: { ice: 40 }, description: '冰抗 +40%' });
      baseEffects.push({ id: `base_def_${now}`, type: 'defense_bonus', value: 3, description: '+3 防御' });
    } else if (template.id === 'armor_all') {
      baseEffects.push({ id: `base_${now}`, type: 'elemental_resist', value: { fire: 10, ice: 10, lightning: 10, wind: 10, earth: 10, arcane: 10, holy: 10, shadow: 10 }, description: '全抗 +10%' });
      baseEffects.push({ id: `base_def_${now}`, type: 'defense_bonus', value: 5, description: '+5 防御' });
    } else if (template.id === 'acc_fire') {
      baseEffects.push({ id: `base_${now}`, type: 'elemental_resist', value: { fire: 15 }, description: '火抗 +15%' });
    } else if (template.id === 'acc_all') {
      baseEffects.push({ id: `base_${now}`, type: 'elemental_resist', value: { fire: 10, ice: 10, lightning: 10, wind: 10, earth: 10, arcane: 10, holy: 10, shadow: 10 }, description: '全抗 +10%' });
    }

    const allEffects = [
      ...baseEffects,
      ...poolEffects.map((eff, i) => ({ ...eff, id: `pool_${now}_${i}` })),
    ];

    const item: Item = {
      name: template.baseName,
      category: template.category,
      subCategory: template.subCategory,
      quality: template.quality,
      effects: allEffects,
    };

    setGeneratedItem(item);
    showToast(`已生成: ${item.name} (${item.quality}, ${allEffects.length} 个词条)`, 'info');
  }, [showToast]);

  if (!internalShow) return null;

  const combatBattles = DEBUG_BATTLES.filter((b) => b.category !== 'item');
  const itemBattles = DEBUG_BATTLES.filter((b) => b.category === 'item');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      data-testid="debug-modal"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-2xl max-w-3xl w-full mx-4 p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">🐞 调试模式</h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="debug-modal-close"
            className="text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* 二级菜单 Tab */}
        <div className="flex gap-1 mb-4 border-b border-zinc-200 dark:border-zinc-700">
          <button
            type="button"
            onClick={() => setActiveTab('combat')}
            data-testid="debug-tab-combat"
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'combat'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            ⚔️ 战斗调试
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('item')}
            data-testid="debug-tab-item"
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'item'
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300'
            }`}
          >
            📦 物品调试
          </button>
        </div>

        {error && (
          <div
            data-testid="debug-error"
            className="mb-4 p-3 bg-red-100 text-red-800 rounded text-sm"
          >
            预设启动失败: {error}
          </div>
        )}

        {/* 战斗调试 Tab */}
        {activeTab === 'combat' && (
          <>
            <p className="text-sm text-zinc-500 mb-4">
              选一个预设战斗进入演示. 战斗结束会自动回到此菜单.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {combatBattles.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleCardClick(preset)}
                  data-testid={`debug-card-${preset.difficulty}`}
                  className="text-left p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-blue-400 hover:shadow transition"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded border ${DIFFICULTY_COLOR[preset.difficulty]}`}
                    >
                      {DIFFICULTY_LABEL[preset.difficulty]}
                    </span>
                    <h3 className="font-semibold">{preset.title}</h3>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">{preset.description}</p>
                  <p className="text-xs text-zinc-500">预期: {preset.expectedOutcome}</p>
                </button>
              ))}
            </div>
          </>
        )}

        {/* 物品调试 Tab */}
        {activeTab === 'item' && (
          <>
            <p className="text-sm text-zinc-500 mb-4">
              生成物品验证 affix 池词条分布. 点击生成后查看词条详情.
            </p>

            {/* 抗性验证战斗 */}
            {itemBattles.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">抗性验证战斗</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {itemBattles.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handleCardClick(preset)}
                      data-testid={`debug-card-${preset.id}`}
                      className="text-left p-4 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-blue-400 hover:shadow transition"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${DIFFICULTY_COLOR[preset.difficulty]}`}>
                          {DIFFICULTY_LABEL[preset.difficulty]}
                        </span>
                        <h3 className="font-semibold">{preset.title}</h3>
                      </div>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">{preset.description}</p>
                      <p className="text-xs text-zinc-500">预期: {preset.expectedOutcome}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 物品生成 */}
            <div>
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">物品生成</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {ITEM_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleGenerateItem(t)}
                    data-testid={`debug-item-${t.id}`}
                    className="text-left p-3 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-amber-400 hover:shadow transition"
                  >
                    <div className="text-lg mb-1">{t.icon}</div>
                    <div className="text-xs font-semibold">{t.label}</div>
                    <div className="text-[10px] text-zinc-500">{t.quality}</div>
                  </button>
                ))}
              </div>

              {/* 生成结果 */}
              {generatedItem && (
                <div className="p-4 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-zinc-50 dark:bg-zinc-800">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-semibold">{generatedItem.name}</h4>
                    <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300">
                      {generatedItem.quality}
                    </span>
                    {generatedItem.subCategory && (
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 border border-blue-300">
                        {generatedItem.subCategory}
                      </span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {generatedItem.effects.map((eff, i) => (
                      <div key={eff.id ?? i} className="flex items-center gap-2 text-sm">
                        <span className={`text-xs font-mono ${eff.id?.startsWith('pool_') ? 'text-purple-600 dark:text-purple-400' : 'text-blue-600 dark:text-blue-400'}`}>
                          {eff.id?.startsWith('pool_') ? '[池]' : '[基]'}
                        </span>
                        <span className="text-zinc-700 dark:text-zinc-300">{eff.description}</span>
                        <span className="text-xs text-zinc-400 ml-auto">{eff.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
