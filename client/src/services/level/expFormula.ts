/**
 * v0.5.1 — 客户端纯函数, 与 server/services/exp_formula.py 镜像.
 * 服务端权威: PATCH /exp 走服务端 exp_formula 重算 level/exp.
 * 本函数用于:
 *  1. CharacterPanel level bar 实时计算 (基于当前 level 显示 expToNext)
 *  2. 单元测试与类型推导
 */
export const MAX_LEVEL = 20;
export const EXP_PER_LEVEL_BASE = 100;

export function expToNext(level: number): number {
  if (level >= MAX_LEVEL) return 0; // v0.5.4: 与 server exp_formula.py 一致, 满级锁 0
  if (level < 1) return 0;
  return Math.round(100 * Math.pow(level, 1.5));
}
