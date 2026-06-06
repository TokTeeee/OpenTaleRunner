"""地形种子 + 天气生成 — 大陆级坐标 (1单位=1米)"""
import json
from db.database import Database

# 原点(0,0,0) = 光辉城冒险者公会门口
# X+: 东, Z+: 南, Y+: 海拔

# 硬编码回退 — 当故事书未提供 terrain_seeds 时使用
TERRAIN_SEEDS = {
    "royal_plains": [
        # 王都平原全域: 约300km×250km
        {"x_min": -160000, "x_max": 160000, "y_min": 0, "y_max": 0, "z_min": -140000, "z_max": 140000, "terrain": "平原", "desc": "广袤的王都平原，河流纵横，农田遍布。大陆唯一的人口稠密区"},
        # 光辉城: ~25km直径
        {"x_min": -12000, "x_max": 12000, "y_min": 0, "y_max": 200, "z_min": -10000, "z_max": 10000, "terrain": "都城", "desc": "光辉城——大陆最大的都市，冒险者公会总部坐落于此"},
        # 12个出生村庄 (间距10-40km不等)
        {"x_min": -14000, "x_max": -10000, "y_min": 0, "y_max": 0, "z_min": -14000, "z_max": -10000, "terrain": "村庄", "desc": "朝露村——距光辉城最近的城郊农庄，各色冒险者的起点"},
        {"x_min": -40000, "x_max": -36000, "y_min": 0, "y_max": 0, "z_min": -50000, "z_max": -46000, "terrain": "农田村", "desc": "麦穗村——大陆粮仓，麦田无际"},
        {"x_min": 50000, "x_max": 54000, "y_min": 0, "y_max": 0, "z_min": 45000, "z_max": 49000, "terrain": "商镇", "desc": "石板镇——商业中转枢纽，旅店与仓库林立"},
        {"x_min": -90000, "x_max": -86000, "y_min": 0, "y_max": 0, "z_min": 15000, "z_max": 19000, "terrain": "林边村", "desc": "溪木村——林边村落，木材和草药采集"},
        {"x_min": -5000, "x_max": -1000, "y_min": 0, "y_max": 0, "z_min": 70000, "z_max": 74000, "terrain": "牧场村", "desc": "铁蹄村——养马业中心"},
        {"x_min": 100000, "x_max": 104000, "y_min": 0, "y_max": 0, "z_min": -80000, "z_max": -76000, "terrain": "采石村", "desc": "灰石村——采石场村落"},
        {"x_min": 80000, "x_max": 84000, "y_min": 0, "y_max": 0, "z_min": 110000, "z_max": 114000, "terrain": "湖畔村", "desc": "盐湖村——盐矿湖畔，制盐业为生"},
        {"x_min": -70000, "x_max": -66000, "y_min": 0, "y_max": 0, "z_min": 85000, "z_max": 89000, "terrain": "河畔村", "desc": "磨坊渡——河畔水力磨坊，交通要道"},
        {"x_min": 10000, "x_max": 14000, "y_min": 0, "y_max": 0, "z_min": -120000, "z_max": -116000, "terrain": "林场村", "desc": "赤松镇——赤松木产地"},
        {"x_min": -135000, "x_max": -131000, "y_min": 0, "y_max": 0, "z_min": -100000, "z_max": -96000, "terrain": "山脚村", "desc": "山麓村——靠近铁脊山脉山脚"},
        {"x_min": -155000, "x_max": -151000, "y_min": 0, "y_max": 0, "z_min": 25000, "z_max": 29000, "terrain": "花田村", "desc": "绿野村——平原西端，花卉和养蜂业"},
        {"x_min": 70000, "x_max": 74000, "y_min": 0, "y_max": 0, "z_min": -15000, "z_max": -11000, "terrain": "关隘镇", "desc": "古道口——南北贸易咽喉关卡"},
    ],
    "emerald_forest": [
        {"x_min": 160000, "x_max": 600000, "y_min": 0, "y_max": 600, "z_min": -300000, "z_max": 300000, "terrain": "原始森林", "desc": "巨型古树与萤光蘑菇林覆盖的远古森林"},
        {"x_min": 300000, "x_max": 320000, "y_min": 300, "y_max": 400, "z_min": -20000, "z_max": 20000, "terrain": "树冠城市", "desc": "苍翠之都——建在巨树上的森林之城"},
        {"x_min": 200000, "x_max": 210000, "y_min": 0, "y_max": 0, "z_min": 100000, "z_max": 110000, "terrain": "迷雾沼泽", "desc": "沉没神殿所在的危险沼泽"},
    ],
    "silver_desert": [
        {"x_min": -200000, "x_max": 200000, "y_min": -10, "y_max": 0, "z_min": 150000, "z_max": 600000, "terrain": "沙漠", "desc": "无尽沙丘与岩山峡谷"},
        {"x_min": 50000, "x_max": 70000, "y_min": 0, "y_max": 0, "z_min": 200000, "z_max": 210000, "terrain": "绿洲城市", "desc": "金沙城——香料与宝石的集散地"},
        {"x_min": -80000, "x_max": -60000, "y_min": -50, "y_max": 0, "z_min": 350000, "z_max": 370000, "terrain": "地下暗河", "desc": "古代暗河网络连接的都市遗迹"},
    ],
    "iron_spine_mountains": [
        {"x_min": -600000, "x_max": -160000, "y_min": 500, "y_max": 5000, "z_min": -400000, "z_max": 400000, "terrain": "山脉", "desc": "连绵高耸的铁脊山脉，活火山与冰封山巅"},
        {"x_min": -350000, "x_max": -330000, "y_min": 2500, "y_max": 3000, "z_min": -20000, "z_max": 20000, "terrain": "火山都市", "desc": "炉心城——建在火山口上的锻冶之都"},
        {"x_min": -450000, "x_max": -430000, "y_min": 800, "y_max": 1000, "z_min": -150000, "z_max": -140000, "terrain": "矿道", "desc": "矿锤村——破魔铁的产地"},
    ],
    "azure_islands": [
        {"x_min": 100000, "x_max": 800000, "y_min": -5, "y_max": 5, "z_min": 200000, "z_max": 800000, "terrain": "海洋群岛", "desc": "数百座大小岛屿，珊瑚礁与海底洞穴"},
        {"x_min": 250000, "x_max": 270000, "y_min": 0, "y_max": 0, "z_min": 250000, "z_max": 260000, "terrain": "港口都市", "desc": "潮汐港——大陆最大的港口"},
        {"x_min": 400000, "x_max": 420000, "y_min": 0, "y_max": 0, "z_min": 500000, "z_max": 520000, "terrain": "风暴海域", "desc": "漩涡神殿所在的危险海域"},
    ],
    "northern_ice": [
        {"x_min": -500000, "x_max": 500000, "y_min": 1000, "y_max": 5000, "z_min": -400000, "z_max": -150000, "terrain": "冰原", "desc": "永冻冰原，冰川裂谷，极光天际"},
        {"x_min": -15000, "x_max": 15000, "y_min": 2500, "y_max": 2800, "z_min": -280000, "z_max": -260000, "terrain": "要塞", "desc": "霜脊堡——冰川上的巨石要塞"},
        {"x_min": -120000, "x_max": -100000, "y_min": 3200, "y_max": 3400, "z_min": -350000, "z_max": -340000, "terrain": "地热温泉", "desc": "温泉谷——北境唯一的温暖之地"},
    ],
    "obsidian_throne": [
        {"x_min": 200000, "x_max": 800000, "y_min": 0, "y_max": 0, "z_min": -500000, "z_max": 500000, "terrain": "焦土", "desc": "被魔气污染的荒原，扭曲森林，黑曜石尖塔"},
        {"x_min": 350000, "x_max": 380000, "y_min": 0, "y_max": 800, "z_min": -30000, "z_max": 30000, "terrain": "魔王城堡", "desc": "黑曜石王座——魔王阿尔德里克的要塞。通天塔入口"},
        {"x_min": 250000, "x_max": 270000, "y_min": -100, "y_max": 0, "z_min": 300000, "z_max": 320000, "terrain": "深渊裂隙", "desc": "魔物涌出世界的裂缝"},
    ],
}

WEATHER_PATTERNS = {
    "royal_plains": ["晴朗温暖", "阵雨", "薄雾", "多云", "雷暴"],
    "emerald_forest": ["薄雾", "细雨", "阳光穿透树冠", "浓雾"],
    "silver_desert": ["酷热", "沙暴", "寒冷夜空", "罕见的小雨"],
    "iron_spine_mountains": ["山脚温暖", "山腰大风", "火山灰雨", "山顶暴雪"],
    "azure_islands": ["晴朗海风", "热带暴雨", "台风", "海雾"],
    "northern_ice": ["极寒", "暴风雪", "极光之夜", "短暂白昼"],
    "obsidian_throne": ["暗紫云层", "腐蚀性魔雨", "魔力闪电", "死寂"],
}


async def _get_terrain_seeds(db: Database) -> dict:
    """Try loading terrain_seeds from storybook, fall back to hardcoded"""
    try:
        row = await db.fetch_one("SELECT value FROM world_meta WHERE key='storybook_data'")
        if row:
            sb = json.loads(row["value"])
            seeds = sb.get("terrain_seeds")
            if seeds and isinstance(seeds, list) and len(seeds) > 0:
                # Convert list format to dict format
                result: dict = {}
                for s in seeds:
                    region = s["region"]
                    if region not in result:
                        result[region] = []
                    result[region].append({
                        "x_min": s["x_min"], "x_max": s["x_max"],
                        "y_min": s["y_min"], "y_max": s["y_max"],
                        "z_min": s["z_min"], "z_max": s["z_max"],
                        "terrain": s["terrain_type"],
                        "desc": s["description"],
                    })
                return result
    except Exception:
        pass
    return TERRAIN_SEEDS


async def seed_terrain(db: Database) -> int:
    count = 0
    seeds = await _get_terrain_seeds(db)
    for region, grids in seeds.items():
        for g in grids:
            await db.execute(
                "INSERT OR IGNORE INTO terrain_grid (region,x_min,x_max,y_min,y_max,z_min,z_max,terrain_type,description,discovered_at_world_day) VALUES (?,?,?,?,?,?,?,?,?,1)",
                (region, g["x_min"], g["x_max"], g["y_min"], g["y_max"], g["z_min"], g["z_max"], g["terrain"], g["desc"]))
            count += 1
    return count


async def seed_daily_weather(db: Database, world_day: int, region: str) -> str:
    patterns = WEATHER_PATTERNS.get(region, ["晴朗"])
    idx = (world_day * 7 + hash(region)) % len(patterns)
    weather = patterns[abs(idx)]
    await db.execute(
        "INSERT OR REPLACE INTO daily_weather (region, world_day, weather, temperature, wind) VALUES (?, ?, ?, ?, ?)",
        (region, world_day, weather, "适中", "微风"))
    return weather


async def get_weather(db: Database, region: str, world_day: int) -> str:
    row = await db.fetch_one("SELECT weather FROM daily_weather WHERE region=? AND world_day=?", (region, world_day))
    if row: return row["weather"]
    return await seed_daily_weather(db, world_day, region)


async def get_terrain(db: Database, region: str, x: int, y: int, z: int) -> dict | None:
    rows = await db.fetch_all(
        "SELECT *, ((x_max-x_min)+(y_max-y_min)+(z_max-z_min)) AS area FROM terrain_grid WHERE region=? AND x_min<=? AND x_max>=? AND y_min<=? AND y_max>=? AND z_min<=? AND z_max>=? ORDER BY area ASC LIMIT 1",
        (region, x, x, y, y, z, z))
    if rows:
        r = dict(rows[0])
        return {"terrain_type": r["terrain_type"], "description": r["description"]}
    return {"terrain_type": "未知", "description": f"{region}的未知区域"}


async def register_location(db: Database, region: str, x: int, y: int, z: int, terrain_type: str, description: str, world_day: int = 1) -> None:
    await db.execute(
        "INSERT OR IGNORE INTO terrain_grid (region,x_min,x_max,y_min,y_max,z_min,z_max,terrain_type,description,discovered_at_world_day) VALUES (?,?,?,?,?,?,?,?,?,?)",
        (region, x, x + 500, y, y, z, z + 500, terrain_type, description, world_day))


async def get_all_terrain(db: Database, region: str | None = None, world_day: int | None = None) -> list[dict]:
    sql = "SELECT * FROM terrain_grid WHERE 1=1"
    params = []
    if region:
        sql += " AND region=?"; params.append(region)
    if world_day is not None:
        sql += " AND discovered_at_world_day <= ?"; params.append(world_day)
    rows = await db.fetch_all(sql, tuple(params))
    return [dict(r) for r in rows]


# ---- 水域种子 ----
WATER_SEEDS = [
    {"id": "ocean_west", "type": "ocean", "name": "无尽之海", "region": "", "path": "[[-800000,-600000],[-800000,600000],[-500000,600000],[-500000,-600000]]"},
    {"id": "ocean_east", "type": "ocean", "name": "迷雾之洋", "region": "", "path": "[[500000,-600000],[500000,600000],[800000,600000],[800000,-600000]]"},
    {"id": "ocean_south", "type": "ocean", "name": "南海", "region": "", "path": "[[-800000,400000],[800000,400000],[800000,600000],[-800000,600000]]"},
    {"id": "lake_moon", "type": "lake", "name": "月光湖", "region": "emerald_forest", "path": "[[320000,280000],[350000,280000],[350000,300000],[320000,300000]]"},
    {"id": "river_silver", "type": "river", "name": "银带河", "region": "royal_plains", "path": "[[-100000,-50000],[0,-10000],[30000,30000],[80000,80000]]"},
    {"id": "sea_azure", "type": "ocean", "name": "苍海", "region": "azure_islands", "path": "[[100000,200000],[800000,200000],[800000,800000],[100000,800000]]"},
    {"id": "lake_glacier", "type": "lake", "name": "冰川湖", "region": "northern_ice", "path": "[[-100000,-320000],[-60000,-320000],[-60000,-300000],[-100000,-300000]]"},
    {"id": "river_mountain", "type": "river", "name": "铁脊河", "region": "iron_spine_mountains", "path": "[[-400000,-100000],[-350000,-50000],[-300000,0],[-200000,50000]]"},
]

ROAD_SEEDS = [
    {"id": "road_king", "name": "王都大道", "region": "royal_plains", "from": "光辉城", "to": "古道口", "path": "[[0,0],[30000,5000],[50000,8000],[72000,-12000]]", "type": "major"},
    {"id": "road_south", "name": "南向商路", "region": "royal_plains", "from": "古道口", "to": "金沙城", "path": "[[72000,-12000],[80000,50000],[60000,200000]]", "type": "major"},
    {"id": "road_east", "name": "东向林道", "region": "royal_plains", "from": "光辉城", "to": "苍翠之都", "path": "[[0,0],[80000,20000],[160000,50000],[310000,0]]", "type": "major"},
    {"id": "road_west", "name": "西向山路", "region": "iron_spine_mountains", "from": "光辉城", "to": "炉心城", "path": "[[0,0],[-80000,10000],[-160000,20000],[-340000,0]]", "type": "major"},
    {"id": "road_north", "name": "北向冰道", "region": "northern_ice", "from": "光辉城", "to": "霜脊堡", "path": "[[0,0],[-10000,-80000],[-5000,-150000],[0,-270000]]", "type": "major"},
    {"id": "road_village_1", "name": "石板镇支路", "region": "royal_plains", "from": "石板镇", "to": "盐湖村", "path": "[[52000,47000],[60000,80000],[82000,112000]]", "type": "minor"},
    {"id": "road_village_2", "name": "山村小路", "region": "royal_plains", "from": "绿野村", "to": "山麓村", "path": "[[-153000,27000],[-143000,10000],[-133000,-98000]]", "type": "minor"},
]


async def seed_waters(db: Database) -> int:
    """从故事书 water_seeds 加载水域，回退硬编码种子"""
    count = 0
    seeds = WATER_SEEDS

    # Try storybook first (P2.7)
    sb_raw = await db.fetch_one("SELECT value FROM world_meta WHERE key='storybook_data'")
    if sb_raw:
        sb = json.loads(sb_raw["value"])
        sb_seeds = sb.get("water_seeds") or sb.get("waterSeeds")
        if sb_seeds:
            seeds = sb_seeds

    for w in seeds:
        path = w["path"] if isinstance(w["path"], list) else json.loads(w["path"])
        await db.execute("INSERT OR IGNORE INTO water_bodies (id, type, name, region, path) VALUES (?,?,?,?,?)",
                         (w["id"], w["type"], w["name"], w.get("region", ""), json.dumps(path)))
        count += 1
    return count


async def seed_roads(db: Database) -> int:
    """从故事书 road_seeds 加载道路，回退硬编码种子"""
    count = 0
    seeds = ROAD_SEEDS

    # Try storybook first (P2.7)
    sb_raw = await db.fetch_one("SELECT value FROM world_meta WHERE key='storybook_data'")
    if sb_raw:
        sb = json.loads(sb_raw["value"])
        sb_seeds = sb.get("road_seeds") or sb.get("roadSeeds")
        if sb_seeds:
            seeds = sb_seeds

    for r in seeds:
        path = r["path"] if isinstance(r["path"], list) else json.loads(r["path"])
        await db.execute("INSERT OR IGNORE INTO roads (id, name, region, from_loc, to_loc, path, road_type) VALUES (?,?,?,?,?,?,?)",
                         (r["id"], r["name"], r.get("region", ""), r.get("from", ""), r.get("to", ""), json.dumps(path), r.get("type", "minor")))
        count += 1
    return count


async def get_waters(db: Database) -> list[dict]:
    rows = await db.fetch_all("SELECT * FROM water_bodies")
    return [{"id": r["id"], "type": r["type"], "name": r["name"], "region": r["region"], "path": json.loads(r["path"])} for r in rows]


async def get_roads(db: Database) -> list[dict]:
    rows = await db.fetch_all("SELECT * FROM roads")
    return [{"id": r["id"], "name": r["name"], "region": r["region"], "from": r["from_loc"], "to": r["to_loc"], "path": json.loads(r["path"]), "type": r["road_type"]} for r in rows]
