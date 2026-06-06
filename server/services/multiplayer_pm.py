"""多人PM叙事引擎 — 合并多玩家行动生成统一叙事"""

import json
import httpx
from typing import Optional, Dict, Any, List
from config import settings
from logging_config import api_log


class MultiplayerPMEngine:
    """多人模式 PM 叙事引擎（服务端LLM调用）"""

    async def generate_narrative(
        self,
        players: List[Dict[str, Any]],
        actions: Dict[str, str],
        conflicts: List[Dict[str, Any]],
        location: Optional[Dict[str, Any]],
        world_day: int,
        round_number: int,
        pending_introductions: Optional[List[Dict[str, Any]]] = None,
        narrative_style: str = "detailed",
        difficulty_modifier: int = 0,
    ) -> Dict[str, Any]:
        """
        为多个玩家的行动生成统一叙事

        Returns:
          {
            "narrative": "...",
            "consequences": {player_id: {...}},  # 每个玩家的后果
            "world_state_changes": {...}
          }
        """
        prompt = self._build_prompt(
            players, actions, conflicts, location, world_day, round_number,
            pending_introductions, narrative_style, difficulty_modifier,
        )

        narrative_text = await self._call_llm(prompt)
        if not narrative_text:
            narrative_text = self._fallback(players, actions, pending_introductions)

        # 尝试解析 consequences（如果LLM返回了JSON）
        consequences, world_changes = self._parse_consequences(narrative_text, players)
        clean_narrative = self._strip_consequences_block(narrative_text)

        return {
            "narrative": clean_narrative,
            "consequences": consequences,
            "world_state_changes": world_changes,
        }

    def _build_prompt(
        self,
        players: List[Dict[str, Any]],
        actions: Dict[str, str],
        conflicts: List[Dict[str, Any]],
        location: Optional[Dict[str, Any]],
        world_day: int,
        round_number: int,
        pending_introductions: Optional[List[Dict[str, Any]]],
        narrative_style: str,
        difficulty_modifier: int,
    ) -> str:
        # 玩家列表
        players_text = ""
        for p in players:
            name = p.get("character_name") or p.get("player_name", "未知")
            status = p.get("status", "")
            bg = p.get("character_background", "")
            players_text += f"- {name}" + (f"（{bg}）" if bg else "") + "\n"

        # 行动列表
        actions_text = ""
        for pid, action in actions.items():
            player = next((p for p in players if p.get("player_id") == pid), None)
            name = (player.get("character_name") or player.get("player_name", pid)) if player else pid
            actions_text += f"- {name}: {action}\n"

        # 冲突信息
        conflicts_text = ""
        if conflicts:
            conflicts_text = "\n【潜在冲突】\n"
            for c in conflicts:
                ctype = c.get("type", "")
                cdesc = c.get("description", "")
                conflicts_text += f"- [{ctype}] {cdesc}\n"

        # 待引入的新成员
        intro_text = ""
        if pending_introductions:
            intro_text = "\n【待引入的新成员】\n"
            intro_text += "以下角色需要在本次叙事中自然加入队伍，请为他们设计合理的出场方式：\n"
            for intro in pending_introductions:
                intro_text += (
                    f"- {intro.get('character_name', '未知')}"
                    f"（{intro.get('character_background', '未知背景')}）\n"
                )
            intro_text += "\n你可以选择以下引入方式之一：\n"
            intro_text += "  - 道路偶遇：在旅途中遇到\n"
            intro_text += "  - 酒馆/驿站碰面：在休息点遇到\n"
            intro_text += "  - 任务委托：共同的目标让他们走到一起\n"
            intro_text += "  - 突发事件：某个事件让他们加入队伍\n"

        # 风格指令
        style_guide = {
            "concise": "简洁明了，直击要点，100-150字",
            "detailed": "细腻描写，注重氛围和角色感受，200-300字",
            "epic": "史诗风格，壮阔的叙事笔调，250-350字",
            "humorous": "轻松幽默，加入诙谐的旁白，150-250字",
        }
        style_instruction = style_guide.get(narrative_style, style_guide["detailed"])

        # 难度提示
        difficulty_hint = ""
        if difficulty_modifier != 0:
            direction = "更高" if difficulty_modifier > 0 else "更低"
            difficulty_hint = (
                f"\n【难度调整】当前世界难度修正为 {difficulty_modifier:+d}，"
                f"请在叙事中体现{direction}的挑战性。\n"
            )

        prompt = f"""你是一个TRPG多人游戏的主持人(GM)。以下是当前场景中所有冒险者的行动。

【世界日】第{world_day}天
【行动轮】第{round_number}轮
【当前地点】
{json.dumps(location, ensure_ascii=False) if location else '未知地点'}

【队伍成员】
{players_text}
{difficulty_hint}
【玩家行动】
{actions_text}
{conflicts_text}
{intro_text}
【叙事要求】
- 生成一段{style_instruction}的统一叙事，描述所有玩家在当前轮的行动及结果
- 使用第三人称视角，让所有玩家都能看到完整的故事
- 如果存在冲突，请自然地协调处理（如"两人同时走向商人..."）
- 如果有待引入的新成员，请在本轮叙事中自然引入至少一位
- 叙事中提及的所有角色都应使用其角色名

【后果输出】
在叙事末尾，用 <consequences> 标签包裹JSON，描述各玩家的后果：
<consequences>
{{
  "player_id_1": {{"hpChange": 0, "itemsGained": [], "stateChanges": {{}}}},
  "player_id_2": {{"hpChange": -2, "itemsGained": [{{"name": "药剂"}}], "stateChanges": {{}}}}
}}
</consequences>
（如果本轮有引入新成员，添加 "introduced": [{{"player_id": "...", "narrative": "..."}}]）

请生成叙事："""

        return prompt

    async def _call_llm(self, prompt: str) -> str:
        if not settings.llm_api_key:
            api_log.info("MultiplayerPM: No LLM API key, using fallback")
            return self._fallback_from_prompt(prompt)

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    settings.llm_endpoint,
                    headers={
                        "Authorization": f"Bearer {settings.llm_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": settings.llm_model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": settings.llm_temperature,
                        "max_tokens": settings.llm_max_tokens,
                    },
                )
                if resp.status_code != 200:
                    api_log.warning(f"MultiplayerPM: LLM returned {resp.status_code}")
                    return self._fallback_from_prompt(prompt)

                data = resp.json()
                msg = data.get("choices", [{}])[0].get("message", {})
                return msg.get("content") or msg.get("reasoning_content") or ""

        except Exception as e:
            api_log.warning(f"MultiplayerPM: LLM call failed: {e}")
            return self._fallback_from_prompt(prompt)

    def _fallback(self, players, actions, pending_intros=None) -> str:
        """无LLM时的备用叙事"""
        parts = []
        for pid, action in actions.items():
            player = next((p for p in players if p.get("player_id") == pid), None)
            name = (player.get("character_name") or player.get("player_name", pid)) if player else pid
            if action == "跳过":
                parts.append(f"{name}静静地观察着周围。")
            else:
                parts.append(f"{name}{action}。")

        narrative = " ".join(parts)

        if pending_intros:
            for intro in pending_intros:
                narrative += (
                    f" 就在这时，{intro.get('character_name', '一位冒险者')}出现在众人面前，"
                    f"加入了队伍。"
                )

        return narrative or "冒险者们继续着他们的旅程..."

    def _fallback_from_prompt(self, prompt: str) -> str:
        """从prompt中提取行动生成简单叙事"""
        lines = prompt.split("\n")
        action_lines = []
        in_actions = False
        for line in lines:
            if "【玩家行动】" in line:
                in_actions = True
                continue
            if in_actions and line.startswith("- "):
                action_lines.append(line[2:])
            elif in_actions and (line.startswith("【") or line.startswith("<")):
                break

        if not action_lines:
            return "冒险者们进行了各自的行动，故事继续展开..."

        parts = []
        for al in action_lines:
            parts.append(al.replace(": ", ""))
        return "。".join(parts) + "。冒险继续着..."

    def _parse_consequences(
        self, narrative: str, players: List[Dict[str, Any]]
    ) -> tuple[Dict[str, Any], Dict[str, Any]]:
        """尝试从叙事中提取后果JSON"""
        consequences: Dict[str, Any] = {}
        world_changes: Dict[str, Any] = {}

        # 尝试提取 <consequences> 标签内容
        if "<consequences>" in narrative and "</consequences>" in narrative:
            try:
                start = narrative.index("<consequences>") + len("<consequences>")
                end = narrative.index("</consequences>")
                json_str = narrative[start:end].strip()
                parsed = json.loads(json_str)
                if isinstance(parsed, dict):
                    if "introduced" in parsed:
                        world_changes["introduced_players"] = parsed.pop("introduced")
                    consequences = parsed
            except (json.JSONDecodeError, ValueError):
                pass

        # 为没有后果的玩家生成默认后果
        for player in players:
            pid = player.get("player_id", "")
            if pid not in consequences:
                consequences[pid] = {
                    "hpChange": 0,
                    "itemsGained": [],
                    "itemsLost": [],
                    "stateChanges": {},
                }

        return consequences, world_changes

    @staticmethod
    def _strip_consequences_block(narrative: str) -> str:
        if "<consequences>" not in narrative or "</consequences>" not in narrative:
            return narrative.strip()

        start = narrative.index("<consequences>")
        end = narrative.index("</consequences>") + len("</consequences>")
        cleaned = (narrative[:start] + narrative[end:]).strip()
        return cleaned


# 模块级单例
engine = MultiplayerPMEngine()
