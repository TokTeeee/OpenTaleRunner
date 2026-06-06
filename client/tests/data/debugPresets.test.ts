import { describe, expect, it } from 'vitest';
import {
  DEBUG_BATTLES,
  createDebugPlayer,
  goblinScout,
  goblinWarrior,
  trollChief,
} from '../../src/data/debugPresets';

describe('debugPresets', () => {
  it('4 个预设齐, 难度分别对应 trivial/normal/hard/deadly', () => {
    expect(DEBUG_BATTLES).toHaveLength(4);
    expect(DEBUG_BATTLES.map((b) => b.difficulty)).toEqual(['trivial', 'normal', 'hard', 'deadly']);
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
});
