"""v0.5.1 — exp_formula service tests (server-side mirror of client formula).

expToNext(level) = round(100 * level^1.5), capped at MAX_LEVEL=20.
applyExpFormula chains level-ups and consumes exp pool; difficulty multiplies
the grant amount (easy 0.5 / normal 1.0 / hard 1.5 / deadly 2.0).
"""
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import pytest
from services.exp_formula import exp_to_next, apply_exp_formula, MAX_LEVEL


class TestExpToNext:
    def test_l1_to_l2(self):
        assert exp_to_next(1) == 100

    def test_l5_to_l6(self):
        assert exp_to_next(5) == 1118

    def test_l19_to_l20(self):
        assert exp_to_next(19) == 8282

    def test_l20_returns_zero(self):
        assert exp_to_next(MAX_LEVEL) == 0


class TestApplyExpFormula:
    def test_normal_grant_under_threshold(self):
        new_lv, new_exp = apply_exp_formula(1, 0, 50, 'normal')
        assert new_lv == 1
        assert new_exp == 50

    def test_normal_grant_above_threshold_levels_up(self):
        new_lv, new_exp = apply_exp_formula(1, 0, 150, 'normal')
        assert new_lv == 2
        # 150 - 100 (l1->l2) = 50
        assert new_exp == 50

    def test_multi_level_chain(self):
        # L1, 0 exp, +2000 normal -> 100+283+520+800 = 1703, leaves 297 at L5
        new_lv, new_exp = apply_exp_formula(1, 0, 2000, 'normal')
        assert new_lv == 5
        assert new_exp == 297

    def test_easy_difficulty_halves(self):
        # easy x0.5, 200 * 0.5 = 100, exact L1->L2
        new_lv, new_exp = apply_exp_formula(1, 0, 200, 'easy')
        assert new_lv == 2
        assert new_exp == 0

    def test_hard_difficulty_1_5x(self):
        # hard x1.5, 200 * 1.5 = 300; pool 300, L1->L2 costs 100, L2->L3 costs 283 -> 200<283
        new_lv, new_exp = apply_exp_formula(1, 0, 200, 'hard')
        assert new_lv == 2
        assert new_exp == 200

    def test_deadly_difficulty_2x(self):
        # deadly x2, 100 * 2 = 200; pool 200, L1->L2 costs 100, L2->L3 costs 283 -> 100<283
        new_lv, new_exp = apply_exp_formula(1, 0, 100, 'deadly')
        assert new_lv == 2
        assert new_exp == 100

    def test_max_level_no_change(self):
        new_lv, new_exp = apply_exp_formula(20, 50, 9999, 'normal')
        assert new_lv == 20
        assert new_exp == 50

    def test_zero_amount(self):
        new_lv, new_exp = apply_exp_formula(1, 0, 0, 'normal')
        assert new_lv == 1
        assert new_exp == 0

    def test_negative_amount(self):
        new_lv, new_exp = apply_exp_formula(1, 0, -10, 'normal')
        assert new_lv == 1
        assert new_exp == 0
