/**
 * v0.5.1 — 客户端 grantExp 纯函数.
 * 镜像 server/services/exp_formula.py 的 apply_exp_formula, 用于本地 UI 响应.
 * 注: 服务端仍权威, 真正持久化由 PATCH /api/v1/characters/{id}/exp 完成.
 */
import { expToNext, MAX_LEVEL } from './expFormula';

export type Difficulty = 'easy' | 'normal' | 'hard' | 'deadly';

export interface ExpGrantInput {
  level: number;
  exp: number;
  unspentAttributePoints: number;
}

export interface ExpGrantResult extends ExpGrantInput {}

const DIFFICULTY_MULT: Record<Difficulty, number> = {
  easy: 0.5,
  normal: 1.0,
  hard: 1.5,
  deadly: 2.0,
};

export function grantExp(
  state: ExpGrantInput,
  amount: number,
  difficulty: Difficulty = 'normal',
): ExpGrantResult {
  const mult = DIFFICULTY_MULT[difficulty] ?? 1.0;
  const final = Math.floor(amount * mult);
  let { level, exp, unspentAttributePoints } = state;
  if (level >= MAX_LEVEL || final <= 0) {
    return { level, exp, unspentAttributePoints };
  }
  let pool = exp + final;
  while (level < MAX_LEVEL) {
    const need = expToNext(level);
    if (pool < need) break;
    pool -= need;
    level += 1;
  }
  if (level >= MAX_LEVEL) pool = 0;
  return { level, exp: pool, unspentAttributePoints: unspentAttributePoints + (level - state.level) };
}
