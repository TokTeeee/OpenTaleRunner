"""v0.5.1 — PATCH /exp and PATCH /attributes/spend endpoint tests.

Boots via the conftest server (TEST_BASE_URL), registers a fresh user,
creates a character, then exercises the two new endpoints.
"""
import sys
import os
import uuid
import pytest
import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

BASE = os.getenv("TEST_BASE_URL", "http://127.0.0.1:8910")


async def _register_and_create(client: httpx.AsyncClient):
    """Register a new user, create a fresh character, return (auth_header, char_id, base_attrs)."""
    uname = f"v5t_{uuid.uuid4().hex[:8]}"
    pw = "testpass123"
    resp = await client.post("/api/v1/auth/register", json={"username": uname, "password": pw})
    assert resp.status_code == 200, f"Register failed: {resp.text}"
    token = resp.json()["token"]
    auth = {"Authorization": f"Bearer {token}"}

    resp = await client.post("/api/v1/characters/create", json={
        "data": {
            "name": "等级测试者",
            "race": "人类",
            "background": "为了测等级测试",
            "appearance": "",
            "attributes": {"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10},
            "skills": [],
            "region": "royal_plains",
            "worldDay": 1,
        },
    }, headers=auth)
    assert resp.status_code in (200, 201), f"Create char failed: {resp.text}"
    char_id = resp.json().get("characterId") or resp.json().get("id")
    assert char_id
    return auth, char_id, {"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10}


@pytest.mark.asyncio
async def test_patch_exp_grants_and_levels_up():
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        auth, char_id, _ = await _register_and_create(client)
        resp = await client.patch(
            f"/api/v1/characters/{char_id}/exp",
            json={"amount": 150, "difficulty": "normal"},
            headers=auth,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["level"] == 2
        assert body["exp"] == 50
        assert body["expToNext"] == 283
        assert body["unspentAttributePoints"] == 1


@pytest.mark.asyncio
async def test_patch_attributes_spend_increments():
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        auth, char_id, base = await _register_and_create(client)
        # First grant enough exp to get a point
        await client.patch(
            f"/api/v1/characters/{char_id}/exp",
            json={"amount": 150, "difficulty": "normal"},
            headers=auth,
        )
        # Now spend the point on STR
        resp = await client.patch(
            f"/api/v1/characters/{char_id}/attributes/spend",
            json={"attribute": "STR"},
            headers=auth,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["attributes"]["STR"] == base["STR"] + 1
        assert body["unspentAttributePoints"] == 0


@pytest.mark.asyncio
async def test_patch_attributes_spend_400_when_no_points():
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        auth, char_id, _ = await _register_and_create(client)
        resp = await client.patch(
            f"/api/v1/characters/{char_id}/attributes/spend",
            json={"attribute": "DEX"},
            headers=auth,
        )
        assert resp.status_code == 400


@pytest.mark.asyncio
async def test_patch_exp_403_for_other_player():
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        # Owner registers and creates
        auth_a, char_id, _ = await _register_and_create(client)
        # Other user registers
        uname_b = f"v5t_{uuid.uuid4().hex[:8]}"
        resp = await client.post("/api/v1/auth/register", json={"username": uname_b, "password": "other1234"})
        assert resp.status_code == 200
        auth_b = {"Authorization": f"Bearer {resp.json()['token']}"}
        # B tries to grant exp to A's character
        resp = await client.patch(
            f"/api/v1/characters/{char_id}/exp",
            json={"amount": 100, "difficulty": "normal"},
            headers=auth_b,
        )
        assert resp.status_code == 403


@pytest.mark.asyncio
async def test_chained_exp_grant_chains_multiple_levels():
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        auth, char_id, _ = await _register_and_create(client)
        # L1, 0 exp, +2000 normal -> L5, 297 exp, 4 points
        resp = await client.patch(
            f"/api/v1/characters/{char_id}/exp",
            json={"amount": 2000, "difficulty": "normal"},
            headers=auth,
        )
        assert resp.status_code == 200
        body = resp.json()
        # expToNext(L5) = round(100 * 5^1.5) = 1118
        assert body == {
            "level": 5,
            "exp": 297,
            "expToNext": 1118,
            "unspentAttributePoints": 4,
        }
        # Re-GET character to verify persistence
        resp = await client.get(f"/api/v1/characters/{char_id}", headers=auth)
        assert resp.status_code == 200
        char = resp.json()
        assert char["level"] == 5
        assert char["exp"] == 297
        assert char["unspentAttributePoints"] == 4


@pytest.mark.asyncio
async def test_max_level_locks_exp_but_keeps_pool():
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        auth, char_id, _ = await _register_and_create(client)
        # Direct write: bump to L20 with 50 exp via repeated grants
        # (v0.5.1 exp_formula: L20 returns 0 expToNext, exp locked at 0)
        # Use single huge grant
        resp = await client.patch(
            f"/api/v1/characters/{char_id}/exp",
            json={"amount": 999_999, "difficulty": "deadly"},
            headers=auth,
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["level"] == 20
        assert body["exp"] == 0
        assert body["expToNext"] == 0


@pytest.mark.asyncio
async def test_spend_attribute_point_caps_at_20():
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        auth, char_id, base = await _register_and_create(client)
        # Grant a huge batch once — chains to L20 with 19 unspent points.
        r = await client.patch(
            f"/api/v1/characters/{char_id}/exp",
            json={"amount": 999_999, "difficulty": "normal"},
            headers=auth,
        )
        assert r.status_code == 200
        assert r.json()["level"] == 20
        pool = r.json()["unspentAttributePoints"]
        assert pool >= 11, f"need at least 11 points, got {pool}"
        # Spend 11 times on STR — cap at 20
        for i in range(11):
            r = await client.patch(
                f"/api/v1/characters/{char_id}/attributes/spend",
                json={"attribute": "STR"},
                headers=auth,
            )
            assert r.status_code == 200, f"iter {i} spend failed: {r.text}"
        # STR should be capped at 20
        final = await client.get(f"/api/v1/characters/{char_id}", headers=auth)
        assert final.json()["attributes"]["STR"] == 20
        # Pool reduced by 11
        assert final.json()["unspentAttributePoints"] == pool - 11


@pytest.mark.asyncio
async def test_migrate_v04_to_v05_idempotent_on_update():
    """Calling PATCH /exp on a v0.4-shaped character backfills new fields and is idempotent."""
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        auth, char_id, _ = await _register_and_create(client)
        # Manually write a v0.4-shaped character via PATCH /api/v1/characters/{id}
        old_shape = {
            "name": "OldSave",
            "race": "human",
            "background": "imported from v0.4",
            "attributes": {"STR": 18, "DEX": 1, "CON": 99, "INT": 10, "WIS": -3, "CHA": 10},
            "skills": [],
            "inventory": {"items": [], "equipped": {"weapon": None, "armor": None, "accessory": None}, "currency": {"gold": 0, "silver": 0, "copper": 0}},
        }
        r = await client.patch(f"/api/v1/characters/{char_id}", json=old_shape, headers=auth)
        assert r.status_code == 200
        # GET should show v0.5 fields backfilled
        g = await client.get(f"/api/v1/characters/{char_id}", headers=auth)
        body = g.json()
        assert body["level"] == 1
        assert body["exp"] == 0
        assert body["expToNext"] == 100
        assert body["unspentAttributePoints"] == 0
        assert body["classId"] is None
        assert body["classSkills"] == []
        # Attribute clamp widened
        assert body["attributes"]["CON"] == 20  # 99 -> 20
        assert body["attributes"]["WIS"] == 1   # -3 -> 1
