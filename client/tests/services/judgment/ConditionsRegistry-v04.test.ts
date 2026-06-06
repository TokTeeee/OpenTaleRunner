import { describe, expect, it } from 'vitest';
import {
  getConditionMeta,
  listConditionKeys,
  resolveConditionEffects,
  CONDITION_REGISTRY,
} from '../../../src/services/judgment/ConditionsRegistry';

describe('ConditionsRegistry: v0.4 ConditionMeta 旁路表 (不破 v0.3)', () => {
  it('v0.3 resolveConditionEffects API 行为不变 (向后兼容)', () => {
    // 同一组 condition, 派生结果与 v0.3 完全一致
    const result = resolveConditionEffects(['中毒', '受伤']);
    expect(result.dicePenalty).toBe(2); // max(中毒=2, 受伤=1)
    expect(result.travelSpeedMultiplier).toBe(0.7); // min(中毒=0.8, 受伤=0.7)
    expect(result.regenMultiplier).toBe(0.5); // min(中毒=0.5, 受伤=0.8)
  });

  it('v0.3 CONDITION_REGISTRY 14 个 condition 全部可查 (向后兼容)', () => {
    const keys = Object.keys(CONDITION_REGISTRY);
    expect(keys).toContain('中毒');
    expect(keys).toContain('受伤');
    expect(keys).toContain('昏迷');
    expect(keys.length).toBe(15); // 14 旧 + 醉酒新增
  });

  describe('getConditionMeta', () => {
    it('查询精确 key 返回对应 meta', () => {
      const meta = getConditionMeta('中毒');
      expect(meta).not.toBeNull();
      expect(meta?.modifiers?.CON).toBe(-1);
      expect(meta?.defaultDuration).toBe(5);
      expect(meta?.onTick?.hpDelta).toBe(-1);
    });

    it('v0.4 战斗临时 condition (wounded_1/2/3) 有 meta', () => {
      expect(getConditionMeta('wounded_1')?.modifiers?.STR).toBe(-1);
      expect(getConditionMeta('wounded_2')?.modifiers?.STR).toBe(-2);
      expect(getConditionMeta('wounded_3')?.modifiers?.STR).toBe(-3);
      expect(getConditionMeta('wounded_3')?.defaultDuration).toBe(8);
    });

    it('perma-wound 是永久 (undefined defaultDuration)', () => {
      const meta = getConditionMeta('perma-wound');
      expect(meta).not.toBeNull();
      expect(meta?.defaultDuration).toBeUndefined();
    });

    it('流血 走 DOT 模式', () => {
      const meta = getConditionMeta('流血');
      expect(meta?.onTick?.hpDelta).toBe(-1);
      expect(meta?.defaultDuration).toBe(4);
    });

    it('包含匹配 (e.g. "中毒_剧毒" 命中 "中毒")', () => {
      const meta = getConditionMeta('中毒_剧毒');
      expect(meta).not.toBeNull();
      expect(meta?.modifiers?.CON).toBe(-3);
    });

    it('未知 condition 返回 null (不抛错)', () => {
      expect(getConditionMeta('未知状态')).toBeNull();
      expect(getConditionMeta('')).toBeNull();
    });
  });

  it('listConditionKeys 至少 23 个 v0.4 condition', () => {
    const keys = listConditionKeys();
    expect(keys.length).toBeGreaterThanOrEqual(23);
  });

  it('ConditionMeta.modifiers 不破坏 v0.3 ConditionEffect 派生路径', () => {
    // resolveConditionEffects 用的是 CONDITION_REGISTRY (v0.3 派生效),
    // getConditionMeta 用的是 CONDITION_META (v0.4 战斗元数据).
    // 两者并行, 不互相污染.
    const v03Result = resolveConditionEffects(['中毒']);
    const v04Meta = getConditionMeta('中毒');
    expect(v03Result.dicePenalty).toBe(2);
    expect(v04Meta?.modifiers?.CON).toBe(-1);
    // 注意: v0.3 派生效是 dicePenalty, v0.4 派生效是 CON modifier — 两者并行存在
  });
});
