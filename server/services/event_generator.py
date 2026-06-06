"""事件模板生成器 — 基于区域设定和故事线程序化生成事件"""
import json
from db.database import Database


async def generate_event_templates(db: Database) -> int:
    """从storybook数据生成事件模板。已存在的模板会被跳过。"""

    sb_raw = await db.fetch_one("SELECT value FROM world_meta WHERE key='storybook_data'")
    if not sb_raw:
        return 0
    sb = json.loads(sb_raw["value"])
    regions = sb.get("regions", [])

    existing = await db.fetch_all("SELECT id FROM event_templates")
    existing_ids = {r["id"] for r in existing}
    count = 0

    # Major events — 主线重大节点
    major_events = [
        {"id": "evt_major_01", "name": "魔物目击急剧增多", "level": "Major", "region": "royal_plains",
         "description": "各区域冒险者公会接到大量魔物袭击报告", "impact": 20,
         "trigger": {"world_day_min": 30, "player_in_region": True}},
        {"id": "evt_major_02", "name": "魔王的战争宣言", "level": "Major", "region": "obsidian_throne",
         "description": "阿尔德里克通过魔力投影向人类宣战", "impact": 30,
         "trigger": {"events_completed": ["evt_major_01"]}},
        {"id": "evt_major_03", "name": "四魔将降临", "level": "Major",
         "description": "魔将各自率军进攻人类区域", "impact": 40, "region": "",
         "trigger": {"events_completed": ["evt_major_02"], "world_day_min": 60}},
        {"id": "evt_major_04", "name": "黑曜石总攻", "level": "Major", "region": "obsidian_throne",
         "description": "人类联合军进攻魔王领地", "impact": 50,
         "trigger": {"events_completed": ["evt_major_03"]}},
        {"id": "evt_major_05", "name": "通天塔之门", "level": "Major", "region": "obsidian_throne",
         "description": "魔王被击败，通天塔入口显现", "impact": 100,
         "trigger": {"events_completed": ["evt_major_04"]}},
    ]

    for evt in major_events:
        if evt["id"] in existing_ids: continue
        await db.execute(
            "INSERT INTO event_templates (id,name,level,region,description,template_narrative,trigger_conditions,causal_parents,impact_on_main,status) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (evt["id"], evt["name"], evt["level"], evt["region"], evt["description"],
             evt["description"], json.dumps(evt["trigger"]), json.dumps([]), evt["impact"], "locked"))
        count += 1

    # Generate events from storybook.main_quest.beats (P2.6)
    beats = sb.get("main_quest", {}).get("beats", [])
    for beat in beats:
        beat_id = f"evt_beat_{beat.get('id', '')}"
        if beat_id in existing_ids: continue
        trigger = {}
        if beat.get("unlock_condition"):
            trigger["condition_text"] = beat["unlock_condition"]
        if beat.get("depends_on"):
            trigger["events_completed"] = [f"evt_beat_{beat['depends_on']}"]
        await db.execute(
            "INSERT INTO event_templates (id,name,level,region,description,template_narrative,trigger_conditions,causal_parents,impact_on_main,status) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (beat_id, beat.get("name", ""), "Major", "",
             beat.get("narrative_when_unlocked", beat.get("description", "")),
             beat.get("narrative_when_unlocked", beat.get("description", "")),
             json.dumps(trigger), json.dumps([]), 15,
             "locked" if beat.get("depends_on") else "available"))
        count += 1

    # Mid + Early events per region (程序生成)
    for region in regions:
        rid = region.get("id", "")
        rname = region.get("name", rid)

        # 每个区域的基础事件模板
        mid_events = [
            ("evt_mid_{}_01", "Mid", f"{rname}的异常报告", f"{rname}出现异常现象，引起当地NPC的注意"),
            ("evt_mid_{}_02", "Mid", f"{rname}的势力冲突", f"{rname}内部势力之间发生紧张事件"),
        ]
        early_events = [
            ("evt_early_{}_01", "Early", f"探索{rname}的秘密", f"在{rname}发现了不寻常的线索"),
            ("evt_early_{}_02", "Early", f"{rname}的传闻", f"在{rname}听到了一个值得追查的传闻"),
            ("evt_early_{}_03", "Early", f"{rname}的遭遇", f"在{rname}遭遇了一次意外"),
        ]
        minor_events = [
            ("evt_minor_{}_01", "Minor", f"{rname}的天气突变", f"{rname}天气突然变化，影响了冒险"),
            ("evt_minor_{}_02", "Minor", f"{rname}的路人求助", f"{rname}一位路人向玩家求助"),
        ]

        for evt_id_suffix, level, name, desc in mid_events + early_events + minor_events:
            evt_id = evt_id_suffix.format(rid)
            if evt_id in existing_ids: continue
            await db.execute(
                "INSERT INTO event_templates (id,name,level,region,description,template_narrative,trigger_conditions,causal_parents,impact_on_main,status) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (evt_id, name, level, rid, desc, desc,
                 json.dumps({"player_in_region": True, "pm_adaptive": level == "Minor"}),
                 json.dumps([]), 1 if level == "Mid" else 0, "available" if level in ("Early","Minor") else "locked"))
            count += 1

    return count
