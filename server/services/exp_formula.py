"""v0.5.1 — 服务端等级-经验公式 (与客户端 client/src/services/level/expFormula.ts 镜像).

服务端权威: PATCH /exp 走这里重算 level/exp, 客户端 grantExp 仅用于本地 UI 响应.
"""
MAX_LEVEL = 20

_DIFFICULTY_MULT = {
    'easy': 0.5,
    'normal': 1.0,
    'hard': 1.5,
    'deadly': 2.0,
}


def exp_to_next(level: int) -> int:
    if level >= MAX_LEVEL:
        return 0
    return round(100 * (level ** 1.5))


def apply_exp_formula(level: int, exp: int, amount: int,
                      difficulty: str = 'normal') -> tuple[int, int]:
    mult = _DIFFICULTY_MULT.get(difficulty, 1.0)
    final = int(amount * mult)
    if level >= MAX_LEVEL or final <= 0:
        return (level, exp)

    pool = exp + final
    while level < MAX_LEVEL:
        need = exp_to_next(level)
        if pool < need:
            break
        pool -= need
        level += 1
    if level >= MAX_LEVEL:
        pool = 0
    return (level, pool)
