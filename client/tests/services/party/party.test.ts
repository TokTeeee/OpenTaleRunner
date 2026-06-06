import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { usePartyStore } from '../../../src/stores/partyStore';
import {
  ANIMAL_TEMPLATES,
  MONSTER_TEMPLATES,
  buildMemberFromTemplate,
} from '../../../src/services/party/PartyTemplates';
import { resetClientStores } from '../../utils/resetStores';
import type { PartyMember } from '../../../src/types/party';

function makeNpcMember(overrides: Partial<PartyMember> = {}): PartyMember {
  return {
    memberId: `npc_${Math.random().toString(36).slice(2, 8)}`,
    memberType: 'npc',
    sourceId: 'npc-001',
    name: '测试伙伴',
    label: '战士',
    appearance: '',
    personality: '忠诚、勇敢',
    role: 'combat',
    attributes: { STR: 6, DEX: 5, CON: 6, INT: 4, WIS: 4, CHA: 5 },
    skills: [],
    status: { hp: 20, maxHp: 20, isConscious: true, conditions: [] },
    combatAbilities: [
      { name: '剑击', type: 'attack', description: '挥剑', bonus: { type: 'damage_bonus', value: 2 }, cooldown: 1 },
    ],
    utilityAbilities: [],
    joinedAt: new Date().toISOString(),
    joinReason: '招募',
    relationshipDescription: '伙伴',
    loyalty: 50,
    leaveConditions: [{ type: 'loyalty_below', threshold: 20, description: '忠诚<20 离队' }],
    personalityTraits: ['忠诚'],
    canLevelUp: true,
    experience: 0,
    ...overrides,
  };
}

describe('PartyStore — 招募 / 忠诚 / 离队 / 升级 (B3.1)', () => {
  beforeEach(() => {
    resetClientStores();
  });

  afterEach(() => {
    resetClientStores();
  });

  describe('招募 (addMember)', () => {
    it('成功添加新成员并写入 store', () => {
      const store = usePartyStore.getState();
      const ok = store.addMember(makeNpcMember({ memberId: 'm1', sourceId: 'npc-001' }));
      expect(ok).toBe(true);
      expect(usePartyStore.getState().members).toHaveLength(1);
    });

    it('超过 maxSize 时拒绝加入', () => {
      const store = usePartyStore.getState();
      usePartyStore.setState({ maxSize: 1 });
      expect(store.addMember(makeNpcMember({ memberId: 'a', sourceId: 'a' }))).toBe(true);
      expect(store.addMember(makeNpcMember({ memberId: 'b', sourceId: 'b' }))).toBe(false);
      expect(usePartyStore.getState().members).toHaveLength(1);
    });

    it('同 sourceId 的成员去重', () => {
      const store = usePartyStore.getState();
      expect(store.addMember(makeNpcMember({ memberId: '1', sourceId: 'npc-x' }))).toBe(true);
      expect(store.addMember(makeNpcMember({ memberId: '2', sourceId: 'npc-x' }))).toBe(false);
      expect(usePartyStore.getState().members).toHaveLength(1);
    });

    it('canRecruit 在未满员时返回 true', () => {
      usePartyStore.setState({ maxSize: 2, members: [] });
      expect(usePartyStore.getState().canRecruit()).toBe(true);
      usePartyStore.setState({ members: [makeNpcMember({ memberId: 'x', sourceId: 'x' })] });
      expect(usePartyStore.getState().canRecruit()).toBe(true);
      usePartyStore.setState({ members: [
        makeNpcMember({ memberId: 'x', sourceId: 'x' }),
        makeNpcMember({ memberId: 'y', sourceId: 'y' }),
      ] });
      expect(usePartyStore.getState().canRecruit()).toBe(false);
    });
  });

  describe('忠诚变化 (updateMemberLoyalty)', () => {
    beforeEach(() => {
      usePartyStore.getState().addMember(
        makeNpcMember({ memberId: 'loyal', sourceId: 'loyal-1', loyalty: 50 }),
      );
    });

    it('正向 delta 提升忠诚', () => {
      usePartyStore.getState().updateMemberLoyalty('loyal', 10);
      expect(usePartyStore.getState().members[0].loyalty).toBe(60);
    });

    it('负向 delta 降低忠诚', () => {
      usePartyStore.getState().updateMemberLoyalty('loyal', -15);
      expect(usePartyStore.getState().members[0].loyalty).toBe(35);
    });

    it('loyalty 不会低于 0', () => {
      usePartyStore.getState().updateMemberLoyalty('loyal', -1000);
      expect(usePartyStore.getState().members[0].loyalty).toBe(0);
    });

    it('loyalty 不会超过 100', () => {
      usePartyStore.getState().updateMemberLoyalty('loyal', 999);
      expect(usePartyStore.getState().members[0].loyalty).toBe(100);
    });

    it('不存在的 memberId 不抛错', () => {
      expect(() => usePartyStore.getState().updateMemberLoyalty('nope', 5)).not.toThrow();
    });
  });

  describe('离队 (leaveConditions)', () => {
    it('忠诚 < leaveConditions.threshold 时成员应被识别为离队', () => {
      const member = makeNpcMember({
        memberId: 'leaver',
        sourceId: 'leaver-1',
        loyalty: 25,
        leaveConditions: [{ type: 'loyalty_below', threshold: 20, description: '忠诚<20 离队' }],
      });
      usePartyStore.getState().addMember(member);
      usePartyStore.getState().updateMemberLoyalty('leaver', -10);
      const updated = usePartyStore.getState().members[0];
      expect(updated.loyalty).toBe(15);
      const triggered = updated.leaveConditions.some(
        (c) => c.type === 'loyalty_below' && updated.loyalty < (c.threshold as number),
      );
      expect(triggered).toBe(true);
    });

    it('忠诚 >= threshold 时不触发离队', () => {
      const member = makeNpcMember({
        memberId: 'stayer',
        sourceId: 'stayer-1',
        loyalty: 30,
        leaveConditions: [{ type: 'loyalty_below', threshold: 20, description: '忠诚<20 离队' }],
      });
      usePartyStore.getState().addMember(member);
      usePartyStore.getState().removeMember('stayer');
      expect(usePartyStore.getState().members).toHaveLength(0);
    });
  });

  describe('经验与升级 (addMemberExperience + levelUpMember)', () => {
    it('累计经验达 100 时自动升级并清零', () => {
      usePartyStore.getState().addMember(
        makeNpcMember({
          memberId: 'lvl',
          sourceId: 'lvl-1',
          experience: 0,
          canLevelUp: true,
        }),
      );
      const before = usePartyStore.getState().members[0];
      const beforeMaxHp = before.status.maxHp;
      const beforeStr = before.attributes.STR;

      usePartyStore.getState().addMemberExperience('lvl', 60);
      expect(usePartyStore.getState().members[0].experience).toBe(60);
      expect(usePartyStore.getState().members[0].status.maxHp).toBe(beforeMaxHp);

      usePartyStore.getState().addMemberExperience('lvl', 50);
      const after = usePartyStore.getState().members[0];
      expect(after.experience).toBe(10);
      expect(after.status.maxHp).toBe(beforeMaxHp + 4);
      expect(after.attributes.STR).toBe(beforeStr + 1);
    });

    it('canLevelUp=false 的成员不获得经验也不升级', () => {
      usePartyStore.getState().addMember(
        makeNpcMember({ memberId: 'nolvl', sourceId: 'nolvl-1', canLevelUp: false, experience: 0 }),
      );
      usePartyStore.getState().addMemberExperience('nolvl', 200);
      const after = usePartyStore.getState().members[0];
      expect(after.experience).toBe(0);
      expect(after.attributes.STR).toBe(6);
    });
  });

  describe('模板构建 (PartyTemplates)', () => {
    it('动物模板必填字段齐全', () => {
      for (const [key, tpl] of Object.entries(ANIMAL_TEMPLATES)) {
        expect(tpl.name).toBeTruthy();
        expect(tpl.memberType).toBe('animal');
        expect(tpl.status.maxHp).toBeGreaterThan(0);
        expect(tpl.loyalty).toBeGreaterThan(0);
        expect(tpl.leaveConditions.length).toBeGreaterThan(0);
        expect(key).toBeTruthy();
      }
    });

    it('怪物模板必填字段齐全', () => {
      for (const [key, tpl] of Object.entries(MONSTER_TEMPLATES)) {
        expect(tpl.name).toBeTruthy();
        expect(tpl.memberType).toBe('monster');
        expect(tpl.status.maxHp).toBeGreaterThan(0);
        expect(tpl.loyalty).toBeGreaterThan(0);
        expect(key).toBeTruthy();
      }
    });

    it('buildMemberFromTemplate 注入 memberId 与 overrides', () => {
      const member = buildMemberFromTemplate(ANIMAL_TEMPLATES.wolf, { name: '白爪' });
      expect(member.memberId).toMatch(/^tpl_/);
      expect(member.name).toBe('白爪');
      expect(member.memberType).toBe('animal');
      expect(member.loyalty).toBe(80);
    });
  });
});
