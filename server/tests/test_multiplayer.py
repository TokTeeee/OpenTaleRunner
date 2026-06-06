"""多人联机测试 — 房间流程 / 行动轮结果 / 中途加入配置
运行：SERVICE_JWT_SECRET=test-secret TEST_BASE_URL=http://127.0.0.1:8010 pytest -q tests/test_multiplayer.py
"""

import os
import uuid

import httpx
import pytest


BASE = os.getenv("TEST_BASE_URL", "http://127.0.0.1:8000")


async def register_user(client: httpx.AsyncClient, prefix: str) -> tuple[dict, str]:
    username = f"{prefix}_{uuid.uuid4().hex[:8]}"
    response = await client.post(
        "/api/v1/auth/register",
        json={"username": username, "password": "testpass123"},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    token = payload["token"]
    return {"Authorization": f"Bearer {token}"}, payload["player_id"]


class TestMultiplayerPipeline:
    @pytest.fixture(autouse=True)
    def ensure_secret(self):
        if not os.getenv("SERVICE_JWT_SECRET"):
            os.environ["SERVICE_JWT_SECRET"] = "test-integration-secret-32chars"

    @pytest.mark.asyncio
    async def test_round_result_persists_actions_and_dice(self):
        async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
            host_auth, host_id = await register_user(client, "host")
            guest_auth, guest_id = await register_user(client, "guest")

            response = await client.post(
                "/api/v1/multiplayer/rooms",
                headers=host_auth,
                json={
                    "mode": "new",
                    "config": {
                        "room_name": "联机测试房",
                        "max_players": 2,
                    },
                },
            )
            assert response.status_code == 200, response.text
            room_id = response.json()["room_id"]

            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/join",
                headers=guest_auth,
                json={},
            )
            assert response.status_code == 200, response.text

            for auth, name in ((host_auth, "房主角色"), (guest_auth, "队友角色")):
                response = await client.post(
                    f"/api/v1/multiplayer/rooms/{room_id}/character-ready",
                    headers=auth,
                    json={
                        "character_id": f"char-{name}",
                        "character_name": name,
                        "character_background": f"测试背景-{name}",
                    },
                )
                assert response.status_code == 200, response.text

            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/start",
                headers=host_auth,
                json={},
            )
            assert response.status_code == 200, response.text

            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/action",
                headers=host_auth,
                json={
                    "action": "与商人交谈",
                    "dice_result": {
                        "finalResult": 11,
                        "outcome": "success",
                        "diceValues": [4, 5],
                    },
                },
            )
            assert response.status_code == 200, response.text
            first_status = response.json()
            assert first_status["is_round_complete"] is False

            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/action",
                headers=guest_auth,
                json={
                    "action": "观察商人的反应",
                    "dice_result": {
                        "finalResult": 8,
                        "outcome": "partial_success",
                        "diceValues": [3, 3],
                    },
                },
            )
            assert response.status_code == 200, response.text
            round_result = response.json()["round_result"]

            assert round_result["player_actions"][host_id] == "与商人交谈"
            assert round_result["player_actions"][guest_id] == "观察商人的反应"
            assert round_result["dice_results"][host_id]["finalResult"] == 11
            assert round_result["dice_results"][guest_id]["outcome"] == "partial_success"
            assert "<consequences>" not in round_result["narrative"]

            response = await client.get(
                f"/api/v1/multiplayer/rooms/{room_id}/round-status",
                headers=host_auth,
            )
            assert response.status_code == 200, response.text
            round_status = response.json()
            assert round_status["current_round"] == 1
            assert round_status["latest_round_result"]["player_actions"][guest_id] == "观察商人的反应"
            assert round_status["latest_round_result"]["dice_results"][host_id]["diceValues"] == [4, 5]

            response = await client.get(
                f"/api/v1/multiplayer/rooms/{room_id}/narratives",
                headers=host_auth,
                params={"since_round": -1},
            )
            assert response.status_code == 200, response.text
            narratives = response.json()["narratives"]
            assert len(narratives) == 1
            assert narratives[0]["player_actions"][host_id] == "与商人交谈"
            assert narratives[0]["dice_results"][guest_id]["finalResult"] == 8

    @pytest.mark.asyncio
    async def test_late_join_defaults_enabled_and_can_be_disabled(self):
        async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
            host_auth, _ = await register_user(client, "default_host")
            outsider_auth, _ = await register_user(client, "outsider")

            response = await client.post(
                "/api/v1/multiplayer/rooms",
                headers=host_auth,
                json={
                    "mode": "new",
                    "config": {
                        "room_name": "默认中途加入",
                        "max_players": 2,
                    },
                },
            )
            assert response.status_code == 200, response.text
            assert response.json()["config"]["allow_late_join"] is True

            response = await client.post(
                "/api/v1/multiplayer/rooms",
                headers=host_auth,
                json={
                    "mode": "new",
                    "config": {
                        "room_name": "禁用中途加入",
                        "max_players": 2,
                        "allow_late_join": False,
                    },
                },
            )
            assert response.status_code == 200, response.text
            room_id = response.json()["room_id"]

            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/character-ready",
                headers=host_auth,
                json={
                    "character_id": "solo-host",
                    "character_name": "单人房主",
                    "character_background": "独自测试 late join 的房主",
                },
            )
            assert response.status_code == 200, response.text

            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/start",
                headers=host_auth,
                json={},
            )
            assert response.status_code == 200, response.text

            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/join",
                headers=outsider_auth,
                json={},
            )
            assert response.status_code == 400
            assert "不允许中途加入" in response.text

    @pytest.mark.asyncio
    async def test_spectator_to_introduction_full_chain(self):
        """中途加入观战 → 创建角色 → pending_intro → 正式引入 完整前后端链路"""
        async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
            host_auth, host_id = await register_user(client, "host")
            alpha_auth, alpha_id = await register_user(client, "alpha")
            spectator_auth, spectator_id = await register_user(client, "spec")

            # 1. 创建房间: 3人上限, 允许中途加入, 引入延迟=2轮
            response = await client.post(
                "/api/v1/multiplayer/rooms",
                headers=host_auth,
                json={
                    "mode": "new",
                    "config": {
                        "room_name": "观战引入测试",
                        "max_players": 4,
                        "allow_late_join": True,
                        "late_join_intro_delay": 2,
                    },
                },
            )
            assert response.status_code == 200, response.text
            room_id = response.json()["room_id"]

            # 2. alpha 加入
            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/join",
                headers=alpha_auth,
                json={},
            )
            assert response.status_code == 200

            # 3. 两人完成角色准备
            for auth, name in ((host_auth, "房主"), (alpha_auth, "alpha")):
                response = await client.post(
                    f"/api/v1/multiplayer/rooms/{room_id}/character-ready",
                    headers=auth,
                    json={
                        "character_id": f"char-{name}",
                        "character_name": name,
                        "character_background": f"背景-{name}",
                    },
                )
                assert response.status_code == 200, response.text

            # 4. 开始游戏
            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/start",
                headers=host_auth,
                json={},
            )
            assert response.status_code == 200

            # 5. 第0轮: host 和 alpha 提交行动 → 自动处理
            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/action",
                headers=host_auth,
                json={"action": "探索房间", "dice_result": {"finalResult": 12, "outcome": "success", "diceValues": [2, 5]}},
            )
            assert response.status_code == 200
            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/action",
                headers=alpha_auth,
                json={"action": "检查窗户", "dice_result": {"finalResult": 9, "outcome": "partial_success", "diceValues": [3, 4]}},
            )
            assert response.status_code == 200
            round_0_result = response.json()["round_result"]
            assert round_0_result["round"] == 0
            # round 0 结束，current_round = 1
            assert round_0_result["next_round"] == 1

            # 6. 观战者中途加入（当前round=1）
            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/join",
                headers=spectator_auth,
                json={},
            )
            assert response.status_code == 200, response.text
            join_data = response.json()
            spec_player = next(
                (p for p in join_data["players"] if p["player_id"] == spectator_id), None
            )
            assert spec_player is not None
            assert spec_player["status"] == "spectating"
            assert spec_player["joined_at_round"] == 1

            # 6.1 验证存量为玩家收到 spectator_joined 通知
            notes_response = await client.get(
                f"/api/v1/multiplayer/rooms/{room_id}/notifications",
                headers=host_auth,
            )
            assert notes_response.status_code == 200
            notifications = notes_response.json()["notifications"]
            spec_joined = [n for n in notifications if n["event"] == "spectator_joined"]
            assert len(spec_joined) >= 1, f"应有 spectator_joined 通知, 实际: {notifications}"
            assert spec_joined[0]["player_id"] == spectator_id
            assert "观战" in spec_joined[0]["narrative"]

            # 7. 观战者创建角色 → spectator-ready
            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/spectator-ready",
                headers=spectator_auth,
                json={
                    "character_id": "char-spectator",
                    "character_name": "观战者",
                    "character_background": "一个迟来的冒险者",
                },
            )
            assert response.status_code == 200, response.text
            ready_data = response.json()
            assert ready_data["status"] == "pending_intro"
            assert ready_data["estimated_intro_round"] == 3  # 1 + 2 = 3

            # 7.1 验证存量为玩家收到 character_created 通知
            notes_response = await client.get(
                f"/api/v1/multiplayer/rooms/{room_id}/notifications",
                headers=host_auth,
            )
            notifications = notes_response.json()["notifications"]
            char_created = [n for n in notifications if n["event"] == "character_created"]
            assert len(char_created) >= 1, f"应有 character_created 通知, 实际: {notifications}"
            assert char_created[0]["character_name"] == "观战者"

            # 8. 第1轮: host 和 alpha 提交行动 → 自动处理
            #    观战者此时 status=pending_intro, 已等待 1 轮 (joined at round 1, now round 1, waited=0)
            #    还没到引入时机（延迟=2, 需等待>=2）
            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/action",
                headers=host_auth,
                json={"action": "继续前进", "dice_result": {"finalResult": 14, "outcome": "success", "diceValues": [5, 5]}},
            )
            assert response.status_code == 200
            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/action",
                headers=alpha_auth,
                json={"action": "观察四周", "dice_result": {"finalResult": 7, "outcome": "failure", "diceValues": [1, 3]}},
            )
            assert response.status_code == 200
            round_1_result = response.json()["round_result"]
            assert round_1_result["round"] == 1
            assert round_1_result["next_round"] == 2

            # 第1轮后，观战者还未被引入（waited=1轮, delay=2）
            assert len(round_1_result.get("introduced_players", [])) == 0, f"第1轮不应引入, 实际引入了: {round_1_result.get('introduced_players')}"

            # 9. 第2轮: host 和 alpha 提交行动 → 自动处理
            #    观战者已等待 2 轮 (joined at round 1, now round 2, waited=2 >= delay=2)
            #    应正式引入
            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/action",
                headers=host_auth,
                json={"action": "打开宝箱", "dice_result": {"finalResult": 18, "outcome": "critical_success", "diceValues": [6, 6]}},
            )
            assert response.status_code == 200
            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/action",
                headers=alpha_auth,
                json={"action": "警戒后方", "dice_result": {"finalResult": 10, "outcome": "success", "diceValues": [4, 3]}},
            )
            assert response.status_code == 200
            round_2_result = response.json()["round_result"]
            assert round_2_result["round"] == 2
            assert round_2_result["next_round"] == 3

            # 9.1 验证 introduced_players 包含观战者
            introduced = round_2_result.get("introduced_players", [])
            assert len(introduced) >= 1, f"第2轮应引入观战者, introduced_players={introduced}"
            intro = next((p for p in introduced if p["player_id"] == spectator_id), None)
            assert intro is not None, f"应引入观战者 {spectator_id}, 实际: {introduced}"
            assert intro["character_name"] == "观战者"

            # 9.2 验证存量为玩家收到 player_introduced 通知
            notes_response = await client.get(
                f"/api/v1/multiplayer/rooms/{room_id}/notifications",
                headers=host_auth,
            )
            notifications = notes_response.json()["notifications"]
            intro_notes = [n for n in notifications if n["event"] == "player_introduced"]
            assert len(intro_notes) >= 1, f"应有 player_introduced 通知, 实际: {notifications}"
            assert intro_notes[0]["player_id"] == spectator_id
            assert intro_notes[0]["character_name"] == "观战者"

            # 10. 验证观战者现在可以提交行动了
            response = await client.get(
                f"/api/v1/multiplayer/rooms/{room_id}",
                headers=spectator_auth,
            )
            room_state = response.json()
            spec_after = next(
                (p for p in room_state["players"] if p["player_id"] == spectator_id), None
            )
            assert spec_after["status"] == "in_game", f"引入后观战者应为 in_game, 实际: {spec_after['status']}"

            # 11. 观战者（已是正式成员）提交行动
            response = await client.post(
                f"/api/v1/multiplayer/rooms/{room_id}/action",
                headers=spectator_auth,
                json={"action": "感谢队友接纳", "dice_result": {"finalResult": 8, "outcome": "success", "diceValues": [3, 2]}},
            )
            assert response.status_code == 200, response.text

            # 12. round_status 也应包含通知
            response = await client.get(
                f"/api/v1/multiplayer/rooms/{room_id}/round-status",
                headers=host_auth,
            )
            assert response.status_code == 200
            round_status = response.json()
            rn = round_status.get("recent_notifications", [])
            assert len(rn) >= 3, f"round_status应包含>=3条通知, 实际: {len(rn)}"
            events = [n["event"] for n in rn]
            assert "spectator_joined" in events
            assert "character_created" in events
            assert "player_introduced" in events
