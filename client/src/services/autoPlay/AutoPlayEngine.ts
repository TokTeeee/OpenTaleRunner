import { LLMClient } from '../llm/LLMClient';
import { useGameStore } from '../../stores/gameStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAutoPlayStore } from '../../stores/autoPlayStore';
import { logger } from '../../utils/logger';
import type { PlayerDecision, PlayerDecisionContext } from '../../types/autoPlay';

export class AutoPlayEngine {
  private playerLLM: LLMClient | null = null;
  private abortController: AbortController | null = null;
  private loopTimer: ReturnType<typeof setTimeout> | null = null;
  private isActive = false;
  private consecutiveErrors = 0;

  private readonly submitAction: (action: string) => Promise<void>;

  constructor(submitAction: (action: string) => Promise<void>) {
    this.submitAction = submitAction;
  }

  private getLLMClient(): LLMClient | null {
    const settings = useSettingsStore.getState();
    const config = settings.getAutoPlayLLMContext();
    if (!config) return null;
    return new LLMClient({
      provider: config.provider,
      apiKey: config.apiKey,
      endpoint: config.endpoint,
      model: config.model,
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    });
  }

  start(): void {
    if (this.isActive) return;
    const store = useAutoPlayStore.getState();
    if (store.status === 'running') return;

    this.playerLLM = this.getLLMClient();
    if (!this.playerLLM) {
      useAutoPlayStore.getState().setErrorMessage('请先配置 AI API Key');
      return;
    }

    this.isActive = true;
    this.consecutiveErrors = 0;
    useAutoPlayStore.getState().setStatus('running');
    logger.info('AutoPlay', 'Engine started');
    this.scheduleNextRound();
  }

  pause(): void {
    if (!this.isActive) return;
    this.isActive = false;
    this.cancelTimers();
    useAutoPlayStore.getState().setStatus('paused');
    logger.info('AutoPlay', 'Engine paused');
  }

  resume(): void {
    if (this.isActive) return;
    const store = useAutoPlayStore.getState();
    if (store.status !== 'paused') return;

    this.playerLLM = this.getLLMClient();
    if (!this.playerLLM) {
      useAutoPlayStore.getState().setErrorMessage('请先配置 AI API Key');
      return;
    }

    this.isActive = true;
    this.consecutiveErrors = 0;
    useAutoPlayStore.getState().setStatus('running');
    logger.info('AutoPlay', 'Engine resumed');
    this.scheduleNextRound();
  }

  stop(): void {
    this.isActive = false;
    this.cancelTimers();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    // 修复: 之前无论何时都 setStatus('idle'),导致 setErrorMessage 设的 'error' 状态被立刻覆盖
    // 语义: 已经是 'error' 时保留以便 UI 显示错误信息;其他情况回归 'idle'
    const current = useAutoPlayStore.getState().status;
    if (current !== 'error') {
      useAutoPlayStore.getState().setStatus('idle');
    }
    logger.info('AutoPlay', 'Engine stopped');
  }

  /**
   * 强制重置到 idle(忽略 error 状态)。用于:
   *  - 外部"重置"按钮
   *  - scheduleNextRound 正常完成轮次
   *  - 用户主动取消
   */
  forceStop(): void {
    this.isActive = false;
    this.cancelTimers();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    useAutoPlayStore.getState().setStatus('idle');
    logger.info('AutoPlay', 'Engine force-stopped');
  }

  step(): void {
    if (this.isActive) return;
    const store = useAutoPlayStore.getState();
    if (store.status === 'running') return;

    this.playerLLM = this.getLLMClient();
    if (!this.playerLLM) {
      useAutoPlayStore.getState().setErrorMessage('请先配置 AI API Key');
      return;
    }

    this.isActive = true;
    this.consecutiveErrors = 0;
    useAutoPlayStore.getState().setStatus('running');
    logger.info('AutoPlay', 'Single step started');
    this.processSingleRound();
  }

  private async processSingleRound(): Promise<void> {
    try {
      await this.processRound();
    } catch {
      // ignore errors in single step
    }
    if (useAutoPlayStore.getState().status !== 'error') {
      this.isActive = false;
      useAutoPlayStore.getState().setStatus('idle');
    }
  }

  private cancelTimers(): void {
    if (this.loopTimer) { clearTimeout(this.loopTimer); this.loopTimer = null; }
  }

  private scheduleNextRound(): void {
    if (!this.isActive) return;
    this.cancelTimers();

    const store = useAutoPlayStore.getState();
    if (store.totalRounds > 0 && store.currentRound >= store.totalRounds) {
      // 正常完成所有轮次 — 用 forceStop 回到 idle(不影响 error 状态,因为此处不可能是 error)
      this.forceStop();
      return;
    }

    const delay = store.intervalMs;
    this.loopTimer = setTimeout(() => this.processRound(), delay);
  }

  private async processRound(): Promise<void> {
    if (!this.isActive) return;

    const gameState = useGameStore.getState();
    const charState = useCharacterStore.getState();
    const character = charState.character;

    if (!character) {
      useAutoPlayStore.getState().setErrorMessage('无角色数据');
      this.stop();
      return;
    }

    if (gameState.isWaitingForPM) {
      this.scheduleNextRound();
      return;
    }

    if (!gameState.isWaitingForPlayer || gameState.currentChoices.length === 0) {
      this.scheduleNextRound();
      return;
    }

    try {
      const ctx: PlayerDecisionContext = {
        characterName: character.name,
        characterBackground: character.background,
        attributes: { ...character.attributes },
        hp: character.hp,
        maxHp: character.maxHp,
        vital: { ...(character.vital || {}) },
        recentActions: (character.recentHistory || []).slice(-5).map((h: { summary: string }) => h.summary),
        sceneDescription: gameState.messages.filter(m => m.type === 'pm').slice(-1)[0]?.content || '',
        choices: gameState.currentChoices,
      };

      const decision = await this.callPlayerAI(ctx);

      useAutoPlayStore.getState().setCurrentRound(useAutoPlayStore.getState().currentRound + 1);
      useAutoPlayStore.getState().setLastReasoning(decision.reasoning);

      let action: string;
      if (decision.choiceIndex >= 0 && decision.choiceIndex < ctx.choices.length) {
        action = ctx.choices[decision.choiceIndex].text;
      } else if (decision.customAction.trim()) {
        action = decision.customAction.trim();
      } else {
        action = ctx.choices[0]?.text || '继续探索';
      }

      useAutoPlayStore.getState().setLastAction(action);
      logger.info('AutoPlay', `Round ${useAutoPlayStore.getState().currentRound}: "${action}" (${decision.reasoning})`);

      await this.submitAction(action);

      this.consecutiveErrors = 0;
    } catch (err) {
      this.consecutiveErrors++;
      const msg = (err as Error).message || String(err);
      logger.error('AutoPlay', `Round error: ${msg}`);
      useAutoPlayStore.getState().setLastAction(`[错误] ${msg.slice(0, 60)}`);

      if (this.consecutiveErrors >= 3) {
        useAutoPlayStore.getState().setErrorMessage(`连续${this.consecutiveErrors}次失败: ${msg.slice(0, 80)}`);
        this.stop();
        return;
      }
    }

    this.scheduleNextRound();
  }

  private async callPlayerAI(ctx: PlayerDecisionContext): Promise<PlayerDecision> {
    if (!this.playerLLM) {
      this.playerLLM = this.getLLMClient();
    }
    if (!this.playerLLM) throw new Error('No LLM client configured');

    const choicesText = ctx.choices.map((c, i) => `[${i}] ${c.text} (${c.tendency})`).join('\n');

    const systemPrompt = `你是一个角色决策助手。你的任务是替角色"${ctx.characterName}"在当前的TRPG场景中做出选择或行动。
你必须完全站在角色的角度思考，基于角色的背景、性格和当前状态做出合理的决策。
不要总是选最优策略——真实的角色会有情感和冲动。
不要输出除JSON以外的任何内容。`;

    const userPrompt = `【角色档案】
姓名: ${ctx.characterName}
背景: ${ctx.characterBackground}
属性: ${JSON.stringify(ctx.attributes)}
HP: ${ctx.hp}/${ctx.maxHp}
状态: ${JSON.stringify(ctx.vital)}
${ctx.recentActions.length > 0 ? `近期行为: ${ctx.recentActions.join('、')}` : ''}

【当前场景】
${ctx.sceneDescription.slice(0, 1000)}

【可选行动】
${choicesText}

【决策指令】
请基于角色的背景、性格和当前状态，选择最合理的行动。
如果选项中有符合角色当前倾向的选择，直接选它。
如果没有合适的选项，可以自定义行动。

输出JSON格式:
{"choice_index": -1, "custom_action": "自定义行动文本", "reasoning": "选择理由", "style": "combat/social/explore"}

- choice_index: 从可选行动中选择第几个(-1表示自定义行动)
- custom_action: 如果choice_index为-1，在这里写自定义行动文本
- reasoning: 一句话解释为什么这样选择
- style: 行动类型 combat/social/explore`;

    const resp = await this.playerLLM.chat(systemPrompt + '\n\n' + userPrompt, '');
    return this.parsePlayerDecision(resp);
  }

  private parsePlayerDecision(raw: string): PlayerDecision {
    const clean = raw.trim();
    const codeBlock = clean.match(/```(?:json)?\s*([\s\S]*?)```/);
    let text = codeBlock ? codeBlock[1].trim() : clean;
    text = text.replace(/,(\s*[}\]])/g, '$1');

    let depth = 0, start = -1;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '{') { if (depth === 0) start = i; depth++; }
      else if (text[i] === '}') { depth--; if (depth === 0 && start >= 0) { text = text.slice(start, i + 1); break; } }
    }

    try {
      const json = JSON.parse(text);
      return {
        choiceIndex: typeof json.choice_index === 'number' ? json.choice_index : -1,
        customAction: json.custom_action || '',
        reasoning: json.reasoning || '',
        style: json.style || 'explore',
      };
    } catch {
      logger.warn('AutoPlay', `Decision parse failed, raw: ${raw.slice(0, 200)}`);
      return { choiceIndex: 0, customAction: '', reasoning: '解析失败，选择默认选项', style: 'explore' };
    }
  }
}