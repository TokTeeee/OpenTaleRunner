import { useCharacterStore } from '../../../stores/characterStore';
import { getClass } from '../../../data/classes';

type ChipType = 'origin' | 'classlearned';

type SkillChip = {
  key: string;
  type: ChipType;
  label: string;
};

const TYPE_STYLES: Record<ChipType, string> = {
  origin: 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-300',
  classlearned: 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300',
};

/**
 * v0.5.14: 合并技能区
 * - 蓝色 (origin) = 出身技能 (character.skills)
 * - 绿色 (classlearned) = 职业已学节点 (character.classSkills)
 *
 * v0.5.14-fix: 移除"可学未学"黄色 chip — 用户要求只显示已学习技能.
 *              完整 12 节点技能树通过 ClassSkillTreeModal 查看.
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

  // 2. 职业已学节点 (classlearned) — 绿
  const classDef = character.classId ? getClass(character.classId) : null;
  if (classDef) {
    const nodes = (classDef.nodes ?? []) as Array<{ id: string; tier: number; slot: number; name: string }>;
    const learnedIds = (character.classSkills ?? []).map((n) => n.nodeId);
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
  }

  if (chips.length === 0) return null;

  return (
    <div>
      <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">技能</div>
      <div className="flex flex-wrap gap-1">
        {chips.map((c) => (
          <span
            key={c.key}
            data-testid={`skill-chip-${c.type}-${c.key.replace(/^(origin|learned)_/, '')}`}
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
