import { useState } from 'react';
import { usePartyStore } from '../../stores/partyStore';
import { usePMEngine } from '../../hooks/usePMEngine';
import type { PartyMember } from '../../types/party';
import { MEMBER_TYPE_LABELS, UTILITY_ABILITY_LABELS } from '../../types/party';

function LoyaltyBar({ loyalty }: { loyalty: number }) {
  const blocks = 5;
  const filled = Math.round((loyalty / 100) * blocks);
  return (
    <div className="flex items-center gap-1">
      <span className="text-[8px] text-gray-600">忠诚</span>
      <div className="flex gap-0.5">
        {Array.from({ length: blocks }).map((_, i) => (
          <div
            key={i}
            className={`h-1.5 w-3 rounded-sm ${i < filled ? 'bg-amber-500/80' : 'bg-gray-700'}`}
          />
        ))}
      </div>
      <span className="text-[8px] text-gray-500">{loyalty}</span>
    </div>
  );
}

function HPBar({ current, max }: { current: number; max: number }) {
  const pct = Math.max(0, Math.min(100, (current / max) * 100));
  const color = pct > 60 ? 'bg-emerald-500/80' : pct > 30 ? 'bg-amber-500/80' : 'bg-rose-500/80';
  return (
    <div className="flex items-center gap-1">
      <div className="flex-1 h-1.5 bg-gray-700 rounded-sm overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[9px] text-gray-500">
        {current}/{max}
      </span>
    </div>
  );
}

function MemberCard({
  member, expanded, onToggle,
}: {
  member: PartyMember;
  expanded: boolean;
  onToggle: () => void;
}) {
  const store = usePartyStore();
  const { submitCustom } = usePMEngine();

  return (
    <div className="glass rounded-lg border border-white/[.04]">
      <div
        onClick={onToggle}
        className={`p-2.5 flex items-center gap-2 cursor-pointer transition-all ${
          expanded ? 'border-b border-white/[.04]' : ''
        }`}
      >
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-400/15 flex items-center justify-center text-[10px] text-indigo-300 font-bold shrink-0">
          {member.name[0]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-gray-300 truncate">{member.name}</span>
            <span className="text-[8px] text-gray-600">
              {MEMBER_TYPE_LABELS[member.memberType]}
            </span>
          </div>
          <div className="text-[9px] text-gray-600 mt-0.5">{member.label}</div>
        </div>
        <span className="text-[10px] text-gray-500">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="p-2.5 space-y-2 animate-in">
          <HPBar current={member.status.hp} max={member.status.maxHp} />
          <LoyaltyBar loyalty={member.loyalty} />
          {member.status.conditions.length > 0 && (
            <div className="text-[9px] text-rose-400">
              状态: {member.status.conditions.join(', ')}
            </div>
          )}
          <div className="text-[9px] text-gray-500">{member.joinReason}</div>
          <div className="text-[9px] text-gray-600 leading-snug">{member.relationshipDescription}</div>

          {/* Combat abilities */}
          {member.combatAbilities.length > 0 && (
            <div>
              <div className="text-[8px] text-gray-700 uppercase mb-0.5">战斗能力</div>
              {member.combatAbilities.map((a, i) => (
                <div key={i} className="text-[9px] text-gray-500 flex justify-between">
                  <span>{a.name}</span>
                  <span className="text-indigo-400/80">+{a.bonus.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Utility abilities */}
          {member.utilityAbilities.length > 0 && (
            <div>
              <div className="text-[8px] text-gray-700 uppercase mb-0.5">辅助能力</div>
              {member.utilityAbilities.map((a, i) => (
                <div key={i} className="text-[9px] text-gray-500 flex justify-between">
                  <span>{a.name}</span>
                  <span>{UTILITY_ABILITY_LABELS[a.type]} Lv.{a.level}</span>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-1.5">
            <button
              onClick={() => {
                store.updateMemberLoyalty(member.memberId, 5);
                submitCustom(`[与${member.name}互动，表达感谢]`);
              }}
              className="flex-1 text-[9px] py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
            >
              感谢
            </button>
            <button
              onClick={() => {
                store.removeMember(member.memberId);
                submitCustom(`[${member.name}离开了队伍]`);
              }}
              className="px-2 text-[9px] py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500/20 transition-colors"
            >
              解雇
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function PartyPanel() {
  const { members, maxSize, name, totalCarryCapacity } = usePartyStore();
  const getCombatBonus = usePartyStore((s) => s.getCombatBonus);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const combat = getCombatBonus();
  const hasCombat = combat.totalDamageBonus > 0 || combat.totalDefenseBonus > 0 || combat.totalSkillBonus > 0;

  const allUtilities = new Set<string>();
  for (const m of members) {
    for (const u of m.utilityAbilities) {
      allUtilities.add(UTILITY_ABILITY_LABELS[u.type] || u.type);
    }
  }

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider flex items-center gap-1">
          <span>🛡 {name}</span>
          <span className="text-gray-700">
            ({members.length}/{maxSize})
          </span>
        </div>
      </div>

      {members.length === 0 ? (
        <div className="glass rounded-xl p-3 text-center">
          <div className="text-[11px] text-gray-600">队伍为空</div>
          <div className="text-[9px] text-gray-700 mt-1">
            与NPC建立好感后可以邀请加入队伍
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {members.map((m) => (
            <MemberCard
              key={m.memberId}
              member={m}
              expanded={expandedId === m.memberId}
              onToggle={() => setExpandedId(expandedId === m.memberId ? null : m.memberId)}
            />
          ))}
        </div>
      )}

      {/* Ability Overview */}
      {members.length > 0 && (
        <div className="glass rounded-xl p-2.5 space-y-1.5">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider">
            队伍能力总览
          </div>
          {hasCombat && (
            <div className="flex gap-2 text-[9px]">
              {combat.totalDamageBonus > 0 && (
                <span className="text-rose-400/80">⚔ 伤害+{combat.totalDamageBonus}</span>
              )}
              {combat.totalDefenseBonus > 0 && (
                <span className="text-blue-400/80">🛡 防御+{combat.totalDefenseBonus}</span>
              )}
              {combat.totalSkillBonus > 0 && (
                <span className="text-indigo-400/80">✨ 技能+{combat.totalSkillBonus}</span>
              )}
            </div>
          )}
          {allUtilities.size > 0 && (
            <div className="flex flex-wrap gap-1.5 text-[9px] text-gray-500">
              {Array.from(allUtilities).map((u) => (
                <span key={u} className="px-1.5 py-0.5 rounded bg-white/[.03] border border-white/[.04]">
                  {u}
                </span>
              ))}
            </div>
          )}
          <div className="text-[8px] text-gray-700">
            ⚖ 队伍负重: {totalCarryCapacity + members.reduce((acc, m) => {
              const carry = m.utilityAbilities.find((a) => a.type === 'carry');
              return acc + (carry?.bonus || 0);
            }, 0)}kg
          </div>
        </div>
      )}
    </div>
  );
}
