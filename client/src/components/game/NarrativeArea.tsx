import { useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../stores/gameStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useMultiplayerStore } from '../../stores/multiplayerStore';
import { useNPCStore } from '../../stores/npcStore';
import { buildNarrativeSegments } from '../../services/narrative/dialogueSegments';
import { getStoredVoiceParams } from '../../services/tts/NPCVoiceManager';
import { TTSClient } from '../../services/tts/TTSClient';
import { bubbleInk, dividerReveal, inkPulse } from '../../styles/motion';

export function NarrativeArea() {
  const messages = useGameStore((s) => s.messages);
  const isWaiting = useGameStore((s) => s.isWaitingForPM);
  const streamingText = useGameStore((s) => s.streamingText);
  const ttsEnabled = useSettingsStore((s) => s.ttsEnabled);
  const setTTS = useSettingsStore((s) => s.setTTSEnabled);
  const npcIndependentVoice = useSettingsStore((s) => s.npcIndependentVoice);
  const tts = useSettingsStore((s) => s.tts);
  const llmApiKey = useSettingsStore((s) => s.llm.apiKey);
  const isMultiplayer = useMultiplayerStore((s) => s.gameMode === 'multiplayer');
  const npcMap = useNPCStore((s) => s.npcs);
  const containerRef = useRef<HTMLDivElement>(null);
  const ttsClientRef = useRef<{ stop: () => void } | null>(null);
  const npcByName = useMemo(
    () => new Map(Object.values(npcMap).map((npc) => [npc.name, npc])),
    [npcMap],
  );
  const npcNames = useMemo(
    () => [...npcByName.keys()].sort((left, right) => right.length - left.length),
    [npcByName],
  );
  const canUseTTS = tts.provider === 'edge' || Boolean(tts.apiKey || llmApiKey);

  const pmAccent = isMultiplayer
    ? {
        avatarLabel: 'PM',
        avatarClassName: 'bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border-emerald-400/20 text-emerald-200',
        bubbleClassName: 'bg-bubble-pm border-emerald-500/15 text-emerald-50/95 shadow-emerald-950/20',
        pointerClassName: 'bg-bubble-pm border-emerald-500/15',
        badgeClassName: 'via-emerald-500/15 border-emerald-500/12 bg-emerald-500/6 text-emerald-300/60',
      }
    : {
        avatarLabel: 'G',
        avatarClassName: 'bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border-indigo-400/15 text-indigo-300',
        bubbleClassName: 'bg-ink-800 border-indigo-500/10 text-gray-200 shadow-black/10',
        pointerClassName: 'bg-ink-800 border-indigo-500/10',
        badgeClassName: 'via-indigo-500/15 border-indigo-500/10 bg-indigo-500/5 text-indigo-400/50',
      };

  useEffect(() => {
    containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamingText]);

  useEffect(() => () => {
    ttsClientRef.current?.stop();
  }, []);

  const playSegment = async (text: string, speakerName?: string) => {
    if (!canUseTTS || !text.trim()) {
      return;
    }

    try {
      const speaker = speakerName ? npcByName.get(speakerName) : undefined;
      const voiceParams = npcIndependentVoice && speaker
        ? getStoredVoiceParams(speaker.npcId, null)
        : undefined;
      ttsClientRef.current?.stop();
      const client = new TTSClient(voiceParams ? {
        voice: voiceParams.voice_id,
        speed: voiceParams.speed,
        provider: voiceParams.provider,
      } : undefined);
      ttsClientRef.current = client;
      await client.speak(text.trim());
    } catch {
      // Ignore playback failures and keep the UI responsive.
    }
  };

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
      <div className="flex justify-end">
          <button
            onClick={() => setTTS(!ttsEnabled)}
            className={`text-[10px] px-2.5 py-1 rounded border transition-all ${
              ttsEnabled
                ? 'bg-gold-500/10 border-gold-500/30 text-gold-300 hover:bg-gold-500/20'
                : 'bg-white/[.03] border-white/[.06] text-gray-500 hover:text-gold-400 hover:border-gold-500/20'
            }`}
            title={ttsEnabled ? '关闭 GM 语音朗读' : '开启 GM 语音朗读'}
          >
            {ttsEnabled ? '🔊 朗读已开' : '🔇 朗读已关'}
          </button>
      </div>
      <AnimatePresence initial={false}>
      {messages.map((msg) => {
        if (msg.type === 'divider') {
          return (
            <motion.div
              key={msg.id}
              className="flex items-center gap-3 py-3"
              variants={dividerReveal}
              initial="initial"
              animate="animate"
            >
              <motion.div
                className="flex-1 h-px bg-gradient-to-r from-transparent via-gold-500/40 to-transparent"
                variants={dividerReveal}
                style={{ originX: 0 }}
              />
              <span className="text-gold-500 text-[10px] font-display tracking-[.3em]">ᛟ</span>
              <span className={`text-[10px] font-display tracking-[.18em] uppercase px-3 py-1 rounded-full border border-gold-500/20 bg-gold-500/[0.04] text-gold-300/80`}>
                {msg.content}
              </span>
              <span className="text-gold-500 text-[10px] font-display tracking-[.3em]">ᛇ</span>
              <motion.div
                className="flex-1 h-px bg-gradient-to-r from-transparent via-gold-500/40 to-transparent"
                variants={dividerReveal}
                style={{ originX: 1 }}
              />
            </motion.div>
          );
        }
        if (msg.type === 'pm') {
          const segments = buildNarrativeSegments(msg.content, npcNames);
          return (
            <motion.div
              key={msg.id}
              className="flex gap-3 max-w-[88%]"
              variants={bubbleInk}
              initial="initial"
              animate="animate"
            >
              <div className={`w-8 h-8 rounded-lg border flex items-center justify-center text-[10px] font-display font-bold shrink-0 mt-1 ${pmAccent.avatarClassName}`}>
                {pmAccent.avatarLabel}
              </div>
              <div className="relative">
                <div className={`absolute left-[-6px] top-3 w-3 h-3 rotate-45 border-l border-b ${pmAccent.pointerClassName}`} />
                <div className={`rounded-2xl rounded-tl-sm px-5 py-3.5 text-[13px] leading-relaxed font-narrative shadow-lg border space-y-3 ${pmAccent.bubbleClassName}`}>
                  {segments.map((segment) => {
                    const isNpcDialogue = segment.kind === 'dialogue' && Boolean(segment.speakerName && npcByName.has(segment.speakerName));
                    const showPlayButton = canUseTTS && (
                      (segment.kind === 'narration' && ttsEnabled)
                      || (segment.kind === 'dialogue' && (ttsEnabled || (npcIndependentVoice && isNpcDialogue)))
                    );

                    return (
                      <div key={`${msg.id}-${segment.id}`} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            {segment.kind === 'dialogue' && (
                              <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full border ${
                                isNpcDialogue
                                  ? 'border-amber-400/25 bg-amber-500/10 text-amber-200'
                                  : 'border-indigo-400/15 bg-indigo-500/10 text-indigo-200'
                              }`}>
                                {segment.speakerName || '对白'}
                              </span>
                            )}
                          </div>
                          {showPlayButton && (
                            <button
                              onClick={() => void playSegment(segment.text, segment.speakerName)}
                              className="shrink-0 text-[10px] px-2 py-0.5 rounded border border-white/10 text-gray-300/75 hover:text-gold-300 hover:border-gold-500/30 hover:bg-gold-500/[0.04] transition-colors"
                              title={segment.kind === 'dialogue' ? '播放这句台词' : '播放这段旁白'}
                            >
                              ▶ 朗读
                            </button>
                          )}
                        </div>
                        <div className={`whitespace-pre-wrap font-narrative ${
                          segment.kind === 'dialogue'
                            ? isNpcDialogue
                              ? 'rounded-xl border border-amber-400/15 bg-amber-500/5 px-3 py-2 text-amber-50 font-quote italic'
                              : 'rounded-xl border border-indigo-400/10 bg-indigo-500/5 px-3 py-2 text-indigo-50/95 font-quote italic'
                            : 'text-gray-200'
                        }`}>
                          {segment.kind === 'dialogue' ? `「${segment.text}」` : segment.text}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          );
        }
        if (msg.type === 'player') {
          return (
            <motion.div
              key={msg.id}
              className="flex gap-3 justify-end max-w-[88%] ml-auto"
              variants={bubbleInk}
              initial="initial"
              animate="animate"
            >
              <div className="relative">
                <div className="absolute right-[-6px] top-3 w-3 h-3 rotate-45 bg-bubble-decision border-r border-t border-gold-500/15" />
                <div className="bg-bubble-decision border border-gold-500/15 rounded-2xl rounded-tr-sm px-5 py-3.5 text-gray-200 text-[13px] leading-relaxed font-narrative shadow-lg shadow-black/10">
                  {msg.content}
                </div>
              </div>
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold-500/20 to-amber-500/20 border border-gold-400/20 flex items-center justify-center text-[10px] text-gold-300 font-display font-bold shrink-0 mt-1">
                你
              </div>
            </motion.div>
          );
        }
        if (msg.type === 'system') {
          return (
            <motion.div
              key={msg.id}
              className="text-center py-2"
              variants={inkPulse}
              initial="initial"
              animate="animate"
            >
              <span className="text-[11px] text-gold-400/70 font-display tracking-[.18em] uppercase bg-gold-500/[0.03] px-4 py-1 rounded-full border border-gold-500/10">
                {msg.content}
              </span>
            </motion.div>
          );
        }
        if (msg.type === 'round_summary') {
          return (
            <motion.div
              key={msg.id}
              className="bg-bubble-system border border-gold-500/25 rounded-2xl p-4 space-y-3 shadow-parchment max-w-[92%]"
              variants={bubbleInk}
              initial="initial"
              animate="animate"
            >
              {msg.round != null && (
                <div className="text-[10px] text-gold-400 tracking-[.18em] uppercase font-display">第 {msg.round} 轮</div>
              )}
              <div className="text-[11px] text-gold-300/80 uppercase tracking-[.18em] font-display">⚔ 行动与判定</div>
              {msg.details?.map((detail) => (
                <div key={`${msg.id}-${detail.playerId}`} className="rounded-xl border border-gold-500/10 bg-black/20 px-4 py-3">
                  <div className="text-sm text-gray-200 font-medium font-display">{detail.playerName}</div>
                  <div className="text-[13px] text-gray-400 leading-relaxed mt-1 font-narrative">{detail.action}</div>
                  <div className="text-[11px] text-gold-300/80 mt-2 font-mono">{detail.dice}</div>
                </div>
              ))}
            </motion.div>
          );
        }
        return null;
      })}
      </AnimatePresence>
      {streamingText && (
        <motion.div
          className="flex gap-3 max-w-[88%]"
          variants={bubbleInk}
          initial="initial"
          animate="animate"
        >
          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center text-[10px] font-display font-bold shrink-0 mt-1 ${pmAccent.avatarClassName}`}>{pmAccent.avatarLabel}</div>
          <div className={`rounded-2xl rounded-tl-sm px-5 py-3.5 text-[13px] leading-relaxed font-narrative shadow-lg border ${pmAccent.bubbleClassName}`}>
            {streamingText}<span className="inline-block w-1.5 h-4 bg-gold-400 ml-0.5 animate-pulse align-middle" />
          </div>
        </motion.div>
      )}
      {isWaiting && !streamingText && (
        <motion.div
          className="flex gap-3 max-w-[88%]"
          variants={bubbleInk}
          initial="initial"
          animate="animate"
        >
          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center text-[10px] font-display font-bold shrink-0 mt-1 ${pmAccent.avatarClassName}`}>{pmAccent.avatarLabel}</div>
          <div className={`rounded-2xl rounded-tl-sm px-5 py-3.5 border ${pmAccent.bubbleClassName}`}>
            <span className="text-gold-400/60 text-[13px] font-display tracking-[.3em] animate-breathe">· · ·</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
