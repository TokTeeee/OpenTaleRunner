/**
 * v0.4 战斗系统 — 骰子工具 + 拦截器
 *
 * 提供:
 * - RollFn 类型: 抹子函数签名 (sides: number) => integer in [1, sides]
 * - defaultRoll: 真随机 (Math.random)
 * - makeSeededRoll: 种子化随机 (测试用)
 * - makeConstRoll: 常数随机 (测试用, 模拟 always 1 / always 20)
 *
 * 注入式设计: ActionResolver / BalanceEvaluator 等接收 RollFn 参数,
 * 不直接调 Math.random, 便于测试. CombatEngine 在构造时接收一个 RollFn,
 * 默认为 defaultRoll.
 *
 * v0.3 dice.ts 已有部分骰子函数, 本模块是 v0.4 战斗专用版 (e.g. d20 ACT 用).
 */

export type RollFn = (sides: number) => number;

/** 默认真随机抹子 */
export const defaultRoll: RollFn = (sides) => {
  if (sides < 1) return 0;
  return Math.floor(Math.random() * sides) + 1;
};

/** 投 1 个 dN, 范围 [1, N] */
export function rollD(sides: number, roll: RollFn = defaultRoll): number {
  return roll(sides);
}

/** 投 2 个 d6, 范围 [2, 12] */
export function roll2d6(roll: RollFn = defaultRoll): number {
  return roll(6) + roll(6);
}

/** 投 Nd6 加总, 范围 [N, N*6] */
export function rollNd6(count: number, roll: RollFn = defaultRoll): number {
  let sum = 0;
  for (let i = 0; i < count; i++) sum += roll(6);
  return sum;
}

/** d20 投 (ACT 队列用) */
export function rollD20(roll: RollFn = defaultRoll): number {
  return roll(20);
}

/**
 * 顺序抹子: 给定一个常数序列, 每次调 roll() 返回下一个值, 循环.
 * 测试用: 让 ACT 队列的顺序可预测.
 */
export function makeConstRoll(values: number[]): RollFn {
  let i = 0;
  return (sides: number) => {
    const v = values[i % values.length];
    i++;
    if (v < 1) return 1;
    if (v > sides) return sides;
    return v;
  };
}

/**
 * 种子化抹子 (mulberry32): 相同 seed 产生相同序列.
 * 适合跨测试运行的可重现性.
 */
export function makeSeededRoll(seed: number): RollFn {
  let s = seed >>> 0;
  return (sides: number) => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) % sides + 1;
  };
}

/**
 * ACT 投: d20 + DEX 修正, 范围 [1, 20 + DEX_mod]
 * 怪物敏捷差判断: 玩家 DEX 14 → +2 修正; DEX 8 → -1
 * spec §5.4 initiative = d20 + DEX 修正 (DEX_mod = floor((DEX-10)/2))
 */
export interface InitiativeRoll {
  d20: number;
  dexMod: number;
  total: number;
}

export function rollInitiative(dex: number, roll: RollFn = defaultRoll): InitiativeRoll {
  const d20 = rollD20(roll);
  const dexMod = Math.floor((dex - 10) / 2);
  return { d20, dexMod, total: d20 + dexMod };
}
