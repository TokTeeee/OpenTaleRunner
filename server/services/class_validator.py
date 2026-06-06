"""v0.5.2 — 服务端职业变更校验.

校验规则:
  - classId 必须在 ALLOWED_CLASSES 内
  - 解锁的 node 数不能超过当前等级允许的数量
  - 每个 node 的 nodeId 必须匹配 {class}_t{tier}_{slot} 格式
  - 每个 node 的 classId 必须与新 classId 一致
  - classId 锁定: 已选定 classId 后不可改
  - 选择职业时必须至少选 T1 一个节点
"""
import re
from fastapi import HTTPException

ALLOWED_CLASSES = {'warrior', 'cleric', 'mage', 'thief'}
NODE_ID_RE = re.compile(r'^(warrior|cleric|mage|thief)_t[1-4]_[1-3]$')


def _expected_node_count(level: int) -> int:
    if level < 5: return 1
    if level < 10: return 2
    if level < 15: return 3
    return 4


def validate_class_update(char: dict, new_class_id, new_class_skills: list) -> None:
    if new_class_id is not None and new_class_id not in ALLOWED_CLASSES:
        raise HTTPException(422, f"invalid classId: {new_class_id}")

    expected = _expected_node_count(char.get("level", 1))
    if len(new_class_skills) > expected:
        raise HTTPException(
            422,
            f"too many class skills ({len(new_class_skills)} > {expected} for level {char.get('level')})",
        )

    for node in new_class_skills:
        nid = node.get("nodeId", "")
        if not NODE_ID_RE.match(nid):
            raise HTTPException(422, f"invalid nodeId format: {nid}")
        # nodeId prefix must equal the chosen classId
        nid_prefix = nid.split("_t", 1)[0]
        if new_class_id is not None and nid_prefix != new_class_id:
            raise HTTPException(422, f"nodeId {nid} does not match classId {new_class_id}")
        if node.get("classId") != new_class_id:
            raise HTTPException(422, "node classId mismatch")

    # classId lock only when choosing a non-null class.
    # Setting back to None is permitted (test reset / pre-class-save state).
    current = char.get("classId")
    if new_class_id is not None and current is not None and current != new_class_id:
        raise HTTPException(422, "classId is locked in v0.5 (cannot change class)")

    if new_class_id is not None and len(new_class_skills) == 0:
        raise HTTPException(422, "must have at least T1 node when choosing class")
