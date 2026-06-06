import { describe, expect, it } from 'vitest';
import { assignVoiceToNPC, legacyJavaHashCode, NPCVoiceParams } from '../../../src/services/tts/NPCVoiceManager';

describe('NPCVoiceManager — 审计 P5 修复: 改用 DJB2 哈希', () => {
  it('相同 npcId 分配到相同 voice', () => {
    const a = assignVoiceToNPC('npc_alice');
    const b = assignVoiceToNPC('npc_alice');
    expect(a.voice_id).toBe(b.voice_id);
    expect(a.speed).toBe(b.speed);
    expect(a.pitch).toBe(b.pitch);
  });

  it('不同 npcId 分配到不同 voice (或不同 speed/pitch)', () => {
    // 选 5 个 ID 降低碰撞概率
    const ids = ['npc_a', 'npc_b', 'npc_c', 'npc_d', 'npc_e'];
    const results = ids.map(id => assignVoiceToNPC(id));
    // 至少应有 2 个不同的 (voice, speed, pitch) 组合
    const uniq = new Set(results.map(r => `${r.voice_id}|${r.speed}|${r.pitch}`));
    expect(uniq.size).toBeGreaterThan(1);
  });

  it('返回的参数有合法 provider', () => {
    const r = assignVoiceToNPC('npc_x');
    expect(['openai', 'mimo', 'edge', 'browser']).toContain(r.provider);
  });

  it('legacyJavaHashCode 保留旧实现 (用于历史数据兼容)', () => {
    expect(legacyJavaHashCode('alice')).toBeGreaterThan(0);
    expect(legacyJavaHashCode('alice')).toBe(legacyJavaHashCode('alice'));
  });

  it('DJB2 vs Java hashCode 对相同字符串产生不同结果', () => {
    const a = assignVoiceToNPC('alice');
    // 旧实现应该给出不同的 hash
    const oldHash = legacyJavaHashCode('alice');
    const newHash = (function djb2(str: string) {
      let h = 5381;
      for (let i = 0; i < str.length; i++) h = (h * 33 + str.charCodeAt(i)) | 0;
      return Math.abs(h);
    })('alice');
    expect(oldHash).not.toBe(newHash);
    // 注: pool 索引可能相同 (因为 % 15 取模), 但 hash 本身不同
    expect(a.voice_id).toBeDefined();
  });

  it('返回的 speed/pitch 在合理范围 (0.5-1.5)', () => {
    const a: NPCVoiceParams = assignVoiceToNPC('npc_xyz');
    expect(a.speed).toBeGreaterThanOrEqual(0.5);
    expect(a.speed).toBeLessThanOrEqual(1.5);
    expect(a.pitch).toBeGreaterThanOrEqual(0.5);
    expect(a.pitch).toBeLessThanOrEqual(1.5);
  });
});
