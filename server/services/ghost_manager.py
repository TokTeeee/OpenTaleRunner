"""幽灵NPC管理"""
import uuid, json, re
from datetime import datetime, timedelta
from repositories.encounter_repo import IGhostRepo
from config import settings

_PERSONALITY_PATTERNS = [
    (r'沉默[寡少]言', '沉默寡言'),
    (r'开朗|乐观|活泼', '开朗'),
    (r'谨慎|小心|警惕', '谨慎'),
    (r'冲动|鲁莽|冒失', '冲动'),
    (r'冷静|沉稳|理智', '冷静'),
    (r'善良|仁慈|温柔', '善良'),
    (r'狡猾|精明|算计', '狡猾'),
    (r'正直|正义|公正', '正直'),
    (r'孤僻|独来独往|离群', '孤僻'),
    (r'好奇|求知|探索', '好奇'),
    (r'贪婪|贪财|爱财', '贪婪'),
    (r'忠诚|可靠|守诺', '忠诚'),
    (r'幽默|风趣|诙谐', '幽默'),
    (r'傲慢|骄傲|自负', '傲慢'),
    (r'勇敢|无畏|大胆', '勇敢'),
    (r'怯懦|胆小|畏缩', '怯懦'),
    (r'热情|热心|好客', '热情'),
    (r'冷漠|冷淡|漠然', '冷漠'),
    (r'执着|固执|顽固', '执着'),
]

_INTENT_PATTERNS = [
    (r'战斗|攻击|砍|杀|刺|射|剑|刀|弓|斧', '寻找战斗'),
    (r'交易|买卖|商|购|卖|买|金币|银币', '寻找交易机会'),
    (r'探索|冒险|寻找|调查|发现|搜寻', '正在探索'),
    (r'休息|休息|扎营|睡觉|旅店|酒馆', '正在休息'),
    (r'学习|阅读|研究|魔法|术式|书', '正在学习'),
    (r'采集|收集|采|草药|矿|猎|钓鱼', '正在采集资源'),
    (r'旅行|前往|赶路|出发|到达|穿越', '正在旅行'),
    (r'帮助|救援|保护|护送|协助', '正在帮助他人'),
    (r'修理|修复|打造|锻造|制作', '在做手艺活'),
    (r'交谈|打听|询问|交谈|聊', '在与人交谈'),
]

_SKILL_ROLE_MAP = {
    '剑': '剑士', '刀': '刀客', '弓': '弓手', '斧': '斧战士',
    '盾': '盾卫', '术式': '术士', '治疗': '医师', '急救': '医师',
    '潜行': '潜行者', '开锁': '盗贼', '偷': '盗贼',
    '锻造': '铁匠', '炼金': '炼金术士', '附魔': '附魔师',
    '狩猎': '猎人', '追踪': '猎人', '采集': '采集者',
    '说服': '交涉者', '谈判': '交涉者', '话术': '交涉者',
    '领导': '领导者', '指挥': '指挥官',
    '野外': '生存专家', '生存': '生存专家',
    '魔法': '法师', '元素': '法师', '召唤': '召唤师',
}


class GhostManager:
    def __init__(self, ghost_repo: IGhostRepo):
        self.ghost_repo = ghost_repo

    async def upsert_from_character(self, player_id: str, char_data: dict, region: str, recent_action: str = ""):
        expires = (datetime.utcnow() + timedelta(seconds=settings.ghost_npc_ttl)).isoformat()
        bg = char_data.get("background", "")
        skills = char_data.get("skills", [])
        attrs = char_data.get("attributes", {})
        rep = char_data.get("reputation", {})

        ghost = {
            "npcId": f"ghost_{player_id}",
            "playerId": player_id,
            "characterName": char_data.get("name", "未知"),
            "appearance": char_data.get("appearance", ""),
            "personalityTags": self._extract_tags(bg, attrs),
            "recentActions": recent_action[:100],
            "currentIntent": self._infer_intent(recent_action, skills),
            "attitudeToStrangers": self._infer_attitude(attrs, rep),
            "knownInfo": [self._infer_role(skills)] if skills else [],
            "region": region,
            "expiresAt": expires,
        }
        await self.ghost_repo.upsert(ghost)

    async def get_region_ghosts(self, region: str) -> list[dict]:
        return await self.ghost_repo.get_by_region(region)

    async def cleanup_expired(self) -> int:
        return await self.ghost_repo.remove_expired()

    def _extract_tags(self, background: str, attributes: dict) -> list[str]:
        tags = []
        if not background:
            return ['神秘']

        for pattern, tag in _PERSONALITY_PATTERNS:
            if re.search(pattern, background) and tag not in tags:
                tags.append(tag)

        if not tags:
            tags.append('普通')

        attrs = attributes or {}
        if attrs.get('CHA', 10) >= 14:
            if '冷静' in tags or '冷漠' in tags:
                pass
            elif '魅力非凡' not in tags:
                tags.append('善于交际')
        if attrs.get('STR', 10) >= 15 and '强壮' not in tags:
            tags.append('强壮')
        if attrs.get('INT', 10) >= 14 and '博学' not in tags:
            tags.append('博学')

        return tags[:5]

    def _infer_intent(self, recent_action: str, skills: list) -> str:
        if not recent_action:
            return '探索世界'

        for pattern, intent in _INTENT_PATTERNS:
            if re.search(pattern, recent_action):
                return intent

        if skills:
            skill_names = [s.get('name', '') for s in skills]
            for name in skill_names:
                for key, role in _SKILL_ROLE_MAP.items():
                    if key in name:
                        return f'作为{role}在活动'

        return '探索世界'

    def _infer_attitude(self, attributes: dict, reputation: dict) -> str:
        attrs = attributes or {}
        rep = reputation or {}
        cha = attrs.get('CHA', 10)
        goodness = rep.get('goodness', 0)
        violence = rep.get('violence', 0)

        if cha >= 16:
            return '友善'
        if cha >= 13:
            return '随和'
        if cha <= 8:
            return '冷淡' if goodness >= 0 else '敌意'
        if violence >= 30:
            return '咄咄逼人'
        if goodness <= -30:
            return '充满敌意'

        return '谨慎'

    def _infer_role(self, skills: list) -> str:
        if not skills:
            return '冒险者'
        for s in skills:
            name = s.get('name', '')
            for key, role in _SKILL_ROLE_MAP.items():
                if key in name:
                    return f'看起来像一位{role}'
        # Use highest level skill
        best = max(skills, key=lambda s: s.get('level', 0))
        return f'擅长{best.get("name", "未知")}的冒险者'
