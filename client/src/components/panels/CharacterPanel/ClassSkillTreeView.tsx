/**
 * ClassSkillTreeView — 在 CharacterPanel 内显示职业技能树
 *
 * - 读取 characterStore.character.classId 和 classSkills
 * - 渲染 4 tier × 3 slot = 12 节点
 * - picked 节点高亮, 其他 dimmed
 * - classId 为 null 或无效 → 返回 null (不渲染)
 */
import { useCharacterStore } from '../../../stores/characterStore';
import { getClass } from '../../../data/classes';

const TIER_UNLOCK: Record<1 | 2 | 3 | 4, number> = { 1: 1, 2: 5, 3: 10, 4: 15 };

export function ClassSkillTreeView() {
  const character = useCharacterStore((s) => s.character);
  if (!character?.classId) return null;
  const def = getClass(character.classId);
  if (!def) return null;
  const pickedSet = new Set(character.classSkills.map((n) => n.nodeId));
  const characterLevel = character.level ?? 1;
  return (
    <div>
      <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5 flex items-center gap-2">
        <span>{def.icon} {def.name} 技能树</span>
        <span className="text-[9px] text-gray-500 ml-auto">
          T1✓ / T2@{TIER_UNLOCK[2]} / T3@{TIER_UNLOCK[3]} / T4@{TIER_UNLOCK[4]}
        </span>
      </div>
      <div data-testid="class-skill-tree" className="grid grid-cols-3 gap-1.5">
        {def.nodes.map((node) => {
          const picked = pickedSet.has(node.id);
          const unlockedByLevel = characterLevel >= TIER_UNLOCK[node.tier];
          return (
            <div
              key={node.id}
              data-testid={`node-${node.id}`}
              className={[
                'node p-1.5 rounded border text-[9px] leading-tight',
                picked
                  ? 'picked bg-emerald-900/40 border-emerald-500/60 text-emerald-200'
                  : unlockedByLevel
                  ? 'dimmed bg-gray-800/40 border-gray-700 text-gray-500'
                  : 'dimmed bg-gray-900/30 border-gray-800 text-gray-700 opacity-60',
              ].join(' ')}
              title={node.description}
            >
              <div className="text-[8px] text-gray-500 mb-0.5">T{node.tier}·{node.slot}</div>
              <div className="font-medium text-[10px]">{node.name}</div>
              <div className="text-[8px] text-gray-500 mt-0.5 line-clamp-2">{node.description}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
