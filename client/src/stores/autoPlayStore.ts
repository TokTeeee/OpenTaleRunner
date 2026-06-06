/**
 * AutoPlay 运行状态中心。
 * 保存自动游玩的执行状态、轮次统计、最近一次动作/推理和运行间隔，
 * 让控制面板与自动执行引擎之间通过 store 同步可观测状态。
 */
import { create } from 'zustand';
import type { AutoPlayStatus } from '../types/autoPlay';

interface AutoPlayStoreState {
  status: AutoPlayStatus;
  currentRound: number;
  totalRounds: number;
  lastAction: string;
  lastReasoning: string;
  errorMessage: string;
  intervalMs: number;

  setStatus: (s: AutoPlayStatus) => void;
  setCurrentRound: (r: number) => void;
  setTotalRounds: (r: number) => void;
  setLastAction: (a: string) => void;
  setLastReasoning: (r: string) => void;
  setErrorMessage: (e: string) => void;
  setIntervalMs: (ms: number) => void;
  reset: () => void;
}

const initial = {
  status: 'idle' as AutoPlayStatus,
  currentRound: 0,
  totalRounds: -1,
  lastAction: '',
  lastReasoning: '',
  errorMessage: '',
  intervalMs: 3000,
};

export const useAutoPlayStore = create<AutoPlayStoreState>((set) => ({
  ...initial,
  setStatus: (s) => set({ status: s }),
  setCurrentRound: (r) => set({ currentRound: r }),
  setTotalRounds: (r) => set({ totalRounds: r }),
  setLastAction: (a) => set({ lastAction: a }),
  setLastReasoning: (r) => set({ lastReasoning: r }),
  setErrorMessage: (e) => set({ errorMessage: e, status: e ? 'error' : 'idle' }),
  setIntervalMs: (ms) => set({ intervalMs: ms }),
  reset: () => set(initial),
}));