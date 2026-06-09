import { describe, expect, it } from 'vitest';
import {
  DEBUG_BATTLES,
  createDebugPlayer,
  goblinScout,
  goblinScoutFireResist,
  goblinWarrior,
  trollChief,
} from '../../src/data/debugPresets';

describe('debugPresets', () => {
  it('6 个预设齐, 难度分别对应 trivial/normal/hard/deadly/ability/ability(resist)', () => {
    expect(DEBUG_BATTLES).toHaveLength(6);
    expect(DEBUG_BATTLES.map((b) => b.difficulty)).toEqual(['trivial', 'normal', 'hard', 'deadly', 'ability', 'ability']);
  });

  it('每张卡 1-3 个敌人, 所有敌人 side=enemy', () => {
    for (const b of DEBUG_BATTLES) {
      expect(b.enemies.length).toBeGreaterThanOrEqual(1);
      expect(b.enemies.length).toBeLessThanOrEqual(3);
      for (const e of b.enemies) {
        expect(e.side).toBe('enemy');
      }
    }
  });

  it('createDebugPlayer 返回固定合成玩家 (id=debug_player, name=测试勇者)', () => {
    const p = createDebugPlayer();
    expect(p.id).toBe('debug_player');
    expect(p.name).toBe('测试勇者');
    expect(p.side).toBe('player');
    expect(p.hp).toBe(30);
    expect(p.maxHp).toBe(30);
    expect(p.ap).toBe(6);
    expect(p.maxAp).toBe(6);
  });

  it('怪物工厂: goblinScout (HP 8, STR 6, DEX 12)', () => {
    const g = goblinScout();
    expect(g.hp).toBe(8);
    expect(g.maxHp).toBe(8);
    expect(g.attributes.STR).toBe(6);
    expect(g.attributes.DEX).toBe(12);
  });

  it('怪物工厂: goblinWarrior (HP 25, STR 14, +5 damage)', () => {
    const g = goblinWarrior();
    expect(g.hp).toBe(25);
    expect(g.attributes.STR).toBe(14);
    // 武器 +5 攻击加成
    expect(g.equipped.weapon?.effects[0]?.value).toBe(5);
  });

  it('怪物工厂: trollChief (HP 60, STR 18, +8 damage)', () => {
    const t = trollChief();
    expect(t.hp).toBe(60);
    expect(t.attributes.STR).toBe(18);
    expect(t.equipped.weapon?.effects[0]?.value).toBe(8);
  });

  // -----------------------------------------------------------------
  // v0.6.2 — mage 变体
  // -----------------------------------------------------------------

  it('v0.6.2: debug_ability 预设存在, playerOptions.learnedAbilities 含 4 个能力 (3 学派)', () => {
    const ab = DEBUG_BATTLES.find((b) => b.id === 'debug_ability');
    expect(ab).toBeDefined();
    expect(ab?.difficulty).toBe('ability');
    expect(ab?.playerOptions?.learnedAbilities).toEqual([
      { abilityId: 'spell_fire_bolt', school: 'magic', learnedAt: 1 },
      { abilityId: 'prayer_holy_heal', school: 'prayer', learnedAt: 1 },
      { abilityId: 'art_warrior_smash', school: 'battle_art', learnedAt: 1 },
      { abilityId: 'art_mage_arcane_ward', school: 'battle_art', learnedAt: 1 },
    ]);
    expect(ab?.playerOptions?.maxMp).toBe(30);
  });

  it('v0.6.2: createDebugPlayer(options) 注入 maxMp, 玩家 name 变"测试法师"', () => {
    const mage = createDebugPlayer({
      maxMp: 30,
      learnedAbilities: [
        { abilityId: 'spell_fire_bolt', school: 'magic', learnedAt: 1 },
        { abilityId: 'prayer_holy_heal', school: 'prayer', learnedAt: 1 },
        { abilityId: 'art_warrior_smash', school: 'battle_art', learnedAt: 1 },
        { abilityId: 'art_mage_arcane_ward', school: 'battle_art', learnedAt: 1 },
      ],
    });
    expect(mage.name).toBe('测试法师');
    expect(mage.mp).toBe(30);
    expect(mage.maxMp).toBe(30);
    // 法师属性: INT 16
    expect(mage.attributes.INT).toBe(16);
  });

  it('v0.6.3: 法师变体装备学徒法杖, 无护甲', () => {
    const mage = createDebugPlayer({
      maxMp: 30,
      learnedAbilities: [
        { abilityId: 'spell_fire_bolt', school: 'magic', learnedAt: 1 },
      ],
    });
    expect(mage.equipped.weapon?.name).toBe('学徒法杖');
    expect(mage.equipped.weapon?.subCategory).toBe('staff');
    expect(mage.equipped.weapon?.quality).toBe('精良');
    expect(mage.equipped.armor).toBeNull();
    expect(mage.equipped.accessory).toBeNull();
  });

  it('v0.6.2: createDebugPlayer() 无参数时 = 战士 (name=测试勇者, mp=0)', () => {
    const w = createDebugPlayer();
    expect(w.name).toBe('测试勇者');
    expect(w.mp).toBe(0);
    expect(w.maxMp).toBe(0);
    expect(w.attributes.STR).toBe(14);
  });

  it('v0.6.3: goblinScoutFireResist 带火抗防具 (fire=40)', () => {
    const g = goblinScoutFireResist();
    expect(g.elementalResistances.fire).toBe(40);
    expect(g.equipped.armor?.name).toBe('抗火皮甲');
  });

  it('v0.6.3: debug_resist 预设存在, category=item', () => {
    const r = DEBUG_BATTLES.find((b) => b.id === 'debug_resist');
    expect(r).toBeDefined();
    expect(r?.category).toBe('item');
    expect(r?.enemies[0]?.elementalResistances.fire).toBe(40);
  });
});
