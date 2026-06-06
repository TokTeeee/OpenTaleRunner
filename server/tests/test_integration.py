"""集成测试 — 全链路验证
运行：SERVICE_JWT_SECRET=test-secret pytest tests/test_integration.py -v
"""
import pytest, httpx, asyncio, uuid, json, os

BASE = os.getenv("TEST_BASE_URL", "http://127.0.0.1:8000")


async def read_sse_event(lines):
    event_name = None
    data_lines = []

    async for line in lines:
        if not line:
            if data_lines:
                return {"event": event_name or "message", "data": "\n".join(data_lines)}
            continue
        if line.startswith(":"):
            continue
        if line.startswith("event:"):
            event_name = line.split(":", 1)[1].strip()
        elif line.startswith("data:"):
            data_lines.append(line.split(":", 1)[1].strip())

    raise RuntimeError("SSE stream closed before a full event was received")


class TestFullPipeline:
    @pytest.fixture(autouse=True)
    def ensure_secret(self):
        if not os.getenv("SERVICE_JWT_SECRET"):
            os.environ["SERVICE_JWT_SECRET"] = "test-integration-secret-32chars"

    @pytest.mark.asyncio
    async def test_full_pipeline(self):
        async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
            # 1. Register
            uname = f"test_{uuid.uuid4().hex[:8]}"
            resp = await client.post("/api/v1/auth/register", json={
                "username": uname, "password": "testpass123",
            })
            assert resp.status_code == 200, f"Register failed: {resp.text}"
            data = resp.json()
            assert "token" in data
            token = data["token"]
            player_id = data["player_id"]
            auth = {"Authorization": f"Bearer {token}"}

            # 2. Login
            resp = await client.post("/api/v1/auth/login", json={
                "username": uname, "password": "testpass123",
            })
            assert resp.status_code == 200

            # 3. Create character
            resp = await client.post("/api/v1/characters/create", json={
                "data": {
                    "name": "测试冒险者",
                    "race": "人类",
                    "background": "来自王都平原的年轻冒险者，性格谨慎但勇敢",
                    "appearance": "棕色短发，深色皮甲",
                    "attributes": {"STR": 12, "DEX": 14, "CON": 13, "INT": 10, "WIS": 12, "CHA": 11},
                    "skills": [{"name": "剑术", "level": 2, "type": "background", "relatedAttribute": "STR", "description": "基础剑术训练"}],
                    "region": "royal_plains",
                    "worldDay": 1,
                },
            }, headers=auth)
            assert resp.status_code in (200, 201), f"Create char failed: {resp.text}"
            char_data = resp.json()
            char_id = char_data.get("characterId") or char_data.get("id")
            assert char_id

            # 4. Get character
            resp = await client.get(f"/api/v1/characters/{char_id}", headers=auth)
            assert resp.status_code == 200

            # 5. Upload chronicle entries
            entry = {
                "id": str(uuid.uuid4()),
                "playerId": player_id,
                "characterName": "测试冒险者",
                "worldDay": 1,
                "region": "royal_plains",
                "subRegion": "光辉城",
                "summary": "在光辉城市集帮助了一个被欺负的商人",
                "actionType": "social",
                "consequences": {"reputationChange": {"商人行会": 5}},
            }
            resp = await client.post("/api/v1/chronicle/upload/single", json=entry, headers=auth)
            assert resp.status_code == 200

            # 6. Get chronicles
            resp = await client.get("/api/v1/world/chronicle?day=1", headers=auth)
            assert resp.status_code == 200

            # 7. Get storybook
            resp = await client.get("/api/v1/storybook/full", headers=auth)
            assert resp.status_code == 200
            sb = resp.json()
            assert "regions" in sb or "world_name" in sb

            # 8. Get world state
            resp = await client.get("/api/v1/world/state/royal_plains", headers=auth)
            assert resp.status_code in (200, 404)

            # 9. Get ghost NPCs
            resp = await client.get("/api/v1/world/ghost-npcs/royal_plains", headers=auth)
            assert resp.status_code == 200

            # 10. Sync updates
            resp = await client.get("/api/v1/sync/updates", headers=auth)
            assert resp.status_code == 200
            sync_payload = resp.json()
            assert sync_payload["worldDay"] >= 1
            assert "regionStates" in sync_payload

            # 10.1 World stream initial snapshot + push update
            async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as stream_client:
                async with stream_client.stream("GET", f"/api/v1/world/stream?playerId={player_id}&regionId=royal_plains", headers=auth) as stream_resp:
                    assert stream_resp.status_code == 200
                    stream_lines = stream_resp.aiter_lines()

                    initial_event = await asyncio.wait_for(read_sse_event(stream_lines), timeout=5.0)
                    assert initial_event["event"] == "world_update"
                    initial_payload = json.loads(initial_event["data"])
                    assert initial_payload["worldDay"] >= 1
                    assert "royal_plains" in initial_payload["regionStates"]

                    push_entry = {
                        "id": str(uuid.uuid4()),
                        "playerId": player_id,
                        "characterName": "测试冒险者",
                        "worldDay": 1,
                        "region": "royal_plains",
                        "subRegion": "光辉城",
                        "summary": "在光辉城城门口记录了一次新的巡逻见闻",
                        "actionType": "explore",
                        "consequences": {},
                    }
                    push_resp = await client.post("/api/v1/chronicle/upload/single", json=push_entry, headers=auth)
                    assert push_resp.status_code == 200

                    pushed_event = await asyncio.wait_for(read_sse_event(stream_lines), timeout=5.0)
                    assert pushed_event["event"] == "world_update"
                    pushed_payload = json.loads(pushed_event["data"])
                    assert pushed_payload.get("reason") == "chronicle_uploaded"

            # 11. Activity report
            resp = await client.post("/api/v1/activity/report", json={
                "entityId": player_id,
                "entityType": "player",
                "entityName": "测试冒险者",
                "currentAction": "在光辉城冒险者公会查看委托",
                "actionType": "explore",
                "location": {
                    "region": "royal_plains",
                    "subRegion": "光辉城",
                    "coordinates": {"x": 0, "y": 0, "z": 0},
                },
                "worldDay": 1,
                "isOnline": True,
            }, headers=auth)
            assert resp.status_code == 200

            print(f"\n✅ Full pipeline PASSED — player: {uname}, char: {char_id}")
