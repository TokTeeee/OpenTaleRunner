import { useCharacterStore } from '../../../stores/characterStore';
import { getClass } from '../../../data/classes';

type ChipType = 'origin' | 'classlearned' | 'classavailable';

type SkillChip = {
  key: string;
  type: ChipType;
  label: string;
};

const TYPE_STYLES: Record<ChipType, string> = {
  origin: 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-300',
  classlearned: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300',
  classavailable: 'bg-amber-500/10 border border-amber-500/20 text-amber-300',
};

/**
 * v0.5.14: 合并技能区
 * - 蓝色 (origin) = 出身技能 (character.skills)
 * - 绿色 (classlearned) = 职业已学节点 (character.classSkills)
 * - 黄色 (classavailable) = 职业可学但未选节点
 *
 * 注: 现有 ClassNode 没有 unlockedByLevel 字段, 所有 12 节点都默认可学 (Lv.1 全开)
 */
export function SkillsSection() {
  const character = useCharacterStore((s) => s.character);
  if (!character) return null;

  const chips: SkillChip[] = [];

  // 1. 出身技能 (origin) — 蓝
  for (const s of character.skills ?? []) {
    chips.push({
      key: `origin_${s.id}`,
      type: 'origin',
      label: `${s.name} Lv.${s.level}`,
    });
  }

  // 2. 职业相关
  const classDef = character.classId ? getClass(character.classId) : null;
  if (classDef) {
    const nodes = (classDef.nodes ?? []) as Array<{ id: string; tier: number; slot: number; name: string }>;
    // 已学节点 ID 列表 (从 ClassSkillNode[] 提取 nodeId)
    const learnedIds = (character.classSkills ?? []).map((n) => n.nodeId);
    const learnedSet = new Set(learnedIds);

    // 2a. 已学 (classlearned) — 绿
    for (const nodeId of learnedIds) {
      const node = nodes.find((n) => n.id === nodeId);
      if (node) {
        chips.push({
          key: `learned_${nodeId}`,
          type: 'classlearned',
          label: `T${node.tier}·${node.slot} ${node.name}`,
        });
      }
    }

    // 2b. 可学未选 (classavailable) — 黄 (按 tier 升序)
    const available = nodes
      .filter((n) => !learnedSet.has(n.id))
      .sort((a, b) => a.tier - b.tier || a.slot - b.slot);
    for (const node of available) {
      chips.push({
        key: `avail_${node.id}`,
        type: 'classavailable',
        label: `T${node.tier}·${node.slot} ${node.name}`,
      });
    }
  }

  if (chips.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">技能</div>
      <div className="flex flex-wrap gap-1">
        {chips.map((c) => (
          <span
            key={c.key}
            data-testid={`skill-chip-${c.type}-${c.key.replace(/^(origin|learned|avail)_/, '')}`}
            className={`text-[10px] px-2 py-0.5 rounded-md ${TYPE_STYLES[c.type]}`}
            title={c.label}
          >
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
