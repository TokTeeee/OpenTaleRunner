"""区域别名 — i18n 支持。优先从故事书构建，回退硬编码"""
import json

LANG = "zh-CN"

# 硬编码回退 — 当故事书不可用时使用
_REGION_ALIASES_FALLBACK = {
    "royal_plains": {"zh-CN": "王都平原", "en": "Royal Plains"},
    "emerald_forest": {"zh-CN": "翡翠古森", "en": "Emerald Forest"},
    "silver_desert": {"zh-CN": "银月沙漠", "en": "Silver Desert"},
    "iron_spine_mountains": {"zh-CN": "铁脊山脉", "en": "Iron Spine Mountains"},
    "azure_islands": {"zh-CN": "苍海列岛", "en": "Azure Islands"},
    "northern_ice": {"zh-CN": "北境冰原", "en": "Northern Ice"},
    "obsidian_throne": {"zh-CN": "黑曜石王座", "en": "Obsidian Throne"},
}

_TERRAIN_ALIASES_FALLBACK: dict = {}

# Runtime cache built from storybook
_region_aliases: dict | None = None
_terrain_aliases: dict | None = None


def init_from_storybook(storybook_data: dict) -> None:
    """从故事书数据构建别名表"""
    global _region_aliases, _terrain_aliases

    # Region aliases: regions[].{id, name}
    _region_aliases = {}
    for r in storybook_data.get("regions", []):
        rid = r.get("id", "")
        name = r.get("name", "")
        if rid and name:
            _region_aliases[rid] = {"zh-CN": name, "en": name}

    # Terrain aliases: location_types + terrain_seeds
    _terrain_aliases = {}
    lts = storybook_data.get("location_types", {})
    for category in lts.values():
        for st in category.get("subtypes", []):
            sid = st.get("id", "")
            label = st.get("label", "")
            if sid and label:
                _terrain_aliases[sid] = {"zh-CN": label, "en": label}

    # Also add terrain_seeds terrain_type values
    for seed in storybook_data.get("terrain_seeds", []):
        ttype = seed.get("terrain_type", "")
        if ttype and ttype not in _terrain_aliases:
            _terrain_aliases[ttype] = {"zh-CN": ttype, "en": ttype}

    # Add fallback entries for missing keys
    _terrain_aliases["地点"] = {"zh-CN": "地点", "en": "Location"}
    _terrain_aliases["未知"] = {"zh-CN": "未知", "en": "Unknown"}


def alias_region(key: str, lang: str = LANG) -> str:
    if _region_aliases:
        return _region_aliases.get(key, {}).get(lang, key)
    return _REGION_ALIASES_FALLBACK.get(key, {}).get(lang, key)


def alias_terrain(key: str, lang: str = LANG) -> str:
    if _terrain_aliases:
        return _terrain_aliases.get(key, {}).get(lang, key)
    return key


def get_all_region_aliases(lang: str = LANG) -> dict:
    src = _region_aliases if _region_aliases else _REGION_ALIASES_FALLBACK
    return {k: v.get(lang, k) for k, v in src.items()}


def get_all_terrain_aliases(lang: str = LANG) -> dict:
    src = _terrain_aliases if _terrain_aliases else {}
    return {k: v.get(lang, k) for k, v in src.items()}
