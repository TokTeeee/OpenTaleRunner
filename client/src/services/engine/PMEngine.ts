/**
 * PM / GM 推理核心服务。
 * 负责组装 Prompt、协调 Query Protocol、调用 LLM 并解析结构化场景/叙事结果。
 * 它只返回业务结果，不直接修改各个 store；真正的状态落地由上层 orchestration 负责。
 */
import type { SceneContext, SceneResponse, JudgeParams, NarrativeResponse, ActionContext } from '../../types/game';
import type { Character } from '../../types/character';
import type { GhostNPC, RegionData, WorldChronicleEntry, MilestoneStatus } from '../../types/world';
import type { LLMConfig } from '../../types/llm';
import { LLMClient } from '../llm/LLMClient';
import { parseToolCalls } from '../llm/toolcallParser';
import { PromptBuilder } from './PromptBuilder';
import { absurdityToLC } from '../../utils/dice';
import { logger } from '../../utils/logger';
import { resolveQueries, buildQueryResultText } from './QueryResolver';
import { eventBus } from '../event/EventBus';
import { EVENTS } from '../event/events';
import { useGameStore } from '../../stores/gameStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type { GMQuery } from './QueryResolver';
import type { GameNPC } from '../../types/npc';

const ACTIVITY_MAP: Record<string, string> = {
  inventory_search: 'GM 正在查看你的背包',
  npc_lookup: 'GM 正在回想认识的 NPC',
  location_info: 'GM 正在确认你的位置',
  character_state: 'GM 正在检查你的状态',
  skill_check: 'GM 正在评估你的技能',
  recent_events: 'GM 正在回顾近期经历',
  world_lore: 'GM 正在查阅世界观',
};

interface PMEngineContext {
  worldLore: string;
  currentEra: string;
  milestones: MilestoneStatus[];
  recentChronicle: WorldChronicleEntry[];
  regionStates: Map<string, RegionData>;
  ghostNPCs: GhostNPC[];
  knownNPCs: GameNPC[];
  recentMessages: Array<{ role: string; content: string }>;
  lastNarrative: string;
  narrativeGuide?: Record<string, unknown>;
}

export class PMEngine {
  private llmClient: LLMClient;
  private promptBuilder: PromptBuilder;
  private context: PMEngineContext;

  constructor(config: LLMConfig, context: PMEngineContext) {
    this.llmClient = new LLMClient(config);
    this.promptBuilder = new PromptBuilder();
    this.context = context;
  }

  updateLLMConfig(config: LLMConfig): void {
    this.llmClient.updateConfig(config);
  }

  updateContext(context: Partial<PMEngineContext>): void {
    this.context = { ...this.context, ...context };
  }

  async generateScene(
    character: Character,
    sceneContext: SceneContext,
    regionState?: RegionData,
  ): Promise<SceneResponse> {
    const region = regionState ?? this.context.regionStates.get(sceneContext.region);
    const promptString = this.promptBuilder.buildSceneGeneratePrompt({
      worldLore: this.context.worldLore,
      currentEra: this.context.currentEra,
      milestones: this.context.milestones,
      recentChronicle: this.context.recentChronicle,
      character,
      sceneContext,
      regionState: region,
      ghostNPCs: this.context.ghostNPCs,
      knownNPCs: this.context.knownNPCs,
      recentMessages: this.context.recentMessages,
      lastNarrative: this.context.lastNarrative,
      narrativeGuide: this.context.narrativeGuide,
      structuredLocation: useGameStore.getState().currentStructuredLocation,
    });

    const response = await this.llmClient.chat(promptString, '');
    return this.parseSceneResponse(response);
  }

  async *streamGenerateScene(
    character: Character,
    sceneContext: SceneContext,
    regionState?: RegionData,
  ): AsyncGenerator<string> {
    const region = regionState ?? this.context.regionStates.get(sceneContext.region);
    const promptString = this.promptBuilder.buildSceneGeneratePrompt({
      worldLore: this.context.worldLore,
      currentEra: this.context.currentEra,
      milestones: this.context.milestones,
      recentChronicle: this.context.recentChronicle,
      character,
      sceneContext,
      regionState: region,
      ghostNPCs: this.context.ghostNPCs,
      knownNPCs: this.context.knownNPCs,
      recentMessages: this.context.recentMessages,
      lastNarrative: this.context.lastNarrative,
      narrativeGuide: this.context.narrativeGuide,
      structuredLocation: useGameStore.getState().currentStructuredLocation,
    });

    yield* this.llmClient.streamChat(promptString, '');
  }

  async evaluateAction(
    character: Character,
    actionContext: ActionContext,
    regionState?: RegionData,
  ): Promise<JudgeParams> {
    const region = regionState ?? this.context.regionStates.get(actionContext.region);
    const promptString = this.promptBuilder.buildActionEvaluatePrompt({
      worldLore: this.context.worldLore,
      character,
      sceneContext: {
        worldDay: actionContext.worldDay,
        region: actionContext.region,
        subRegion: actionContext.subRegion,
        coordinates: actionContext.coordinates,
        terrain: actionContext.terrain,
        weather: actionContext.weather,
        factions: actionContext.factions,
        recentEvents: actionContext.recentEvents,
        remainingActionPoints: 0,
      },
      regionState: region,
      ghostNPCs: this.context.ghostNPCs,
      actionContext,
    });

    const response = await this.llmClient.chat(promptString, '');
    return this.parseJudgeResponse(response);
  }

  async advanceNarrative(
    character: Character,
    actionContext: ActionContext,
    diceResultStr: string,
    regionState?: RegionData,
  ): Promise<NarrativeResponse> {
    return this.combinedAdvance(character, actionContext, diceResultStr, true, regionState);
  }

  async combinedAdvance(
    character: Character,
    actionContext: ActionContext,
    diceResultStr: string,
    _includeNextScene: boolean = true,
    regionState?: RegionData,
  ): Promise<NarrativeResponse> {
    const settings = useSettingsStore.getState();
    if (settings.experimental.enableTokenBudget) {
      return this.combinedAdvanceWithBudget(character, actionContext, diceResultStr);
    }

    const promptString = this.buildCombinedAdvancePromptString(character, actionContext, diceResultStr, regionState);

    const response = await this.llmClient.chat(promptString, '');
    return this.parseNarrativeResponse(response);
  }

  /**
   * 流式版本的 combinedAdvance.
   *
   * 审计 P2 修复: 原 combinedAdvance() 仅走 llmClient.chat() 非流式, 用户在长叙事生成期间无任何反馈.
   * 新增 streamCombinedAdvance() 复用相同 prompt 装配, 但走 llmClient.streamChat() 逐 chunk yield.
   *
   * 注意: 流式仍需在结束时调用 parseNarrativeResponse 解析完整文本. 调用方应:
   *  ```ts
   *  let buf = '';
   *  for await (const chunk of pm.streamCombinedAdvance(...)) {
   *    buf += chunk;
   *    ui.appendText(chunk);
   *  }
   *  const result = pm.parseNarrativeResponse(buf);
   *  ```
   *
   * budget 模式不支持流式(预算推导需要整段 prompt 完整组装), 在该模式下自动 fallback 到非流式 combinedAdvanceWithBudget.
   */
  async *streamCombinedAdvance(
    character: Character,
    actionContext: ActionContext,
    diceResultStr: string,
    _includeNextScene: boolean = true,
    regionState?: RegionData,
  ): AsyncGenerator<string, NarrativeResponse, void> {
    const settings = useSettingsStore.getState();
    if (settings.experimental.enableTokenBudget) {
      // budget 模式不支持流式, fallback 到非流式并 yield 整段
      const result = await this.combinedAdvanceWithBudget(character, actionContext, diceResultStr);
      yield result.narrative;
      return result;
    }

    const promptString = this.buildCombinedAdvancePromptString(character, actionContext, diceResultStr, regionState);
    let fullText = '';
    for await (const chunk of this.llmClient.streamChat(promptString, '')) {
      fullText += chunk;
      yield chunk;
    }
    // 解析完整响应作为 generator 的返回值
    return this.parseNarrativeResponse(fullText);
  }

  /** combinedAdvance / streamCombinedAdvance 共享的 prompt 装配逻辑, 避免双份维护 */
  private buildCombinedAdvancePromptString(
    character: Character,
    actionContext: ActionContext,
    diceResultStr: string,
    regionState?: RegionData,
  ): string {
    const region = regionState ?? this.context.regionStates.get(actionContext.region);
    return this.promptBuilder.buildCombinedAdvancePrompt({
      worldLore: this.context.worldLore,
      character,
      sceneContext: {
        worldDay: actionContext.worldDay,
        region: actionContext.region,
        subRegion: actionContext.subRegion,
        coordinates: actionContext.coordinates,
        terrain: actionContext.terrain,
        weather: actionContext.weather,
        factions: actionContext.factions,
        recentEvents: actionContext.recentEvents,
        remainingActionPoints: 0,
      },
      regionState: region,
      ghostNPCs: this.context.ghostNPCs,
      knownNPCs: this.context.knownNPCs,
      actionContext,
      lastNarrative: this.context.lastNarrative,
      recentMessages: this.context.recentMessages,
      structuredLocation: useGameStore.getState().currentStructuredLocation,
    }, diceResultStr);
  }

  private async combinedAdvanceWithBudget(
    character: Character,
    actionContext: ActionContext,
    diceResultStr: string,
  ): Promise<NarrativeResponse> {
    const { prompt, budget, allocation } = this.promptBuilder.buildCombinedAdvanceWithBudget({
      character,
      sceneContext: {
        worldDay: actionContext.worldDay,
        region: actionContext.region,
        subRegion: actionContext.subRegion,
        coordinates: actionContext.coordinates,
        terrain: actionContext.terrain,
        weather: actionContext.weather,
        factions: actionContext.factions,
        recentEvents: actionContext.recentEvents,
        remainingActionPoints: 0,
      },
      lastNarrative: this.context.lastNarrative,
      recentMessages: this.context.recentMessages,
      knownNPCs: this.context.knownNPCs,
      structuredLocation: useGameStore.getState().currentStructuredLocation,
      worldLore: this.context.worldLore,
    }, diceResultStr, actionContext.playerAction);

    const level = budget.getBudgetLevel(allocation);
    logger.info('PM', `TokenBudget: ${level} level, ${budget.getMaxInputTokens()} max, ${allocation.size} components`);

    const response = await this.llmClient.chat(prompt, '');
    return this.parseNarrativeResponse(response);
  }

  async combinedAdvanceWithQueries(
    character: Character,
    actionContext: ActionContext,
    diceResultStr: string,
  ): Promise<NarrativeResponse> {
    const MAX_ROUNDS = 3;
    let fullHistory = '';

    for (let round = 0; round < MAX_ROUNDS; round++) {
      const promptString = this.promptBuilder.buildCombinedAdvanceWithQueriesPrompt({
        worldLore: this.context.worldLore,
        character,
        sceneContext: {
          worldDay: actionContext.worldDay,
          region: actionContext.region,
          subRegion: actionContext.subRegion,
          coordinates: actionContext.coordinates,
          terrain: actionContext.terrain,
          weather: actionContext.weather,
          factions: actionContext.factions,
          recentEvents: actionContext.recentEvents,
          remainingActionPoints: 0,
        },
      }, diceResultStr, actionContext.playerAction, fullHistory);

      const response = await this.llmClient.chat(promptString, '');
      const json = this.extractJson(response);

      // Try to extract query/narrative from the response
      const responseType = json.type as string | undefined;

      if (responseType === 'query' && Array.isArray(json.queries)) {
        const queries = json.queries as GMQuery[];
        const intents = queries.map(q => q.intent);
        const activityHint = intents.map(i => ACTIVITY_MAP[i] || 'GM 正在查询数据').find(Boolean) || 'GM 正在查询数据';
        eventBus.emit(EVENTS.GM_ACTIVITY, { activity: activityHint });

        const results = resolveQueries(queries);
        const resultText = buildQueryResultText(results);
        fullHistory += `\n[查询轮次${round + 1}]\nGM查询: ${json.reasoning || '获取数据'}\n查询结果:\n${resultText}\n`;
        logger.info('PM', `Query round ${round + 1}: ${intents.join(', ')}`);
        continue;
      }

      // Clear activity on narrative
      eventBus.emit(EVENTS.GM_ACTIVITY, { activity: '' });

      // If not a query response, treat as final narrative
      return this.parseNarrativeResponse(response);
    }

    // Max rounds exceeded — parse whatever we have as narrative
    logger.warn('PMEngine', 'Max query rounds exceeded, treating as narrative');
    return this.parseNarrativeResponse(fullHistory || '');
  }

  abort(): void {
    this.llmClient.abort();
  }

  parseSceneResponse(raw: string): SceneResponse {
    try {
      const json = this.extractJson(raw);
      const atmosphere = this.asAtmosphere(json.atmosphere);
      return {
        sceneDescription: typeof json.scene_description === 'string' ? json.scene_description : raw,
        choices: this.asChoices(json.choices),
        sceneModifier: typeof json.scene_modifier === 'number' ? json.scene_modifier : 0,
        atmosphere,
        currentLocation: typeof json.current_location === 'string' ? json.current_location : '',
      };
    } catch {
      return {
        sceneDescription: raw,
        choices: this.defaultChoices(),
        sceneModifier: 0,
        atmosphere: { mood: '平凡', dangerLevel: 'low' },
        currentLocation: '',
      };
    }
  }

  /**
   * v0.4 战斗系统补齐: 在 v0.3 parseNarrativeResponse 基础上, 预先提取 <tool_call>{}</tool_call> 块.
   * 流程:
   * 1. parseToolCalls(raw) 拆出 narrative 清洁文本 + 结构化 toolCalls
   * 2. parseNarrativeResponse(cleanNarrative) 走 v0.3 narrative JSON 解析
   * 3. 把 toolCalls 附加到返回结果
   *
   * 调用方拿到返回后, 可选择性调 ToolCallRegistry.dispatch(toolCalls, ctx) 串行执行.
   */
  parseNarrativeWithToolCalls(raw: string): NarrativeResponse {
    const { narrative, toolCalls } = parseToolCalls(raw);
    const result = this.parseNarrativeResponse(narrative);
    if (toolCalls.length > 0) {
      result.toolCalls = toolCalls;
    }
    return result;
  }

  private parseJudgeResponse(raw: string): JudgeParams {
    try {
      const json = this.extractJson(raw);
      const absurdityLevel = typeof json.absurdity_level === 'number' ? json.absurdity_level : 5;
      return {
        absurdityLevel,
        difficultyLC: absurdityToLC(absurdityLevel),
        reason: typeof json.reason === 'string' ? json.reason : '',
        relevantSkill: typeof json.relevant_skill === 'string' ? json.relevant_skill : null,
        relevantAttribute: typeof json.relevant_attribute === 'string' ? json.relevant_attribute : null,
      };
    } catch {
      return {
        absurdityLevel: 5,
        difficultyLC: 8,
        reason: '无法评估',
        relevantSkill: null,
        relevantAttribute: null,
      };
    }
  }

  private parseNarrativeResponse(raw: string): NarrativeResponse {
    try {
      const json = this.extractJson(raw);
      const consequencesJson = this.asRecord(json.consequences);
      return {
        narrative: typeof json.narrative === 'string' ? json.narrative : raw,
        npcsIntroduced: this.asNpcIntroduced(json.npcs_introduced),
        sceneDescription: typeof json.scene_description === 'string' ? json.scene_description : '',
        timeElapsed: typeof json.time_elapsed === 'string' ? json.time_elapsed : '',
        setTime: typeof json.set_time === 'string' ? json.set_time : (typeof json.setTime === 'string' ? json.setTime : undefined),
        currentLocation: typeof json.current_location === 'string' ? json.current_location : '',
        choices: this.asChoices(json.choices),
        sceneModifier: typeof json.scene_modifier === 'number' ? json.scene_modifier : 0,
        atmosphere: this.asAtmosphere(json.atmosphere),
        consequences: {
          itemsGained: this.asArray(consequencesJson.items_gained),
          itemsLost: this.asArray(consequencesJson.items_lost),
          itemsModified: this.asArray(consequencesJson.items_modified),
          skillsModified: this.asArray(consequencesJson.skills_modified),
          currencyChange: this.asRecord(consequencesJson.currency_change) as { gold?: number; silver?: number; copper?: number },
          reputationChange: this.asRecord(consequencesJson.reputation_change) as Record<string, number>,
          worldEffects: this.asStringArray(consequencesJson.world_effects),
          skillsLearned: this.asArray(consequencesJson.skills_learned),
          hpChange: typeof consequencesJson.hp_change === 'number' ? consequencesJson.hp_change : 0,
          stateChanges: this.asRecord(consequencesJson.state_changes) as NarrativeResponse['consequences']['stateChanges'],
          attributeChanges: this.asRecord(consequencesJson.attribute_changes) as NarrativeResponse['consequences']['attributeChanges'],
          identityChanges: this.asRecord(consequencesJson.identity_changes) as NarrativeResponse['consequences']['identityChanges'],
          conditionsAdded: this.asStringArray(consequencesJson.conditions_added),
          conditionsRemoved: this.asStringArray(consequencesJson.conditions_removed),
        },
      };
    } catch {
      return {
        narrative: raw, npcsIntroduced: [], sceneDescription: '', timeElapsed: '', currentLocation: '', choices: this.defaultChoices(),
        sceneModifier: 0, atmosphere: { mood: '平凡', dangerLevel: 'low' },
        consequences: { itemsGained: [], itemsLost: [], itemsModified: [], skillsModified: [], currencyChange: {}, reputationChange: {}, worldEffects: [], skillsLearned: [], hpChange: 0, stateChanges: {} },
      };
    }
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  }

  private asArray<T>(value: unknown): T[] {
    return Array.isArray(value) ? value as T[] : [];
  }

  private asStringArray(value: unknown): string[] {
    return this.asArray<unknown>(value).filter((entry): entry is string => typeof entry === 'string');
  }

  private asChoices(value: unknown): SceneResponse['choices'] {
    return Array.isArray(value) ? value as SceneResponse['choices'] : this.defaultChoices();
  }

  private asNpcIntroduced(value: unknown): NarrativeResponse['npcsIntroduced'] {
    return Array.isArray(value) ? value as NarrativeResponse['npcsIntroduced'] : [];
  }

  private asAtmosphere(value: unknown): { mood: string; dangerLevel: string } {
    const entry = this.asRecord(value);
    return {
      mood: typeof entry.mood === 'string' ? entry.mood : '平凡',
      dangerLevel: typeof entry.dangerLevel === 'string' ? entry.dangerLevel : 'low',
    };
  }

  private extractJson(raw: string): Record<string, unknown> {
    let text = this.unwrapCodeFence(raw);
    // 去掉末尾非法逗号
    text = text.replace(/,(\s*[}\]])/g, '$1');
    // 找到第一个完整的 JSON 对象
    let depth = 0, start = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') { if (depth === 0) start = i; depth++; }
      else if (text[i] === '}') { depth--; if (depth === 0 && start >= 0) { text = text.slice(start, i + 1); break; } }
    }
    try { return JSON.parse(text); }
    catch {
      logger.warn('PMEngine', `JSON parse failed, raw: ${raw.slice(0, 300)}`);
      const loose = this.extractLooseJsonFields(raw);
      return Object.keys(loose).length > 0 ? loose : { narrative: this.unwrapCodeFence(raw) };
    }
  }

  private unwrapCodeFence(raw: string): string {
    const text = raw.trim();
    const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    return codeBlock ? codeBlock[1].trim() : text;
  }

  private extractLooseJsonFields(raw: string): Record<string, unknown> {
    const text = this.unwrapCodeFence(raw).replace(/,(\s*[}\]])/g, '$1');
    const narrative = this.extractFirstStringField(text, ['narrative', 'nraid', 'scene_description']);
    const sceneDescription = this.extractFirstStringField(text, ['scene_description']);
    const timeElapsed = this.extractFirstStringField(text, ['time_elapsed']);
    const setTime = this.extractFirstStringField(text, ['set_time', 'setTime']);
    const currentLocation = this.extractScalarField(text, 'current_location');
    const sceneModifierRaw = this.extractScalarField(text, 'scene_modifier');
    const choices = this.parseJsonFragment<SceneResponse['choices']>(this.extractBalancedFragmentAfterKey(text, 'choices', '[', ']'));
    const consequences = this.parseJsonFragment<Record<string, unknown>>(this.extractBalancedFragmentAfterKey(text, 'consequences', '{', '}'));
    const atmosphere = this.parseJsonFragment<Record<string, unknown>>(this.extractBalancedFragmentAfterKey(text, 'atmosphere', '{', '}'));
    const npcsIntroduced = this.parseJsonFragment<NarrativeResponse['npcsIntroduced']>(this.extractBalancedFragmentAfterKey(text, 'npcs_introduced', '[', ']'));

    const loose: Record<string, unknown> = {};
    if (narrative) loose.narrative = narrative;
    if (sceneDescription) loose.scene_description = sceneDescription;
    if (timeElapsed) loose.time_elapsed = timeElapsed;
    if (setTime) loose.set_time = setTime;
    if (currentLocation) loose.current_location = currentLocation;
    if (sceneModifierRaw && !Number.isNaN(Number(sceneModifierRaw))) loose.scene_modifier = Number(sceneModifierRaw);
    if (choices) loose.choices = choices;
    if (consequences) loose.consequences = consequences;
    if (atmosphere) loose.atmosphere = atmosphere;
    if (npcsIntroduced) loose.npcs_introduced = npcsIntroduced;
    return loose;
  }

  private extractFirstStringField(text: string, keys: string[]): string | undefined {
    for (const key of keys) {
      const value = this.extractScalarField(text, key);
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private extractScalarField(text: string, key: string): string | undefined {
    const pattern = new RegExp(`"${key}"\\s*:\\s*(?:"((?:\\\\.|[^"\\\\])*)"|([^,\\n}\\]]+))`, 'i');
    const match = text.match(pattern);
    if (!match) return undefined;

    if (typeof match[1] === 'string') {
      try {
        return JSON.parse(`"${match[1]}"`) as string;
      } catch {
        return match[1];
      }
    }

    return match[2]?.trim().replace(/^['"]|['"]$/g, '');
  }

  private extractBalancedFragmentAfterKey(
    text: string,
    key: string,
    openChar: '{' | '[',
    closeChar: '}' | ']',
  ): string | null {
    const keyPattern = new RegExp(`"${key}"\\s*:`, 'i');
    const keyMatch = keyPattern.exec(text);
    if (!keyMatch) return null;

    let start = -1;
    for (let i = keyMatch.index + keyMatch[0].length; i < text.length; i++) {
      if (text[i] === openChar) {
        start = i;
        break;
      }
      if (!/\s/.test(text[i])) {
        break;
      }
    }
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i++) {
      const char = text[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) {
        continue;
      }
      if (char === openChar) {
        depth += 1;
      } else if (char === closeChar) {
        depth -= 1;
        if (depth === 0) {
          return text.slice(start, i + 1);
        }
      }
    }

    return null;
  }

  private parseJsonFragment<T>(fragment: string | null): T | undefined {
    if (!fragment) return undefined;
    try {
      return JSON.parse(fragment.replace(/,(\s*[}\]])/g, '$1')) as T;
    } catch {
      return undefined;
    }
  }

  private defaultChoices() {
    return [
      { text: '仔细观察周围环境', hint: '', tendency: 'explore' as const },
      { text: '向前探索', hint: '', tendency: 'explore' as const },
      { text: '先做好准备', hint: '', tendency: 'avoid' as const },
    ];
  }
}
