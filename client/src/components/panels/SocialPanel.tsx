import { useState, useMemo, useEffect } from 'react';
import { useNPCStore } from '../../stores/npcStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useWorldStore } from '../../stores/worldStore';
import { usePMEngine } from '../../hooks/usePMEngine';
import type { GameNPC, NPCRelationshipLevel } from '../../types/npc';
import { RELATIONSHIP_LABELS, levelToColor } from '../../types/npc';
import { ATTRIBUTE_LABELS } from '../../types/character';
import { ErrorBoundary } from '../shared/ErrorBoundary';
import { getStoredVoiceParams } from '../../services/tts/NPCVoiceManager';
import { TTSClient } from '../../services/tts/TTSClient';
import { ImageClient } from '../../services/image/ImageClient';
import { useMemoryByEntitySync } from '../../hooks/useMemory';

function SocialPanelInner() {
  const npcMap = useNPCStore((s) => s.npcs);
  const npcs = useMemo(() => Object.values(npcMap || {}).filter((n) => n.isMet), [npcMap]);
  const [selectedNpc, setSelectedNpc] = useState<GameNPC | null>(null);
  const npcMemories = useMemoryByEntitySync('npc', selectedNpc?.npcId ?? '');
  const [filter, setFilter] = useState<NPCRelationshipLevel | 'all'>('all');
  const { submitCustom } = usePMEngine();
  const tts = useSettingsStore((s) => s.tts);
  const llmApiKey = useSettingsStore((s) => s.llm.apiKey);
  const npcIndependentVoice = useSettingsStore((s) => s.npcIndependentVoice);
  const imageGenEnabled = useSettingsStore((s) => s.imageGenEnabled);
  const storybook = useWorldStore((s) => s.storybook);
  const [npcPortraits, setNpcPortraits] = useState<Record<string, string>>({});
  const [portraitLoading, setPortraitLoading] = useState<Record<string, boolean>>({});
  const canPreviewNpcVoice = npcIndependentVoice && (tts.provider === 'edge' || Boolean(tts.apiKey || llmApiKey));

  // Generate NPC portrait on first view
  useEffect(() => {
    if (!selectedNpc || !imageGenEnabled) return;
    const npcId = selectedNpc.npcId;
    if (npcPortraits[npcId] || portraitLoading[npcId]) return;

    const s = useSettingsStore.getState();
    if (!s.imageGen.apiKey && !s.llm.apiKey) return;

    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- "loading" flag before async fetch; refactor to derived state in v0.4
    setPortraitLoading(p => ({ ...p, [npcId]: true }));

    (async () => {
      try {
        const artPrefix = storybook?.narrativeGuide?.tone || 'fantasy character portrait, oil painting style';
        const prompt = `${artPrefix}, portrait of ${selectedNpc.name}, ${selectedNpc.appearance}, ${selectedNpc.personality}`;
        const result = await new ImageClient().generate(prompt, `npc:${npcId}`);
        if (!cancelled && result) setNpcPortraits(p => ({ ...p, [npcId]: result }));
      } catch { /* ignore */ }
      if (!cancelled) setPortraitLoading(p => ({ ...p, [npcId]: false }));
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch one-shot on selectedNpc; tracked for v0.4
  }, [selectedNpc?.npcId, imageGenEnabled]);

  const speakNPC = async (npc: GameNPC) => {
    if (!canPreviewNpcVoice) return;
    try {
      const voiceParams = npcIndependentVoice
        ? getStoredVoiceParams(npc.npcId, null)
        : undefined;
      const tts = new TTSClient(voiceParams ? {
        voice: voiceParams.voice_id,
        speed: voiceParams.speed,
        provider: voiceParams.provider,
      } : undefined);
      tts.speak(`${npc.name}，${npc.title || ''}。${npc.personality ? npc.personality.slice(0, 60) : ''}`);
    } catch { /* ignore */ }
  };

  const filtered = filter === 'all' ? npcs : npcs.filter((n) => n?.relationship?.level === filter);
  const safeLevel = (npc: GameNPC) => npc?.relationship?.level || 'stranger';
  const safeColor = (npc: GameNPC) => levelToColor(safeLevel(npc) as NPCRelationshipLevel);
  const safeAttitude = (npc: GameNPC) => npc?.relationship?.attitude ?? 0;

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-800">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">社交</div>
        <div className="flex gap-1 flex-wrap">
          {(['all', 'friend', 'close', 'ally'] as ('all' | NPCRelationshipLevel)[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded text-xs transition-colors ${
                filter === f ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {f === 'all' ? '全部' : RELATIONSHIP_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-gray-600 text-sm">
            暂无结识的NPC
          </div>
        ) : (
          <div className="space-y-0.5 p-1">
            {filtered.map((npc) => (
              <button
                key={npc.npcId}
                onClick={() => setSelectedNpc(npc)}
                className={`w-full text-left p-2 rounded-lg transition-colors hover:bg-gray-800/70 ${
                  selectedNpc?.npcId === npc.npcId ? 'bg-gray-800 border border-gray-700' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-300 truncate">{npc.name}</div>
                    <div className="text-xs text-gray-500 truncate">{npc.title}</div>
                  </div>
                  <span className={`text-xs shrink-0 ml-2 ${safeColor(npc)}`}>
                    {RELATIONSHIP_LABELS[safeLevel(npc) as NPCRelationshipLevel] || '陌生人'}
                  </span>
                </div>
                <div className="flex gap-1 mt-1">
                  <span className="h-1 rounded-full bg-indigo-500/50"
                    style={{ width: `${(safeAttitude(npc) + 100) / 2}%`, maxWidth: '100%' }} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* NPC Detail Modal */}
      {selectedNpc && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]" onClick={() => setSelectedNpc(null)}>
          <div
            className="bg-gray-900 border border-gray-700 rounded-xl w-[520px] max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-4 border-b border-gray-800 flex items-start gap-4">
              {npcPortraits[selectedNpc.npcId] ? (
                <img src={npcPortraits[selectedNpc.npcId]} alt={selectedNpc.name}
                  className="w-14 h-14 rounded-xl object-cover shrink-0 border border-white/[.06]" />
              ) : portraitLoading[selectedNpc.npcId] ? (
                <div className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 bg-gray-800/50 border border-gray-700">
                  <span className="text-[10px] text-gray-600 animate-pulse">🎨</span>
                </div>
              ) : (
                <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold shrink-0
                  ${selectedNpc.isHostile ? 'bg-red-900/40 border border-red-800' : 'bg-indigo-900/40 border border-indigo-800'}`}>
                  {selectedNpc.name[0]}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-gray-200">{selectedNpc.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded ${levelToColor(selectedNpc.relationship.level)} bg-gray-800`}>
                    {RELATIONSHIP_LABELS[selectedNpc.relationship.level]}
                  </span>
                </div>
                <div className="text-sm text-gray-400">{selectedNpc.title}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {selectedNpc.region} · {selectedNpc.subRegion}
                </div>
              </div>
              <button onClick={() => setSelectedNpc(null)} className="text-gray-500 hover:text-gray-300 text-lg shrink-0">
                {'\u2715'}
              </button>
            </div>

            {/* Large portrait — uses imageGen URL from header fetch, falls back to letter gradient */}
            <div className="px-4 pt-2" data-testid="npc-portrait-large-wrapper">
              {npcPortraits[selectedNpc.npcId] ? (
                <img
                  src={npcPortraits[selectedNpc.npcId]}
                  alt={selectedNpc.name}
                  data-testid="npc-portrait-large"
                  className="w-full aspect-[3/4] max-h-48 mx-auto rounded-xl object-cover"
                />
              ) : (
                <div
                  data-testid="npc-portrait-large"
                  className="w-full aspect-[3/4] max-h-48 mx-auto rounded-xl bg-gradient-to-b from-gray-800/50 to-gray-800/20 border border-gray-700/30 flex items-center justify-center"
                >
                  <span className="text-4xl opacity-20">{selectedNpc.name[0]}</span>
                </div>
              )}
            </div>

            <div className="p-4 space-y-4">
              {/* Quick action buttons */}
              <div className="flex gap-1.5">
                <button onClick={() => submitCustom(`[与${selectedNpc.name}交谈]`)}
                  className="text-[10px] text-amber-400/70 px-2 py-1 rounded bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 transition-colors">
                  💬 交谈
                </button>
                <button onClick={() => submitCustom(`[向${selectedNpc.name}赠礼]`)}
                  className="text-[10px] text-emerald-400/70 px-2 py-1 rounded bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 transition-colors">
                  🎁 赠礼
                </button>
                <button onClick={() => submitCustom(`[向${selectedNpc.name}了解信息]`)}
                  className="text-[10px] text-blue-400/70 px-2 py-1 rounded bg-blue-500/5 border border-blue-500/10 hover:bg-blue-500/10 transition-colors">
                  ℹ️ 信息
                </button>
                <button onClick={() => submitCustom(`[请求${selectedNpc.name}帮助]`)}
                  className="text-[10px] text-purple-400/70 px-2 py-1 rounded bg-purple-500/5 border border-purple-500/10 hover:bg-purple-500/10 transition-colors">
                  🤝 帮助
                </button>
                {canPreviewNpcVoice && (
                  <button onClick={() => speakNPC(selectedNpc)}
                    className="text-[10px] text-pink-400/70 px-2 py-1 rounded bg-pink-500/5 border border-pink-500/10 hover:bg-pink-500/10 transition-colors"
                    title={`试听 ${selectedNpc.name} 的配音`}>
                    🔊 试听
                  </button>
                )}
              </div>

              {/* Appearance + Background */}
              <div>
                <div className="text-xs text-indigo-400 uppercase tracking-wider mb-1">外貌</div>
                <div className="text-sm text-gray-300">{selectedNpc.appearance}</div>
              </div>
              <div>
                <div className="text-xs text-indigo-400 uppercase tracking-wider mb-1">背景</div>
                <div className="text-sm text-gray-300">{selectedNpc.background}</div>
              </div>
              <div>
                <div className="text-xs text-indigo-400 uppercase tracking-wider mb-1">性格</div>
                <div className="text-sm text-gray-300">{selectedNpc.personality}</div>
              </div>

              {/* Attributes */}
              <div>
                <div className="text-xs text-indigo-400 uppercase tracking-wider mb-2">属性</div>
                <div className="grid grid-cols-3 gap-1">
                  {Object.entries(selectedNpc.attributes).map(([k, v]) => (
                    <div key={k} className="text-xs flex justify-between bg-gray-800/50 rounded px-2 py-1">
                      <span className="text-gray-400">{ATTRIBUTE_LABELS[k as keyof typeof ATTRIBUTE_LABELS]}</span>
                      <span className="text-gray-200 font-mono">{String(v)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Skills */}
              {selectedNpc.skills.length > 0 && (
                <div>
                  <div className="text-xs text-indigo-400 uppercase tracking-wider mb-2">技能</div>
                  <div className="space-y-1">
                    {selectedNpc.skills.map((s) => (
                      <div key={s.id} className="bg-gray-800/50 rounded px-3 py-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-300">{s.name}</span>
                          <span className="text-xs text-indigo-400">Lv.{s.level}</span>
                        </div>
                        <div className="text-xs text-gray-500">{s.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Relationship Info */}
              <div>
                <div className="text-xs text-indigo-400 uppercase tracking-wider mb-2">你对他的了解</div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-500">好感度</span>
                  <div className="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        selectedNpc.relationship.attitude >= 0 ? 'bg-emerald-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${(selectedNpc.relationship.attitude + 100) / 2}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 font-mono w-8 text-right">{selectedNpc.relationship.attitude}</span>
                </div>
                {selectedNpc.relationship.interactionCount > 0 && (
                  <div className="text-xs text-gray-500">
                    已交互 {selectedNpc.relationship.interactionCount} 次
                  </div>
                )}
                {selectedNpc.relationship.playerKnowsAbout.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {selectedNpc.relationship.playerKnowsAbout.map((info, i) => (
                      <div key={i} className="text-xs bg-gray-800/30 rounded px-2 py-1 text-gray-400">
                        {'\u2022'} {info}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Interaction History */}
              {selectedNpc.relationship.history.length > 0 && (
                <div>
                  <div className="text-xs text-indigo-400 uppercase tracking-wider mb-2">交往记录</div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {selectedNpc.relationship.history.map((h, i) => (
                      <div key={i} className="text-xs text-gray-500 bg-gray-800/30 rounded px-2 py-1">{h}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* v0.4-memory: 长期记忆 (NPC 关联) */}
              {npcMemories.length > 0 && (
                <div>
                  <div className="text-xs text-cyan-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <span>🧠</span><span>长期记忆</span>
                  </div>
                  <div className="space-y-1 max-h-32 overflow-y-auto" data-testid={`npc-memory-${selectedNpc.npcId}`}>
                    {npcMemories.slice(0, 3).map((m: import('../../types/memory').MemoryRecord) => (
                      <div key={m.id} className="text-xs text-cyan-300/80 bg-cyan-500/[.04] rounded px-2 py-1 line-clamp-2">
                        · {m.content}
                      </div>
                    ))}
                    {npcMemories.length > 3 && (
                      <div className="text-[10px] text-cyan-400/60 px-2">
                        还有 {npcMemories.length - 3} 条, 在 🧠 记忆按钮里查看
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-gray-800 p-3 flex justify-end">
              <button
                onClick={() => setSelectedNpc(null)}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function SocialPanel() {
  return (
    <ErrorBoundary>
      <SocialPanelInner />
    </ErrorBoundary>
  );
}
