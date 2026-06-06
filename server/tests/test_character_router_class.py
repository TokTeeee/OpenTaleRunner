"""v0.5.2 — PATCH /class endpoint integration tests."""
import sys
import os
import uuid
import pytest
import httpx

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

BASE = os.getenv("TEST_BASE_URL", "http://127.0.0.1:8910")


async def _register_and_create(client: httpx.AsyncClient):
    uname = f"v5t_{uuid.uuid4().hex[:8]}"
    pw = "testpass123"
    resp = await client.post("/api/v1/auth/register", json={"username": uname, "password": pw})
    assert resp.status_code == 200, f"Register failed: {resp.text}"
    token = resp.json()["token"]
    auth = {"Authorization": f"Bearer {token}"}
    resp = await client.post("/api/v1/characters/create", json={
        "data": {
            "name": "职业测试",
            "race": "人类",
            "background": "测试职业",
            "appearance": "",
            "attributes": {"STR": 10, "DEX": 10, "CON": 10, "INT": 10, "WIS": 10, "CHA": 10},
            "skills": [],
            "region": "royal_plains",
            "worldDay": 1,
        },
    }, headers=auth)
    assert resp.status_code in (200, 201), f"Create char failed: {resp.text}"
    char_id = resp.json().get("characterId") or resp.json().get("id")
    return auth, char_id


@pytest.mark.asyncio
async def test_patch_class_legal_t1():
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        auth, char_id = await _register_and_create(client)
        resp = await client.patch(
            f"/api/v1/characters/{char_id}/class",
            json={
                "classId": "warrior",
                "classSkills": [{"classId": "warrior", "nodeId": "warrior_t1_1", "unlockedAt": 1}],
            },
            headers=auth,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["classId"] == "warrior"
        assert body["classSkills"] == [{"classId": "warrior", "nodeId": "warrior_t1_1", "unlockedAt": 1}]


@pytest.mark.asyncio
async def test_patch_class_422_invalid_classId():
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        auth, char_id = await _register_and_create(client)
        resp = await client.patch(
            f"/api/v1/characters/{char_id}/class",
            json={"classId": "rogue", "classSkills": []},
            headers=auth,
        )
        assert resp.status_code == 422


@pytest.mark.asyncio
async def test_patch_class_422_locked():
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        auth, char_id = await _register_and_create(client)
        # Set class first
        await client.patch(
            f"/api/v1/characters/{char_id}/class",
            json={
                "classId": "warrior",
                "classSkills": [{"classId": "warrior", "nodeId": "warrior_t1_1", "unlockedAt": 1}],
            },
            headers=auth,
        )
        # Try to change
        resp = await client.patch(
            f"/api/v1/characters/{char_id}/class",
            json={
                "classId": "mage",
                "classSkills": [{"classId": "mage", "nodeId": "mage_t1_1", "unlockedAt": 1}],
            },
            headers=auth,
        )
        assert resp.status_code == 422


@pytest.mark.asyncio
async def test_patch_class_403_for_other_player():
    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
        auth_a, char_id = await _register_and_create(client)
        uname_b = f"v5t_{uuid.uuid4().hex[:8]}"
        resp = await client.post("/api/v1/auth/register", json={"username": uname_b, "password": "other1234"})
        auth_b = {"Authorization": f"Bearer {resp.json()['token']}"}
        resp = await client.patch(
            f"/api/v1/characters/{char_id}/class",
            json={
                "classId": "warrior",
                "classSkills": [{"classId": "warrior", "nodeId": "warrior_t1_1", "unlockedAt": 1}],
            },
            headers=auth_b,
        )
        assert resp.status_code == 403
