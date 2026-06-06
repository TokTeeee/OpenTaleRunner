"""种子数据加载 — JSON → SQLite"""
import json, os
from db.database import Database
from services.terrain_service import seed_terrain, seed_waters, seed_roads
from services.aliases import init_from_storybook
from config import settings


async def seed_storybook(db: Database, data_dir: str) -> None:
    path = settings.storybook_path if os.path.isabs(settings.storybook_path) else os.path.join(data_dir, os.path.basename(settings.storybook_path))
    if not os.path.exists(path):
        path = os.path.join(data_dir, "storybook.json")
    if not os.path.exists(path):
        print(f"[seed] storybook.json not found, skipping"); return
    with open(path, "r", encoding="utf-8") as f:
        sb = json.load(f)
    # Initialize aliases from storybook data
    init_from_storybook(sb)
    await db.execute("INSERT OR REPLACE INTO world_meta (key, value) VALUES (?, ?)", ("storybook_data", json.dumps(sb, ensure_ascii=False)))
    for r in sb.get("regions", []):
        w = r.get("weather_patterns", ["晴朗"])[0] if r.get("weather_patterns") else "晴朗"
        await db.execute("INSERT OR IGNORE INTO world_state (region_id, weather) VALUES (?, ?)", (r.get("id",""), w))
    for b in sb.get("main_quest", {}).get("beats", []):
        await db.execute("INSERT OR IGNORE INTO milestones (id, name, status) VALUES (?, ?, ?)", (b.get("id",""), b.get("name",""), b.get("status","locked")))
    await db.execute("INSERT OR IGNORE INTO world_meta (key, value) VALUES (?, ?)", ("world_day", "1"))


async def seed_npc_templates(db: Database, data_dir: str) -> None:
    path = os.path.join(data_dir, "npc_templates.json")
    if not os.path.exists(path):
        print(f"[seed] npc_templates.json not found, skipping"); return
    with open(path, "r", encoding="utf-8") as f:
        tmpl = json.load(f)
    await db.execute("INSERT OR REPLACE INTO world_meta (key, value) VALUES (?, ?)", ("npc_templates", json.dumps(tmpl, ensure_ascii=False)))
    author_npcs = tmpl.get("npc_templates", {}).get("author_npcs", {}).get("list", [])
    for n in author_npcs:
        await db.execute("INSERT OR IGNORE INTO npc_registry (id, name, region, data, source, owner_player_id) VALUES (?,?,?,?,?,?)",
            (n.get("npcId",""), n.get("name",""), n.get("region",""), json.dumps(n, ensure_ascii=False), "storybook", None))


async def seed_all(db: Database, data_dir: str) -> None:
    await seed_storybook(db, data_dir)
    await seed_npc_templates(db, data_dir)
    tc = await seed_terrain(db)
    wc = await seed_waters(db)
    rc = await seed_roads(db)
    print(f"[seed] Terrain: {tc}, Waters: {wc}, Roads: {rc}")

