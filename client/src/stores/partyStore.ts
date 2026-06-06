import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  PartyMember, PartyCombatBonus, PartyCombatAction,
  PartyUtilityAssist,
} from '../types/party';
import { systemHooks } from '../services/hooks/SystemHooks';
import { buildSnapshot } from '../services/hooks/GameSnapshot';

interface PartyState {
  members: PartyMember[];
  maxSize: number;
  name: string;
  totalCarryCapacity: number;

  addMember: (member: PartyMember) => boolean;
  removeMember: (memberId: string) => void;
  updateMemberStatus: (memberId: string, status: Partial<PartyMember['status']>) => void;
  updateMemberLoyalty: (memberId: string, delta: number) => void;
  levelUpMember: (memberId: string) => void;
  addMemberExperience: (memberId: string, amount: number) => void;

  getCombatBonus: () => PartyCombatBonus;
  getUtilityAssist: (abilityType: string) => PartyUtilityAssist | null;
  isMemberCapable: (memberId: string, abilityType: string) => boolean;
  canRecruit: () => boolean;
}

function generateMemberId(): string {
  return `pm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const usePartyStore = create<PartyState>()(
  persist(
    (set, get) => ({
      members: [],
      maxSize: 4,
      name: '冒险小队',
      totalCarryCapacity: 50,

      addMember: (member) => {
        const state = get();
        if (state.members.length >= state.maxSize) return false;
        const withId = { ...member, memberId: member.memberId || generateMemberId() };
        if (state.members.some((existing) =>
          existing.memberId === withId.memberId
          || (existing.sourceId && withId.sourceId && existing.sourceId === withId.sourceId)
          || (existing.memberType === withId.memberType && existing.name === withId.name))) {
          return false;
        }
        set((s) => {
          const next = { members: [...s.members, withId] };
          systemHooks.apply('party.onMemberJoin', { memberName: withId.name }, {
            namespace: 'party.onMemberJoin', source: 'derived', snapshot: buildSnapshot(), abort: () => {},
          });
          return next;
        });
        return true;
      },

      removeMember: (memberId) => {
        set((s) => {
          const member = s.members.find((m) => m.memberId === memberId);
          const next = { members: s.members.filter((m) => m.memberId !== memberId) };
          if (member) {
            systemHooks.apply('party.onMemberLeave', { memberName: member.name }, {
              namespace: 'party.onMemberLeave', source: 'derived', snapshot: buildSnapshot(), abort: () => {},
            });
          }
          return next;
        });
      },

      updateMemberStatus: (memberId, status) =>
        set((s) => ({
          members: s.members.map((m) =>
            m.memberId === memberId
              ? { ...m, status: { ...m.status, ...status } }
              : m,
          ),
        })),

      updateMemberLoyalty: (memberId, delta) =>
        set((s) => ({
          members: s.members.map((m) =>
            m.memberId === memberId
              ? { ...m, loyalty: Math.max(0, Math.min(100, m.loyalty + delta)) }
              : m,
          ),
        })),

      levelUpMember: (memberId) =>
        set((s) => ({
          members: s.members.map((m) => {
            if (m.memberId !== memberId || !m.canLevelUp) return m;
            const newMaxHp = m.status.maxHp + 4;
            return {
              ...m,
              experience: 0,
              status: { ...m.status, hp: newMaxHp, maxHp: newMaxHp },
              attributes: Object.fromEntries(
                Object.entries(m.attributes).map(([k, v]) => [k, v + 1]),
              ),
              combatAbilities: m.combatAbilities.map((a) => ({
                ...a,
                bonus: { ...a.bonus, value: a.bonus.value + 1 },
              })),
            };
          }),
        })),

      addMemberExperience: (memberId, amount) => {
        const member = get().members.find((m) => m.memberId === memberId);
        if (!member || !member.canLevelUp) return;
        const newExp = member.experience + amount;
        if (newExp >= 100) {
          get().levelUpMember(memberId);
          set((s) => ({
            members: s.members.map((m) =>
              m.memberId === memberId ? { ...m, experience: newExp % 100 } : m,
            ),
          }));
        } else {
          set((s) => ({
            members: s.members.map((m) =>
              m.memberId === memberId ? { ...m, experience: newExp } : m,
            ),
          }));
        }
      },

      getCombatBonus: () => {
        const state = get();
        const bonus: PartyCombatBonus = {
          totalDamageBonus: 0,
          totalDefenseBonus: 0,
          totalSkillBonus: 0,
          memberActions: [],
        };
        for (const member of state.members) {
          if (!member.status.isConscious) continue;
          for (const ability of member.combatAbilities) {
            const effect = `${member.name}使用【${ability.name}】：${ability.description}（+${ability.bonus.value}）`;
            switch (ability.bonus.type) {
              case 'damage_bonus':
                bonus.totalDamageBonus += ability.bonus.value;
                break;
              case 'defense_bonus':
                bonus.totalDefenseBonus += ability.bonus.value;
                break;
              case 'skill_bonus':
                bonus.totalSkillBonus += ability.bonus.value;
                break;
              case 'elemental_damage':
                bonus.totalDamageBonus += ability.bonus.value;
                break;
            }
            bonus.memberActions.push({
              memberId: member.memberId,
              memberName: member.name,
              abilityName: ability.name,
              effect,
            } as PartyCombatAction);
          }
        }
        return bonus;
      },

      getUtilityAssist: (abilityType) => {
        const state = get();
        let best: PartyUtilityAssist | null = null;
        for (const member of state.members) {
          for (const ability of member.utilityAbilities) {
            if (ability.type === abilityType) {
              if (!best || ability.level > best.abilityLevel) {
                best = {
                  memberId: member.memberId,
                  memberName: member.name,
                  abilityLevel: ability.level,
                  bonus: ability.bonus,
                  narrative: `${member.name}使用【${ability.name}】（Lv.${ability.level}）协助`,
                };
              }
            }
          }
        }
        return best;
      },

      isMemberCapable: (memberId, abilityType) => {
        const member = get().members.find((m) => m.memberId === memberId);
        if (!member) return false;
        return member.utilityAbilities.some((a) => a.type === abilityType);
      },

      canRecruit: () => get().members.length < get().maxSize,
    }),
    {
      name: 'aeslan-party',
      partialize: (s) => ({
        members: s.members,
        maxSize: s.maxSize,
        name: s.name,
        totalCarryCapacity: s.totalCarryCapacity,
      }),
    },
  ),
);
