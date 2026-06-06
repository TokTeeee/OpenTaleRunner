"""多人联机业务逻辑 — 房间管理 / 行动轮同步 / 掉线处理"""

import json
import asyncio
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta

from models.multiplayer import (
    Room, RoomConfig, RoomState, PlayerSession, CharacterSlot,
    RoomResponse, RoundStatusResponse, RoundProcessResponse,
    SaveResponse, CommonBackstoryResponse,
)
from repositories.multiplayer_repo import IMultiplayerRepo
from services.snowflake import SnowflakeGenerator, generate_snowflake_id

PLAYER_OFFLINE_TIMEOUT_SECONDS = 90


class MultiplayerService:
    def __init__(self, repo: IMultiplayerRepo):
        self.repo = repo
        self.snowflake = SnowflakeGenerator(machine_id=1)
        self.room_locks: Dict[str, asyncio.Lock] = {}

    def _get_room_lock(self, room_id: str) -> asyncio.Lock:
        if room_id not in self.room_locks:
            self.room_locks[room_id] = asyncio.Lock()
        return self.room_locks[room_id]

    # ─── 配置校验 ───

    def _validate_config(self, config: RoomConfig):
        errors = []
        if not config.room_name or len(config.room_name) > 30:
            errors.append("房间名称需要1-30个字符")
        if config.max_players < 1 or config.max_players > 10:
            errors.append("最大玩家数需在1-10之间")
        if config.password and len(config.password) < 4:
            errors.append("密码至少4位")
        if config.difficulty_modifier < -5 or config.difficulty_modifier > 5:
            errors.append("难度修正范围-5到+5")
        if config.action_round_timeout < 60 or config.action_round_timeout > 600:
            errors.append("行动超时范围60-600秒")
        if config.rest_recovery_multiplier < 0.5 or config.rest_recovery_multiplier > 2.0:
            errors.append("恢复倍率范围0.5-2.0")
        if config.narrative_style not in ('concise', 'detailed', 'epic', 'humorous'):
            errors.append("叙事风格不合法")
        if config.narrative_language not in ('zh', 'en', 'auto'):
            errors.append("叙事语言不合法")
        if config.death_penalty not in ('permanent', 'soft', 'narrative_only'):
            errors.append("死亡规则不合法")
        if config.late_join_intro_delay < 1 or config.late_join_intro_delay > 5:
            errors.append("引入延迟轮数范围1-5")
        if errors:
            raise RoomError("; ".join(errors))

    # ─── 房间创建 ───

    async def create_room(
        self,
        host_id: str,
        config: RoomConfig,
        mode: str = "new",
        inherit_data: Optional[dict] = None,
        player_name: str = "",
    ) -> Room:
        self._validate_config(config)
        room_id = generate_snowflake_id()

        if mode == "inherit" and inherit_data:
            room = await self._create_inherited_room(room_id, host_id, config, inherit_data, player_name)
        else:
            room = await self._create_new_room(room_id, host_id, config, player_name)

        return room

    async def _create_new_room(self, room_id: str, host_id: str, config: RoomConfig, player_name: str) -> Room:
        state = RoomState(phase="waiting")

        # 保存房间
        await self.repo.create_room(
            room_id=room_id,
            host_id=host_id,
            mode="new",
            config=config.model_dump_json(),
            state=state.model_dump_json(),
        )

        # 创建房主会话
        host_session = self._build_session_dict(
            room_id=room_id,
            player_id=host_id,
            player_name=player_name,
            is_host=True,
            status="waiting",
        )
        await self.repo.add_session(host_session)

        return Room(
            room_id=room_id,
            host_player_id=host_id,
            config=config,
            mode="new",
            state=state,
            players=[PlayerSession(**host_session)],
            character_slots=[],
        )

    async def _create_inherited_room(
        self, room_id: str, host_id: str, config: RoomConfig, inherit_data: dict, player_name: str
    ) -> Room:
        # 从继承数据创建角色槽
        character_slots = []
        player_characters = inherit_data.get("player_characters", {})
        for slot_id, char_data in player_characters.items():
            if isinstance(char_data, dict):
                character_slots.append(CharacterSlot(
                    slot_id=slot_id,
                    character_id=char_data.get("characterId", ""),
                    character_name=char_data.get("name", "未知"),
                    character_summary=f"{char_data.get('race', '')} {char_data.get('background', '')}".strip() or "未知角色",
                ))

        # 房主自动认领第一个槽位
        host_slot = None
        for slot in character_slots:
            if slot.slot_id == host_id:
                slot.claimed_by_player_id = host_id
                host_slot = slot
                break
        if not host_slot and character_slots:
            character_slots[0].claimed_by_player_id = host_id
            host_slot = character_slots[0]

        world_day = inherit_data.get("world_day", 1)
        current_round = inherit_data.get("current_round", 0)
        location = inherit_data.get("location")

        state = RoomState(
            phase="waiting",
            world_day=world_day,
            current_round=current_round,
            location=location,
        )

        # 保存房间
        await self.repo.create_room(
            room_id=room_id,
            host_id=host_id,
            mode="inherit",
            config=config.model_dump_json(),
            state=state.model_dump_json(),
        )
        await self.repo.update_character_slots(
            room_id,
            json.dumps([s.model_dump() for s in character_slots], ensure_ascii=False),
        )
        await self.repo.update_player_characters(
            room_id,
            json.dumps(player_characters, ensure_ascii=False),
        )

        # 创建房主会话
        host_session = self._build_session_dict(
            room_id=room_id,
            player_id=host_id,
            player_name=player_name,
            is_host=True,
            is_ready=True,
            status="ready",
            character_id=host_slot.character_id if host_slot else None,
            character_name=host_slot.character_name if host_slot else None,
            slot_id=host_slot.slot_id if host_slot else None,
        )
        await self.repo.add_session(host_session)

        return Room(
            room_id=room_id,
            host_player_id=host_id,
            config=config,
            mode="inherit",
            state=state,
            players=[PlayerSession(**host_session)],
            character_slots=character_slots,
        )

    # ─── 加入房间 ───

    async def join_room(
        self, room_id: str, player_id: str, player_name: str = "",
        password: Optional[str] = None, claimed_slot_id: Optional[str] = None,
    ) -> Room:
        room = await self.get_room(room_id)
        if not room:
            raise RoomError("房间不存在")

        # 密码校验
        if room.config.password and room.config.password != password:
            raise RoomError("房间密码错误")

        # 人数上限校验
        if len(room.players) >= room.config.max_players:
            raise RoomError("房间已满")

        async with self._get_room_lock(room_id):
            room = await self.get_room(room_id)  # 重新获取最新状态

            # 锁内再次校验人数（防并发）
            if len(room.players) >= room.config.max_players:
                raise RoomError("房间已满")

            if room.state.phase == "playing":
                if not room.config.allow_late_join:
                    raise RoomError("游戏已开始，不允许中途加入")
                return await self._join_as_spectator(room, player_id, player_name)
            elif room.state.phase != "waiting":
                raise RoomError("房间当前状态不允许加入")

            return await self._join_in_lobby(room, player_id, player_name, claimed_slot_id)

    async def _join_in_lobby(
        self, room: Room, player_id: str, player_name: str, claimed_slot_id: Optional[str] = None
    ) -> Room:
        """大厅阶段加入"""
        if room.mode == "inherit":
            if claimed_slot_id:
                slot = next((s for s in room.character_slots if s.slot_id == claimed_slot_id), None)
                if not slot:
                    raise RoomError("角色槽不存在")
                if slot.claimed_by_player_id:
                    raise RoomError("该角色已被其他玩家认领")
                slot.claimed_by_player_id = player_id
            else:
                unclaimed = [s for s in room.character_slots if not s.claimed_by_player_id]
                if not unclaimed:
                    raise RoomError("所有角色槽已被认领")
                unclaimed[0].claimed_by_player_id = player_id
                claimed_slot_id = unclaimed[0].slot_id

            # 更新角色槽
            await self.repo.update_character_slots(
                room.room_id,
                json.dumps([s.model_dump() for s in room.character_slots], ensure_ascii=False),
            )

        session = self._build_session_dict(
            room_id=room.room_id,
            player_id=player_id,
            player_name=player_name,
            is_host=False,
            is_ready=(room.mode == "inherit"),
            status="ready" if room.mode == "inherit" else "waiting",
            slot_id=claimed_slot_id,
        )
        await self.repo.add_session(session)
        room.players.append(PlayerSession(**session))
        return room

    async def _join_as_spectator(self, room: Room, player_id: str, player_name: str) -> Room:
        """以观战者身份加入"""
        session = self._build_session_dict(
            room_id=room.room_id,
            player_id=player_id,
            player_name=player_name,
            is_host=False,
            is_ready=False,
            status="spectating",
            joined_at_round=room.state.current_round,
        )
        await self.repo.add_session(session)
        room.players.append(PlayerSession(**session))

        await self._append_notification(room, {
            "event": "spectator_joined",
            "player_id": player_id,
            "player_name": player_name,
            "character_name": "",
            "character_background": "",
            "round": room.state.current_round,
            "narrative": f"{player_name} 加入了观战，正在创建角色...",
            "timestamp": datetime.now().isoformat(),
        })
        return room

    @staticmethod
    def _build_session_dict(**kwargs) -> dict:
        defaults = {
            "room_id": "",
            "player_id": "",
            "player_name": "",
            "character_id": None,
            "character_name": None,
            "character_background": None,
            "is_host": False,
            "is_ready": False,
            "is_online": True,
            "status": "waiting",
            "slot_id": None,
            "joined_at_round": 0,
            "last_heartbeat": datetime.now().isoformat(),
        }
        defaults.update(kwargs)
        return defaults

    # ─── 获取房间 ───

    async def get_room(self, room_id: str) -> Optional[Room]:
        row = await self.repo.get_room(room_id)
        if not row:
            return None

        sessions = await self.repo.get_room_sessions(room_id)

        config = RoomConfig.model_validate_json(row["config_json"])
        state = RoomState.model_validate_json(row["state_json"])
        character_slots = [CharacterSlot.model_validate(s) for s in json.loads(row["character_slots_json"])]
        players = [PlayerSession(**self._session_row_to_dict(s)) for s in sessions]
        last_round_result = self._load_json_value(row.get("last_round_result_json"), {})
        narrative_history = self._load_json_value(row.get("narrative_history_json"), [])
        room_notifications = self._load_json_value(row.get("room_notifications_json"), [])

        return Room(
            room_id=row["room_id"],
            host_player_id=row["host_player_id"],
            config=config,
            mode=row["mode"],
            created_at=row["created_at"],
            started_at=row["started_at"],
            state=state,
            players=players,
            character_slots=character_slots,
            current_round_actions=json.loads(row["current_round_actions_json"]),
            current_round_dice_results=json.loads(row["current_round_dice_results_json"]),
            last_round_result=last_round_result if isinstance(last_round_result, dict) and last_round_result else None,
            narrative_history=narrative_history if isinstance(narrative_history, list) else [],
            room_notifications=room_notifications if isinstance(room_notifications, list) else [],
        )

    @staticmethod
    def _session_row_to_dict(row: dict) -> dict:
        return {
            "player_id": row["player_id"],
            "player_name": row.get("player_name", ""),
            "character_id": row.get("character_id"),
            "character_name": row.get("character_name"),
            "character_background": row.get("character_background"),
            "is_host": bool(row.get("is_host", False)),
            "is_ready": bool(row.get("is_ready", False)),
            "is_online": bool(row.get("is_online", True)),
            "last_heartbeat": row.get("last_heartbeat", ""),
            "status": row.get("status", "waiting"),
            "slot_id": row.get("slot_id"),
            "joined_at_round": row.get("joined_at_round", 0),
        }

    @staticmethod
    def _load_json_value(raw: Optional[str], fallback: Any) -> Any:
        if raw in (None, ""):
            return fallback
        try:
            return json.loads(raw)
        except (TypeError, ValueError, json.JSONDecodeError):
            return fallback

    def _restore_player_status(self, room: Room, player: PlayerSession) -> str:
        if room.state.phase != "playing":
            return "ready" if player.is_ready else "waiting"

        if not player.character_id and not player.character_name:
            return "spectating"

        if player.joined_at_round > 0 and player.is_ready:
            rounds_waited = room.state.current_round - player.joined_at_round + 1
            if rounds_waited < room.config.late_join_intro_delay:
                return "pending_intro"

        return "in_game"

    # ─── 离开房间 ───

    async def leave_room(self, room_id: str, player_id: str) -> None:
        async with self._get_room_lock(room_id):
            room = await self.get_room(room_id)
            if not room:
                raise RoomError("房间不存在")

            session = next((p for p in room.players if p.player_id == player_id), None)
            if not session:
                raise RoomError("你不在房间中")

            # 释放角色槽
            if session.slot_id:
                for slot in room.character_slots:
                    if slot.slot_id == session.slot_id:
                        slot.claimed_by_player_id = None
                await self.repo.update_character_slots(
                    room_id,
                    json.dumps([s.model_dump() for s in room.character_slots], ensure_ascii=False),
                )

            await self.repo.remove_session(room_id, player_id)

            # 如果所有玩家离开，销毁房间
            remaining = [p for p in room.players if p.player_id != player_id]
            if not remaining:
                await self.repo.delete_room(room_id)
            elif session.is_host and remaining:
                # 转移房主给第一个剩余玩家
                new_host_id = remaining[0].player_id
                await self.repo.update_session(room_id, new_host_id, {"is_host": True})
                # 更新房间的host_player_id
                row = await self.repo.get_room(room_id)
                if row:
                    config = RoomConfig.model_validate_json(row["config_json"])
                    await self.repo.delete_room(room_id)
                    await self.repo.create_room(
                        room_id=room_id,
                        host_id=new_host_id,
                        mode=room.mode,
                        config=config.model_dump_json(),
                        state=room.state.model_dump_json(),
                    )
                    await self.repo.update_character_slots(
                        room_id,
                        json.dumps([s.model_dump() for s in room.character_slots], ensure_ascii=False),
                    )
                    await self.repo.update_player_characters(
                        room_id,
                        json.dumps(json.loads((await self.repo.get_room(room_id) or {}).get("player_characters_json", "{}")), ensure_ascii=False),
                    )

    # ─── 角色槽管理 ───

    async def claim_slot(self, room_id: str, slot_id: str, player_id: str) -> None:
        room = await self.get_room(room_id)
        if not room:
            raise RoomError("房间不存在")

        slot = next((s for s in room.character_slots if s.slot_id == slot_id), None)
        if not slot:
            raise RoomError("角色槽不存在")
        if slot.claimed_by_player_id:
            raise RoomError("该角色已被其他玩家认领")

        slot.claimed_by_player_id = player_id
        await self.repo.update_character_slots(
            room_id,
            json.dumps([s.model_dump() for s in room.character_slots], ensure_ascii=False),
        )

    async def release_slot(self, room_id: str, player_id: str) -> str:
        room = await self.get_room(room_id)
        if not room:
            raise RoomError("房间不存在")

        for slot in room.character_slots:
            if slot.claimed_by_player_id == player_id:
                slot.claimed_by_player_id = None
                await self.repo.update_character_slots(
                    room_id,
                    json.dumps([s.model_dump() for s in room.character_slots], ensure_ascii=False),
                )
                return slot.slot_id

        raise RoomError("你没有认领任何角色槽")

    # ─── 角色就绪 / 开始游戏 ───

    async def mark_character_ready(
        self, room_id: str, player_id: str, character_id: str,
        character_name: str, character_data: Optional[dict] = None,
        character_background: Optional[str] = None,
    ) -> None:
        room = await self.get_room(room_id)
        if not room:
            raise RoomError("房间不存在")
        if room.state.phase != "waiting":
            raise RoomError("游戏已开始，无法设置就绪")

        updates = {
            "is_ready": True,
            "status": "ready",
            "character_id": character_id,
            "character_name": character_name,
            "character_background": character_background or "",
        }
        await self.repo.update_session(room_id, player_id, updates)

        # 如果提供了角色数据，暂存到房间
        if character_data:
            chars = json.loads((await self.repo.get_room(room_id))["player_characters_json"])
            chars[player_id] = character_data
            await self.repo.update_player_characters(room_id, json.dumps(chars, ensure_ascii=False))

    async def generate_common_backstory(self, room_id: str, player_id: str) -> CommonBackstoryResponse:
        """GM读取所有玩家背景，生成统一起始故事（仅房主）"""
        room = await self.get_room(room_id)
        if not room:
            raise RoomError("房间不存在")
        if room.host_player_id != player_id:
            raise RoomError("仅房主可以生成共同背景故事")

        backgrounds = []
        for p in room.players:
            if p.character_background:
                backgrounds.append(f"- {p.character_name or p.player_name}: {p.character_background}")

        if not backgrounds:
            raise RoomError("没有可用的玩家背景信息")

        prompt = f"""你是一个TRPG的GM。以下是一群冒险者的出身背景：

{chr(10).join(backgrounds)}

请生成：
1. 一段连接所有角色背景的统一起始故事（150-300字）
2. 建议的共同起始地点（从故事书中选择或自由发挥）
3. 每个角色的个人剧情钩子（为什么他们会在这个地点相遇）

以JSON格式返回，包含 common_backstory, suggested_starting_location (含 region/subRegion/specificPlace/coordinates), individual_hooks (key 为 player_id)。"""

        result = await self._call_llm_for_backstory(prompt)
        if not result:
            return self._fallback_backstory(room)

        return result

    async def _call_llm_for_backstory(self, prompt: str) -> Optional[CommonBackstoryResponse]:
        try:
            import httpx
            from config import settings as app_settings
            from logging_config import api_log

            if not app_settings.llm_api_key:
                return None

            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    app_settings.llm_endpoint,
                    headers={
                        "Authorization": f"Bearer {app_settings.llm_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": app_settings.llm_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": max(0.7, app_settings.llm_temperature),
                        "max_tokens": min(800, app_settings.llm_max_tokens),
                    },
                )
                if resp.status_code != 200:
                    api_log.warning(f"CommonBackstory: LLM returned {resp.status_code}")
                    return None

                data = resp.json()
                msg = data.get("choices", [{}])[0].get("message", {})
                content = msg.get("content") or msg.get("reasoning_content") or ""

                if not content:
                    return None

                parsed = self._parse_backstory_json(content)
                return parsed

        except Exception as e:
            from logging_config import api_log
            api_log.warning(f"CommonBackstory: LLM call failed: {e}")
            return None

    def _parse_backstory_json(self, content: str) -> CommonBackstoryResponse:
        import re
        json_match = re.search(r'\{[^{}]*\}', content.replace('\n', ' '))
        if json_match:
            try:
                data = json.loads(json_match.group())
                return CommonBackstoryResponse(
                    common_backstory=data.get("common_backstory", ""),
                    suggested_starting_location=data.get("suggested_starting_location"),
                    individual_hooks=data.get("individual_hooks", {}),
                )
            except (json.JSONDecodeError, TypeError):
                pass

        return CommonBackstoryResponse(
            common_backstory=content.strip()[:500],
            suggested_starting_location=None,
            individual_hooks={},
        )

    def _fallback_backstory(self, room) -> CommonBackstoryResponse:
        names = [p.character_name or p.player_name for p in room.players if p.character_name]
        if not names:
            names = [p.player_name for p in room.players]
        joined = "、".join(names)
        return CommonBackstoryResponse(
            common_backstory=(
                f"命运的交织将{joined}引向了同一座边境小镇。"
                "黄昏时分，旅人酒馆的炉火映照着每一张陌生的面孔，一段新的冒险即将开始..."
            ),
            suggested_starting_location={
                "region": "Aetherlain",
                "subRegion": "Westmarch",
                "specificPlace": "旅人酒馆",
                "coordinates": {"x": 100, "y": 0, "z": 100},
            },
            individual_hooks={
                p.player_id: f"{p.character_name}在旅途中来到了这里"
                for p in room.players if p.character_name
            },
        )

    async def start_game(self, room_id: str, player_id: str) -> Room:
        room = await self.get_room(room_id)
        if not room:
            raise RoomError("房间不存在")
        if room.host_player_id != player_id:
            raise RoomError("仅房主可以开始游戏")

        # 检查就绪条件
        can_start, reason = await self._can_start_game(room)
        if not can_start:
            raise RoomError(reason)

        state = room.state
        state.phase = "playing"
        await self.repo.start_room(room_id, state.model_dump_json())

        # 更新所有玩家状态为 in_game
        for p in room.players:
            await self.repo.update_session(room_id, p.player_id, {"status": "in_game"})

        room.state = state
        return room

    async def _can_start_game(self, room: Room) -> tuple:
        if room.mode == "new":
            not_ready = [p for p in room.players if not p.is_ready]
            if not_ready:
                return False, f"尚有 {len(not_ready)} 名玩家未完成准备"
        elif room.mode == "inherit":
            unclaimed = [s for s in room.character_slots if not s.claimed_by_player_id]
            if unclaimed:
                names = "、".join(s.character_name for s in unclaimed)
                return False, f"还有 {len(unclaimed)} 个角色槽未被认领：{names}"

        if len(room.players) < 1:
            return False, "至少需要1名玩家"

        if room.mode == "inherit" and len(room.character_slots) > room.config.max_players:
            return False, f"存档中有 {len(room.character_slots)} 个角色，但房间最大人数限制为 {room.config.max_players}"

        return True, ""

    # ─── 心跳 ───

    async def heartbeat(self, room_id: str, player_id: str) -> None:
        room = await self.get_room(room_id)
        if not room:
            raise RoomError("房间不存在")

        player = next((p for p in room.players if p.player_id == player_id), None)
        if not player:
            raise RoomError("你不在房间中")

        updates = {
            "last_heartbeat": datetime.now().isoformat(),
            "is_online": True,
        }
        if player.status == "disconnected" or not player.is_online:
            updates["status"] = self._restore_player_status(room, player)
        await self.repo.update_session(room_id, player_id, updates)

    # ─── 观战者就绪 ───

    async def spectator_ready(
        self, room_id: str, player_id: str,
        character_id: str, character_name: str,
        character_data: Optional[dict] = None,
        character_background: Optional[str] = None,
    ) -> dict:
        room = await self.get_room(room_id)
        if not room:
            raise RoomError("房间不存在")

        player = next((p for p in room.players if p.player_id == player_id), None)
        if not player or player.status not in ("spectating", "pending_intro"):
            raise RoomError("你不在观战中")

        await self.repo.update_session(room_id, player_id, {
            "is_ready": True,
            "status": "pending_intro",
            "character_id": character_id,
            "character_name": character_name,
            "character_background": character_background or "",
        })

        if character_data:
            row = await self.repo.get_room(room_id)
            chars = json.loads(row["player_characters_json"])
            chars[player_id] = character_data
            await self.repo.update_player_characters(room_id, json.dumps(chars, ensure_ascii=False))

        await self._append_notification(room, {
            "event": "character_created",
            "player_id": player_id,
            "player_name": player.player_name,
            "character_name": character_name,
            "character_background": character_background or "",
            "round": room.state.current_round,
            "narrative": f"{player.player_name} ({character_name}) 等待GM引入队伍...",
            "timestamp": datetime.now().isoformat(),
        })

        intro_round = room.state.current_round + room.config.late_join_intro_delay
        return {
            "status": "pending_intro",
            "message": "角色创建完成，等待GM在叙事中引入",
            "estimated_intro_round": intro_round,
        }

    # ─── 行动轮 ───

    async def submit_action(
        self,
        room_id: str,
        player_id: str,
        action: str,
        dice_result: Optional[Dict[str, Any]] = None,
    ) -> dict:
        """玩家提交行动"""
        all_acted = False
        async with self._get_room_lock(room_id):
            room = await self.get_room(room_id)
            if not room:
                raise RoomError("房间不存在")
            if room.state.phase != "playing":
                raise RoomError("游戏尚未开始")

            player = next((p for p in room.players if p.player_id == player_id), None)
            if not player:
                raise RoomError("你不在房间中")
            if player.status not in ("in_game",):
                raise RoomError("你当前无法提交行动")

            if player_id in room.state.players_acted:
                raise RoomError("你已提交过本轮行动")

            room.current_round_actions[player_id] = action
            if dice_result is not None:
                room.current_round_dice_results[player_id] = dice_result
            room.state.players_acted.append(player_id)
            if not room.state.round_start_time:
                room.state.round_start_time = datetime.now().isoformat()

            await self.repo.update_room_state(
                room_id,
                room.state.model_dump_json(),
                json.dumps(room.current_round_actions, ensure_ascii=False),
                json.dumps(room.current_round_dice_results, ensure_ascii=False),
            )

            all_acted = self._all_players_acted(room)

        # 锁外处理：所有人已提交 → 自动处理此轮
        if all_acted:
            result = await self.process_round(room_id)
            return {
                "players_acted": [],
                "total_players": len([p for p in room.players if p.status == "in_game"]),
                "is_round_complete": True,
                "round_result": result,
            }

        return {
            "players_acted": room.state.players_acted if room else [],
            "total_players": len([p for p in room.players if p.status == "in_game"]) if room else 0,
            "is_round_complete": False,
        }

    async def skip_round(self, room_id: str, player_id: str) -> dict:
        """跳过本轮行动"""
        return await self.submit_action(room_id, player_id, "跳过")

    async def get_round_status(self, room_id: str) -> dict:
        """查询当前轮次状态"""
        room = await self.get_room(room_id)
        if not room:
            raise RoomError("房间不存在")

        in_game_players = [p for p in room.players if p.status == "in_game" and p.is_online]
        pending = [p.player_id for p in in_game_players if p.player_id not in room.state.players_acted]

        timeout_at = None
        if room.state.round_start_time:
            try:
                start = datetime.fromisoformat(room.state.round_start_time)
                timeout_at = (start + timedelta(seconds=room.config.action_round_timeout)).isoformat()
            except (ValueError, TypeError):
                pass

        return {
            "current_round": room.state.current_round,
            "players_acted": room.state.players_acted,
            "pending_players": pending,
            "actions": room.current_round_actions,
            "dice_results": room.current_round_dice_results,
            "round_start_time": room.state.round_start_time,
            "timeout_at": timeout_at,
            "latest_round_result": room.last_round_result,
            "recent_notifications": room.room_notifications,
        }

    def _all_players_acted(self, room) -> bool:
        """所有 in_game 玩家是否都已行动"""
        active = [p for p in room.players if p.status == "in_game" and p.is_online]
        return all(p.player_id in room.state.players_acted for p in active)

    async def process_round(self, room_id: str) -> dict:
        """处理本轮所有行动：冲突检测 → PM叙事 → 更新状态"""
        async with self._get_room_lock(room_id):
            room = await self.get_room(room_id)
            if not room:
                raise RoomError("房间不存在")
            if room.state.phase != "playing":
                raise RoomError("游戏未在进行中")
            if not room.current_round_actions:
                if room.last_round_result and room.last_round_result.get("next_round") == room.state.current_round:
                    return room.last_round_result
                raise RoomError("当前轮没有可处理的行动")

            processed_round = room.state.current_round
            current_actions = dict(room.current_round_actions)
            current_dice_results = dict(room.current_round_dice_results)

            # 检查是否有待引入的观战者
            pending_intros = self._check_pending_introductions(room, processed_round)

            # 冲突检测（轻量规则）
            conflicts = self._detect_conflicts(current_actions, room.players)

            # 调用多人PM引擎生成叙事
            from services.multiplayer_pm import engine as pm_engine

            player_dicts = [
                {
                    "player_id": p.player_id,
                    "player_name": p.player_name,
                    "character_name": p.character_name,
                    "character_background": p.character_background,
                    "status": p.status,
                }
                for p in room.players
            ]

            narrative_result = await pm_engine.generate_narrative(
                players=player_dicts,
                actions=current_actions,
                conflicts=conflicts,
                location=room.state.location,
                world_day=room.state.world_day,
                round_number=processed_round,
                pending_introductions=pending_intros,
                narrative_style=room.config.narrative_style,
                difficulty_modifier=room.config.difficulty_modifier,
            )

            # 处理引入：pending_intro → in_game
            introduced_players = []
            introduced_lookup = {
                intro.get("player_id"): intro
                for intro in narrative_result.get("world_state_changes", {}).get("introduced_players", [])
                if isinstance(intro, dict)
            }
            for intro in pending_intros:
                player = next(
                    (p for p in room.players if p.player_id == intro["player_id"]), None
                )
                if player:
                    await self.repo.update_session(room_id, player.player_id, {
                        "status": "in_game",
                        "is_ready": True,
                    })
                    intro_payload = introduced_lookup.get(player.player_id, {})
                    introduced_players.append({
                        "player_id": player.player_id,
                        "character_name": player.character_name or "",
                        "narrative": intro_payload.get("narrative", "加入了队伍"),
                    })
                    await self._append_notification(room, {
                        "event": "player_introduced",
                        "player_id": player.player_id,
                        "player_name": player.player_name,
                        "character_name": player.character_name or "",
                        "character_background": player.character_background or "",
                        "round": processed_round,
                        "narrative": intro_payload.get("narrative", f"{player.character_name or player.player_name} 正式加入了队伍！"),
                        "timestamp": datetime.now().isoformat(),
                    })

            # 更新轮次状态
            room.state.current_round = processed_round + 1
            room.state.players_acted = []
            room.state.round_start_time = None
            room.current_round_actions = {}
            room.current_round_dice_results = {}

            round_result = {
                "round": processed_round,
                "player_actions": current_actions,
                "dice_results": current_dice_results,
                "conflicts": conflicts,
                "narrative": narrative_result.get("narrative", ""),
                "consequences": narrative_result.get("consequences", {}),
                "world_state_changes": narrative_result.get("world_state_changes", {}),
                "introduced_players": introduced_players,
                "next_round": room.state.current_round,
            }
            room.last_round_result = round_result
            room.narrative_history = [
                *room.narrative_history,
                {
                    "round": processed_round,
                    "narrative": round_result["narrative"],
                    "player_actions": current_actions,
                    "dice_results": current_dice_results,
                    "timestamp": datetime.now().isoformat(),
                },
            ][-100:]

            await self.repo.update_room_state(
                room_id,
                room.state.model_dump_json(),
                "{}",
                "{}",
            )
            await self.repo.update_round_artifacts(
                room_id,
                json.dumps(round_result, ensure_ascii=False),
                json.dumps(room.narrative_history, ensure_ascii=False),
            )

            return round_result

    async def get_narratives(self, room_id: str, since_round: int = 0, player_id: Optional[str] = None) -> List[Dict[str, Any]]:
        room = await self.get_room(room_id)
        if not room:
            raise RoomError("房间不存在")
        if player_id and not any(p.player_id == player_id for p in room.players):
            raise RoomError("你不在房间中")

        return [
            entry for entry in room.narrative_history
            if isinstance(entry, dict) and entry.get("round", -1) > since_round
        ]

    def _check_pending_introductions(self, room, current_round: int) -> List[dict]:
        """检查有哪些观战者到了应该被引入的轮次"""
        pending = []
        intro_delay = room.config.late_join_intro_delay

        for player in room.players:
            if player.status in ("spectating", "pending_intro"):
                if not player.is_ready:
                    continue
                # joined_at_round 记录的是“从哪一轮开始旁观”，因此在处理 current_round
                # 这一轮结算时，需要把当前已走完的这一轮也计入等待轮数。
                rounds_waited = current_round - player.joined_at_round + 1
                if rounds_waited >= intro_delay:
                    pending.append({
                        "player_id": player.player_id,
                        "character_name": player.character_name or player.player_name,
                        "character_id": player.character_id or "",
                        "character_background": player.character_background or "未知背景",
                    })
        return pending

    async def _append_notification(self, room: Room, notification: dict) -> None:
        room.room_notifications = [
            *room.room_notifications,
            notification,
        ][-50:]
        await self.repo.update_room_notifications(
            room.room_id,
            json.dumps(room.room_notifications, ensure_ascii=False),
        )

    def _detect_conflicts(
        self, actions: dict, players: List
    ) -> List[Dict[str, Any]]:
        """轻量规则引擎：检测多人行动冲突"""
        conflicts = []
        if len(actions) <= 1:
            return conflicts

        # 目标冲突：提取动作中的NPC/物品名
        targets: Dict[str, str] = {}
        for pid, action in actions.items():
            extracted = self._extract_target(action)
            if extracted:
                if extracted in targets:
                    conflicts.append({
                        "type": "target_conflict",
                        "players": [targets[extracted], pid],
                        "target": extracted,
                        "description": f"多人同时关注了'{extracted}'",
                    })
                else:
                    targets[extracted] = pid

        return conflicts

    @staticmethod
    def _extract_target(action: str) -> Optional[str]:
        """从行动文本中提取关键目标（简单规则）"""
        if action == "跳过":
            return None
        keywords = ["与", "向", "对", "和"]
        for kw in keywords:
            if kw in action:
                idx = action.index(kw)
                rest = action[idx + 1:].strip()
                # 提取前6个字作为目标
                target = rest[:6] if len(rest) > 6 else rest
                return target
        return None

    # ─── 存档 ───

    async def build_save_data(self, room_id: str, archive_name: str = "自动保存") -> SaveResponse:
        room = await self.get_room(room_id)
        if not room:
            raise RoomError("房间不存在")

        chars = json.loads((await self.repo.get_room(room_id))["player_characters_json"])

        return SaveResponse(
            archive_id=generate_snowflake_id(),
            archive_name=archive_name,
            created_at=datetime.now().isoformat(),
            world_day=room.state.world_day,
            current_round=room.state.current_round,
            location=room.state.location,
            player_characters=chars,
            shared_world_state={},
            chronicle_entries=[],
            player_list=[
                {"player_id": p.player_id, "character_name": p.character_name or ""}
                for p in room.players
            ],
        )

    # ─── 后台任务 ───

    async def heartbeat_checker_loop(self):
        """后台任务：定期检查心跳超时 + 清理过期房间"""
        while True:
            try:
                room_ids = await self.repo.get_active_rooms()
                now = datetime.now()

                for room_id in room_ids:
                    room = await self.get_room(room_id)
                    if not room:
                        continue

                    timeout = room.config.action_round_timeout
                    all_offline = True

                    for player in room.players:
                        try:
                            last_hb = datetime.fromisoformat(player.last_heartbeat) if player.last_heartbeat else now
                        except (ValueError, TypeError):
                            last_hb = now

                        elapsed = (now - last_hb).total_seconds()

                        if player.is_online and elapsed > PLAYER_OFFLINE_TIMEOUT_SECONDS:
                            await self.repo.update_session(room_id, player.player_id, {
                                "is_online": False,
                            })
                        elif not player.is_online:
                            # 自动跳过未行动的离线玩家
                            if room.state.phase == "playing" and room.config.auto_skip_on_timeout and elapsed > timeout:
                                if player.player_id not in room.state.players_acted and player.status not in ("spectating", "pending_intro"):
                                    async with self._get_room_lock(room_id):
                                        room2 = await self.get_room(room_id)
                                        if room2 and player.player_id not in room2.state.players_acted:
                                            room2.current_round_actions[player.player_id] = "跳过(离线)"
                                            room2.state.players_acted.append(player.player_id)
                                            await self.repo.update_room_state(
                                                room_id,
                                                room2.state.model_dump_json(),
                                                json.dumps(room2.current_round_actions, ensure_ascii=False),
                                                json.dumps(room2.current_round_dice_results, ensure_ascii=False),
                                            )
                            # 4倍超时后移除玩家
                            if elapsed > timeout * 4:
                                await self._remove_player(room_id, player)

                        if player.is_online:
                            all_offline = False

                    # 全员离线30分钟 → 销毁房间
                    if all_offline and room.state.phase != "ended":
                        try:
                            created = datetime.fromisoformat(room.created_at)
                            if (now - created).total_seconds() > 1800:
                                await self.repo.delete_room(room_id)
                        except (ValueError, TypeError):
                            pass

                    # 未开始的房间24小时后销毁
                    if room.state.phase == "waiting":
                        try:
                            created = datetime.fromisoformat(room.created_at)
                            if (now - created).total_seconds() > 86400:
                                await self.repo.delete_room(room_id)
                        except (ValueError, TypeError):
                            pass

            except Exception:
                pass  # 静默处理单次循环错误

            await asyncio.sleep(30)

    async def _remove_player(self, room_id: str, player):
        """移除玩家并释放角色槽"""
        if player.slot_id:
            room = await self.get_room(room_id)
            if room:
                for slot in room.character_slots:
                    if slot.slot_id == player.slot_id:
                        slot.claimed_by_player_id = None
                await self.repo.update_character_slots(
                    room_id,
                    json.dumps([s.model_dump() for s in room.character_slots], ensure_ascii=False),
                )
        await self.repo.remove_session(room_id, player.player_id)


class RoomError(Exception):
    pass
