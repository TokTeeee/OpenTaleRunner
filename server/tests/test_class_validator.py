"""v0.5.2 — class_validator unit tests."""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from fastapi import HTTPException
from services.class_validator import (
    validate_class_update, ALLOWED_CLASSES, _expected_node_count,
)


class TestExpectedNodeCount:
    def test_l1(self): assert _expected_node_count(1) == 1
    def test_l4(self): assert _expected_node_count(4) == 1
    def test_l5(self): assert _expected_node_count(5) == 2
    def test_l9(self): assert _expected_node_count(9) == 2
    def test_l10(self): assert _expected_node_count(10) == 3
    def test_l14(self): assert _expected_node_count(14) == 3
    def test_l15(self): assert _expected_node_count(15) == 4
    def test_l20(self): assert _expected_node_count(20) == 4


class TestValidateClassUpdate:
    def test_legal_warrior_t1(self):
        char = {"level": 1, "classId": None}
        skills = [{"classId": "warrior", "nodeId": "warrior_t1_1", "unlockedAt": 1}]
        validate_class_update(char, "warrior", skills)

    def test_invalid_classId(self):
        char = {"level": 1, "classId": None}
        with pytest.raises(HTTPException) as exc:
            validate_class_update(char, "rogue", [])
        assert exc.value.status_code == 422

    def test_too_many_nodes(self):
        char = {"level": 1, "classId": None}
        skills = [
            {"classId": "warrior", "nodeId": "warrior_t1_1", "unlockedAt": 1},
            {"classId": "warrior", "nodeId": "warrior_t2_1", "unlockedAt": 1},
        ]
        with pytest.raises(HTTPException):
            validate_class_update(char, "warrior", skills)

    def test_invalid_node_format(self):
        char = {"level": 1, "classId": None}
        skills = [{"classId": "warrior", "nodeId": "warrior_xx_1", "unlockedAt": 1}]
        with pytest.raises(HTTPException):
            validate_class_update(char, "warrior", skills)

    def test_classId_locked(self):
        char = {"level": 5, "classId": "warrior"}
        skills = [{"classId": "mage", "nodeId": "mage_t1_1", "unlockedAt": 1}]
        with pytest.raises(HTTPException):
            validate_class_update(char, "mage", skills)

    def test_node_classId_mismatch(self):
        char = {"level": 1, "classId": None}
        skills = [{"classId": "warrior", "nodeId": "mage_t1_1", "unlockedAt": 1}]
        with pytest.raises(HTTPException):
            validate_class_update(char, "warrior", skills)

    def test_must_pick_t1(self):
        char = {"level": 1, "classId": None}
        with pytest.raises(HTTPException):
            validate_class_update(char, "warrior", [])

    def test_null_classId_no_skills(self):
        char = {"level": 1, "classId": "warrior"}
        validate_class_update(char, None, [])
