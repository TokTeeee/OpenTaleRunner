import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../stores/gameStore';
import { useWorldStore } from '../../stores/worldStore';
import { useMultiplayerStore } from '../../stores/multiplayerStore';
import { usePMEngine } from '../../hooks/usePMEngine';
import { useVoiceInput } from '../../hooks/useVoiceInput';
import { getWorldName } from '../../services/storybook/runtime';
import { fadeInUp, buttonHover, buttonTap, goldSlide, inkPulse } from '../../styles/motion';

const PM_PHASES = ['观察场景', '评估行动', '命运之骰', '编织故事'];

/** 提交按钮 - 顶部金色滑线 + 缩放反馈 */
function ActionSubmitButton({ disabled = false, onClick, label }: { disabled?: boolean; onClick: () => void; label?: string }) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className="group relative overflow-hidden px-5 py-3 rounded-xl bg-gradient-to-r from-gold-600/80 to-gold-500/80 hover:from-gold-500/90 hover:to-gold-400/90 disabled:from-white/5 disabled:to-white/5 disabled:text-gray-600 text-ink-950 text-sm font-bold transition-all shadow-lg shadow-gold-900/20 font-display tracking-wide disabled:cursor-not-allowed"
      whileHover={!disabled ? buttonHover : undefined}
      whileTap={!disabled ? buttonTap : undefined}
    >
      <span className="relative z-10">{label ?? '行动'}</span>
      {/* 顶部金色滑线 - hover 时滑入 */}
      <motion.span
        className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-gold-200 to-transparent"
        variants={goldSlide}
        initial="initial"
        whileHover="animate"
      />
    </motion.button>
  );
}

/** 决策按钮 - 左侧金色边框滑入 + hover 渐变 */
function ChoiceButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      onClick={onClick}
      className="group relative w-full text-left px-4 py-2.5 rounded-xl bg-white/[.03] hover:bg-gold-500/[0.06] border border-white/[.04] hover:border-gold-500/30 text-[13px] text-gray-300 hover:text-gold-200 transition-all duration-200 overflow-hidden font-narrative"
      whileHover={{ x: 2, transition: { duration: 0.15 } }}
      whileTap={buttonTap}
    >
      {/* 左侧 2px 金色边框滑入 */}
      <span className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-gold-400 to-gold-600 scale-y-0 group-hover:scale-y-100 origin-center transition-transform duration-300" />
      <span className="relative">{children}</span>
    </motion.button>
  );
}

export function InteractionArea({ onOpenMultiplayerCharacterWizard }: { onOpenMultiplayerCharacterWizard?: () => void } = {}) {
  const choices = useGameStore((s) => s.currentChoices);
  const isWaiting = useGameStore((s) => s.isWaitingForPM);
  const isWaitingPlayer = useGameStore((s) => s.isWaitingForPlayer);
  const gmActivity = useGameStore((s) => s.gmActivity);
  const recentActions = useGameStore((s) => s.recentActions);
  const {
    gameMode: multiplayerMode,
    roomConfig,
    currentPlayerId,
    currentRound,
    estimatedIntroRound,
    players,
    playersActed,
  } = useMultiplayerStore();
  const { pickChoice, submitCustom, skipAction, requestScene, clearError, abort, pmError } = usePMEngine();
  const [customInput, setCustomInput] = useState('');
  const [phaseText, setPhaseText] = useState(PM_PHASES[0]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const voice = useVoiceInput();
  const worldName = getWorldName(useWorldStore((s) => s.storybook));
  const mySession = players.find((player) => player.playerId === currentPlayerId);
  const isSpectating = mySession?.status === 'spectating' || mySession?.status === 'pending_intro';
  const hasActed = Boolean(currentPlayerId && playersActed.includes(currentPlayerId));
  const inGamePlayers = players.filter((player) => player.status === 'in_game');
  const remainingIntroRounds = estimatedIntroRound != null
    ? Math.max(estimatedIntroRound - currentRound, 0)
    : mySession
      ? Math.max((mySession.joinedAtRound + (roomConfig?.lateJoinIntroDelay ?? 2)) - currentRound, 0)
      : 0;

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- voice transcript → input box sync; refactor to derived state in v0.4
    if (voice.transcript) setCustomInput(voice.transcript);
  }, [voice.transcript]);

  useEffect(() => {
    if (!isWaiting) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- phase rotation kickoff; refactor in v0.4
    let i = 0; setPhaseText(PM_PHASES[0]);
    const t = setInterval(() => { i = (i + 1) % PM_PHASES.length; setPhaseText(PM_PHASES[i]); }, 2000);
    return () => clearInterval(t);
  }, [isWaiting]);

  const submit = () => { if (!customInput.trim()) return; submitCustom(customInput); setCustomInput(''); setShowSuggestions(false); };

  if (multiplayerMode === 'multiplayer') {
    if (pmError) {
      return (
        <motion.div className="border-t border-rose-500/10 p-4 space-y-3 glass-strong"
          variants={fadeInUp} initial="initial" animate="animate"
        >
          <div className="flex items-center gap-2"><span className="text-rose-400">⚠</span><span className="text-sm text-rose-400 font-medium font-display">多人同步失败</span></div>
          <div className="text-xs text-rose-500/70 font-mono">{pmError}</div>
          <div className="flex gap-2">
            <button onClick={() => { clearError(); requestScene(); }} className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-xl text-sm border border-rose-500/20 font-display">重试</button>
            <button onClick={() => { abort(); clearError(); }} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-500 rounded-xl text-sm font-display">取消</button>
          </div>
        </motion.div>
      );
    }

    if (isSpectating) {
      return (
        <motion.div className="border-t border-gold-500/10 p-5 glass-strong space-y-4"
          variants={fadeInUp} initial="initial" animate="animate"
        >
          <div className="rounded-2xl border border-gold-500/20 bg-gold-500/[0.04] p-5 space-y-3 shadow-parchment">
            <div className="text-[11px] uppercase tracking-[.18em] text-gold-300/80 font-display">观战模式</div>
            <div className="text-sm text-gray-200 font-narrative">
              {mySession?.isReady ? '角色已提交，等待 GM 在叙事中引入你。' : '你可以先旁观队伍行动，并随时完成角色创建。'}
            </div>
            <div className="text-xs text-gray-500 leading-relaxed font-mono">
              预计还需 {remainingIntroRounds} 轮引入，你在此期间可以回看历史叙事和队友当前行动状态。
            </div>
            {!mySession?.isReady && onOpenMultiplayerCharacterWizard && (
              <ActionSubmitButton
                onClick={onOpenMultiplayerCharacterWizard}
                label="创建角色并等待引入"
              />
            )}
          </div>
        </motion.div>
      );
    }

    if (hasActed) {
      const pendingNames = inGamePlayers
        .filter((p) => p.playerId !== currentPlayerId && !playersActed.includes(p.playerId))
        .map((p) => p.characterName || p.playerName);

      return (
        <motion.div className="border-t border-gold-500/10 p-5 glass-strong flex flex-col items-center gap-3"
          variants={fadeInUp} initial="initial" animate="animate"
        >
          <motion.div
            className="w-9 h-9 relative"
            variants={inkPulse} initial="initial" animate="animate"
          >
            <div className="absolute inset-0 rounded-full border-2 border-gold-500/15" />
            <div className="absolute inset-0 rounded-full border-2 border-t-gold-400 border-r-gold-500/40 animate-spin" />
          </motion.div>
          <div className="text-xs text-gold-300/80 font-medium tracking-wide font-display">等待队友完成行动</div>
          <div className="text-[10px] text-gray-600 font-mono">
            已提交 {playersActed.length}/{inGamePlayers.length}
          </div>
          {pendingNames.length > 0 && (
            <div className="flex flex-wrap gap-1 justify-center">
              {pendingNames.map((name, i) => (
                <span key={i} className="text-[9px] px-2 py-0.5 rounded-full bg-gold-500/[.06] border border-gold-500/15 text-gold-300/70 font-mono">
                  ⏳ {name}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      );
    }

    const quickActions = ['观察周围', '继续前进', '与队友商议', '原地等待'];

    return (
      <motion.div className="border-t border-white/[.03] p-4 space-y-3 glass-strong"
        variants={fadeInUp} initial="initial" animate="animate"
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gold-400/60 font-mono">多人行动会在整轮结算后统一叙事</span>
          {roomConfig?.allowSkipAction !== false && (
            <motion.button
              onClick={() => skipAction()}
              className="text-[11px] transition-all px-3 py-1 rounded-full border border-gold-500/10 text-gold-400/60 hover:text-gold-300 hover:border-gold-500/30 font-display"
              whileHover={buttonHover} whileTap={buttonTap}
            >
              跳过此轮
            </motion.button>
          )}
        </div>

        {recentActions.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {recentActions.map((action, i) => (
              <motion.button key={i} onClick={() => submitCustom(action)}
                className="text-[10px] px-2 py-1 rounded-full bg-white/[.03] border border-white/[.06] text-gray-500 hover:text-gold-300 hover:border-gold-500/30 transition-colors truncate max-w-[180px] font-mono"
                whileHover={buttonHover} whileTap={buttonTap}
                title={action}>
                🔄 {action.slice(0, 20)}
              </motion.button>
            ))}
          </div>
        )}

        <div className="flex gap-1.5 flex-wrap">
          {quickActions.map((action) => (
            <motion.button key={action} onClick={() => submitCustom(action)}
              className="text-[10px] px-2.5 py-1 rounded-full bg-gold-500/[.06] border border-gold-500/15 text-gold-300/70 hover:text-gold-200 hover:bg-gold-500/15 transition-colors font-display"
              whileHover={buttonHover} whileTap={buttonTap}
            >
              {action}
            </motion.button>
          ))}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
              maxLength={2000}
              placeholder={voice.isListening ? '正在聆听...' : '描述本轮想要执行的行动...'}
              className={`w-full px-4 py-3 rounded-xl bg-white/[.03] border text-sm text-gray-200 placeholder-gray-600 focus:outline-none transition-all font-narrative ${
                inputFocused
                  ? 'border-gold-500/50 bg-gold-500/[0.03] shadow-[0_0_0_3px_rgba(212,184,132,0.1)]'
                  : 'border-white/[.06]'
              }`}
            />
            {inputFocused && (
              <motion.span
                className="absolute left-0 right-0 -bottom-px h-[1px] bg-gradient-to-r from-transparent via-gold-400 to-transparent"
                layoutId="input-underline"
              />
            )}
          </div>
          {voice.isSupported && (
            <motion.button
              onClick={() => voice.isListening ? voice.stop() : voice.start()}
              className={`px-3 py-3 rounded-xl border transition-all text-sm ${
                voice.isListening
                  ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 animate-pulse'
                  : 'bg-white/[.03] border-white/[.06] text-gray-500 hover:text-gold-300 hover:border-gold-500/30'
              }`}
              whileHover={buttonHover} whileTap={buttonTap}
              title="点击开始/停止语音输入"
            >
              🎤
            </motion.button>
          )}
          <ActionSubmitButton onClick={submit} disabled={!customInput.trim()} />
        </div>
      </motion.div>
    );
  }

  if (pmError) {
    return (
      <motion.div className="border-t border-rose-500/10 p-4 space-y-3 glass-strong"
        variants={fadeInUp} initial="initial" animate="animate"
      >
        <div className="flex items-center gap-2"><span className="text-rose-400">⚠</span><span className="text-sm text-rose-400 font-medium font-display">与 GM 连接中断</span></div>
        <div className="text-xs text-rose-500/70 font-mono">{pmError}</div>
        <div className="flex gap-2">
          <button onClick={() => { clearError(); requestScene(); }} className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 rounded-xl text-sm border border-rose-500/20 font-display">重试</button>
          <button onClick={() => { abort(); clearError(); }} className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-500 rounded-xl text-sm font-display">取消</button>
        </div>
      </motion.div>
    );
  }

  if (isWaiting) {
    return (
      <motion.div className="border-t border-gold-500/10 p-5 glass-strong flex flex-col items-center gap-3"
        variants={fadeInUp} initial="initial" animate="animate"
      >
        <motion.div
          className="w-9 h-9 relative"
          variants={inkPulse} initial="initial" animate="animate"
        >
          <div className="absolute inset-0 rounded-full border-2 border-gold-500/15" />
          <div className="absolute inset-0 rounded-full border-2 border-t-gold-400 border-r-gold-500/40 animate-spin" />
        </motion.div>
        <div className="text-xs text-gold-300/80 font-medium tracking-wide font-display animate-breathe">{phaseText}</div>
        {gmActivity.length > 0 ? (
          <div className="space-y-0.5">
            {gmActivity.map((line, i) => (
              <div key={i} className={`text-[10px] font-mono ${i === gmActivity.length - 1 ? 'text-gold-300' : 'text-gold-500/40'}`}>{line}</div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-gold-400/50 font-mono">GM 正在编织命运</div>
        )}
      </motion.div>
    );
  }

  if (!isWaitingPlayer) {
    return (
      <motion.div className="border-t border-white/[.02] p-5 glass-strong text-center text-xs text-gold-400/60 font-display tracking-wide"
        variants={fadeInUp} initial="initial" animate="animate"
      >
        <span className="animate-breathe">正在载入{worldName}</span>
      </motion.div>
    );
  }

  return (
    <motion.div className="border-t border-white/[.03] p-4 space-y-3 glass-strong"
      variants={fadeInUp} initial="initial" animate="animate"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gold-400/60 font-mono">⏳ 时间随行动流逝</span>
        <motion.button
          onClick={() => setShowSuggestions(!showSuggestions)}
          className={`text-[11px] transition-all px-3 py-1 rounded-full border font-display ${
            showSuggestions
              ? 'border-gold-500/30 bg-gold-500/[0.06] text-gold-300'
              : 'border-gold-500/10 text-gold-400/60 hover:text-gold-300 hover:border-gold-500/30'
          }`}
          whileHover={buttonHover} whileTap={buttonTap}
        >
          {showSuggestions ? '收起' : '💡 建议'}
        </motion.button>
      </div>

      <AnimatePresence>
      {showSuggestions && choices.length > 0 && (
        <motion.div className="space-y-1.5"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto', transition: { duration: 0.22 } }}
          exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
        >
          {choices.map((c, i) => (
            <ChoiceButton key={i} onClick={() => { pickChoice(c); setShowSuggestions(false); }}>
              {c.text}
            </ChoiceButton>
          ))}
        </motion.div>
      )}
      </AnimatePresence>

      {/* Recent Actions */}
      {recentActions.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {recentActions.map((action, i) => (
            <motion.button key={i} onClick={() => submitCustom(action)}
              className="text-[10px] px-2 py-1 rounded-full bg-white/[.03] border border-white/[.06] text-gray-500 hover:text-gold-300 hover:border-gold-500/30 transition-colors truncate max-w-[180px] font-mono"
              whileHover={buttonHover} whileTap={buttonTap}
              title={action}>
              🔄 {action.slice(0, 20)}
            </motion.button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder={voice.isListening ? '正在聆听...' : '写下你想做的事情...'}
            className={`w-full px-4 py-3 rounded-xl bg-white/[.03] border text-sm text-gray-200 placeholder-gray-600 focus:outline-none transition-all font-narrative ${
              inputFocused
                ? 'border-gold-500/50 bg-gold-500/[0.03] shadow-[0_0_0_3px_rgba(212,184,132,0.1)]'
                : 'border-white/[.06]'
            }`}
          />
          {inputFocused && (
            <motion.span
              className="absolute left-0 right-0 -bottom-px h-[1px] bg-gradient-to-r from-transparent via-gold-400 to-transparent"
              layoutId="input-underline"
            />
          )}
        </div>
        {voice.isSupported && (
          <motion.button
            onClick={() => voice.isListening ? voice.stop() : voice.start()}
            className={`px-3 py-3 rounded-xl border transition-all text-sm ${
              voice.isListening
                ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 animate-pulse'
                : 'bg-white/[.03] border-white/[.06] text-gray-500 hover:text-gold-300 hover:border-gold-500/30'
            }`}
            whileHover={buttonHover} whileTap={buttonTap}
            title="点击开始/停止语音输入"
          >
            🎤
          </motion.button>
        )}
        <ActionSubmitButton onClick={submit} disabled={!customInput.trim()} />
      </div>
    </motion.div>
  );
}
