"""NPC 服务"""
import json, uuid
from datetime import datetime, timezone
from repositories.npc_repo import INPCRepo
from repositories.world_repo import IWorldRepo


class NPCService:
    def __init__(self, npc_repo: INPCRepo, world_repo: IWorldRepo):
        self.npc_repo = npc_repo
        self.world_repo = world_repo

    async def register(self, npc: dict, owner_player_id: str | None = None) -> str:
        if not npc.get("npcId"):
            npc["npcId"] = str(uuid.uuid4())
        return await self.npc_repo.register(npc, owner_player_id)

    async def get_region_npcs(self, region: str) -> list[dict]:
        return await self.npc_repo.get_by_region(region)

    async def get_known_npcs(self, npc_ids: list[str], player_id: str) -> list[dict]:
        return await self.npc_repo.get_known(npc_ids, player_id)

    async def update_relationship(self, npc_id: str, player_id: str, rel: dict) -> None:
        await self.npc_repo.update_relationship(npc_id, player_id, rel)
        # Auto-check promotion after relationship update
        await self.check_promotion(npc_id, player_id)

    async def get_templates(self) -> dict:
        data = await self.world_repo.get_npc_templates()
        return data.get("npc_templates", {}) if data else {}

    async def check_promotion(self, npc_id: str, player_id: str | None = None) -> bool:
        """检查并执行 NPC 升格。多维度：单玩家好感/交互，或多玩家提及。"""
        npc = await self.npc_repo.get(npc_id)
        if not npc or npc.get("promoted"): return False

        should_promote = False
        reason = ""

        # 单玩家维度
        if player_id:
            rel = await self.npc_repo.get_relationship(npc_id, player_id)
            if rel:
                if rel.get("attitude", 0) >= 80:
                    should_promote = True
                    reason = f"玩家好感度达到{rel['attitude']}"
                elif rel.get("interactionCount", 0) >= 20:
                    should_promote = True
                    reason = f"交互次数达到{rel['interactionCount']}"

        # 多玩家维度
        if not should_promote:
            all_rels = await self.npc_repo.get_all_relationships(npc_id)
            unique_players = len(set(r.get("player_id") for r in all_rels if r.get("player_id")))
            if unique_players >= 3:
                total_interactions = sum(r.get("interaction_count", 0) for r in all_rels)
                if total_interactions >= 30:
                    should_promote = True
                    reason = f"被{unique_players}名玩家共计{total_interactions}次交互"

        if should_promote:
            await self.npc_repo.promote(npc_id)
            await self.npc_repo.patch_data(npc_id, {
                "promotion_info": {
                    "promoted_at": datetime.now(timezone.utc).isoformat(),
                    "promotion_reason": reason,
                    "promoted_by_player": player_id or "multi_player",
                }
            })
            return True

        return False

    async def get_full_npc(self, npc_id: str, player_id: str | None = None) -> dict | None:
        """获取 NPC 完整数据（含关系、音色、立绘、升格状态）"""
        npc = await self.npc_repo.get(npc_id)
        if not npc: return None

        result = dict(npc)
        if player_id:
            result["relationship"] = await self.npc_repo.get_relationship(npc_id, player_id)
            result["isMet"] = result["relationship"] is not None
        return result

    async def patch_npc(self, npc_id: str, updates: dict) -> None:
        """客户端同步 NPC 数据到服务端（voice_params / portrait / 等）"""
        allowed = {"voice_params", "portrait", "behavior_config", "attributes", "skills"}
        filtered = {k: v for k, v in updates.items() if k in allowed}
        if filtered:
            await self.npc_repo.patch_data(npc_id, filtered)
