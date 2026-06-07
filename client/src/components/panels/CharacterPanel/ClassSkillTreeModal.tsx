/**
 * ClassSkillTreeModal — 角色面板头部职业文字点击后展开的全屏 Modal
 *
 * v0.5.14
 *
 * 行为:
 * - isOpen=false: 不渲染
 * - 渲染 12 节点 (4 tier × 3 slot) 大网格
 * - 已学节点 (learnedNodes 包含) emerald 高亮
 * - 未学节点白底, 可点击查看详情
 * - Esc 键 / 关闭按钮 / 点击 overlay → onClose
 * - 点击节点 → 显示节点详情面板 (description + effect)
 *
 * 注: ClassNode 只有 `id` (无 nodeId) 和 `tier/slot/description/effect` (无 unlockedByLevel)。
 *     所以 12 节点从 Lv.1 起全可学, 详情面板展示 description + effect。
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getClass } from '../../../data/classes';
import type { ClassNode, ClassNodeEffect } from '../../../types/class';

type Props = {
  classId: string;
  isOpen: boolean;
  onClose: () => void;
  learnedNodes: string[];
  currentLevel: number;
};

function formatEffect(effect: ClassNodeEffect): string {
  switch (effect.type) {
    case 'attribute_mod': return `${effect.attribute} +${effect.bonus}`;
    case 'hp_max_bonus': return `生命上限 +${effect.bonus}`;
    case 'mp_max_bonus': return `魔法上限 +${effect.bonus}`;
    case 'dodge_threshold_bonus': return `招架门槛 ${effect.bonus > 0 ? '+' : ''}${effect.bonus}`;
    case 'damage_modifier': return `伤害 +${Math.round(effect.bonus * 100)}%`;
    case 'exp_bonus': return `经验 +${Math.round(effect.bonus * 100)}%`;
    case 'qte_tolerance': return `QTE 容差 +${effect.bonus}`;
    default: return '';
  }
}

export function ClassSkillTreeModal({ classId, isOpen, onClose, learnedNodes }: Props) {
  const [selectedNode, setSelectedNode] = useState<ClassNode | null>(null);
  const classDef = getClass(classId);

  // 统一关闭处理: 关闭时清空选中节点, 避免下次打开时残留
  const handleClose = useCallback(() => {
    setSelectedNode(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, handleClose]);

  if (!isOpen || !classDef) return null;

  const nodes: ClassNode[] = (classDef.nodes ?? []) as ClassNode[];
  const learnedSet = new Set(learnedNodes);
  const tierMax = nodes.reduce((m, n) => Math.max(m, n.tier), 1);

  // v0.5.14-fix: 用 createPortal 渲染到 document.body
  // 父级 CharacterPanel 有 animate-in class (含 transform: translateY), 会创建新的
  // containing block, 导致 position:fixed 的 Modal 被定位到 panel 内, 位置异常且
  // 关闭按钮可能不可达. Portal 逃出 panel 的 stacking context.
  return createPortal(
    <div
      data-testid="class-skill-tree-modal"
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-[90vw] h-[90vh] max-w-5xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-gray-200">
            <span className="mr-2">{classDef.icon}</span>
            {classDef.name} 技能树
            <span className="text-sm text-gray-500 ml-3">
              [{learnedNodes.length}/{nodes.length} 已学]
            </span>
          </h2>
          <button
            data-testid="skilltree-close"
            onClick={handleClose}
            className="text-gray-500 hover:text-gray-300 text-2xl px-2"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        {/* 节点网格 (3 列 × 4 行, 按 tier 分组排序) */}
        <div className="flex-1 overflow-y-auto p-6">
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}
          >
            {Array.from({ length: tierMax }, (_, i) => i + 1).map((tier) =>
              nodes
                .filter((n) => n.tier === tier)
                .sort((a, b) => a.slot - b.slot)
                .map((node) => {
                  const learned = learnedSet.has(node.id);
                  const isSelected = selectedNode?.id === node.id;
                  const baseStyle = learned
                    ? 'bg-emerald-500/20 border-emerald-400/60 text-emerald-200'
                    : 'bg-white/5 border-white/20 text-gray-200 hover:bg-white/10';
                  const ringStyle = isSelected ? 'ring-2 ring-amber-400' : '';
                  return (
                    <button
                      key={node.id}
                      data-testid={`skilltree-node-${node.id}`}
                      onClick={() => setSelectedNode(node)}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${baseStyle} ${ringStyle}`}
                    >
                      <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                        T{node.tier}·{node.slot}
                      </div>
                      <div className="text-sm font-semibold mt-1">{node.name}</div>
                      <div className="text-[10px] mt-2 opacity-80">
                        {formatEffect(node.effect)}
                      </div>
                      {learned && (
                        <div className="text-[10px] text-emerald-400 mt-2 font-medium">
                          ✅ 已学
                        </div>
                      )}
                    </button>
                  );
                }),
            )}
          </div>
        </div>

        {/* 节点详情面板 */}
        {selectedNode && (
          <div
            data-testid="skilltree-detail"
            className="p-4 border-t border-gray-700 bg-gray-800/50"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-gray-200">
                  {selectedNode.name}{' '}
                  <span className="text-[10px] text-gray-500">
                    T{selectedNode.tier}·{selectedNode.slot}
                  </span>
                  {learnedSet.has(selectedNode.id) && (
                    <span className="text-[10px] text-emerald-400 ml-2">✅ 已学</span>
                  )}
                </div>
                <div className="text-xs text-gray-400 mt-1">{selectedNode.description}</div>
                <div className="text-[10px] text-amber-400 mt-1">
                  效果: {formatEffect(selectedNode.effect)}
                </div>
              </div>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-gray-500 hover:text-gray-300 text-lg shrink-0"
                aria-label="关闭详情"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
