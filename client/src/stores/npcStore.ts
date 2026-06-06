/**
 * NPC 关系状态中心。
 * 维护客户端已认识 NPC 的注册表、关系等级、交互历史与升格能力，
 * 供社交面板、Prompt 注入和组队系统复用同一份 NPC 事实来源。
 */
import { create } from 'zustand';
import type { GameNPC, NPCRelationshipLevel, NPCInteractionResult } from '../types/npc';
import { attitudeToLevel } from '../types/npc';

interface NPCState {
  npcs: Record<string, GameNPC>;

  registerNPC: (npc: GameNPC) => void;
  registerBatch: (npcs: GameNPC[]) => void;
  meetNPC: (npcId: string) => void;
  modifyAttitude: (npcId: string, delta: number) => void;
  addNPCInfo: (npcId: string, info: string) => void;
  addInteraction: (npcId: string, summary: string) => void;
  levelUpSkill: (npcId: string, skillId: string) => void;
  addNPCSecret: (npcId: string, secret: string) => void;
  getNPC: (npcId: string) => GameNPC | undefined;
  getNPCsByRegion: (region: string) => GameNPC[];
  getKnownNPCs: () => GameNPC[];
  getNPCsByLevel: (level: NPCRelationshipLevel) => GameNPC[];
  processInteraction: (npcId: string, attitudeDelta: number, newInfo: string[]) => NPCInteractionResult;
  promoteNPC: (npcId: string, background: string, skills: Array<{name:string;level:number;desc:string}>) => void;
  getPromotableNPCs: () => GameNPC[];
}

export const useNPCStore = create<NPCState>((set, get) => ({
  npcs: {},

  registerNPC: (npc) =>
    set((s) => ({ npcs: { ...s.npcs, [npc.npcId]: { ...npc } } })),

  registerBatch: (npcs: GameNPC[]) =>
    set((s) => {
      const updated = { ...s.npcs };
      for (const npc of npcs) updated[npc.npcId] = npc;
      return { npcs: updated };
    }),

  meetNPC: (npcId) =>
    set((s) => {
      const npc = s.npcs[npcId];
      if (!npc) return s;
      return {
        npcs: {
          ...s.npcs,
          [npcId]: {
            ...npc,
            isMet: true,
            relationship: {
              ...npc.relationship,
              firstMet: npc.relationship.firstMet || new Date().toISOString(),
            },
          },
        },
      };
    }),

  modifyAttitude: (npcId, delta) =>
    set((s) => {
      const npc = s.npcs[npcId];
      if (!npc) return s;
      const newAttitude = Math.max(-100, Math.min(100, npc.relationship.attitude + delta));
      return {
        npcs: {
          ...s.npcs,
          [npcId]: {
            ...npc,
            relationship: {
              ...npc.relationship,
              attitude: newAttitude,
              level: attitudeToLevel(newAttitude),
            },
          },
        },
      };
    }),

  addNPCInfo: (npcId, info) =>
    set((s) => {
      const npc = s.npcs[npcId];
      if (!npc) return s;
      const knows = npc.relationship.playerKnowsAbout;
      if (knows.includes(info)) return s;
      return {
        npcs: {
          ...s.npcs,
          [npcId]: {
            ...npc,
            relationship: {
              ...npc.relationship,
              playerKnowsAbout: [...knows, info],
            },
          },
        },
      };
    }),

  addInteraction: (npcId, summary) =>
    set((s) => {
      const npc = s.npcs[npcId];
      if (!npc) return s;
      return {
        npcs: {
          ...s.npcs,
          [npcId]: {
            ...npc,
            relationship: {
              ...npc.relationship,
              interactionCount: npc.relationship.interactionCount + 1,
              history: [...npc.relationship.history.slice(-20), summary],
            },
          },
        },
      };
    }),

  levelUpSkill: (npcId, skillId) =>
    set((s) => {
      const npc = s.npcs[npcId];
      if (!npc || !npc.canGrow) return s;
      return {
        npcs: {
          ...s.npcs,
          [npcId]: {
            ...npc,
            skills: npc.skills.map((sk) =>
              sk.id === skillId ? { ...sk, level: Math.min(sk.level + 1, sk.maxLevel) } : sk,
            ),
          },
        },
      };
    }),

  addNPCSecret: (npcId, secret) =>
    set((s) => {
      const npc = s.npcs[npcId];
      if (!npc || npc.secrets.includes(secret)) return s;
      return {
        npcs: { ...s.npcs, [npcId]: { ...npc, secrets: [...npc.secrets, secret] } },
      };
    }),

  getNPC: (npcId) => get().npcs[npcId],

  getNPCsByRegion: (region) =>
    Object.values(get().npcs).filter((n) => n.region === region),

  getKnownNPCs: () =>
    Object.values(get().npcs).filter((n) => n.isMet),

  getNPCsByLevel: (level) =>
    Object.values(get().npcs).filter((n) => n.relationship.level === level),

  processInteraction: (npcId, attitudeDelta, newInfo) => {
    const npc = get().npcs[npcId];
    if (!npc) {
      return { attitudeChange: 0, newInfo: [], levelChange: null, narrative: '', unlockedSkill: null, unlockedQuest: null };
    }
    const oldLevel = npc.relationship.level;
    get().modifyAttitude(npcId, attitudeDelta);
    for (const info of newInfo) {
      get().addNPCInfo(npcId, info);
    }
    get().meetNPC(npcId);
    const updatedNpc = get().npcs[npcId];
    const newLevel = updatedNpc.relationship.level;
    return {
      attitudeChange: attitudeDelta,
      newInfo,
      levelChange: newLevel !== oldLevel ? newLevel : null,
      narrative: '',
      unlockedSkill: null,
      unlockedQuest: null,
    };
  },

  promoteNPC: (npcId, background, skills) =>
    set((s) => {
      const npc = s.npcs[npcId];
      if (!npc) return s;
      const newSkills = skills.map((sk, i) => ({
        id: `npc_promo_sk_${i}`,
        name: sk.name,
        level: sk.level,
        maxLevel: 10,
        type: 'acquired' as const,
        relatedAttribute: 'INT' as const,
        description: sk.desc,
        acquiredAt: '升格获得',
        experience: 0,
        expToNext: sk.level * 3,
      }));
      return {
        npcs: {
          ...s.npcs,
          [npcId]: {
            ...npc,
            background,
            skills: [...npc.skills, ...newSkills],
            canGrow: true,
            canBeRecruited: true,
          },
        },
      };
    }),

  getPromotableNPCs: () =>
    Object.values(get().npcs).filter(
      (n) => n.relationship.interactionCount >= 20 || n.relationship.attitude >= 80,
    ),
}));
