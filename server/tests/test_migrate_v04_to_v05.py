"""v0.5.1 — _migrate_v04_to_v05 idempotent backfill tests.

The migration runs on every create/update so old v0.4 character saves
(via JSON blob in `characters.data`) gain v0.5.1 fields with sensible
defaults, and v0.5+ saves pass through unchanged.

The function is intentionally idempotent: setdefault semantics on the
top-level fields, in-place clamp on attributes [1, 20] (widened from
the v0.4 [3, 18] PHB-style range).
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from repositories.character_repo import _migrate_v04_to_v05


def test_migrate_adds_default_v05_fields():
    data = {
        "name": "OldChar",
        "attributes": {"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10},
    }
    out = _migrate_v04_to_v05(data)
    assert out["level"] == 1
    assert out["exp"] == 0
    assert out["expToNext"] == 100
    assert out["unspentAttributePoints"] == 0
    assert out["classId"] is None
    assert out["classSkills"] == []


def test_migrate_widens_attribute_clamp():
    data = {"attributes": {"STR": 18, "DEX": 1, "CON": 25, "INT": 10, "WIS": -5, "CHA": 10}}
    out = _migrate_v04_to_v05(data)
    assert out["attributes"]["STR"] == 18  # already in range, untouched
    assert out["attributes"]["DEX"] == 1
    assert out["attributes"]["CON"] == 20  # clamped from 25
    assert out["attributes"]["WIS"] == 1   # clamped from -5


def test_migrate_idempotent():
    data = {
        "level": 5, "exp": 100, "expToNext": 800, "unspentAttributePoints": 2,
        "classId": "warrior",
        "classSkills": [{"classId": "warrior", "nodeId": "warrior_t1_1", "unlockedAt": 1}],
        "attributes": {"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10},
    }
    out = _migrate_v04_to_v05(data)
    assert out == data  # no change
