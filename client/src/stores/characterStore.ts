/**
 * 当前玩家角色状态中心。
 * 管理角色卡、属性、技能、生命/生活状态、物品与近期经历，并在条件变化时触发系统钩子。
 * 它描述的是“当前操控角色”，而不是角色列表或世界中的其它实体。
 */
import { create } from 'zustand';
import type { Character, Attributes, Skill, Inventory, VitalStats, Reputation, HistoryEntry, Currency, ClassSkillNode, ElementalResistances } from '../types/character';
import type { Element } from '../types/ability';
import type { Item } from '../types/item';
import { systemHooks } from '../services/hooks/SystemHooks';
import type { GameSnapshot } from '../types/hooks';
import { eventBus } from '../services/event/EventBus';
import { EVENTS } from '../services/event/events';
import { getAbility } from '../data/abilities';
import { checkCanLearn } from '../services/abilities/learnAbility';

function buildHookSnapshot(character: Character): GameSnapshot {
  return {
    currentDay: character.currentLocalDay,
    gameClock: 0,
    timeOfDay: '',
    terrain: '',
    weather: '',
    currentRegion: character.joinedRegion,
    character: {
      hp: character.hp,
      maxHp: character.maxHp,
      vital: character.vital,
      conditions: character.conditions,
      attributes: character.attributes,
      equipped: {
        weapon: character.inventory.equipped.weapon?.name || '',
        armor: character.inventory.equipped.armor?.name || '',
        accessory: character.inventory.equipped.accessory?.name || '',
      },
    },
    party: { members: [], size: 0 },
  };
}

interface CharacterState {
  character: Character | null; isLoaded: boolean;
  setCharacter: (char: Character) => void;
  updateAttributes: (attrs: Partial<Attributes>) => void;
  addSkill: (skill: Skill) => void;
  modifySkill: (skillId: string, changes: { newName?: string; newDescription?: string; levelChange?: number }) => void;
  updateHP: (hp: number) => void;
  updateMP: (mp: number) => void;
  updateVital: (delta: Partial<VitalStats>) => void;
  updateReputation: (delta: Partial<Reputation & { regional: Record<string, number> }>) => void;
  addCondition: (condition: string) => void;
  removeCondition: (condition: string) => void;
  addHistory: (entry: HistoryEntry) => void;
  setLastActionTime: (t: string) => void;
  updateInventory: (inv: Inventory) => void;
  updateCurrency: (c: Partial<Currency>) => void;
  updateIdentity: (changes: { name?: string; appearance?: string; background?: string }) => void;
  /** v0.5.1 — 用服务端返回值应用 EXP 授权 (Pydantic 返回 { level, exp, expToNext, unspentAttributePoints }) */
  applyServerExpGrant: (patch: { level: number; exp: number; expToNext: number; unspentAttributePoints: number; unspentSkillPoints: number }) => void;
  /** v0.5.3 — 设置角色职业与已解锁技能 (本地 + 调用方负责 PATCH /class 同步服务端) */
  setClass: (classId: string | null, classSkills: ClassSkillNode[]) => void;
  // ---- v0.6.2 ability / resistance mutators ----
  /** 学习 ability (幂等, 按 ability 的真实 school). */
  learnAbility: (abilityId: string) => void;
  /** 遗忘 ability. */
  forgetAbility: (abilityId: string) => void;
  /** 设置元素抗性, 钳制到 [-100, 100]. */
  setResistance: (element: Element, value: number) => void;
  /** v0.6.4 — 分配属性点 (校验总数 ≤ unspentAttributePoints, 属性钳制 [1,20]) */
  allocateAttribute: (allocation: Partial<Attributes>) => void;
  /** v0.6.4b — 消耗技能点学习 ability (校验+扣减) */
  learnAbilityWithPoint: (abilityId: string) => void;
}

export const useCharacterStore = create<CharacterState>((set) => ({
  character: null, isLoaded: false,

  setCharacter: (char) => {
    // v0.6.6: 迁移 — 从 attributes 中减去已装备物品的 attribute_mod，还原纯基础值
    // 旧版 applyItemEffects 会把装备加成揉进 attributes，需要一次性修正
    const correctedAttrs = { ...char.attributes };
    const slots = [char.inventory.equipped.weapon, char.inventory.equipped.armor, char.inventory.equipped.accessory];
    for (const item of slots) {
      if (!item?.effects) continue;
      for (const eff of item.effects) {
        if (eff.type === 'attribute_mod' && typeof eff.value === 'object' && eff.value !== null) {
          const mods = eff.value as Record<string, unknown>;
          for (const key of Object.keys(correctedAttrs) as (keyof Attributes)[]) {
            const delta = mods[key];
            if (typeof delta === 'number') {
              correctedAttrs[key] = correctedAttrs[key] - delta;
            }
          }
        }
      }
    }
    set({ character: { ...char, attributes: correctedAttrs }, isLoaded: true });
  },

  updateAttributes: (attrs) =>
    set((s) => {
      if (!s.character) return s;
      // v0.5.1: 钳制从 [3, 18] 放宽到 [1, 20] (v0.5+ 可用 spent points 把任一属性点满 20)
      const next: Record<string, number> = {};
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null) continue;
        next[k] = Math.max(1, Math.min(20, v));
      }
      return { character: { ...s.character, attributes: { ...s.character.attributes, ...next } } };
    }),

  addSkill: (skill) =>
    set((s) => { if (!s.character) return s; return { character: { ...s.character, skills: [...s.character.skills, skill] } }; }),

  modifySkill: (skillId, changes) =>
    set((s) => {
      if (!s.character) return s;
      const skills = s.character.skills.map(sk => {
        if (sk.id !== skillId) return sk;
        return {
          ...sk,
          name: changes.newName ?? sk.name,
          description: changes.newDescription ?? sk.description,
          level: changes.levelChange != null ? Math.max(0, Math.min(sk.maxLevel, sk.level + changes.levelChange)) : sk.level,
        };
      });
      return { character: { ...s.character, skills } };
    }),

  updateHP: (hp) =>
    set((s) => { if (!s.character) return s; return { character: { ...s.character, hp: Math.max(0, Math.min(s.character.maxHp, hp)) } }; }),

  updateMP: (mp) =>
    set((s) => { if (!s.character) return s; return { character: { ...s.character, mp: Math.max(0, Math.min(s.character.maxMp, mp)) } }; }),

  updateVital: (delta) =>
    set((s) => {
      if (!s.character) return s;
      const v = { ...s.character.vital };
      for (const [k, dv] of Object.entries(delta)) {
        if (dv != null) v[k as keyof VitalStats] = Math.max(0, Math.min(100, (v[k as keyof VitalStats] || 0) + dv));
      }
      return { character: { ...s.character, vital: v } };
    }),

  updateReputation: (delta) =>
    set((s) => {
      if (!s.character) return s;
      const r = { ...s.character.reputation };
      if (delta.goodness != null) r.goodness = Math.max(-100, Math.min(100, r.goodness + delta.goodness));
      if (delta.violence != null) r.violence = Math.max(0, Math.min(100, r.violence + delta.violence));
      if (delta.lawfulness != null) r.lawfulness = Math.max(-100, Math.min(100, r.lawfulness + delta.lawfulness));
      if (delta.regional) {
        const regional = { ...r.regional };
        for (const [k, v] of Object.entries(delta.regional)) {
          regional[k] = Math.max(-100, Math.min(100, (regional[k] || 0) + v));
        }
        r.regional = regional;
      }
      return { character: { ...s.character, reputation: r } };
    }),

  addCondition: (condition) =>
    set((s) => {
      if (!s.character) return s;
      systemHooks.apply('condition.onAdded', { condition }, {
        namespace: 'condition.onAdded', source: 'gm', snapshot: buildHookSnapshot(s.character), abort: () => {},
      });
      return { character: { ...s.character, conditions: [...s.character.conditions, condition] } };
    }),

  removeCondition: (condition) =>
    set((s) => {
      if (!s.character) return s;
      systemHooks.apply('condition.onRemoved', { condition }, {
        namespace: 'condition.onRemoved', source: 'gm', snapshot: buildHookSnapshot(s.character), abort: () => {},
      });
      return { character: { ...s.character, conditions: s.character.conditions.filter((c) => c !== condition) } };
    }),

  addHistory: (entry) =>
    set((s) => { if (!s.character) return s; return { character: { ...s.character, recentHistory: [...s.character.recentHistory.slice(-9), entry] } }; }),

  setLastActionTime: (t) =>
    set((s) => { if (!s.character) return s; return { character: { ...s.character, lastActionTime: t } }; }),

  updateInventory: (inv) =>
    set((s) => { if (!s.character) return s; return { character: { ...s.character, inventory: inv } }; }),

  updateCurrency: (c) =>
    set((s) => {
      if (!s.character) return s;
      const cur = { ...s.character.inventory.currency, ...c };
      return { character: { ...s.character, inventory: { ...s.character.inventory, currency: cur } } };
    }),

  updateIdentity: (changes) =>
    set((s) => {
      if (!s.character) return s;
      return { character: { ...s.character, ...changes } };
    }),

  // -------------------------------------------------------------------------
  // v0.5.1 — Level-EXP patch application (server is authoritative)
  // -------------------------------------------------------------------------

  applyServerExpGrant: (patch) =>
    set((s) => {
      if (!s.character) return s;
      const oldLevel = s.character.level ?? 1;
      const newLevel = patch.level;
      // v0.5.1: 升级时广播 LEVEL_UP (延迟到 next tick, 避免 setState 期间 emit)
      if (newLevel > oldLevel) {
        queueMicrotask(() => {
          try {
            // v0.5.6: 改用静态 import (原 require() 被 lint 禁, 且 eventBus 已是 singleton 无循环依赖)
            eventBus.emit(EVENTS.LEVEL_UP, {
              characterId: s.character!.characterId,
              oldLevel, newLevel,
            });
          } catch { /* best-effort */ }
        });
      }
      return {
        character: {
          ...s.character,
          level: newLevel,
          exp: patch.exp,
          expToNext: patch.expToNext,
          unspentAttributePoints: patch.unspentAttributePoints,
          unspentSkillPoints: patch.unspentSkillPoints,
        },
      };
    }),

  // -------------------------------------------------------------------------
  // v0.5.3 — Class registration
  // -------------------------------------------------------------------------

  setClass: (classId, classSkills) =>
    set((s) => {
      if (!s.character) return s;
      return {
        character: {
          ...s.character,
          classId,
          classSkills,
        },
      };
    }),

  // -------------------------------------------------------------------------
  // v0.6.2 — Ability / resistance mutators
  // -------------------------------------------------------------------------

  learnAbility: (abilityId) =>
    set((s) => {
      if (!s.character) return s;
      if (s.character.learnedAbilities.some((la) => la.abilityId === abilityId)) return s;
      const school = getAbility(abilityId)?.school ?? 'magic';
      return {
        character: {
          ...s.character,
          learnedAbilities: [...s.character.learnedAbilities, { abilityId, school, learnedAt: Date.now() }],
        },
      };
    }),

  forgetAbility: (abilityId) =>
    set((s) => {
      if (!s.character) return s;
      return {
        character: {
          ...s.character,
          learnedAbilities: s.character.learnedAbilities.filter((la) => la.abilityId !== abilityId),
        },
      };
    }),

  setResistance: (element, value) =>
    set((s) => {
      if (!s.character) return s;
      const clamped = Math.max(-100, Math.min(100, value));
      return {
        character: {
          ...s.character,
          elementalResistances: { ...s.character.elementalResistances, [element as keyof ElementalResistances]: clamped },
        },
      };
    }),

  allocateAttribute: (allocation) =>
    set((s) => {
      if (!s.character) return s;
      const entries = Object.entries(allocation) as [keyof Attributes, number][];
      if (entries.length === 0) return s;
      if (entries.some(([, v]) => v <= 0)) return s;

      const totalRequested = entries.reduce((sum, [, v]) => sum + v, 0);
      if (totalRequested > s.character.unspentAttributePoints) return s;

      const nextAttrs = { ...s.character.attributes };
      let actualSpent = 0;
      for (const [k, v] of entries) {
        const newVal = Math.min(20, nextAttrs[k] + v);
        actualSpent += newVal - nextAttrs[k];
        nextAttrs[k] = newVal;
      }

      return {
        character: {
          ...s.character,
          attributes: nextAttrs,
          unspentAttributePoints: s.character.unspentAttributePoints - actualSpent,
        },
      };
    }),

  learnAbilityWithPoint: (abilityId) =>
    set((s) => {
      if (!s.character) return s;
      if (s.character.unspentSkillPoints <= 0) return s;
      if (s.character.learnedAbilities.some((la) => la.abilityId === abilityId)) return s;
      const ability = getAbility(abilityId);
      if (!ability) return s;
      const result = checkCanLearn({ character: s.character, ability });
      if (!result.canLearn) return s;
      const school = ability.school ?? 'magic';
      return {
        character: {
          ...s.character,
          learnedAbilities: [...s.character.learnedAbilities, { abilityId, school, learnedAt: Date.now() }],
          unspentSkillPoints: s.character.unspentSkillPoints - 1,
        },
      };
    }),
}));
