"""多人联机模型 — Room / RoomConfig / PlayerSession / CharacterSlot 等"""

from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime


# ─── 房间配置 ───

class RoomConfig(BaseModel):
    """房间配置参数（房主创建时设定，游戏开始后不可修改）"""

    # 基本设置
    room_name: str = Field(default="冒险小队", min_length=1, max_length=30)
    max_players: int = Field(default=4, ge=1, le=10)
    password: Optional[str] = None  # 可选房间密码，空=公开房间

    # 故事设置
    storybook_id: Optional[str] = None  # None=使用服务器默认故事书
    starting_region: Optional[str] = None  # None=由GM决定
    narrative_style: str = "detailed"  # concise | detailed | epic | humorous
    narrative_language: str = "zh"  # zh | en | auto

    # 游戏规则
    difficulty_modifier: int = Field(default=0, ge=-5, le=5)
    allow_npc_recruitment: bool = True
    enable_fast_travel: bool = True
    death_penalty: str = "soft"  # permanent | soft | narrative_only
    rest_recovery_multiplier: float = Field(default=1.0, ge=0.5, le=2.0)

    # 行动轮规则
    action_round_timeout: int = Field(default=300, ge=60, le=600)
    auto_skip_on_timeout: bool = True
    allow_skip_action: bool = True

    # 房间管理
    allow_late_join: bool = True
    late_join_intro_delay: int = Field(default=2, ge=1, le=5)
    allow_spectators: bool = False


# ─── 玩家会话 ───

class PlayerSession(BaseModel):
    """房间中的玩家会话"""
    player_id: str
    player_name: str = ""
    character_id: Optional[str] = None
    character_name: Optional[str] = None
    character_background: Optional[str] = None  # GM引入用
    is_host: bool = False
    is_ready: bool = False
    is_online: bool = True
    last_heartbeat: str = Field(default_factory=lambda: datetime.now().isoformat())
    status: str = "waiting"  # waiting | creating_character | ready | in_game | spectating | pending_intro | disconnected
    slot_id: Optional[str] = None  # inherit模式关联的角色槽
    joined_at_round: int = 0  # 加入时的轮数


# ─── 角色槽（继承存档模式） ───

class CharacterSlot(BaseModel):
    """继承存档时的角色槽（只读，等待玩家认领）"""
    slot_id: str
    character_id: str
    character_name: str
    character_summary: str = ""  # "人类战士 Lv.3"
    claimed_by_player_id: Optional[str] = None


# ─── 房间状态 ───

class RoomState(BaseModel):
    """房间的游戏状态"""
    phase: str = "waiting"  # waiting | preparing | playing | ended
    world_day: int = 1
    current_round: int = 0
    location: Optional[Dict[str, Any]] = None
    players_acted: List[str] = []
    round_start_time: Optional[str] = None
    common_backstory: Optional[str] = None  # GM生成的统一起始故事


# ─── 房间 ───

class Room(BaseModel):
    """多人房间"""
    room_id: str
    host_player_id: str
    config: RoomConfig
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    started_at: Optional[str] = None
    ended_at: Optional[str] = None

    players: List[PlayerSession] = []
    state: RoomState = Field(default_factory=RoomState)
    mode: str = "new"  # new | inherit
    character_slots: List[CharacterSlot] = []

    current_round_actions: Dict[str, str] = {}
    current_round_dice_results: Dict[str, Any] = {}
    last_round_result: Optional[Dict[str, Any]] = None
    narrative_history: List[Dict[str, Any]] = []
    room_notifications: List[Dict[str, Any]] = []


# ─── 请求/响应模型 ───

class CreateRoomRequest(BaseModel):
    mode: str = "new"  # new | inherit
    config: RoomConfig
    inherit_data: Optional[Dict[str, Any]] = None


class JoinRoomRequest(BaseModel):
    password: Optional[str] = None
    claimed_slot_id: Optional[str] = None  # inherit模式指定认领的角色槽


class ClaimSlotRequest(BaseModel):
    slot_id: str


class CharacterReadyRequest(BaseModel):
    character_id: str
    character_name: str
    character_data: Optional[Dict[str, Any]] = None
    character_background: Optional[str] = None


class StartGameRequest(BaseModel):
    starting_location: Optional[Dict[str, Any]] = None
    common_backstory_narrative: Optional[str] = None


class SubmitActionRequest(BaseModel):
    action: str = Field(min_length=1, max_length=2000)
    dice_result: Optional[Dict[str, Any]] = None


class RoomResponse(BaseModel):
    room_id: str
    host_player_id: str
    config: RoomConfig
    mode: str
    created_at: str
    started_at: Optional[str] = None
    state: RoomState
    players: List[PlayerSession]
    character_slots: List[CharacterSlot] = []


class RoundStatusResponse(BaseModel):
    current_round: int
    players_acted: List[str]
    pending_players: List[str]
    actions: Dict[str, str]
    dice_results: Dict[str, Any] = {}
    round_start_time: Optional[str] = None
    timeout_at: Optional[str] = None
    latest_round_result: Optional[Dict[str, Any]] = None


class RoundProcessResponse(BaseModel):
    round: int
    player_actions: Dict[str, str]
    dice_results: Dict[str, Any] = {}
    conflicts: List[Dict[str, Any]] = []
    narrative: str
    consequences: Dict[str, Any] = {}
    world_state_changes: Dict[str, Any] = {}
    introduced_players: List[Dict[str, Any]] = []
    next_round: int


class SaveResponse(BaseModel):
    """房主请求存档时，服务器返回的打包数据"""
    archive_id: str
    archive_name: str
    created_at: str
    world_day: int
    current_round: int
    location: Optional[Dict[str, Any]] = None
    player_characters: Dict[str, Any] = {}
    shared_world_state: Optional[Dict[str, Any]] = None
    chronicle_entries: List[Dict[str, Any]] = []
    player_list: List[Dict[str, Any]] = []


class CommonBackstoryResponse(BaseModel):
    common_backstory: str
    suggested_starting_location: Optional[Dict[str, Any]] = None
    individual_hooks: Dict[str, str] = {}


class NarrativeHistoryResponse(BaseModel):
    round: int
    narrative: str
    player_actions: Dict[str, str]
    dice_results: Dict[str, Any] = {}
    timestamp: str


class RoomNotification(BaseModel):
    event: str  # spectator_joined | character_created | player_introduced
    player_id: str
    player_name: str = ""
    character_name: str = ""
    character_background: str = ""
    round: int = 0
    narrative: str = ""
    timestamp: str = ""


class RoomNotificationsResponse(BaseModel):
    notifications: List[Dict[str, Any]] = []
