/**
 * 当前玩家角色状态中心。
 * 管理角色卡、属性、技能、生命/生活状态、物品与近期经历，并在条件变化时触发系统钩子。
 * 它描述的是“当前操控角色”，而不是角色列表或世界中的其它实体。
 */
import { create } from 'zustand';
import type { Character, Attributes, Skill, Inventory, VitalStats, Reputation, HistoryEntry, Currency, ClassSkillNode } from '../types/character';
import type { Item } from '../types/item';
import { systemHooks } from '../services/hooks/SystemHooks';
import type { GameSnapshot } from '../types/hooks';
import { eventBus } from '../services/event/EventBus';
import { EVENTS } from '../services/event/events';

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
  updateVital: (delta: Partial<VitalStats>) => void;
  updateReputation: (delta: Partial<Reputation & { regional: Record<string, number> }>) => void;
  addCondition: (condition: string) => void;
  removeCondition: (condition: string) => void;
  addHistory: (entry: HistoryEntry) => void;
  setLastActionTime: (t: string) => void;
  updateInventory: (inv: Inventory) => void;
  updateCurrency: (c: Partial<Currency>) => void;
  updateIdentity: (changes: { name?: string; appearance?: string; background?: string }) => void;
  /** 应用/反应用 物品的 attribute_mod 词条, true=装备, false=卸下 */
  applyItemEffects: (item: Item, apply: boolean) => void;
  /** v0.5.1 — 用服务端返回值应用 EXP 授权 (Pydantic 返回 { level, exp, expToNext, unspentAttributePoints }) */
  applyServerExpGrant: (patch: { level: number; exp: number; expToNext: number; unspentAttributePoints: number }) => void;
  /** v0.5.3 — 设置角色职业与已解锁技能 (本地 + 调用方负责 PATCH /class 同步服务端) */
  setClass: (classId: string | null, classSkills: ClassSkillNode[]) => void;
}

export const useCharacterStore = create<CharacterState>((set) => ({
  character: null, isLoaded: false,

  setCharacter: (char) => set({ character: char, isLoaded: true }),

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

  /**
   * 应用/反应用 物品的 attribute_mod 词条
   * apply = true 时累加, false 时反向(用于卸下时撤销)
   * 词条数据格式: eff.value = { STR: 1, DEX: 2, ... }
   */
  applyItemEffects: (item, apply) => {
    set((s) => {
      if (!s.character || !item?.effects) return s;
      const attrs = { ...s.character.attributes };
      for (const eff of item.effects) {
        if (eff.type !== 'attribute_mod') continue;
        // attribute_mod 词条格式: value = { STR: 1, DEX: 2, ... }
        if (typeof eff.value !== 'object' || eff.value == null) continue;
        const mods = eff.value as Record<string, unknown>;
        for (const key of Object.keys(attrs) as (keyof Attributes)[]) {
          const delta = mods[key];
          if (typeof delta === 'number') {
            attrs[key] = attrs[key] + (apply ? delta : -delta);
          }
        }
      }
      return { character: { ...s.character, attributes: attrs } };
    });
  },

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
}));
