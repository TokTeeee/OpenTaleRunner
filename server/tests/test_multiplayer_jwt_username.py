"""v0.5.10 #7 — 验证 token username claim 流入 create_room.player_name

测试: 创建一个 player 后, 用其 token 创建房间, 验证 service.create_room 收到的
      player_name 等于 token 中的 username, 而非 sub (player_id).
"""
import os
import uuid

import httpx
import pytest


BASE = os.getenv("TEST_BASE_URL", "http://127.0.0.1:8000")


class TestJWTTokenUsername:
    @pytest.fixture(autouse=True)
    def ensure_secret(self):
        if not os.getenv("SERVICE_JWT_SECRET"):
            os.environ["SERVICE_JWT_SECRET"] = "test-integration-secret-32chars"

    @pytest.mark.asyncio
    async def test_create_room_uses_token_username_not_player_id(self):
        """v0.5.10 #7: token 含 username, create_room 必须用 username 当 player_name."""
        async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
            # 注册用户, 拿到 token + player_id
            username = f"jwt_user_{uuid.uuid4().hex[:8]}"
            response = await client.post(
                "/api/v1/auth/register",
                json={"username": username, "password": "testpass123"},
            )
            assert response.status_code == 200, response.text
            payload = response.json()
            token = payload["token"]
            player_id = payload["player_id"]
            response_username = payload["username"]

            # username 和 player_id 应当不同 (player_id 是 uuid)
            assert response_username != player_id, \
                "Test setup error: username should differ from player_id"

            # 解 token 验 username claim 存在
            import jwt as pyjwt
            decoded = pyjwt.decode(
                token, os.environ["SERVICE_JWT_SECRET"], algorithms=["HS256"]
            )
            print(f"DEBUG token decoded: {decoded}")
            assert "username" in decoded, \
                f"Token missing 'username' claim; got keys: {list(decoded.keys())}"
            assert decoded["username"] == username, \
                f"Token username claim mismatch: {decoded['username']} != {username}"

            # 用 token 创建房间
            auth_header = {"Authorization": f"Bearer {token}"}
            response = await client.post(
                "/api/v1/multiplayer/rooms",
                headers=auth_header,
                json={
                    "mode": "new",
                    "config": {
                        "room_name": "JWT username 测试房",
                        "max_players": 2,
                    },
                },
            )
            assert response.status_code == 200, response.text
            room = response.json()

            # 核心断言: 房间的 host_player_id 是 player_id (sub)
            assert room["host_player_id"] == player_id, \
                f"host_player_id should be {player_id}, got {room['host_player_id']}"

            # 核心断言 #2: 房间的 host 玩家名字段应反映 token 的 username
            # (具体字段名按 RoomResponse 的 players 列表)
            host_players = [p for p in room["players"] if p.get("player_id") == player_id]
            assert len(host_players) >= 1, \
                f"Host player not found in room.players: {room['players']}"
            host = host_players[0]
            # 验证 host 的 player_name == username (而非 player_id)
            host_name = host.get("player_name", "") or host.get("username", "")
            assert host_name == username, \
                f"Room host player_name should be '{username}', got '{host_name}'"
