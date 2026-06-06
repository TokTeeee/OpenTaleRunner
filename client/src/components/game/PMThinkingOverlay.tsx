import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../stores/gameStore';
import { inkConverge, inkPulse } from '../../styles/motion';

const BLOB_COUNT = 5;
const CONVERGE_DISTANCE = 60;

export function PMThinkingOverlay() {
  const isWaiting = useGameStore((s) => s.isWaitingForPM);
  const gmActivity = useGameStore((s) => s.gmActivity);

  // 为 5 个 ink-blob 生成不同的初始位置 (从四周向中心)
  const blobs = Array.from({ length: BLOB_COUNT }, (_, i) => {
    const angle = (i / BLOB_COUNT) * Math.PI * 2;
    return {
      x: Math.cos(angle) * CONVERGE_DISTANCE,
      y: Math.sin(angle) * CONVERGE_DISTANCE,
      size: 8 + (i % 3) * 4, // 8/12/16
      delay: i * 0.1,
      hue: i % 2 === 0 ? 'bg-gold-500/40' : 'bg-indigo-500/30',
    };
  });

  if (!isWaiting) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="pm-thinking"
        className="fixed inset-0 z-[70] flex items-center justify-center bg-black/30 backdrop-blur-[2px] pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.3 } }}
        exit={{ opacity: 0, transition: { duration: 0.22 } }}
      >
        <div className="relative flex flex-col items-start gap-2 px-7 py-5 rounded-2xl bg-ink-900/95 backdrop-blur-md border border-gold-500/30 shadow-parchment min-w-[260px] overflow-hidden">
          {/* 5 个墨水 blob 从四周聚拢 */}
          {blobs.map((b, i) => (
            <motion.div
              key={i}
              className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-md ${b.hue}`}
              style={{ width: b.size, height: b.size }}
              custom={{ x: b.x, y: b.y }}
              variants={inkConverge}
              initial="initial"
              animate="animate"
            />
          ))}

          {/* 中心文字 */}
          <motion.div
            className="relative z-10"
            variants={inkPulse}
            initial="initial"
            animate="animate"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-gold-500 text-base font-display">ᛟ</span>
              <span className="text-sm text-gold-300 font-display italic tracking-wider">
                PM 正在思考...
              </span>
              <span className="text-gold-500 text-base font-display">ᛇ</span>
            </div>
            {gmActivity.length > 0 ? (
              <div className="mt-2.5 space-y-1.5">
                {gmActivity.map((line, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-[10px] text-gold-500/50">▸</span>
                    <span className={`text-xs font-mono ${
                      i === gmActivity.length - 1
                        ? 'text-gold-300 font-medium'
                        : 'text-gold-400/50'
                    }`}>
                      {line}
                    </span>
                    {i === gmActivity.length - 1 && (
                      <div className="w-3 h-3 rounded-full border-2 border-gold-500/20 border-t-gold-400 animate-spin ml-1" />
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-2 text-[10px] text-gold-400/50 font-mono animate-breathe tracking-wide">
                命运之笔在羊皮卷上缓缓浮现...
              </div>
            )}
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
