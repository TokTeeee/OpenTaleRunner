import { useState, useEffect, useCallback } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useCharacterStore } from '../../stores/characterStore';
import { useCharacterListStore } from '../../stores/characterListStore';
import { useMultiplayerStore } from '../../stores/multiplayerStore';
import { useWorldStore } from '../../stores/worldStore';
import { LLMClient } from '../../services/llm/LLMClient';
import { PromptBuilder } from '../../services/engine/PromptBuilder';
import { generateInitialAttributes, validateAttributes } from '../../utils/formula';
import type { Character, Attributes, AttributeName, Skill, ClassSkillNode } from '../../types/character';
import type { LLMConfig } from '../../types/llm';
import { ATTRIBUTE_NAMES, ATTRIBUTE_LABELS } from '../../types/character';
import { generateId } from '../../utils/text';
import { getWorldLore, getWorldName, resolveStartingContext } from '../../services/storybook/runtime';
import { CLASS_LIST, getClass } from '../../data/classes';
import type { ClassId, ClassNode } from '../../types/class';

const WIZARD_TOTAL_STEPS = 7;
type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

function getBirthCoordinateBounds(locations: Array<{ coordinates?: { x: number; z: number } }>) {
  const coords = locations
    .map((location) => location.coordinates)
    .filter((coordinates): coordinates is { x: number; z: number } => typeof coordinates?.x === 'number' && typeof coordinates?.z === 'number');

  if (coords.length === 0) {
    return { minX: -50000, maxX: 50000, minZ: -50000, maxZ: 50000 };
  }

  return {
    minX: Math.min(...coords.map((coord) => coord.x)) - 20000,
    maxX: Math.max(...coords.map((coord) => coord.x)) + 20000,
    minZ: Math.min(...coords.map((coord) => coord.z)) - 20000,
    maxZ: Math.max(...coords.map((coord) => coord.z)) + 20000,
  };
}

function makeStructuredLocationSnapshot(input: {
  region: string;
  regionName: string;
  subRegion: string;
  specificPlace: string;
  description: string;
  coordinates: { x: number; y: number; z: number };
}) {
  const now = new Date().toISOString();
  return {
    ...input,
    firstVisitedAt: now,
    lastVisitedAt: now,
    visitCount: 1,
    isKnown: true,
  };
}

export function CharacterCreationWizard({
  onComplete,
  onCancel,
  multiplayer,
  initialStep,
}: {
  onComplete: (char: Character) => void;
  onCancel: () => void;
  multiplayer?: {
    roomId: string;
    onReady: (character: Character) => Promise<void>;
  };
  initialStep?: WizardStep;
}) {
  const settings = useSettingsStore();
  const storybook = useWorldStore((s) => s.storybook);
  const worldLore = useWorldStore((s) => s.worldLore);

  const [step, setStep] = useState<WizardStep>(initialStep ?? 1);
  const [loading, setLoading] = useState(false);

  // Step data
  const [birthVillage, setBirthVillage] = useState('');
  const [background, setBackground] = useState('');
  const [attributes, setAttributes] = useState<Attributes>(generateInitialAttributes());
  const [skills, setSkills] = useState<Skill[]>([]);
  const [equipmentSummary, setEquipmentSummary] = useState('');
  const [appearance, setAppearance] = useState('');
  const [characterName, setCharacterName] = useState('');
  // v0.5.2 Step 7 — class
  const [classId, setClassId] = useState<string | null>(null);
  const [classSkills, setClassSkills] = useState<ClassSkillNode[]>([]);
  // Step 7 internal: which class is being picked (null = at class grid)
  const [pickingT1For, setPickingT1For] = useState<ClassId | null>(null);
  // Step 7 internal: whether user explicitly picked "无职业" (vs initial state)
  const [classNonePicked, setClassNonePicked] = useState(false);

  // PM dialogue for background step
  const [bgDialogue, setBgDialogue] = useState<Array<{ role: 'pm' | 'player'; content: string }>>([]);
  const [bgInput, setBgInput] = useState('');
  const [bgRound, setBgRound] = useState(0);
  const [bgDone, setBgDone] = useState(false);

  const [llmClient, setLlmClient] = useState<LLMClient | null>(null);
  const [promptBuilder] = useState(() => new PromptBuilder());
  const [error, setError] = useState<string | null>(null);
  const [customVillage, setCustomVillage] = useState<{ id: string; name: string; coord: string; desc: string; coordinates?: { x: number; z: number } } | null>(null);
  const startInfo = resolveStartingContext(storybook);
  const birthLocations = startInfo.birthLocations;
  const selectedVillage = (customVillage && customVillage.id === birthVillage)
    ? customVillage
    : (birthLocations.find((location) => location.id === birthVillage) || birthLocations[0]);
  const startRegionName = startInfo.regionName;
  const worldName = getWorldName(storybook);
  const resolvedWorldLore = getWorldLore(storybook, worldLore);
  const birthCoordinateBounds = getBirthCoordinateBounds(birthLocations);

  useEffect(() => {
    const config: LLMConfig = {
      provider: settings.llm.provider,
      apiKey: settings.llm.apiKey,
      endpoint: settings.llm.endpoint,
      model: settings.llm.model,
      temperature: settings.llm.temperature,
      maxTokens: settings.llm.maxTokens,
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- LLMClient construction guarded by settings; refactor in v0.4
    setLlmClient(new LLMClient(config));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only initialization; tracked for v0.4
  }, []);

  useEffect(() => {
    if (!birthVillage && birthLocations[0]?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- default selection sync; refactor in v0.4
      setBirthVillage(birthLocations[0].id);
    }
  }, [birthVillage, birthLocations]);

  const callPM = useCallback(async (systemPrompt: string, userPrompt: string) => {
    if (!llmClient) throw new Error('LLM not ready');
    setLoading(true);
    setError(null);
    try {
      const result = await llmClient.chat(systemPrompt, userPrompt);
      return result;
    } catch (e) {
      setError(`PM 调用失败: ${(e as Error).message}`);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [llmClient]);

  const retryCurrentStep = () => {
    setError(null);
    switch (step) {
      case 1: return; // village select — no LLM call needed
      case 2: if (!characterName && !appearance) generateNameAndAppearance(); return;  // v0.5.14: 名字+外貌
      case 3: return; // attributes — no LLM call
      case 4: return; // v0.5.14: class pick — no LLM call
      case 5: if (!bgDone && bgDialogue.length === 0) startBgDialogue(); else if (!bgDone) continueBgDialogue(); return;  // v0.5.14: 背景
      case 6: generateSkills(); return;   // v0.5.14: 技能
      case 7: generateEquipment(); return; // v0.5.14: 装备
    }
  };

  // Step 1: Start background dialogue (with village assignment)
  const startBgDialogue = async () => {
    const village = selectedVillage || birthLocations[Math.floor(Math.random() * Math.max(1, birthLocations.length))];
    if (!village) {
      setError('缺少可用的出生地，请先加载故事书配置。');
      return;
    }

    const systemPrompt = promptBuilder.buildWorldLayer({
      worldLore: resolvedWorldLore,
    }) + `\n你正在引导一位新冒险者创建角色。所有冒险者都出生在${startRegionName}的某个定居点。`;

    const userPrompt = `玩家出生在${startRegionName}的定居点: ${village.name}${village.coord}。${village.desc}。
请用一段话向玩家提问: "告诉我，你是谁？在${village.name}长大的你，是什么驱使你踏上冒险之路？"`;

    const response = await callPM(systemPrompt, userPrompt);
    setBgDialogue([{ role: 'pm', content: response }]);
    setBgRound(1);
  };

  const continueBgDialogue = async () => {
    if (!bgInput.trim()) return;
    const playerAnswer = bgInput;
    setBgInput('');

    const history = [...bgDialogue, { role: 'player' as const, content: playerAnswer }];
    setBgDialogue(history);

    if (bgRound >= 3) {
      // Summarize and finish
      const summary = await callPM(
        '你正在帮助玩家创建角色。请根据以下对话历史，提炼出这个角色的完整背景故事（3-5句话），包括姓名、出身、性格和冒险动机。回复只包含背景故事文本，不要加额外说明。',
        history.map(m => `${m.role === 'pm' ? 'PM' : '玩家'}: ${m.content}`).join('\n')
      );
      setBackground(summary);
      setBgDone(true);
      return;
    }

    const response = await callPM(
      '你正在引导玩家细化角色背景。根据玩家刚才的回答，追问一个相关的细节问题（比如家庭、训练经历、关键人生事件）。只提问，不要评价。',
      `玩家刚才说: "${playerAnswer}"。请提一个追问。`
    );
    setBgDialogue([...history, { role: 'pm', content: response }]);
    setBgRound(bgRound + 1);
  };

  // Step 3: Re-roll attributes
  const rerollAttributes = () => setAttributes(generateInitialAttributes());

  // Step 4: Generate skills
  const generateSkills = async () => {
    const systemPrompt = promptBuilder.buildWorldLayer({
      worldLore: resolvedWorldLore,
    });
    const prompt = `${systemPrompt}\n角色背景: ${background}\n属性: STR:${attributes.STR} DEX:${attributes.DEX} CON:${attributes.CON} INT:${attributes.INT} WIS:${attributes.WIS} CHA:${attributes.CHA}\n请根据这个角色的背景和属性，生成2-3个合理的出身技能。返回JSON数组：\n[{"name":"技能名","level":1-3,"description":"简短描述","relatedAttribute":"STR/DEX/CON/INT/WIS/CHA"}]`;
    const raw = await callPM(prompt, '');
    try {
      const json = JSON.parse(raw.match(/\[[\s\S]*\]/)?.[0] || raw);
      const generated: Skill[] = json.map((s: Record<string, unknown>, i: number) => ({
        id: `sk_bg_${i}`,
        name: String(s.name),
        level: Number(s.level) || 1,
        maxLevel: 10,
        type: 'background' as const,
        relatedAttribute: (String(s.relatedAttribute)) as AttributeName,
        description: String(s.description),
        acquiredAt: '出身技能',
        experience: 0,
        expToNext: (Number(s.level) || 1) * 3,
      }));
      setSkills(generated);
    } catch {
      setSkills([{
        id: 'sk_default', name: '基础战斗', level: 2, maxLevel: 10, type: 'background',
        relatedAttribute: 'STR', description: '基本的战斗技巧', acquiredAt: '出身技能', experience: 0, expToNext: 6,
      }]);
    }
  };

  // Step 5: Generate equipment
  const generateEquipment = async () => {
    const village = selectedVillage || { name: startInfo.subRegion };
    const prompt = `角色背景: ${background}\n出生在${village.name}（${startRegionName}）。请根据角色背景，列出初始装备。返回JSON: {"equipment_text":"装备描述","weapon":{"name":"武器名","quality":"普通","bonus":0},"armor":{"name":"防具名","quality":"普通","bonus":0}}`;
    const raw = await callPM(prompt, '');
    try { const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw); setEquipmentSummary(json.equipment_text || raw); }
    catch { setEquipmentSummary(`${characterName || '冒险者'}带着简单的装备从${village.name}出发。`); }
  };

  // Step 6: Generate name & appearance if not set
  const generateNameAndAppearance = async () => {
    const prompt = `角色背景: ${background}\n请根据这个角色的背景，生成一个合适的名字和简短的外貌描述（1-2句话）。返回JSON: {"name":"角色名","appearance":"外貌描述"}`;
    const raw = await callPM(prompt, '');
    try {
      const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
      if (!characterName && json.name) setCharacterName(json.name);
      if (!appearance && json.appearance) setAppearance(json.appearance);
    } catch { /* use defaults */ }
  };

  // Step 7: Generate entry scene
  const generateEntryScene = async () => {
    const village = selectedVillage?.name || startInfo.subRegion || '某个定居点';
    const prompt = `新冒险者"${characterName || '未知'}"从${startRegionName}的${village}出发。\n背景: ${background}\n请以2-4句话描写他/她踏上冒险之路的第一幕场景。`;
    return callPM(prompt, '');
  };

  // Finalize character
  const finalizeCharacter = async () => {
    setLoading(true);
    try {
      // Generate entry scene
      const entryScene = await generateEntryScene();
      const villageCoordinates = selectedVillage?.coordinates
        ? { x: selectedVillage.coordinates.x || 0, y: 0, z: selectedVillage.coordinates.z || 0 }
        : { x: 0, y: 0, z: 0 };
      const regionData = storybook?.regions?.find((region) => region.id === startInfo.regionId || region.name === startInfo.regionId);
      const startingLocation = selectedVillage?.name || startInfo.subRegion;

      const char: Character = {
        characterId: generateId(),
        playerId: multiplayer
          ? (useMultiplayerStore.getState().currentPlayerId || ('player_' + Date.now()))
          : ('player_' + Date.now()),
        name: characterName || '无名冒险者',
        race: '人类',
        background,
        appearance: appearance || '一个普通的冒险者',
        attributes,
        skills,
        inventory: {
          equipped: {
            weapon: { name: '铁剑', quality: '普通' as const, category: 'weapon', description: '一把普通的铁制长剑', effects: [], itemId: 'init_weapon' },
            armor: { name: '皮甲', quality: '普通' as const, category: 'armor', description: '简单的皮制护甲', effects: [{ id: 'init_def', type: 'defense_bonus' as const, value: 1, description: '防御+1' }], itemId: 'init_armor' },
            accessory: null,
          },
            backpack: [
              { name: '治疗药水', category: 'consumable' as const, quality: '普通' as const, quantity: 2, description: '红色的治疗药水，能恢复少量生命值', effects: [{ id: 'init_hp', type: 'hp_restore' as const, value: 3, description: '恢复3点HP' }], itemId: 'init_potion', history: [{ timestamp: new Date().toISOString(), event: 'acquired', description: '初始装备' }] },
              { name: '干粮', category: 'consumable' as const, quality: '普通' as const, quantity: 5, description: '能填饱肚子的硬面包', effects: [], itemId: 'init_rations', history: [{ timestamp: new Date().toISOString(), event: 'acquired', description: '初始装备' }] },
            ],
            currency: { gold: 0, silver: 3, copper: 50 },
        },
        hp: 20, maxHp: 20,
        vital: { hunger: 15, thirst: 10, fatigue: 5, hygiene: 10, morale: 70, wound: 0, temperature: 37, encumbrance: 20 },
        reputation: { goodness: 0, violence: 5, lawfulness: 10, regional: {} },
        conditions: [],
        joinedRegion: startInfo.regionId,
        joinedWorldDay: 1,
        currentLocalDay: 1,
        lastActionTime: new Date().toISOString(),
        currentRegion: startInfo.regionId,
        currentSubRegion: startInfo.subRegion,
        currentLocation: startingLocation,
        currentCoordinates: villageCoordinates,
        currentTerrain: regionData?.terrain || '',
        currentWeather: '',
        currentStructuredLocation: makeStructuredLocationSnapshot({
          region: startInfo.regionId,
          regionName: startInfo.regionName,
          subRegion: startInfo.subRegion,
          specificPlace: startingLocation,
          description: entryScene.slice(0, 120),
          coordinates: villageCoordinates,
        }),
        gameClock: 8,
        timeOfDay: '早晨',
        recentHistory: [{
          worldDay: 1,
          region: startInfo.regionId,
          subRegion: startInfo.subRegion,
          location: startingLocation,
          coordinates: villageCoordinates,
          summary: entryScene.slice(0, 120),
        }],
        // v0.5.1 Level-EXP defaults (server overrides via /exp after first grant)
        level: 1,
        exp: 0,
        expToNext: 100,
        unspentAttributePoints: 0,
        // v0.5.2 Class pick
        classId,
        classSkills,
      };

    if (multiplayer) {
      // 多人模式：先保存角色本地，再通知服务器
      const charToSave = { ...char };
      useCharacterStore.getState().setCharacter(charToSave);
      useCharacterListStore.getState().addCharacter(charToSave);
      await multiplayer.onReady(char);
    } else {
      onComplete(char);
    }
    } catch { setError('角色创建最后一步失败，请重试'); } finally { setLoading(false); }
  };

  const renderVillageSelect = () => (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-xl font-bold text-gray-200">选择你的出生地</h3>
        <p className="text-sm text-gray-500 mt-1">所有冒险者都在{startRegionName}出生。可选已知定居点或让 PM 为你生成一个专属故乡。</p>
      </div>
      <button onClick={async () => {
        if (!llmClient) return;
        setLoading(true);
        setError(null);
        try {
          const p = `为${startRegionName}生成一个新的小定居点，包含：名（2-3字）、坐标X（${birthCoordinateBounds.minX}到${birthCoordinateBounds.maxX}）、坐标Z（${birthCoordinateBounds.minZ}到${birthCoordinateBounds.maxZ}）、特色描述（1句话）。返回JSON: {"name":"名","x":数字,"z":数字,"desc":"特色"}`;
          const raw = await llmClient.chat(p, '');
          const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
          const newId = 'custom_' + json.name;
          const newVillage = {
            id: newId,
            name: json.name,
            coord: `(${json.x}, ${json.z})`,
            desc: json.desc || 'PM为你创造的专属故乡',
            coordinates: { x: Number(json.x) || 0, z: Number(json.z) || 0 },
          };
          setCustomVillage(newVillage);
          setBirthVillage(newId);
        } catch {
          setBirthVillage(birthLocations[0]?.id || 'birth_origin');
          setError('生成失败，已选择默认出生地');
        }
        setLoading(false);
      }}
        className="w-full p-3 rounded-lg border border-dashed border-emerald-700 bg-emerald-900/20 hover:bg-emerald-900/30 text-emerald-400 text-sm font-medium transition-colors">
        {loading ? '生成中...' : '🎲 随机生成新村庄（由PM现场创造）'}
      </button>
      <div className="grid grid-cols-1 gap-2 max-h-[45vh] overflow-y-auto">
        {/* Custom generated village — shown first with highlight */}
        {customVillage && (
          <div className="mb-1">
            <button key={customVillage.id} onClick={() => setBirthVillage(customVillage.id)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${birthVillage === customVillage.id ? 'border-emerald-500 bg-emerald-900/30' : 'border-emerald-700/50 bg-emerald-900/10 hover:bg-emerald-900/20'}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-emerald-300">✨ {customVillage.name}</span>
                <span className="text-xs text-emerald-600 font-mono">{customVillage.coord}</span>
              </div>
              <div className="text-xs text-emerald-500/70 mt-1">{customVillage.desc}</div>
            </button>
          </div>
        )}
        {birthLocations.map((v) => (
          <button key={v.id} onClick={() => setBirthVillage(v.id)}
            className={`text-left p-3 rounded-lg border transition-colors ${birthVillage === v.id ? 'border-indigo-500 bg-indigo-900/30' : 'border-gray-700 bg-gray-800 hover:bg-gray-750'}`}>
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-200">{v.name}</span>
              <span className="text-xs text-gray-500 font-mono">{v.coord}</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">{v.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );

  const renderBackground = () => (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-xl font-bold text-gray-200">塑造你的故事</h3>
        <p className="text-sm text-gray-500 mt-1">
          {bgDialogue.length === 0
            ? 'AI 将引导你描述角色的出身和背景'
            : bgDone
              ? '背景设定完成'
              : `第 ${bgRound}/3 轮对话`}
        </p>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-700 rounded p-3 text-red-400 text-sm">{error}</div>
      )}

      <div className="bg-gray-800/50 rounded-lg p-4 max-h-[40vh] overflow-y-auto space-y-3">
        {bgDialogue.length === 0 && !loading && (
          <div className="text-center text-gray-500 text-sm py-8">
            点击"开始对话"让 AI 引导你创建角色背景
          </div>
        )}
        {bgDialogue.map((msg, i) => (
          <div key={i} className={msg.role === 'pm' ? 'text-gray-300' : 'text-indigo-400 text-right'}>
            <span className="text-xs text-gray-500 mr-2">{msg.role === 'pm' ? 'PM' : '你'}</span>
            {msg.content}
          </div>
        ))}
        {loading && <div className="text-gray-500 text-sm animate-pulse">...</div>}
      </div>

      {!bgDone && bgDialogue.length > 0 && (
        <div className="flex gap-2">
          <input
            value={bgInput}
            onChange={(e) => setBgInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); continueBgDialogue(); } }}
            placeholder="输入你的回答..."
            disabled={loading}
            className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 placeholder-gray-500 disabled:opacity-50"
          />
          <button
            onClick={continueBgDialogue}
            disabled={loading || !bgInput.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg transition-colors"
          >
            回答
          </button>
        </div>
      )}

      {bgDialogue.length === 0 && !loading && (
        <button onClick={startBgDialogue} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors">
          开始对话
        </button>
      )}

      {bgDone && (
        <div className="bg-emerald-900/30 border border-emerald-700 rounded p-3">
          <div className="text-emerald-400 text-xs font-medium mb-1">背景已设定</div>
          <div className="text-gray-300 text-sm">{background}</div>
        </div>
      )}
    </div>
  );

  const renderAttributes = () => {
    const validation = validateAttributes(attributes);
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h3 className="text-xl font-bold text-gray-200">属性分配</h3>
          <p className="text-sm text-gray-500 mt-1">3d6 掷点，你可以手动调整数值（范围3-18）</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {ATTRIBUTE_NAMES.map((attr) => (
            <div key={attr} className="space-y-1">
              <label className="text-sm text-gray-400">{ATTRIBUTE_LABELS[attr]}</label>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={3} max={18}
                  value={attributes[attr]}
                  onChange={(e) => setAttributes({ ...attributes, [attr]: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="w-8 text-center font-mono text-gray-200">{attributes[attr]}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center text-sm text-gray-400">
          总计: {Object.values(attributes).reduce((s, v) => s + v, 0)} / 63 (平均)
          {validation && <div className="text-amber-400 mt-1">{validation}</div>}
        </div>

        <button onClick={rerollAttributes} className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors">
          重新掷点
        </button>
      </div>
    );
  };

  const renderSkills = () => (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-xl font-bold text-gray-200">技能生成</h3>
        <p className="text-sm text-gray-500 mt-1">AI 将根据你的背景自动生成2-3个出身技能</p>
      </div>

      {loading && <div className="text-center text-gray-400 py-8 animate-pulse">正在生成技能...</div>}

      {skills.length > 0 && (
        <div className="space-y-2">
          {skills.map((s) => (
            <div key={s.id} className="bg-gray-800 rounded-lg p-3 border border-gray-700">
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-200">{s.name}</span>
                <span className="text-xs bg-indigo-900/50 text-indigo-400 px-2 py-0.5 rounded">Lv.{s.level}</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">{s.description}</div>
              <div className="text-xs text-gray-500 mt-1">关联属性: {ATTRIBUTE_LABELS[s.relatedAttribute]}</div>
            </div>
          ))}
        </div>
      )}

      {skills.length === 0 && (
        <button onClick={generateSkills} disabled={loading} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg transition-colors">
          生成技能
        </button>
      )}
    </div>
  );

  const renderEquipment = () => (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-xl font-bold text-gray-200">初始装备</h3>
        <p className="text-sm text-gray-500 mt-1">AI 将根据你的背景和区域给予初始装备</p>
      </div>

      {loading && <div className="text-center text-gray-400 py-8 animate-pulse">正在生成装备...</div>}

      {equipmentSummary && (
        <div className="bg-emerald-900/30 border border-emerald-700 rounded p-4 text-gray-300 text-sm">
          {equipmentSummary}
        </div>
      )}

      {!equipmentSummary && (
        <button onClick={generateEquipment} disabled={loading} className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg transition-colors">
          生成装备
        </button>
      )}
    </div>
  );

  const handleClassPick = (cls: ClassId | null) => {
    if (cls === null) {
      setClassId(null);
      setClassSkills([]);
      setPickingT1For(null);
      setClassNonePicked(true);
      return;
    }
    setClassId(cls);
    setClassSkills([]);
    setClassNonePicked(false);
    setPickingT1For(cls);
  };

  const handleT1NodePick = (node: ClassNode) => {
    if (!pickingT1For) return;
    // v0.5.4: 用世界日 (创建时 worldDay=1), 与 GuildClassModal / TierUnlockModal 保持一致
    setClassSkills([{ classId: pickingT1For, nodeId: node.id, unlockedAt: 1 }]);
    setPickingT1For(null);
  };

  const handleResetClassPick = () => {
    setClassId(null);
    setClassSkills([]);
    setPickingT1For(null);
    setClassNonePicked(false);
  };

  const renderClass = () => {
    // Tier 1 节点选择
    if (pickingT1For) {
      const def = getClass(pickingT1For);
      const t1Nodes = (def?.nodes ?? []).filter((n) => n.tier === 1);
      return (
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-200">选择 T1 专精</h3>
            <p className="text-sm text-gray-500 mt-1">
              {def?.icon} {def?.name} — 选定一个 T1 节点作为你的初始专精
            </p>
          </div>
          <div data-testid="classstep-tier1" className="grid grid-cols-1 gap-2 max-h-[45vh] overflow-y-auto">
            {t1Nodes.map((node) => (
              <button
                key={node.id}
                data-testid={`classstep-node-${node.id}`}
                onClick={() => handleT1NodePick(node)}
                className="text-left p-3 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-750 transition-colors"
              >
                <div className="font-medium text-gray-200">{node.name}</div>
                <div className="text-xs text-gray-400 mt-1">{node.description}</div>
              </button>
            ))}
          </div>
          <button
            data-testid="classstep-back"
            onClick={handleResetClassPick}
            className="w-full py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            ← 重新选择职业
          </button>
        </div>
      );
    }

    // 已选 class + T1 时的 summary
    if (classId && classSkills.length > 0) {
      const def = getClass(classId);
      const t1Node = def?.nodes.find((n) => n.id === classSkills[0]?.nodeId);
      return (
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-200">职业与专精</h3>
            <p className="text-sm text-gray-500 mt-1">你的角色选择了</p>
          </div>
          <div className="bg-emerald-900/30 border border-emerald-700 rounded-lg p-4 space-y-2">
            <div className="text-emerald-400 text-sm">
              <span className="text-2xl mr-2">{def?.icon}</span>
              <span className="font-bold">{def?.name}</span>
            </div>
            <div className="text-gray-300 text-sm">
              <span className="text-xs text-gray-500">T1 专精: </span>
              <span className="font-medium">{t1Node?.name}</span>
            </div>
            <div className="text-xs text-gray-500">{t1Node?.description}</div>
          </div>
          <button
            onClick={handleResetClassPick}
            className="w-full py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            重新选择职业
          </button>
        </div>
      );
    }

    // 选 "无职业" 后的 summary
    if (classNonePicked) {
      return (
        <div className="space-y-4">
          <div className="text-center">
            <h3 className="text-xl font-bold text-gray-200">选择你的职业</h3>
            <p className="text-sm text-gray-500 mt-1">可选 4 大职业之一,或先以无职业身份踏上旅途 (后续可在冒险者公会选定)</p>
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-3 text-sm text-gray-400 text-center">
            ✓ 已选: <span className="text-gray-300 font-medium">无职业</span> (v0.5 之后可从冒险者公会补选)
          </div>
          <div className="grid grid-cols-1 gap-2 max-h-[40vh] overflow-y-auto">
            {CLASS_LIST.map((cls) => (
              <button
                key={cls.id}
                data-testid={`classstep-class-${cls.id}`}
                onClick={() => handleClassPick(cls.id)}
                className="text-left p-3 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-750 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-200">{cls.icon} {cls.name}</span>
                  <span className="text-xs text-gray-500">主属性 {ATTRIBUTE_LABELS[cls.primaryAttribute]}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">{cls.description}</div>
              </button>
            ))}
          </div>
          <button
            onClick={handleResetClassPick}
            className="w-full py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            重新选择 (回到网格)
          </button>
        </div>
      );
    }

    // 初始 class 网格
    return (
      <div className="space-y-4">
        <div className="text-center">
          <h3 className="text-xl font-bold text-gray-200">选择你的职业</h3>
          <p className="text-sm text-gray-500 mt-1">可选 4 大职业之一,或先以无职业身份踏上旅途 (后续可在冒险者公会选定)</p>
        </div>
        <button
          data-testid="classstep-none"
          onClick={() => handleClassPick(null)}
          className="w-full p-3 rounded-lg border border-dashed border-gray-600 bg-gray-800/40 hover:bg-gray-800 text-gray-300 text-sm font-medium transition-colors"
        >
          🆓 无职业 (暂不选择)
        </button>
        <div data-testid="classstep-classes" className="grid grid-cols-1 gap-2 max-h-[40vh] overflow-y-auto">
          {CLASS_LIST.map((cls) => (
            <button
              key={cls.id}
              data-testid={`classstep-class-${cls.id}`}
              onClick={() => handleClassPick(cls.id)}
              className="text-left p-3 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-200">{cls.icon} {cls.name}</span>
                <span className="text-xs text-gray-500">主属性 {ATTRIBUTE_LABELS[cls.primaryAttribute]}</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">{cls.description}</div>
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderStep = () => {
    switch (step) {
      case 1: return renderVillageSelect();        // 出生地
      case 2: return renderNameAppearance();      // v0.5.14: 名字+外貌 (从 review 抽出)
      case 3: return renderAttributes();          // 属性
      case 4: return renderClass();               // v0.5.14: 职业 (从末位挪过来)
      case 5: return renderBackground();          // v0.5.14: 背景 (从 step 2 挪过来, 用前面收集的 class+attrs)
      case 6: return renderSkills();              // 技能
      case 7: return renderEquipment();           // 装备 → 直接 finalize
      default: return null;
    }
  };

  // v0.5.14: 名字 + 外貌 step (从原 renderReview 抽出, 独立为 step 2)
  const renderNameAppearance = () => (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-xl font-bold text-gray-200">角色名 + 外貌</h3>
        <p className="text-sm text-gray-500 mt-1">给角色起个名字, 描述外貌 (可留 AI 生成)</p>
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">角色名</label>
        <input
          value={characterName}
          onChange={(e) => setCharacterName(e.target.value)}
          maxLength={50}
          placeholder="输入角色名..."
          data-testid="nameappearance-name"
          className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700 text-gray-200"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1 block">外貌</label>
        <input
          value={appearance}
          onChange={(e) => setAppearance(e.target.value)}
          placeholder="身高 体型 容貌 穿着等..."
          data-testid="nameappearance-appearance"
          className="w-full px-3 py-2 rounded bg-gray-800 border border-gray-700 text-gray-200"
        />
      </div>
      {!characterName && (
        <button
          onClick={generateNameAndAppearance}
          disabled={loading}
          data-testid="nameappearance-auto"
          className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
        >
          AI 自动生成姓名和外貌
        </button>
      )}
    </div>
  );

  const canNext = () => {
    switch (step) {
      case 1: return !!birthVillage;                       // 出生地
      case 2: return true;                                  // v0.5.14: 名字+外貌 (留空也允许, finalize 时 fallback)
      case 3: return !validateAttributes(attributes);      // 属性
      case 4: return classId === null || (!!classId && classSkills.length > 0 && !pickingT1For); // 职业
      case 5: return bgDone && !!background;               // 背景
      case 6: return skills.length > 0;                    // 技能
      case 7: return !!equipmentSummary;                   // 装备
      default: return true;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-[600px] max-h-[85vh] flex flex-col">
        {/* Header with step indicator */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-bold text-gray-200">
             角色创建 ({step}/{WIZARD_TOTAL_STEPS})
          </h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-300 text-xl">
            {'\u2715'}
          </button>
        </div>
        <div className="flex gap-1 px-4 py-2">
          {Array.from({ length: WIZARD_TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
            <div key={s} className={`flex-1 h-1 rounded ${s <= step ? 'bg-indigo-500' : 'bg-gray-700'}`} />
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 bg-red-900/30 border border-red-700 rounded-lg p-3 space-y-2">
              <div className="text-red-400 text-sm">{error}</div>
              <div className="flex gap-2">
                <button onClick={() => { setError(null); retryCurrentStep(); }}
                  className="px-3 py-1 text-xs bg-red-500/10 border border-red-500/20 text-red-300 rounded hover:bg-red-500/20 transition-colors">
                  重试
                </button>
                <button onClick={() => setError(null)}
                  className="px-3 py-1 text-xs bg-white/5 border border-white/10 text-gray-400 rounded hover:bg-white/10 transition-colors">
                  忽略
                </button>
              </div>
            </div>
          )}
          {renderStep()}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-700 p-4 flex justify-between">
          <button
            onClick={() => setStep(Math.max(1, step - 1) as WizardStep)}
            disabled={step === 1 || loading}
            className="px-4 py-2 text-gray-400 hover:text-gray-200 disabled:opacity-30 transition-colors"
          >
            上一步
          </button>

          {step < WIZARD_TOTAL_STEPS ? (
            <button
              onClick={() => setStep((step + 1) as WizardStep)}
              disabled={!canNext() || loading}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg transition-colors"
            >
              下一步
            </button>
          ) : (
            <button
              onClick={finalizeCharacter}
              disabled={loading}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg transition-colors"
            >
              {loading ? '创建中...' : `进入${worldName}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
