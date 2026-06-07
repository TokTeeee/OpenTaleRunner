import type { Character } from '../../types/character';
import type { SceneContext, ActionContext } from '../../types/game';
import type { GhostNPC, WorldChronicleEntry, RegionData, MilestoneStatus } from '../../types/world';
import type { GameNPC } from '../../types/npc';
import type { StructuredLocation } from '../../types/game';
import type { PromptOverride } from '../../types/world';
import { useGameStore } from '../../stores/gameStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useWorldStore } from '../../stores/worldStore';
import { usePartyStore } from '../../stores/partyStore';
import {
  type PromptComponent,
  type ComponentAllocation,
  estimateTokens,
  COMPONENT_PRIORITIES,
  COMPONENT_QUERY_HINTS,
  makeBudgetConfig,
  TokenBudget,
} from './TokenBudget';
import { HistoryCompressor } from './HistoryCompressor';
import { resolveConditionEffects } from '../judgment/ConditionsRegistry';
import { MemoryManager } from '../memory/MemoryManager';

interface PromptData {
  worldLore?: string;
  currentEra?: string;
  milestones?: MilestoneStatus[];
  character?: Character;
  sceneContext?: SceneContext;
  regionState?: RegionData;
  ghostNPCs?: GhostNPC[];
  knownNPCs?: GameNPC[];
  recentChronicle?: WorldChronicleEntry[];
  actionContext?: ActionContext;
  lastNarrative?: string;
  recentMessages?: Array<{ role: string; content: string }>;
  narrativeGuide?: Record<string, unknown>;
  structuredLocation?: StructuredLocation | null;
}

export class PromptBuilder {
  private overrides: PromptOverride[] = [];

  private dialogueFormattingRule(): string {
    return '直接对白一律使用「」或『』包裹，不要使用“”或"作为台词引号；店名、外号、强调词不要写成双引号对白，如需强调名称可直接写名称或使用《》。';
  }

  setOverrides(overrides: PromptOverride[]): void {
    this.overrides = overrides;
  }

  getOverrides(): PromptOverride[] {
    return this.overrides;
  }

  /** Get overrides applicable to a specific slot + context */
  getApplicableOverrides(
    slot: string,
    regionId?: string,
    beatId?: string,
  ): PromptOverride[] {
    return this.overrides.filter(o => {
      if (o.slot !== slot) return false;
      if (o.scope === 'global') return true;
      if (o.scope === 'regional' && regionId && o.targetIds?.includes(regionId)) return true;
      if (o.scope === 'beat' && beatId && o.targetIds?.includes(beatId)) return true;
      return false;
    });
  }

  /**
   * Validate a PromptOverride for the given slot.
   * Returns null on valid, or an error string on invalid.
   *
   * - queryProtocol slot: enforces whitelist of legal field prefixes
   *   (求差集: content 必须以白名单字段开头)
   * - all slots: content length <= 2000 chars
   * - whitelist checked BEFORE length (whitelist error has priority)
   */
  validateOverride(o: PromptOverride, slot: string): string | null {
    if (slot === 'queryProtocol') {
      const WHITELIST = ['SCENE:', 'NPC:', 'QUEST:', 'INVENTORY:', 'COMBAT:', 'TIME:'];
      const hasWhitelisted = WHITELIST.some(prefix =>
        o.content.startsWith(prefix) || o.content.includes('\n' + prefix)
      );
      if (!hasWhitelisted) {
        return 'whitelist violation: queryProtocol content must start with one of: ' + WHITELIST.join(', ');
      }
    }
    if (o.content.length > 2000) {
      return `content length ${o.content.length} exceeds max 2000 chars`;
    }
    return null;
  }

  /** Apply overrides to base content */
  applyOverrides(
    baseContent: string,
    slot: string,
    regionId?: string,
    beatId?: string,
  ): string {
    if (!useSettingsStore.getState().experimental.enablePromptOverrides) return baseContent;

    const applicable = this.getApplicableOverrides(slot, regionId, beatId);
    let result = baseContent;

    for (const override of applicable) {
      const validationError = this.validateOverride(override, slot);
      if (validationError) {
        console.warn(`[PromptBuilder] Override skipped: ${validationError}`);
        continue;
      }
      const resolved = this.resolvePlaceholders(override.content);
      // Safety: JSON schema only allows replace mode
      const effectiveMode = (slot === 'jsonSchemaAdvance' || slot === 'jsonSchemaScene')
        ? 'replace'
        : override.mode;

      switch (effectiveMode) {
        case 'replace':
          result = resolved;
          break;
        case 'prepend':
          result = resolved + '\n' + result;
          break;
        case 'append':
          result = result + '\n' + resolved;
          break;
      }
    }

    return result;
  }

  /** Replace template placeholders with actual values */
  resolvePlaceholders(content: string): string {
    const char = useCharacterStore.getState().character;
    const game = useGameStore.getState();
    const world = useWorldStore.getState();

    return content
      .replace(/\{\{characterName\}\}/g, char?.name ?? '冒险者')
      .replace(/\{\{characterRace\}\}/g, char?.race ?? '人类')
      .replace(/\{\{characterBackground\}\}/g, char?.background?.slice(0, 100) ?? '')
      .replace(/\{\{currentRegion\}\}/g, game.currentRegion)
      .replace(/\{\{currentSubRegion\}\}/g, game.currentSubRegion)
      .replace(/\{\{worldDay\}\}/g, String(game.currentDay))
      .replace(/\{\{currentEra\}\}/g, world.storybook?.currentEra ?? '')
      .replace(/\{\{worldName\}\}/g, world.storybook?.worldName ?? '')
      .replace(/\{\{hp\}\}/g, char ? String(char.hp) : '?')
      .replace(/\{\{maxHp\}\}/g, char ? String(char.maxHp) : '?')
      .replace(/\{\{timeOfDay\}\}/g, game.timeOfDay)
      .replace(/\{\{weather\}\}/g, game.weather)
      .replace(/\{\{terrain\}\}/g, game.terrain)
      .replace(/\{\{lightLevel\}\}/g, () => {
        const c = game.gameClock;
        if (c >= 20 || c < 5) return 'dark_night';
        if (c < 6 || c >= 19) return 'twilight';
        return 'full_daylight';
      });
  }
  buildWorldLayer(data: PromptData): string {
    let prompt = '【身份】\n你是Game Master，引导冒险者在这个奇幻世界谱写故事。\n\n';

    if (data.worldLore) {
      prompt += `【世界观】\n${data.worldLore}\n\n`;
    }
    if (data.currentEra) {
      prompt += `【当前时代】${data.currentEra}\n\n`;
    }
    if (data.milestones && data.milestones.length > 0) {
      prompt += '【当前世界局势】\n';
      for (const m of data.milestones) {
        prompt += `- ${m.name}: ${m.status === 'completed' ? '已完成' : m.status === 'active' ? '进行中' : '尚未发生'}\n`;
      }
      prompt += '\n';
    }
    if (data.recentChronicle && data.recentChronicle.length > 0) {
      prompt += '【近期世界动态】\n';
      for (const c of data.recentChronicle.slice(-3)) {
        prompt += `- 世界日${c.worldDay}: ${c.title}\n`;
      }
      prompt += '\n';
    }
    if (data.regionState) {
      prompt += `【当前区域】${data.regionState.name}\n`;
      prompt += `描述: ${data.regionState.description}\n`;
      prompt += '派系动态:\n';
      for (const f of data.regionState.factions) {
        prompt += `  ${f.name} (态度: ${f.attitude})\n`;
      }
      if (data.regionState.currentEvents.length > 0) {
        prompt += '今日事件: ' + data.regionState.currentEvents.join(', ') + '\n';
      }
      prompt += '\n';
    }
    prompt += this.narrativeGuide(data);
    return prompt;
  }

  buildCharacterLayer(character: Character): string {
    let prompt = `【当前冒险者：${character.name}】\n`;
    prompt += `- 出身：${character.background}\n`;
    prompt += `- 属性：STR:${character.attributes.STR} DEX:${character.attributes.DEX} CON:${character.attributes.CON} INT:${character.attributes.INT} WIS:${character.attributes.WIS} CHA:${character.attributes.CHA}\n`;
    prompt += '- 技能：\n';
    for (const s of character.skills) {
      prompt += `  ${s.name}(Lv.${s.level}): ${s.description}\n`;
    }
    const eq = character.inventory.equipped;
    prompt += `- 装备：武器[${eq.weapon?.name ?? '无'}${eq.weapon?.description ? ` (${eq.weapon.description.slice(0, 40)})` : ''}] 防具[${eq.armor?.name ?? '无'}] 饰品[${eq.accessory?.name ?? '无'}]\n`;
    // Backpack summary
    const bp = character.inventory.backpack || [];
    if (bp.length > 0) {
      const summary = bp.map(i => `${i.name}${i.quantity && i.quantity > 1 ? `×${i.quantity}` : ''}${i.description ? ` (${i.description.slice(0, 30)})` : ''}`).join('、');
      prompt += `- 背包(${bp.length}件): ${summary.slice(0, 200)}\n`;
    }
    prompt += `- HP：${character.hp}/${character.maxHp}\n`;
    const cur = character.inventory.currency;
    prompt += `- 货币：${cur.gold}金 ${cur.silver}银 ${cur.copper}铜\n`;
    if (character.vital) {
      prompt += `- 状态：饱食${character.vital.hunger} 口渴${character.vital.thirst} 疲劳${character.vital.fatigue} 卫生${character.vital.hygiene} 士气${character.vital.morale}\n`;
    }
    if (character.conditions?.length > 0) {
      const descs = character.conditions.map(c => {
        const eff = resolveConditionEffects([c]);
        return `${c}(${eff.description || '判定-' + eff.dicePenalty})`;
      }).join(', ');
      prompt += `  异常：${descs}\n`;
    }
    if (character.recentHistory.length > 0) {
      prompt += '- 近期经历：\n';
      for (const h of character.recentHistory.slice(-3)) {
        prompt += `  世界日${h.worldDay}: ${h.summary}\n`;
      }
    }
    prompt += '\n';
    return prompt;
  }

  buildPartyLayer(): string {
    const party = usePartyStore.getState();
    if (party.members.length === 0) return '';

    let prompt = `【当前冒险队伍 — ${party.name} (${party.members.length}/${party.maxSize})】\n`;
    for (const m of party.members) {
      prompt += `${m.name}（${m.label}）\n`;
      prompt += `  HP: ${m.status.hp}/${m.status.maxHp} | 忠诚: ${m.loyalty}/100\n`;
      if (m.combatAbilities.length > 0) {
        prompt += `  战斗: ${m.combatAbilities.map((a) => `${a.name}(${a.description})`).join(', ')}\n`;
      }
      if (m.utilityAbilities.length > 0) {
        prompt += `  辅助: ${m.utilityAbilities.map((a) => `${a.name} Lv.${a.level}`).join(', ')}\n`;
      }
    }
    prompt += '\n队伍在战斗中自动协助玩家。非战斗时，检查可用辅助能力：\n';
    prompt += '- 如果面对锁住的门且有队员会撬锁 → 暗示"队员可以帮忙"\n';
    prompt += '- 如果面对复杂谈判且有队员会交涉 → 暗示"队员可以代为交涉"\n';
    prompt += '- 如果队员忠诚度很低(≤30) → 可能拒绝帮忙或表现出不满\n';
    prompt += '\n';
    return prompt;
  }

  buildSceneLayer(data: PromptData): string {
    if (!data.sceneContext) return '';
    const ctx = data.sceneContext;
    let prompt = '【当前场景信息】\n';
    prompt += `- 世界日: ${ctx.worldDay}\n`;
    prompt += `- 大区域: ${ctx.region}\n`;
    // Inject time of day
    const state = useGameStore.getState();
    prompt += `- 当前时间: 世界日第${state.currentDay}天 ${state.timeOfDay}(${state.gameClock.toFixed(1)}时)\n`;
    // Light level
    const clock = state.gameClock;
    let light = 'full_daylight';
    if (clock >= 20 || clock < 5) light = 'dark_night';
    else if (clock < 6 || clock >= 19) light = 'twilight';
    prompt += `- 光照: ${light}。NPC作息和怪物活动应据此调整。\n`;

    // Structured location — primary location source (A2 improvement)
    const useStructured = useSettingsStore.getState().experimental.enableStructuredLocation && data.structuredLocation;
    if (useStructured && data.structuredLocation) {
      const loc = data.structuredLocation;
      prompt += `- 当前位置: ${loc.regionName} · ${loc.subRegion} · ${loc.specificPlace}\n`;
      if (loc.description) prompt += `- 地点描述: ${loc.description}\n`;
      prompt += `- 访问次数: ${loc.visitCount} (${loc.isKnown ? '已探索' : '新发现'})\n`;
      prompt += `- 坐标: (${loc.coordinates.x}, ${loc.coordinates.y}, ${loc.coordinates.z})\n`;
      // Scene narrative anchor (not location, just narrative context)
      if (data.lastNarrative) {
        prompt += `- 场景叙事锚点: ${data.lastNarrative.slice(0, 200)}\n`;
      }
    } else {
      // Fallback: legacy narrative text slice
      if (data.lastNarrative) {
        prompt += `- 上条叙事中玩家的位置: ${data.lastNarrative.slice(0, 200)}\n`;
        prompt += `- 重要: 玩家现在就在这里。生成场景时不要回到之前的任何位置。\n`;
      } else {
        prompt += `- 小区域: ${ctx.subRegion}\n`;
      }
    }
    prompt += `- 地形: ${ctx.terrain}\n`;
    prompt += `- 天气: ${ctx.weather}\n`;
    prompt += `- 剩余行动点: ${ctx.remainingActionPoints}\n`;

    const npcText = this.buildKnownNPCs(data);
    if (npcText) prompt += npcText;

    if (data.ghostNPCs && data.ghostNPCs.length > 0) {
      prompt += '\n【区域内的其他冒险者】\n';
      for (const npc of data.ghostNPCs) {
        prompt += this.buildGhostNPCText(npc);
      }
    }
    return prompt;
  }

  buildGhostNPCText(npc: GhostNPC): string {
    return `\n冒险者"${npc.characterName}"正在此区域：${npc.appearance}。${npc.currentIntent}。\n性格: ${npc.personalityTags.join('、')}。对陌生人的态度: ${npc.attitudeToStrangers}。\n`;
  }

  private buildGhostEncounterHint(data: PromptData): string {
    if (!data.ghostNPCs || data.ghostNPCs.length === 0) return '';

    const npcs = data.ghostNPCs;
    if (npcs.length === 0) return '';

    let hint = '\n【🔮 幽灵冒险者偶遇 — 重要：必须在选项中体现】\n';
    hint += '你注意到附近有其他冒险者也在这个区域活动。他们是与你一样在此世界冒险的真人玩家。\n\n';

    for (const npc of npcs) {
      const tags = npc.personalityTags.join('、');
      const intent = npc.currentIntent;
      const attitude = npc.attitudeToStrangers;
      const appearance = npc.appearance?.slice(0, 60) || '';

      hint += `冒险者：${npc.characterName}\n`;
      if (appearance) hint += `  外貌：${appearance}\n`;
      hint += `  性格：${tags}\n`;
      hint += `  当前状态：${intent}\n`;
      hint += `  对陌生人态度：${attitude}\n`;

      // Generate interaction suggestion based on attitude
      let suggestion: string;
      switch (attitude) {
        case '友善':
          suggestion = '可能主动打招呼，乐于交谈或帮助';
          break;
        case '随和':
          suggestion = '可能点头致意，可以搭话';
          break;
        case '谨慎':
          suggestion = '会保持距离后观察，不主动但可以尝试接近';
          break;
        case '冷淡':
          suggestion = '不太理会陌生人，需要好的理由才能搭上话';
          break;
        case '敌意':
          suggestion = '可能直接无视或表现出敌意';
          break;
        default:
          suggestion = '态度不明';
      }
      hint += `  互动建议：${suggestion}\n`;
    }

    hint += '\n请在生成的3个选项中，至少有1个选项涉及与以上某位冒险者的相遇或互动。';
    hint += '偶遇应是自然的（擦肩而过、视线交汇、听到动静），而非刻意安排。';
    hint += '不要让偶遇占据主导——它只是诸多可能性中的一种。';

    return hint + '\n';
  }

  buildKnownNPCs(data: PromptData): string {
    if (!data.knownNPCs || data.knownNPCs.length === 0) return '';
    const regionNPCs = data.knownNPCs.filter(
      (n) => n.isMet && n.region === data.sceneContext?.region,
    );
    if (regionNPCs.length === 0) return '';

    let text = '\n【你已认识的NPC（在本区域）】\n';
    for (const npc of regionNPCs) {
      text += `\n${npc.name}（${npc.title}）\n`;
      text += `- 外貌：${npc.appearance}\n`;
      text += `- 性格：${npc.personality}\n`;
      text += `- 与玩家的关系：${npc.relationship.level}（好感${npc.relationship.attitude}）\n`;
      if (npc.relationship.playerKnowsAbout.length > 0) {
        text += `- 玩家已知信息：${npc.relationship.playerKnowsAbout.join('；')}\n`;
      }
    }
    text += '\n在场景中可以自然地让这些NPC出现或提及他们，根据关系度决定他们的态度。\n';
    return text;
  }

  buildSceneGeneratePrompt(data: PromptData): string {
    const world = this.buildWorldLayer(data);
    const char = data.character ? this.buildCharacterLayer(data.character) : '';
    const party = this.buildPartyLayer();
    const scene = this.buildSceneLayer(data);

    let recentContext = '';
    if (data.lastNarrative) {
      recentContext += `\n【⚠ 位置锚点 — 这是玩家当前所在的确切位置，场景描写必须从这里开始，绝不倒退】\n${data.lastNarrative.slice(0, 500)}\n`;
    }
    if (data.recentMessages && data.recentMessages.length > 0) {
      const lastFew = data.recentMessages.slice(-16);
      recentContext += '\n【最近的剧情对话 — 理解故事进展】\n' + lastFew.map(m => {
        const label = m.role === 'player' ? '玩家行动' : m.role === 'pm' ? '叙事' : '系统';
        return `${label}: ${m.content.slice(0, 200)}`;
      }).join('\n') + '\n';
    }

    return world + '\n' + char + '\n' + party + '\n' + scene + '\n' + recentContext + '\n' + `
【你的任务 — 必须严格遵守】
1. 确认【位置锚点】中玩家当前所在位置。场景描写必须从该位置开始，绝不回到之前的地点。
2. 花1-2句话简短描述当前即时环境。如果锚点中已详细描写，用一句话带过即可——重点是"接下来发生什么"，不是"这里长什么样"。
3. 绝不重复描写玩家已经离开的场景。如果你上次描写了公会大厅但玩家已走到街道上，绝不回头描写大厅。
4. 生成3个选项，必须与故事发展方向紧密相关。` + this.buildGhostEncounterHint(data) + `
5. 返回当前精确位置（current_location）。如果玩家没有移动，也要返回当前位置。
6. ${this.dialogueFormattingRule()}
请严格按照以下JSON格式输出，不要输出任何其他内容：
{
  "scene_description": "场景描述",
  "current_location": "{region}·{sub_region}·具体地点",
  "choices": [
    {"text": "选项文本", "hint": "简易提示", "tendency": "combat/social/explore/opportunistic/avoid"},
    {"text": "选项文本", "hint": "简易提示", "tendency": "combat/social/explore/opportunistic/avoid"},
    {"text": "选项文本", "hint": "简易提示", "tendency": "combat/social/explore/opportunistic/avoid"}
  ],
  "scene_modifier": 0,
  "atmosphere": {"mood": "紧张/轻松/神秘", "danger_level": "low/medium/high"}
}`;
  }

  buildActionEvaluatePrompt(data: PromptData): string {
    const world = this.buildWorldLayer(data);
    const char = data.character ? this.buildCharacterLayer(data.character) : '';
    const scene = this.buildSceneLayer(data);

    return world + '\n' + char + '\n' + scene + '\n' + `
玩家想要执行以下行为: "${data.actionContext?.playerAction ?? ''}"

请评估此行为在当前世界的合理程度（离谱程度1-10），并返回JSON：
{
  "absurdity_level": 1-10,
  "reason": "评估理由",
  "relevant_skill": "最相关的技能名称 或 null",
  "relevant_attribute": "STR/DEX/CON/INT/WIS/CHA 或 null"
}`;
  }

  buildNarrativeAdvancePrompt(data: PromptData, diceResultStr: string): string {
    const world = this.buildWorldLayer(data);
    const char = data.character ? this.buildCharacterLayer(data.character) : '';
    const party = this.buildPartyLayer();
    const scene = this.buildSceneLayer(data);

    return world + '\n' + char + '\n' + party + '\n' + scene + '\n' + `
玩家行为: "${data.actionContext?.playerAction ?? ''}"
判定结果: ${diceResultStr}

请根据判定结果推进叙事。${this.dialogueFormattingRule()} 返回JSON：
{
  "narrative": "叙事文本（2-6句）",
  "consequences": {
    "items_gained": [], "reputation_change": {}, "world_effects": [],
    "skills_learned": [], "hp_change": 0, "fatigue_change": 1
  },
  "npcs_introduced": []
}`;
  }

  /**
   * 长期记忆检索段 — PR-4
   * 从 MemoryManager 同步召回 8 条最相关的历史事实, 注入 prompt.
   * 失败 / 无结果时返回空字符串.
   */
  buildGmMemoryRetrievalSection(actionText: string, data?: PromptData): string {
    try {
      const game = useGameStore.getState();
      const settings = useSettingsStore.getState();
      const char = useCharacterStore.getState().character;

      if (!settings.memory) return '';

      // 拼装检索 query: 行动 + NPC + 物品 + 区域
      const npcNames: string[] = (data?.knownNPCs || [])
        .map((n: { name?: string }) => n?.name)
        .filter((n: unknown): n is string => typeof n === 'string' && n.length > 0);
      const itemNames: string[] = [];  // 后续 PR-5 接入 itemRegistry 拼装
      const queryParts = [
        actionText,
        game.currentRegion,
        game.currentSubRegion,
        ...npcNames,
        ...itemNames,
      ].filter(Boolean);
      const query = queryParts.join(' ');

      // 同步检索 (InMemoryMemoryStore 极快, < 5ms)
      const hits = MemoryManager.searchSync({
        query,
        scopes: ['npc', 'item', 'event', 'player', 'location', 'lore'],
        topK: 8,
        minScore: 0.05,
      });

      // 设置活跃实体豁免
      const activeIds: string[] = [];
      if (char) activeIds.push(`character:${char.characterId}`);
      for (const npc of npcNames) activeIds.push(`npc:${npc}`);
      MemoryManager.setActiveEntities(activeIds);

      if (hits.length === 0) return '';

      const lines = hits.map((h) => {
        const tag = h.scope.toUpperCase();
        const day = h.metadata.worldDay ? `[第${h.metadata.worldDay}天]` : '';
        const importance = `(重要性: ${h.metadata.importance.toFixed(1)})`;
        return `- ${tag} ${day} ${h.content} ${importance}`;
      });

      return `\n## 🧠 长期记忆 (GM 检索 - ${hits.length} 条)\n${lines.join('\n')}\n`;
    } catch {
      // 检索失败不阻塞主流程
      return '';
    }
  }

  buildCombinedAdvancePrompt(data: PromptData, diceResultStr: string): string {
    const world = this.buildWorldLayer(data);
    const char = data.character ? this.buildCharacterLayer(data.character) : '';
    const scene = this.buildSceneLayer(data);

    let recentContext = '';
    if (data.lastNarrative) {
      recentContext += `\n【⚠ 位置锚点 — 此处为玩家的精确位置，绝不倒退】\n${data.lastNarrative.slice(0, 500)}\n`;
    }
    if (data.recentMessages && data.recentMessages.length > 0) {
      const lastFew = data.recentMessages.slice(-16);
      recentContext += '\n【最近对话】\n' + lastFew.map(m => `${m.role === 'player' ? '玩家' : 'GM'}: ${m.content.slice(0, 150)}`).join('\n') + '\n';
    }

    // PR-4: 长期记忆检索段 (放在"最近对话"之后, 让 GM 优先用长期事实补全上下文)
    const memorySection = this.buildGmMemoryRetrievalSection(data.actionContext?.playerAction ?? '', data);

    return world + '\n' + char + '\n' + scene + '\n' + recentContext + memorySection + '\n' + `
玩家刚刚执行了以下行动: "${data.actionContext?.playerAction ?? ''}"
行动判定结果: ${diceResultStr}

请基于判定结果一次性完成以下任务：

⚠ 首先阅读"位置锚点"和"最近对话"理解当前剧情状态。不要凭空引入与当前故事无关的人物或事件。不要引导玩家去特定方向——让他们自由探索。

1. 评估本次行动的合理耗时：若为相对耗时，纳入time_elapsed字段（例如"5分钟""30分钟""2小时"）。**若玩家明确要等到某个绝对时刻（"等到晚上""休息到天亮""等到第三天早晨"），必须同时给出 set_time 字段，格式为 "HH:MM" 或 "第N天 HH:MM"（如 "20:00" / "第3天 08:00"），用于把世界时钟直接跳到该时刻**。set_time 优先级高于 time_elapsed
2. 叙述行动的结果（narrative字段，2-6句）。自然地融入环境氛围
3. 基于玩家当前状态和兴趣方向，生成3个选项（choices）
4. 评估行动对角色状态的影响（state_changes）
5. 如果玩家获得了报酬/物品/金币，或消耗了物品，在consequences中体现
6. 给出当前精确位置（current_location）
7. ${this.dialogueFormattingRule()}
${this.buildGhostEncounterHint(data)}
返回JSON（直接返回JSON，不要代码块）：
{
  "narrative": "行动结果叙述",
  "time_elapsed": "15分钟",
  "current_location": "{region}·{sub_region}·具体地点",
  "choices": [
    {"text": "选项", "hint": "", "tendency": "combat/social/explore/opportunistic/avoid"}
  ],
  "consequences": {
    "items_gained": [], "items_lost": [], "items_modified": [],
    "skills_modified": [],
    "currency_change": {"gold":0,"silver":0,"copper":0},
    "reputation_change": {}, "world_effects": [],
    "skills_learned": [], "hp_change": 0,
    "state_changes": {"hunger":3,"thirst":2,"fatigue":5,"hygiene":1,"morale":0,"wound":0,"temperature":0,"encumbrance":0},
    "attribute_changes": {"STR":0,"DEX":0,"CON":0,"INT":0,"WIS":0,"CHA":0},
    "identity_changes": {},
    "conditions_added": [], "conditions_removed": []
  },
  "npcs_introduced": [],
  "scene_modifier": 0,
  "atmosphere": {"mood": "轻松", "danger_level": "low"}
}`;
  }

  buildCombinedAdvanceWithQueriesPrompt(
    data: PromptData,
    diceResultStr: string,
    playerAction: string,
    queryHistory: string = '',
  ): string {
    const world = this.buildWorldLayer(data);
    const char = data.character ? this.buildCharacterLayerSlim(data.character) : '';
    const scene = this.buildSceneLayerSlim(data);

    let recentContext = '';
    if (data.lastNarrative) {
      recentContext += `\n【⚠ 位置锚点 — 此处为玩家的精确位置】\n${data.lastNarrative.slice(0, 200)}\n`;
    }

    return world + '\n' + char + '\n' + scene + '\n' + recentContext + '\n' + queryHistory + '\n' + `
玩家行动: "${playerAction}"
判定结果: ${diceResultStr}

${this.queryProtocolPrompt()}
${this.buildGhostEncounterHint(data)}
请基于判定结果生成回复。如果你需要更多数据来做出精确的叙事决策，使用查询协议请求数据。
如果你已经有足够的信息，直接返回叙事JSON。${this.dialogueFormattingRule()}

返回JSON格式（二选一）：

【如果要查询数据】:
{
  "type": "query",
  "reasoning": "简短说明为什么需要这些数据",
  "queries": [
    {"query_id": "q1", "intent": "inventory_search", "keyword": "关键词"},
    {"query_id": "q2", "intent": "npc_lookup", "name": "NPC名", "region": "区域"}
  ]
}

【如果直接叙事】:
{
  "type": "narrative",
  "narrative": "行动结果叙述",
  "time_elapsed": "15分钟",
  "current_location": "具体位置",
  "choices": [{"text":"选项","hint":"","tendency":"combat/social/explore/opportunistic/avoid"}],
  "consequences": {
    "items_gained":[],"items_lost":[],"items_modified":[],
    "currency_change":{"gold":0,"silver":0,"copper":0},
    "reputation_change":{},"world_effects":[],
    "skills_learned":[],"hp_change":0,
    "state_changes":{"hunger":3,"thirst":2,"fatigue":5,"hygiene":1,"morale":0,"wound":0,"temperature":0,"encumbrance":0},
    "attribute_changes":{},"identity_changes":{},
    "conditions_added":[],"conditions_removed":[]
  },
  "npcs_introduced":[],
  "scene_modifier":0,
  "atmosphere":{"mood":"轻松","danger_level":"low"}
}`;
  }

  private buildCharacterLayerSlim(character: Character): string {
    let prompt = `【当前冒险者：${character.name}】\n`;
    prompt += `- 出身：${character.background.slice(0, 80)}\n`;
    prompt += `- 属性：STR:${character.attributes.STR} DEX:${character.attributes.DEX} CON:${character.attributes.CON} INT:${character.attributes.INT} WIS:${character.attributes.WIS} CHA:${character.attributes.CHA}\n`;
    prompt += `- 技能：${character.skills.map(s => `${s.name}(Lv.${s.level})`).join('、') || '无'}\n`;
    const eq = character.inventory.equipped;
    prompt += `- 装备：${eq.weapon?.name || '无'} / ${eq.armor?.name || '无'} / ${eq.accessory?.name || '无'}\n`;
    prompt += `- HP：${character.hp}/${character.maxHp}\n`;
    const cur = character.inventory.currency;
    prompt += `- 货币：${cur.gold}金 ${cur.silver}银 ${cur.copper}铜\n`;
    if (character.conditions?.length) {
      prompt += `- 异常：${character.conditions.map(c => {
        const eff = resolveConditionEffects([c]);
        return `${c}(判定-${eff.dicePenalty})`;
      }).join('、')}\n`;
    }
    prompt += '\n';
    return prompt;
  }

  private buildSceneLayerSlim(data: PromptData): string {
    if (!data.sceneContext) return '';
    const ctx = data.sceneContext;
    let prompt = '【当前场景】\n';
    prompt += `- 世界日: ${ctx.worldDay}\n`;
    prompt += `- 区域: ${ctx.region} · ${ctx.subRegion}\n`;
    if (data.lastNarrative) {
      prompt += `- 当前位置: ${data.lastNarrative.slice(0, 150)}\n`;
    }
    prompt += `- 地形: ${ctx.terrain} · 天气: ${ctx.weather}\n`;
    return prompt;
  }

  private queryProtocolPrompt(): string {
    return `【数据查询协议 — 按需使用】
你可以向客户端查询精确数据。不要凭空猜测——查询能给你准确信息。

可用查询：
- inventory_search(keyword): 搜索玩家背包和装备中的物品
- npc_lookup(name, region?): 查找已知NPC的详细信息
- location_info(location): 查询某个地点是否已探索
- character_state(aspects?): 查询角色HP/体力/属性/异常状态
- skill_check(keyword): 查找匹配的技能
- recent_events(count?): 最近的事件摘要
- world_lore(topic): 世界观中相关主题的信息

如果你已有足够信息（如物品名已在上文提及、NPC已知、位置明确），直接叙事即可，不需要查询。`;
  }

  private narrativeGuide(data?: PromptData): string {
    const ng = data?.narrativeGuide as Record<string, unknown> | undefined;
    if (ng) {
      const parts: string[] = ['【叙事风格指南】'];
      if (ng.pointOfView) parts.push(`- ${ng.pointOfView}`);
      if (ng.tone) parts.push(`- 语气: ${ng.tone}`);
      if (ng.sceneLength) parts.push(`- ${ng.sceneLength}`);
      const rules = ng.choiceRules as string[] | undefined;
      if (rules) rules.forEach(r => parts.push(`- ${r}`));
      const forbidden = ng.forbidden as string[] | undefined;
      if (forbidden) forbidden.forEach(f => parts.push(`- ${f}`));
      const checks = ng.consistencyChecks as string[] | undefined;
      if (checks) checks.forEach(c => parts.push(`- ${c}`));
      parts.push(`- ${this.dialogueFormattingRule()}`);
      return parts.join('\n') + '\n';
    }
    // Fallback
    return `【叙事风格指南】
- 使用第二人称"你"对玩家说话
- 你是自由世界的叙述者——不要引导玩家去任何特定方向
- 玩家想做什么就配合什么，不要假设"主线"
- 世界中的事件、NPC、地点都是"存在的可能性"，不是"必须完成的任务"
- 如果玩家的行为恰好与某个已知事件产生交集，自然地提及它——但不催促、不强推
- 场景转换流畅：从A点到B点1句话过渡
- 不要每次进入同一地点重新描述环境
- 绝不替玩家做决定，不打破第四面墙
- 评估每次行动的合理耗时并在叙事中体现（观察/对话几分钟、战斗数十分钟、长途旅行数小时）
- ${this.dialogueFormattingRule()}\n`;
  }

  buildCombinedAdvanceWithBudget(
    data: PromptData,
    diceResultStr: string,
    playerAction: string,
    _queryHistory: string = '',
  ): { prompt: string; budget: TokenBudget; allocation: Map<string, ComponentAllocation> } {
    const settings = useSettingsStore.getState();
    const budget = new TokenBudget(makeBudgetConfig(
      settings.llm.maxTokens || 8192,
      settings.promptBudget.responseReserve,
      settings.promptBudget.safetyMargin,
    ));

    const components: PromptComponent[] = [];

    // P0: GM identity
    components.push({
      id: 'gm_identity',
      priority: COMPONENT_PRIORITIES.gm_identity,
      fullTokens: 30, slimTokens: 30, relevanceScore: 100,
      buildFull: () => '【身份】\n你是Game Master，引导冒险者在这个奇幻世界谱写故事。\n\n',
      buildSlim: () => '【身份】\n你是Game Master。\n\n',
    });

    // P0: narrative guide (slim = only forbidden rules)
    const guideFull = this.narrativeGuide(data);
    const guideLines = guideFull.split('\n').filter(l => l.trim());
    const forbiddenLines = guideLines.filter(l => l.includes('绝不') || l.includes('不要') || l.includes('不打破') || l.includes('不替'));
    components.push({
      id: 'narrative_guide',
      priority: COMPONENT_PRIORITIES.narrative_guide,
      fullTokens: estimateTokens(guideFull), slimTokens: estimateTokens(forbiddenLines.join('\n')),
      relevanceScore: 95,
      buildFull: () => guideFull,
      buildSlim: () => '【叙事风格指南】\n' + forbiddenLines.join('\n') + '\n',
    });

    // P0: player action
    const actionText = `玩家行动: "${playerAction}"\n判定结果: ${diceResultStr}\n`;
    components.push({
      id: 'player_action',
      priority: COMPONENT_PRIORITIES.player_action,
      fullTokens: estimateTokens(actionText), slimTokens: estimateTokens(actionText),
      relevanceScore: 100,
      buildFull: () => actionText,
      buildSlim: () => actionText,
    });

    // P1: character HP/vital
    if (data.character) {
      const char = data.character;
      const hpText = `【当前冒险者：${char.name}】HP:${char.hp}/${char.maxHp}`;
      const vitalText = char.vital ? ` 状态：饱食${char.vital.hunger} 口渴${char.vital.thirst} 疲劳${char.vital.fatigue}` : '';
      const fullCharHp = hpText + vitalText + (char.conditions?.length ? ` 异常：${char.conditions.map(c => { const e = resolveConditionEffects([c]); return `${c}(判定-${e.dicePenalty})`; }).join('、')}` : '') + '\n\n';
      components.push({
        id: 'character_hp_vital',
        priority: COMPONENT_PRIORITIES.character_hp_vital,
        fullTokens: estimateTokens(fullCharHp), slimTokens: estimateTokens(hpText + '\n\n'), relevanceScore: 98,
        buildFull: () => fullCharHp,
        buildSlim: () => hpText + '\n\n',
      });

      // P1: equipped summary
      const eq = char.inventory.equipped;
      const eqFull = `- 装备：武器[${eq.weapon?.name || '无'}] 防具[${eq.armor?.name || '无'}] 饰品[${eq.accessory?.name || '无'}]\n`;
      const eqSlim = `装备: ${eq.weapon?.name || '无'} / ${eq.armor?.name || '无'}\n`;
      components.push({
        id: 'equipped_summary',
        priority: COMPONENT_PRIORITIES.equipped_summary,
        fullTokens: 25, slimTokens: 15, relevanceScore: 85,
        buildFull: () => eqFull, buildSlim: () => eqSlim,
      });

      // P2: character attributes
      const attrsText = `- 属性：STR:${char.attributes.STR} DEX:${char.attributes.DEX} CON:${char.attributes.CON} INT:${char.attributes.INT} WIS:${char.attributes.WIS} CHA:${char.attributes.CHA}\n`;
      components.push({
        id: 'character_attrs',
        priority: COMPONENT_PRIORITIES.character_attrs,
        fullTokens: 40, slimTokens: 40, relevanceScore: 75,
        queryHints: COMPONENT_QUERY_HINTS.character_state,
        buildFull: () => attrsText, buildSlim: () => attrsText,
      });

      // P2: character skills
      const skillsFull = '- 技能：\n' + char.skills.map(s => `  ${s.name}(Lv.${s.level}): ${s.description}`).join('\n') + '\n';
      const skillsSlim = '- 技能：' + char.skills.map(s => `${s.name}(Lv.${s.level})`).join('、') + '\n';
      components.push({
        id: 'character_skills',
        priority: COMPONENT_PRIORITIES.character_skills,
        fullTokens: estimateTokens(skillsFull), slimTokens: estimateTokens(skillsSlim),
        relevanceScore: 70,
        queryHints: COMPONENT_QUERY_HINTS.character_skills,
        buildFull: () => skillsFull, buildSlim: () => skillsSlim,
      });

      // P2: backpack key items
      const bp = char.inventory.backpack || [];
      if (bp.length > 0) {
        const keyItems = bp.filter(i => i.category === 'key_item');
        const important = keyItems.length > 0 ? keyItems : bp.filter(i => i.equipped || (i.effects && i.effects.length > 0));
        const display = important.length > 0 ? important : bp.slice(0, 5);
        const bpFull = `- 背包(${bp.length}件): ${display.map(i => `${i.name}${i.quantity && i.quantity > 1 ? `×${i.quantity}` : ''}`).join('、')}\n`;
        components.push({
          id: 'backpack_key',
          priority: COMPONENT_PRIORITIES.backpack_key,
          fullTokens: estimateTokens(bpFull), slimTokens: 15, relevanceScore: 50,
          queryHints: COMPONENT_QUERY_HINTS.backpack_key,
          buildFull: () => bpFull, buildSlim: () => `- 背包: ${bp.length}件物品\n`,
        });
      }
    }

    // P1: structured location
    if (data.structuredLocation) {
      const loc = data.structuredLocation;
      const locText = `- 当前位置: ${loc.regionName} · ${loc.subRegion} · ${loc.specificPlace}\n`;
      components.push({
        id: 'current_location',
        priority: COMPONENT_PRIORITIES.current_location,
        fullTokens: 30, slimTokens: 30, relevanceScore: 95,
        buildFull: () => locText, buildSlim: () => locText,
      });
    }

    // P1: weather/light
    const state = useGameStore.getState();
    const weatherText = `- 地形: ${data.sceneContext?.terrain || ''} · 天气: ${data.sceneContext?.weather || ''}\n- 光照: ${state.timeOfDay}\n`;
    components.push({
      id: 'weather_light',
      priority: COMPONENT_PRIORITIES.weather_light,
      fullTokens: 25, slimTokens: 15, relevanceScore: 65,
      buildFull: () => weatherText, buildSlim: () => `- 天气: ${data.sceneContext?.weather || ''}\n`,
    });

    // Context: world day + region
    const ctxText = `【当前场景信息】\n- 世界日: ${data.sceneContext?.worldDay || ''}\n- 区域: ${data.sceneContext?.region || ''} · ${data.sceneContext?.subRegion || ''}\n`;
    components.push({
      id: 'current_region',
      priority: COMPONENT_PRIORITIES.current_region,
      fullTokens: estimateTokens(ctxText), slimTokens: 20, relevanceScore: 90,
      buildFull: () => ctxText, buildSlim: () => `世界日${data.sceneContext?.worldDay || ''} · ${data.sceneContext?.region || ''}\n`,
    });

    // P0: task instruction + JSON schema
    const taskText = `\n请基于判定结果生成回复。评估行动耗时纳入time_elapsed。叙述结果(2-6句)。生成3个选项。评估角色状态变化。${this.dialogueFormattingRule()}\n
返回JSON（直接返回JSON，不要代码块）：
{
  "narrative":"行动结果叙述",
  "time_elapsed":"15分钟",
  "current_location":"具体位置",
  "choices":[{"text":"选项","hint":"","tendency":"combat/social/explore/opportunistic/avoid"}],
  "consequences":{
    "items_gained":[],"items_lost":[],"items_modified":[],"skills_modified":[],
    "currency_change":{"gold":0,"silver":0,"copper":0},"reputation_change":{},"world_effects":[],
    "skills_learned":[],"hp_change":0,
    "state_changes":{"hunger":3,"thirst":2,"fatigue":5,"hygiene":1,"morale":0,"wound":0,"temperature":0,"encumbrance":0},
    "attribute_changes":{},"identity_changes":{},"conditions_added":[],"conditions_removed":[]
  },
  "npcs_introduced":[],"scene_modifier":0,"atmosphere":{"mood":"轻松","danger_level":"low"}
}`;
    components.push({
      id: 'task_instruction',
      priority: COMPONENT_PRIORITIES.task_instruction,
      fullTokens: estimateTokens(taskText), slimTokens: estimateTokens(taskText),
      relevanceScore: 100,
      buildFull: () => taskText, buildSlim: () => taskText,
    });

    // P2: known NPCs
    if (data.knownNPCs && data.knownNPCs.length > 0) {
      const regionNPCs = data.knownNPCs.filter(n => n.isMet && n.region === data.sceneContext?.region);
      if (regionNPCs.length > 0) {
        const sorted = [...regionNPCs].sort((a, b) => (b.relationship.attitude || 0) - (a.relationship.attitude || 0));
        const top5 = sorted.slice(0, 5);
        const npcFull = '\n【已认识的NPC】\n' + top5.map(n => `${n.name}(${n.title}): ${n.relationship.level}, 好感${n.relationship.attitude}`).join('\n') + '\n';
        const npcSlim = '\n【NPC】' + top5.map(n => n.name).join('、') + '\n';
        components.push({
          id: 'known_npcs_top5',
          priority: COMPONENT_PRIORITIES.known_npcs_top5,
          fullTokens: estimateTokens(npcFull), slimTokens: estimateTokens(npcSlim),
          relevanceScore: 55,
          queryHints: COMPONENT_QUERY_HINTS.known_npcs_top5,
          buildFull: () => npcFull, buildSlim: () => npcSlim,
        });
      }
    }

    // P3: world lore
    if (data.worldLore) {
      components.push({
        id: 'world_lore_full',
        priority: COMPONENT_PRIORITIES.world_lore_full,
        fullTokens: estimateTokens(data.worldLore), slimTokens: Math.min(estimateTokens(data.worldLore), 60),
        relevanceScore: 10,
        queryHints: COMPONENT_QUERY_HINTS.world_lore_full,
        buildFull: () => `【世界观】\n${data.worldLore}\n\n`,
        buildSlim: () => data.worldLore ? `【世界观】${data.worldLore.slice(0, 200)}\n` : '',
      });
    }

    // P3: recent messages — use HistoryCompressor for budget-controlled compression
    if (data.recentMessages && data.recentMessages.length > 0) {
      const compressor = new HistoryCompressor();
      const messages = data.recentMessages.map(m => ({
        id: '',
        type: m.role === 'player' ? 'player' as const : m.role === 'pm' ? 'pm' as const : 'system' as const,
        content: m.content,
        timestamp: 0,
      }));
      const compressed = compressor.compress(messages, 600);
      const fullMsgs = '\n【最近对话】\n' + messages.slice(-16).map(m => `${m.type === 'player' ? '玩家' : 'GM'}: ${m.content.slice(0, 150)}`).join('\n') + '\n';
      const slimMsgs = '\n' + compressed + '\n';
      components.push({
        id: 'recent_context_all',
        priority: COMPONENT_PRIORITIES.recent_context_all,
        fullTokens: estimateTokens(fullMsgs), slimTokens: estimateTokens(slimMsgs),
        relevanceScore: 60,
        buildFull: () => fullMsgs, buildSlim: () => slimMsgs,
      });
    }

    budget.registerBatch(components);
    const allocation = budget.allocate();

    // Assemble prompt from allocations
    let prompt = '';
    for (const comp of components) {
      const alloc = allocation.get(comp.id);
      if (alloc && alloc.mode !== 'defer_to_query' && alloc.content) {
        prompt += alloc.content;
      }
    }

    // Append query hints if any components deferred
    const hintsText = budget.buildQueryHintText(allocation);
    if (hintsText) {
      prompt += '\n' + hintsText + '\n';
    }

    // Append ghost NPC encounter hint
    prompt += this.buildGhostEncounterHint(data);

    return { prompt, budget, allocation };
  }
}
