import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../stores/gameStore';
import { useAutoPlayStore } from '../../stores/autoPlayStore';
import { OUTCOME_LABELS } from '../../types/game';
import { diceBurst, diceNumber, goldFlicker, roseScatter, screenShake, particleScatter } from '../../styles/motion';

const ROLL_DURATION = 800;
const PARTICLE_COUNT = 8;
const PARTICLE_DISTANCE = 90;

export function DiceResultOverlay() {
  const diceResult = useGameStore((s) => s.currentDiceResult);
  const isWaiting = useGameStore((s) => s.isWaitingForPM);
  const autoPlayStatus = useAutoPlayStore((s) => s.status);
  const [visible, setVisible] = useState(false);
  const [pmReturned, setPmReturned] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [displayValues, setDisplayValues] = useState<number[]>([0, 0]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- "rolling animation" state machine; refactor to useReducer in v0.4
    if (!diceResult) { setVisible(false); setPmReturned(false); setRolling(false); return; }
    setVisible(true);
    setPmReturned(false);
    setRolling(true);
    // Animate: show random dice faces briefly before settling
    let elapsed = 0;
    const step = 60;
    const timer = setInterval(() => {
      elapsed += step;
      if (elapsed >= ROLL_DURATION) {
        clearInterval(timer);
        setDisplayValues(diceResult.diceValues);
        setRolling(false);
      } else {
        setDisplayValues([Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]);
      }
    }, step);
    return () => clearInterval(timer);
  }, [diceResult]);

  useEffect(() => {
    if (!isWaiting && visible) // eslint-disable-next-line react-hooks/set-state-in-effect -- derived "pmReturned" flag from isWaiting/visible; refactor in v0.4
      setPmReturned(true);
  }, [isWaiting, visible]);

  const handleClose = () => {
    setVisible(false);
    useGameStore.getState().setDiceResult(null);
  };

  // 8 颗粒子均匀分布在圆周上
  const particles = useMemo(
    () => Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      angle: (i / PARTICLE_COUNT) * Math.PI * 2,
      key: i,
    })),
    [],
  );

  if (!visible || !diceResult) return null;
  // 自动播放模式下隐藏判定窗
  if (autoPlayStatus === 'running') {
    // 在自动播放时仍然清空结果，但不显示窗口
    if (pmReturned) {
      handleClose();
    }
    return null;
  }

  const c: Record<string, { bg: string; border: string; text: string; glow: string; isCritical: 'success' | 'failure' | 'normal' }> = {
    critical_success: { bg: 'from-yellow-900/95 to-gold-900/95', border: 'border-gold-400/70', text: 'text-gold-300', glow: 'shadow-gold-500/30', isCritical: 'success' },
    success: { bg: 'from-emerald-900/95 to-green-900/95', border: 'border-emerald-400/60', text: 'text-emerald-300', glow: 'shadow-emerald-500/20', isCritical: 'normal' },
    partial_success: { bg: 'from-blue-900/95 to-indigo-900/95', border: 'border-blue-400/60', text: 'text-blue-300', glow: 'shadow-blue-500/20', isCritical: 'normal' },
    failure: { bg: 'from-amber-900/95 to-orange-900/95', border: 'border-amber-400/60', text: 'text-amber-300', glow: 'shadow-amber-500/20', isCritical: 'normal' },
    critical_failure: { bg: 'from-red-900/95 to-rose-900/95', border: 'border-rose-400/70', text: 'text-rose-300', glow: 'shadow-rose-500/30', isCritical: 'failure' },
  };
  const color = c[diceResult.outcome] || c.failure;
  const isShake = color.isCritical !== 'normal';

  return (
    <AnimatePresence>
      <motion.div
        key="dice-overlay"
        className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.22 } }}
        exit={{ opacity: 0, transition: { duration: 0.18 } }}
        variants={isShake ? screenShake : undefined}
      >
        <motion.div
          className={`relative bg-gradient-to-b ${color.bg} ${color.border} border-2 rounded-2xl p-8 shadow-2xl ${color.glow} max-w-sm w-full`}
          variants={diceBurst}
          initial="initial"
          animate="animate"
          style={!isShake ? undefined : { animation: 'none' }}
        >
          {/* 边框金色闪烁 (命中时) */}
          <motion.div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            variants={goldFlicker}
            initial="initial"
            animate="animate"
          />

          {/* 玫瑰色色散光晕 (大失败时) */}
          {color.isCritical === 'failure' && (
            <motion.div
              className="absolute inset-0 rounded-2xl pointer-events-none bg-rose-500/30 blur-xl"
              variants={roseScatter}
              initial="initial"
              animate="animate"
            />
          )}

          {/* 8 颗粒子飞散 (大成功/大失败时) */}
          {color.isCritical !== 'normal' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              {particles.map((p) => (
                <motion.div
                  key={p.key}
                  className={`absolute w-1.5 h-1.5 rounded-full ${
                    color.isCritical === 'success' ? 'bg-gold-400' : 'bg-rose-400'
                  }`}
                  style={{ boxShadow: color.isCritical === 'success'
                    ? '0 0 8px rgba(212,184,132,0.8)'
                    : '0 0 8px rgba(244,63,94,0.8)' }}
                  variants={particleScatter(p.angle, PARTICLE_DISTANCE)}
                  initial="initial"
                  animate="animate"
                />
              ))}
            </div>
          )}

          <div className="relative text-center">
            <div className={`text-4xl font-bold ${color.text} mb-4 font-display tracking-wider uppercase`}>
              {OUTCOME_LABELS[diceResult.outcome] || '检定'}
            </div>
            <div className="flex items-center justify-center gap-3 mb-5">
              {displayValues.map((v, i) => (
                <motion.div
                  key={i}
                  className={`w-14 h-14 rounded-xl bg-ink-900/80 border flex items-center justify-center transition-all ${
                    rolling
                      ? 'border-gold-500/60 shadow-lg shadow-gold-500/20'
                      : 'border-gold-500/40'
                  }`}
                  variants={!rolling ? diceNumber : undefined}
                  initial="initial"
                  animate="animate"
                  style={rolling ? { transform: 'scale(1.1)' } : undefined}
                >
                  <span className={`text-2xl font-bold font-mono transition-colors ${
                    rolling ? 'text-gold-300' : 'text-white'
                  }`}>
                    {v}
                  </span>
                </motion.div>
              ))}
            </div>
            <div className="space-y-1.5 text-xs max-w-[220px] mx-auto mb-5 font-mono">
              <div className="flex justify-between"><span className="text-gray-400">属性修正</span><span className="text-gray-200">+{diceResult.attributeModifier}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">技能加成</span><span className="text-gray-200">+{diceResult.skillBonus}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">装备辅助</span><span className="text-gray-200">+{diceResult.equipmentBonus}</span></div>
              <div className="flex justify-between"><span className="text-rose-400">难度等级</span><span className="text-rose-400">-{diceResult.difficultyLC}</span></div>
              <hr className="border-gray-700/50 my-1" />
              <div className="flex justify-between font-bold text-sm"><span className="text-gray-300">最终结果</span><span className={color.text}>{diceResult.finalResult}</span></div>
            </div>

            {pmReturned ? (
              <button onClick={handleClose}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-all shadow-lg shadow-emerald-900/30 font-display tracking-wide">
                确定
              </button>
            ) : (
              <div className="space-y-3">
                <button disabled className="w-full py-3 rounded-xl bg-gray-700/80 text-gray-500 font-medium cursor-not-allowed font-display">
                  等待 GM 回应...
                </button>
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-gold-500/20 border-t-gold-400 rounded-full animate-spin" />
                  <span className="text-xs text-gold-300/70 animate-breathe font-display tracking-wide">GM 正在编织接下来的故事...</span>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
