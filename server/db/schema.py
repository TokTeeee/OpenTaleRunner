"""DDL 建表"""

SCHEMA = """
CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS characters (
    id TEXT PRIMARY KEY, player_id TEXT NOT NULL REFERENCES players(id),
    data TEXT NOT NULL, region TEXT NOT NULL, world_day INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_char_player ON characters(player_id);
CREATE INDEX IF NOT EXISTS idx_char_region ON characters(region);

CREATE TABLE IF NOT EXISTS chronicle_entries (
    id TEXT PRIMARY KEY, player_id TEXT NOT NULL, character_name TEXT NOT NULL,
    world_day INTEGER NOT NULL, region TEXT NOT NULL, data TEXT NOT NULL,
    synced_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_chron_day ON chronicle_entries(world_day);
CREATE INDEX IF NOT EXISTS idx_chron_region ON chronicle_entries(region);

CREATE TABLE IF NOT EXISTS world_chronicle (
    id TEXT PRIMARY KEY, world_day INTEGER NOT NULL, region TEXT NOT NULL,
    title TEXT NOT NULL, narrative TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wc_day ON world_chronicle(world_day);

CREATE TABLE IF NOT EXISTS world_state (
    region_id TEXT PRIMARY KEY, weather TEXT DEFAULT '晴朗',
    current_events TEXT DEFAULT '[]', faction_data TEXT DEFAULT '{}',
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS world_meta (
    key TEXT PRIMARY KEY, value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS npc_registry (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, region TEXT NOT NULL,
    data TEXT NOT NULL, source TEXT DEFAULT 'client_created',
    owner_player_id TEXT, promoted INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_npc_region ON npc_registry(region);

CREATE TABLE IF NOT EXISTS npc_relationships (
    npc_id TEXT NOT NULL REFERENCES npc_registry(id),
    player_id TEXT NOT NULL REFERENCES players(id),
    attitude INTEGER DEFAULT 0, level TEXT DEFAULT 'stranger',
    first_met TEXT, interaction_count INTEGER DEFAULT 0,
    history TEXT DEFAULT '[]', player_knows TEXT DEFAULT '[]',
    PRIMARY KEY (npc_id, player_id)
);

CREATE TABLE IF NOT EXISTS encounters (
    id TEXT PRIMARY KEY, type TEXT NOT NULL,
    involved_players TEXT DEFAULT '[]', region TEXT NOT NULL,
    description TEXT DEFAULT '', resolved INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ghost_npcs (
    id TEXT PRIMARY KEY, player_id TEXT NOT NULL, character_name TEXT NOT NULL,
    appearance TEXT DEFAULT '', personality_tags TEXT DEFAULT '[]',
    recent_actions TEXT DEFAULT '', current_intent TEXT DEFAULT '',
    attitude_to_strangers TEXT DEFAULT '谨慎', known_info TEXT DEFAULT '[]',
    region TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ghost_region ON ghost_npcs(region);

CREATE TABLE IF NOT EXISTS milestones (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT DEFAULT 'locked',
    contribution INTEGER DEFAULT 0, unlocked_at TEXT
);

-- 事件模板 (服务端程序生成)
CREATE TABLE IF NOT EXISTS event_templates (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, level TEXT NOT NULL,
    region TEXT NOT NULL, description TEXT, template_narrative TEXT,
    trigger_conditions TEXT DEFAULT '{}', causal_parents TEXT DEFAULT '[]',
    causal_children TEXT DEFAULT '[]', impact_on_main INTEGER DEFAULT 0,
    status TEXT DEFAULT 'locked', created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_evt_region ON event_templates(region);
CREATE INDEX IF NOT EXISTS idx_evt_level ON event_templates(level);

-- 事件实例 (玩家触发后的实际事件)
CREATE TABLE IF NOT EXISTS event_instances (
    id TEXT PRIMARY KEY, template_id TEXT NOT NULL,
    discovered_by TEXT NOT NULL, status TEXT DEFAULT 'discovered',
    plan_description TEXT DEFAULT '', progress_narrative TEXT DEFAULT '',
    actual_narrative TEXT DEFAULT '', participants TEXT DEFAULT '[]',
    started_at TEXT DEFAULT (datetime('now')), completed_at TEXT,
    FOREIGN KEY (template_id) REFERENCES event_templates(id)
);
CREATE INDEX IF NOT EXISTS idx_evti_template ON event_instances(template_id);

-- 玩家活动追踪
CREATE TABLE IF NOT EXISTS player_activity (
    player_id TEXT PRIMARY KEY, character_name TEXT NOT NULL,
    region TEXT NOT NULL, sub_region TEXT DEFAULT '',
    coordinates TEXT DEFAULT '{"x":0,"y":0,"z":0}',
    world_day INTEGER DEFAULT 1, last_active TEXT DEFAULT (datetime('now'))
);
-- 补充活动追踪列 (SQLite ALTER兼容)
ALTER TABLE player_activity ADD COLUMN entity_type TEXT DEFAULT 'player';
ALTER TABLE player_activity ADD COLUMN current_action TEXT DEFAULT '';
ALTER TABLE player_activity ADD COLUMN action_type TEXT DEFAULT 'idle';
ALTER TABLE player_activity ADD COLUMN action_started_at TEXT;
ALTER TABLE player_activity ADD COLUMN is_online INTEGER DEFAULT 0;
ALTER TABLE player_activity ADD COLUMN status_data TEXT DEFAULT '{}';

-- 活动历史记录表
CREATE TABLE IF NOT EXISTS activity_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_id TEXT NOT NULL,
    entity_name TEXT DEFAULT '',
    action_summary TEXT NOT NULL,
    action_type TEXT DEFAULT 'idle',
    location_json TEXT DEFAULT '{}',
    started_at TEXT NOT NULL,
    ended_at TEXT,
    world_day INTEGER DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_ah_entity ON activity_history(entity_id);
CREATE INDEX IF NOT EXISTS idx_ah_time ON activity_history(started_at);

-- PR-1: 物品世界注册表 — 物品成为一等公民, 脱手/转手/销毁全程可追溯
CREATE TABLE IF NOT EXISTS item_registry (
    id TEXT PRIMARY KEY,                       -- itemId
    name TEXT NOT NULL,
    data TEXT NOT NULL,                        -- JSON blob (完整 WorldItem)
    holder_kind TEXT,                          -- character/npc/party/container/world/null(已销毁)
    holder_ref_id TEXT,                        -- 持有者 ID, null 表示 world 游离
    region TEXT,                               -- spawnInfo.region, 用于跨玩家查找
    player_id TEXT,                            -- 物品的可访问玩家 (创建者/当前持有者)
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_item_holder ON item_registry(holder_kind, holder_ref_id);
CREATE INDEX IF NOT EXISTS idx_item_player ON item_registry(player_id);
CREATE INDEX IF NOT EXISTS idx_item_region ON item_registry(region);

-- 地形网格
CREATE TABLE IF NOT EXISTS terrain_grid (
    region TEXT NOT NULL, x_min INTEGER NOT NULL, x_max INTEGER NOT NULL,
    y_min INTEGER NOT NULL, y_max INTEGER NOT NULL,
    z_min INTEGER NOT NULL, z_max INTEGER NOT NULL,
    terrain_type TEXT NOT NULL, description TEXT DEFAULT '',
    PRIMARY KEY (region, x_min, y_min, z_min)
);
-- 补充发现时间列 (SQLite ALTER兼容)
ALTER TABLE terrain_grid ADD COLUMN discovered_at_world_day INTEGER DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_terrain_region ON terrain_grid(region);

-- 每日天气
CREATE TABLE IF NOT EXISTS daily_weather (
    region TEXT NOT NULL, world_day INTEGER NOT NULL,
    weather TEXT NOT NULL, temperature TEXT DEFAULT '', wind TEXT DEFAULT '',
    PRIMARY KEY (region, world_day)
);

-- 水域 (海洋/湖泊/河流)
CREATE TABLE IF NOT EXISTS water_bodies (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, name TEXT NOT NULL,
    region TEXT DEFAULT '', path TEXT NOT NULL
);

-- 道路
CREATE TABLE IF NOT EXISTS roads (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, region TEXT DEFAULT '',
    from_loc TEXT DEFAULT '', to_loc TEXT DEFAULT '',
    path TEXT NOT NULL, road_type TEXT DEFAULT 'major'
);

-- 多人房间表（纯运行时状态，存档由房主本地存储）
CREATE TABLE IF NOT EXISTS multiplayer_rooms (
    room_id TEXT PRIMARY KEY,
    host_player_id TEXT NOT NULL REFERENCES players(id),
    mode TEXT NOT NULL DEFAULT 'new',
    config_json TEXT NOT NULL DEFAULT '{}',
    state_json TEXT DEFAULT '{"phase":"waiting","world_day":1,"current_round":0,"players_acted":[],"location":null}',
    current_round_actions_json TEXT DEFAULT '{}',
    current_round_dice_results_json TEXT DEFAULT '{}',
    last_round_result_json TEXT DEFAULT '{}',
    narrative_history_json TEXT DEFAULT '[]',
    character_slots_json TEXT DEFAULT '[]',
    player_characters_json TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now')),
    started_at TEXT,
    ended_at TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mp_room_host ON multiplayer_rooms(host_player_id);

ALTER TABLE multiplayer_rooms ADD COLUMN last_round_result_json TEXT DEFAULT '{}';
ALTER TABLE multiplayer_rooms ADD COLUMN narrative_history_json TEXT DEFAULT '[]';
ALTER TABLE multiplayer_rooms ADD COLUMN room_notifications_json TEXT DEFAULT '[]';

-- 单人实时同步会话表
CREATE TABLE IF NOT EXISTS player_realtime_sessions (
    player_id TEXT PRIMARY KEY REFERENCES players(id),
    character_name TEXT NOT NULL DEFAULT '',
    region TEXT NOT NULL DEFAULT '',
    sub_region TEXT DEFAULT '',
    coordinates TEXT DEFAULT '{"x":0,"y":0,"z":0}',
    world_day INTEGER DEFAULT 1,
    current_action TEXT DEFAULT '',
    status TEXT DEFAULT 'idle',
    is_online INTEGER DEFAULT 1,
    last_heartbeat TEXT DEFAULT (datetime('now')),
    started_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_prs_region ON player_realtime_sessions(region);

-- 房间玩家会话表
CREATE TABLE IF NOT EXISTS room_player_sessions (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES multiplayer_rooms(room_id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id),
    player_name TEXT DEFAULT '',
    character_id TEXT,
    character_name TEXT,
    character_background TEXT,
    is_host INTEGER DEFAULT 0,
    is_ready INTEGER DEFAULT 0,
    is_online INTEGER DEFAULT 1,
    status TEXT DEFAULT 'waiting',
    slot_id TEXT,
    joined_at_round INTEGER DEFAULT 0,
    last_heartbeat TEXT DEFAULT (datetime('now')),
    joined_at TEXT DEFAULT (datetime('now')),
    UNIQUE(room_id, player_id)
);
CREATE INDEX IF NOT EXISTS idx_rmp_room ON room_player_sessions(room_id);
CREATE INDEX IF NOT EXISTS idx_rmp_player ON room_player_sessions(player_id);
"""
