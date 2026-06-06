"""冲突检测器 — 纯规则引擎"""
import json
from datetime import datetime


class ConflictDetector:
    @staticmethod
    def detect(entries: list[dict]) -> list[dict]:
        """检测编年史日志中的冲突。按时间戳排序，检测同区域的行为冲突。返回冲突列表。"""
        conflicts = []
        if not entries:
            return conflicts

        sorted_entries = sorted(entries, key=lambda e: e.get("timestamp", ""))
        region_items: dict[str, list[dict]] = {}
        item_owners: dict[str, tuple[str, str, str]] = {}  # item_name → (player_id, entry_id, timestamp)

        for entry in sorted_entries:
            loc = entry.get("location", {})
            region = loc.get("region", "")
            if region not in region_items:
                region_items[region] = []
            region_items[region].append(entry)

        for region, items in region_items.items():
            npc_interactions: dict[str, list[dict]] = {}
            location_changes: dict[str, list[dict]] = {}

            for entry in items:
                pid = entry.get("playerId", "")
                consequences = entry.get("consequences", {})

                # 1. 物品冲突检测
                items_gained = consequences.get("items_gained", [])
                for item in items_gained:
                    name = item.get("name", "") if isinstance(item, dict) else str(item)
                    if not name:
                        continue
                    if name in item_owners:
                        prev_player, prev_entry, prev_ts = item_owners[name]
                        conflicts.append({
                            "type": "item_conflict",
                            "region": region,
                            "item": name,
                            "winner": prev_player,
                            "loser": pid,
                            "resolution": f"物品'{name}'已被{prev_player}获取",
                            "entries": [prev_entry, entry.get("entryId", "")],
                        })
                    else:
                        item_owners[name] = (pid, entry.get("entryId", ""), entry.get("timestamp", ""))

                # 2. NPC 交互冲突检测
                npcs_introduced = consequences.get("npcs_introduced", [])
                for npc in npcs_introduced:
                    npc_name = npc.get("name", "") if isinstance(npc, dict) else str(npc)
                    if not npc_name:
                        continue
                    if npc_name not in npc_interactions:
                        npc_interactions[npc_name] = []
                    npc_interactions[npc_name].append(entry)

                # Check action summary for NPC name mentions
                action = entry.get("action", {})
                summary = action.get("summary", "") if isinstance(action, dict) else str(action)
                for npc_name in npc_interactions:
                    if npc_name in summary and entry not in npc_interactions[npc_name]:
                        npc_interactions[npc_name].append(entry)

                # 3. 地点冲突检测
                location_effects = consequences.get("world_effects", [])
                for effect in location_effects:
                    effect_str = str(effect)
                    if "破坏" in effect_str or "改变" in effect_str or "摧毁" in effect_str:
                        loc_key = f"{region}:{loc.get('sub_region', '')}"
                        if loc_key not in location_changes:
                            location_changes[loc_key] = []
                        location_changes[loc_key].append(entry)

            # NPC conflict resolution — merge timeline
            for npc_name, npc_entries in npc_interactions.items():
                if len(npc_entries) > 1:
                    sorted_npc = sorted(npc_entries, key=lambda e: e.get("timestamp", ""))
                    conflicts.append({
                        "type": "npc_shared",
                        "region": region,
                        "npc": npc_name,
                        "resolution": f"NPC'{npc_name}'先后与{len(npc_entries)}位冒险者互动",
                        "entries": [e.get("entryId", "") for e in sorted_npc],
                    })

            # Location conflict resolution — timestamp priority
            for loc_key, loc_entries in location_changes.items():
                if len(loc_entries) > 1:
                    sorted_loc = sorted(loc_entries, key=lambda e: e.get("timestamp", ""))
                    first = sorted_loc[0]
                    conflicts.append({
                        "type": "location_conflict",
                        "region": region,
                        "location": loc_key,
                        "winner": first.get("playerId", ""),
                        "resolution": f"地点'{loc_key}'的变更以{first.get('playerId', '')}的行为为准",
                        "entries": [e.get("entryId", "") for e in sorted_loc],
                    })

        return conflicts
