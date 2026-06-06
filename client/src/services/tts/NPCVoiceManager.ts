const NPC_VOICE_POOL = [
  { voice: 'onyx', speed: 1.0, pitch: 1.0 },
  { voice: 'echo', speed: 0.9, pitch: 1.1 },
  { voice: 'fable', speed: 1.1, pitch: 0.9 },
  { voice: 'nova', speed: 1.0, pitch: 1.05 },
  { voice: 'shimmer', speed: 1.0, pitch: 1.15 },
  { voice: 'alloy', speed: 0.95, pitch: 1.0 },
  { voice: 'echo', speed: 1.05, pitch: 0.85 },
  { voice: 'fable', speed: 0.85, pitch: 1.1 },
  { voice: 'onyx', speed: 1.15, pitch: 0.95 },
  { voice: 'nova', speed: 0.9, pitch: 1.1 },
  { voice: 'shimmer', speed: 1.05, pitch: 0.9 },
  { voice: 'alloy', speed: 1.1, pitch: 0.95 },
  { voice: 'echo', speed: 1.0, pitch: 0.8 },
  { voice: 'fable', speed: 0.95, pitch: 1.15 },
  { voice: 'onyx', speed: 0.85, pitch: 1.05 },
];

export interface NPCVoiceParams {
  voice_id: string;
  speed: number;
  pitch: number;
  provider: string;
}

// 审计 P5 修复: 改用 DJB2 哈希算法, 与 docs/媒体能力.md 2.4 节保持一致
//   DJB2 公式: hash = hash * 33 + c, 初始值 5381
//   特点: 分布比 Java hashCode(*31) 略均匀, 冲突更少
function djb2Hash(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// 旧 Java hashCode 实现, 保留供向后兼容 (有持久化数据用旧 hash 计算的, 需要兼容)
// 当前不再使用, 但导出供可能的迁移 / 测试使用
export function legacyJavaHashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function assignVoiceToNPC(npcId: string): NPCVoiceParams {
  const hash = djb2Hash(npcId);
  const poolVoice = NPC_VOICE_POOL[hash % NPC_VOICE_POOL.length];
  return {
    voice_id: poolVoice.voice,
    speed: poolVoice.speed,
    pitch: poolVoice.pitch,
    provider: 'openai',
  };
}

export function getStoredVoiceParams(
  npcId: string,
  storedParams?: NPCVoiceParams | null,
): NPCVoiceParams {
  if (storedParams && storedParams.voice_id) {
    return storedParams;
  }
  return assignVoiceToNPC(npcId);
}
