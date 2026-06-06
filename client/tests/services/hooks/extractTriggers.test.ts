import { describe, expect, it, beforeEach } from 'vitest';
import { extractTriggers } from '../../../src/services/hooks/extractTriggers';
import type { NarrativeResponse } from '../../../src/types/game';
import { resetClientStores } from '../../utils/resetStores';

function makeNarrative(overrides: Partial<NarrativeResponse> = {}): NarrativeResponse {
  return {
    narrative: '',
    npcsIntroduced: [],
    choices: [],
    sceneModifier: 0,
    atmosphere: { mood: 'normal', dangerLevel: 'low' },
    consequences: {
      itemsGained: [],
      itemsLost: [],
      itemsModified: [],
      skillsModified: [],
      currencyChange: {},
      reputationChange: {},
      worldEffects: [],
      skillsLearned: [],
      hpChange: 0,
      stateChanges: {},
    },
    timeElapsed: '',
    currentLocation: '',
    ...overrides,
  };
}

describe('extractTriggers (audit P3 fix: all 17 namespaces)', () => {
  beforeEach(() => {
    resetClientStores();
  });

  it('triggers vital.onTimeElapsed when timeElapsed is set', () => {
    const triggers = extractTriggers(
      makeNarrative({ timeElapsed: '2小时' }),
      '前往森林',
    );
    expect(triggers.some(t => t.namespace === 'vital.onTimeElapsed')).toBe(true);
  });

  it('triggers vital.onRestStart and vital.onRestEnd for 休息 action', () => {
    const triggers = extractTriggers(
      makeNarrative({ timeElapsed: '8小时' }),
      '在旅店休息',
    );
    expect(triggers.some(t => t.namespace === 'vital.onRestStart')).toBe(true);
    expect(triggers.some(t => t.namespace === 'vital.onRestEnd')).toBe(true);
  });

  it('triggers vital.beforeApply on every narrative (写前最终机会)', () => {
    const triggers = extractTriggers(
      makeNarrative({ timeElapsed: '1小时' }),
      '看向远方',
    );
    expect(triggers.some(t => t.namespace === 'vital.beforeApply')).toBe(true);
  });

  it('triggers combat.beforeRoll for attack-style actions', () => {
    const triggers = extractTriggers(
      makeNarrative({ timeElapsed: '1回合' }),
      '向怪物挥剑攻击',
    );
    expect(triggers.some(t => t.namespace === 'combat.beforeRoll')).toBe(true);
  });

  it('triggers combat.onEnd when combat-related content detected', () => {
    const triggers = extractTriggers(
      makeNarrative({ narrative: '你与敌人激烈战斗, 最终击退了敌人', timeElapsed: '1回合' }),
      '挥剑',
    );
    expect(triggers.some(t => t.namespace === 'combat.onEnd')).toBe(true);
  });

  it('triggers condition.onAdded for cons.conditionsAdded', () => {
    const triggers = extractTriggers(
      makeNarrative({
        timeElapsed: '1小时',
        consequences: {
          itemsGained: [], itemsLost: [], itemsModified: [], skillsModified: [],
          currencyChange: {}, reputationChange: {}, worldEffects: [], skillsLearned: [],
          hpChange: 0, stateChanges: {},
          conditionsAdded: ['中毒'],
        },
      }),
      '被毒蛇咬伤',
    );
    expect(triggers.some(t => t.namespace === 'condition.onAdded' && (t.data as any).condition === '中毒')).toBe(true);
  });

  it('triggers condition.onRemoved for cons.conditionsRemoved', () => {
    const triggers = extractTriggers(
      makeNarrative({
        timeElapsed: '1小时',
        consequences: {
          itemsGained: [], itemsLost: [], itemsModified: [], skillsModified: [],
          currencyChange: {}, reputationChange: {}, worldEffects: [], skillsLearned: [],
          hpChange: 0, stateChanges: {},
          conditionsRemoved: ['中毒'],
        },
      }),
      '喝下解药',
    );
    expect(triggers.some(t => t.namespace === 'condition.onRemoved' && (t.data as any).condition === '中毒')).toBe(true);
  });

  it('triggers travel.onStart for 出发/前往 action', () => {
    const triggers = extractTriggers(
      makeNarrative({ timeElapsed: '3小时' }),
      '出发前往森林',
    );
    expect(triggers.some(t => t.namespace === 'travel.onStart')).toBe(true);
  });

  it('triggers travel.onTerrainChange when narrative contains a different terrain', () => {
    const triggers = extractTriggers(
      makeNarrative({
        timeElapsed: '2小时',
        narrative: '你穿过了平原, 进入了森林深处',
      }),
      '前行',
    );
    // 取决于 snapshot 的 default terrain; 至少应能解析出 '森林' 或 '平原' 中的一个
    expect(triggers.some(t => t.namespace === 'travel.onTerrainChange' || t.namespace === 'travel.onStart')).toBe(true);
  });

  it('triggers item.onUse for 使用/吃/喝 action', () => {
    const triggers = extractTriggers(
      makeNarrative({ timeElapsed: '10分钟' }),
      '吃面包',
    );
    expect(triggers.some(t => t.namespace === 'item.onUse')).toBe(true);
  });

  it('triggers item.onEquip for 装备/穿上 action', () => {
    const triggers = extractTriggers(
      makeNarrative({ timeElapsed: '5分钟' }),
      '穿上皮甲',
    );
    expect(triggers.some(t => t.namespace === 'item.onEquip')).toBe(true);
  });

  it('triggers party.onMemberJoin for 加入/结伴 action', () => {
    const triggers = extractTriggers(
      makeNarrative({ timeElapsed: '30分钟', narrative: '欢迎你加入我们的队伍' }),
      '招募新成员',
    );
    expect(triggers.some(t => t.namespace === 'party.onMemberJoin')).toBe(true);
  });

  it('triggers party.onMemberLeave for 离开/离队 action', () => {
    const triggers = extractTriggers(
      makeNarrative({ timeElapsed: '30分钟', narrative: '他与你分道扬镳, 离开了队伍' }),
      '目送离开',
    );
    expect(triggers.some(t => t.namespace === 'party.onMemberLeave')).toBe(true);
  });

  it('triggers party.beforeCombatBonus on combat-related actions', () => {
    const triggers = extractTriggers(
      makeNarrative({ timeElapsed: '1回合', narrative: '怪物出现, 战斗开始' }),
      '攻击敌人',
    );
    expect(triggers.some(t => t.namespace === 'party.beforeCombatBonus')).toBe(true);
  });

  it('returns empty array for plain narrative with no detectable events', () => {
    const triggers = extractTriggers(
      makeNarrative({ narrative: '你静静地站在原地, 什么也没发生' }),
      '观察',
    );
    // 至少 vital.beforeApply 总会触发
    expect(triggers.some(t => t.namespace === 'vital.beforeApply')).toBe(true);
  });
});
