/**
 * 客户端根编排入口。
 * 负责标题页、单人游玩、多人大厅/房间视图之间的切换，并装配 Storybook 运行时、
 * 角色启动流程、世界同步生命周期以及全局模态/覆盖层。
 * 复杂业务规则下沉到 usePMEngine、useAutoPlay 和各类 service，这里只做系统组装。
 */
import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './services/hooks/rules'; // Game Hook System — side-effect: registers all rules
import { registerCombatTools } from './services/combat/combatTools'; // Combat Toolcall System — side-effect: registers combat handlers

// 注册战斗工具 (幂等)
registerCombatTools();
// v0.5.12: 注册 inventory_search GM tool (backpack_full on-demand)
import { registerInventorySearchTool } from './services/engine/inventorySearchTool';
registerInventorySearchTool();
import { useGameStore } from './stores/gameStore';
import { useCharacterStore } from './stores/characterStore';
import { useWorldStore } from './stores/worldStore';
import { useSettingsStore } from './stores/settingsStore';
import { useCharacterListStore } from './stores/characterListStore';
import { usePMEngine } from './hooks/usePMEngine';
import { useAutoPlay } from './hooks/useAutoPlay';
import { SyncManager } from './services/sync/SyncManager';
import { APIClient } from './services/sync/APIClient';
import { eventBus } from './services/event/EventBus';
import { EVENTS } from './services/event/events';
import { AppLayout } from './components/layout/AppLayout';
import { SettingsModal } from './components/modals/SettingsModal';
import { CharacterCreationWizard } from './components/modals/CharacterCreationWizard';
import { SaveLoadModal } from './components/modals/SaveLoadModal';
import { BackpackModal } from './components/modals/BackpackModal';
import { CodexModal } from './components/modals/CodexModal';
import { MemoryModal } from './components/modals/MemoryModal';
import { MapModal } from './components/modals/MapModal';
import { DebugModeModal } from './components/modals/DebugModeModal';
import { DiceResultOverlay } from './components/game/DiceResultOverlay';
import { PMThinkingOverlay } from './components/game/PMThinkingOverlay';
import { ErrorBoundary } from './components/shared/ErrorBoundary';
import { WorldSyncNotifications } from './components/shared/WorldSyncNotifications';
import { ToastContainer } from './components/common/ToastContainer';
import { useCodexInit } from './hooks/useCodexInit';
import { CombatView } from './components/combat/CombatView';
import { TierUnlockModal } from './components/modals/TierUnlockModal';
import { GuildClassModal } from './components/modals/GuildClassModal';
import { subscribeCharacterExpEvents } from './services/level/subscribeCharacterEvents';
import { useUIStore } from './stores/uiStore';
import { useNPCStore } from './stores/npcStore';
import { useMultiplayerStore } from './stores/multiplayerStore';
import { MultiplayerSetupModal } from './components/modals/MultiplayerSetupModal';
import { LobbyPanel } from './components/multiplayer/LobbyPanel';
import { MultiplayerGameView } from './components/multiplayer/MultiplayerGameView';
import { markCharacterReady, spectatorReady } from './services/multiplayer/MultiplayerAPI';
import { startRealtimeSync, stopRealtimeSync, uploadSessionImmediate } from './services/multiplayer/SyncServices';
import { npcGenerator } from './services/npc/NPCGenerator';
import { ZERO_RESISTANCES, type Character } from './types/character';
import { getWorldEra, getWorldName, hydrateStorybook, makeStarterNPCId, matchTemplateKeyForRole, resolveRegionName, resolveStartingContext } from './services/storybook/runtime';

type LegacyCharacter = Partial<Character> & {
  status?: {
    hp?: number;
    maxHp?: number;
    fatigue?: number;
    conditions?: string[];
  };
};

function migrateCharacterData(char: LegacyCharacter): Character {
  // Convert old { status: { hp, maxHp, fatigue, conditions } } to new format
  if (!char.vital) {
    char.vital = {
      hunger: 20, thirst: 15,
      fatigue: char.status?.fatigue ?? 10,
      hygiene: 15, morale: 70, wound: 0, temperature: 37, encumbrance: 20,
    };
  }
  if (char.status?.hp != null) {
    char.hp = char.status.hp;
    char.maxHp = char.status.maxHp;
  }
  if (char.status?.conditions) {
    char.conditions = char.status.conditions;
  }
  char.reputation = char.reputation || { goodness: 0, violence: 5, lawfulness: 10, regional: {} };
  char.lastActionTime = char.lastActionTime || new Date().toISOString();
  if (char.inventory && !char.inventory.currency) {
    char.inventory.currency = { gold: 0, silver: 5, copper: 30 };
  }
  return char as Character;
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

function resolveRuntimeStartState(charData: Character, activeStorybook: ReturnType<typeof useWorldStore.getState>['storybook']) {
  const startInfo = resolveStartingContext(activeStorybook, charData.currentRegion || charData.joinedRegion);
  const lastHistory = [...charData.recentHistory].reverse().find((entry) => entry.location || entry.subRegion || entry.coordinates);
  const regionId = charData.currentRegion || charData.joinedRegion || startInfo.regionId;
  const regionData = activeStorybook?.regions?.find((region) => region.id === regionId || region.name === regionId);
  const fallbackBirthLocation = startInfo.birthLocations.find((location) =>
    location.name === charData.currentLocation || location.id === charData.currentLocation) || startInfo.birthLocations[0];
  const subRegion = charData.currentSubRegion || lastHistory?.subRegion || startInfo.subRegion;
  const currentLocation = charData.currentLocation || lastHistory?.location || fallbackBirthLocation?.name || subRegion;
  const coordinates = charData.currentCoordinates
    ? { ...charData.currentCoordinates }
    : lastHistory?.coordinates
      ? { x: lastHistory.coordinates.x, y: lastHistory.coordinates.y ?? 0, z: lastHistory.coordinates.z }
      : fallbackBirthLocation?.coordinates
        ? { x: fallbackBirthLocation.coordinates.x || 0, y: 0, z: fallbackBirthLocation.coordinates.z || 0 }
        : { x: 0, y: 0, z: 0 };

  return {
    startInfo,
    regionId,
    subRegion,
    currentLocation,
    coordinates,
    terrain: charData.currentTerrain || regionData?.terrain || '',
    weather: charData.currentWeather || '',
    gameClock: typeof charData.gameClock === 'number' ? charData.gameClock : 8,
    structuredLocation: charData.currentStructuredLocation || makeStructuredLocationSnapshot({
      region: regionId,
      regionName: regionData?.name || startInfo.regionName || regionId,
      subRegion,
      specificPlace: currentLocation,
      description: lastHistory?.summary || '',
      coordinates,
    }),
  };
}

export default function App() {
  const phase = useGameStore((s) => s.phase);
  const setPhase = useGameStore((s) => s.setPhase);
  const setDay = useGameStore((s) => s.setDay);
  const setClock = useGameStore((s) => s.setClock);
  const setRegion = useGameStore((s) => s.setRegion);
  const setSubRegion = useGameStore((s) => s.setSubRegion);
  const setLocation = useGameStore((s) => s.setLocation);
  const setCoordinates = useGameStore((s) => s.setCoordinates);
  const setTerrain = useGameStore((s) => s.setTerrain);
  const setWeather = useGameStore((s) => s.setWeather);
  const updateCurrentLocation = useGameStore((s) => s.updateCurrentLocation);
  const addDayDivider = useGameStore((s) => s.addDayDivider);
  const setCharacter = useCharacterStore((s) => s.setCharacter);
  const setWorldDay = useWorldStore((s) => s.setWorldDay);
  const setDiceResult = useGameStore((s) => s.setDiceResult);
  const activeModal = useUIStore((s) => s.activeModal);
  const openModal = useUIStore((s) => s.openModal);
  const mapModalOpen = useUIStore((s) => s.mapModalOpen);
  const closeMapModal = useUIStore((s) => s.closeMapModal);
  const toasts = useUIStore((s) => s.toasts);
  const settings = useSettingsStore();
  const serverEndpoint = useSettingsStore((s) => s.server.endpoint);
  const storybook = useWorldStore((s) => s.storybook);
  const { requestScene, initPM, chronicleRecorder } = usePMEngine();
  const { startAutoPlay, pauseAutoPlay, stopAutoPlay, stepAutoPlay, startActivityReporter, stopActivityReporter } = useAutoPlay();
  const savedChars = useCharacterListStore((s) => s.savedCharacters);
  const addSavedChar = useCharacterListStore((s) => s.addCharacter);
  const removeSavedChar = useCharacterListStore((s) => s.removeCharacter);

  const [showWizard, setShowWizard] = useState(false);
  const [loadingChar, setLoadingChar] = useState<string | null>(null);
  const [showMultiplayerSetup, setShowMultiplayerSetup] = useState(false);
  const [showLobby, setShowLobby] = useState(false);
  const [showWizardInLobby, setShowWizardInLobby] = useState(false);
  const [showDebugMode, setShowDebugMode] = useState(false);
  const displayEra = getWorldEra(storybook);
  const worldName = getWorldName(storybook);

  // Multiplayer state
  const mpGameMode = useMultiplayerStore((s) => s.gameMode);
  const mpRoomId = useMultiplayerStore((s) => s.roomId);
  const mpRoomPhase = useMultiplayerStore((s) => s.roomPhase);
  const mpCurrentPlayerId = useMultiplayerStore((s) => s.currentPlayerId);
  const mpPlayers = useMultiplayerStore((s) => s.players);
  const currentMpSession = mpPlayers.find((player) => player.playerId === mpCurrentPlayerId) || null;

  const hasApiKey = !!settings.llm.apiKey;

  // Start/stop activity reporter based on game phase
  const reporterStartedRef = useRef(false);
  const syncRef = useRef<SyncManager | null>(null);

  // Watch for multiplayer room creation → show lobby
  useEffect(() => {
    if (mpGameMode === 'multiplayer' && mpRoomId && showMultiplayerSetup) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legacy state-bridge; refactor to derived state in v0.4
      setShowMultiplayerSetup(false);
      setShowLobby(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot bridge; tracked for v0.4
  }, [mpGameMode, mpRoomId]);

  useEffect(() => {
    if (mpGameMode === 'multiplayer' && mpRoomId && mpRoomPhase === 'playing' && phase !== 'playing') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legacy state-bridge; refactor to derived state in v0.4
      setShowLobby(false);
      setPhase('playing');
    }
  }, [mpGameMode, mpRoomId, mpRoomPhase, phase, setPhase]);

  useEffect(() => {
    let cancelled = false;
    hydrateStorybook({
      endpoint: serverEndpoint,
      apply: (storybookData) => {
        if (!cancelled) {
          useWorldStore.getState().setStorybook(storybookData);
        }
      },
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [serverEndpoint]);

  useEffect(() => {
    const isDebug = useGameStore.getState().isDebugMode;
    if (phase === 'playing' && !reporterStartedRef.current) {
      reporterStartedRef.current = true;
      startActivityReporter();
      // 调试模式下不启动服务器同步
      if (!isDebug) {
        // Start periodic world sync (pull chronicles, ghost NPCs, encounters)
        const api = new APIClient(useSettingsStore.getState().server.endpoint);
        const syncMgr = new SyncManager(api, chronicleRecorder);
        syncRef.current = syncMgr;
        syncMgr.startAutoSync(useSettingsStore.getState().server.autoSyncInterval * 60);
        startRealtimeSync();
      }
    }
    if (phase === 'title') {
      reporterStartedRef.current = false;
      stopActivityReporter();
      if (useSettingsStore.getState().server.syncOnExit) {
        syncRef.current?.forceUpload().catch(() => {});
      }
      stopRealtimeSync();
      syncRef.current?.stopAutoSync();
      syncRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chronicler is lifecycle-scoped; tracked for v0.4
  }, [phase, startActivityReporter, stopActivityReporter]);

  useEffect(() => {
    const unsubscribe = eventBus.on(EVENTS.CRITICAL_SYNC_FLUSH, () => {
      const isDebug = useGameStore.getState().isDebugMode;
      if (phase !== 'playing' || isDebug) {
        return;
      }
      uploadSessionImmediate().catch(() => {});
      syncRef.current?.forceUpload().catch(() => {});
    });

    return unsubscribe;
  }, [phase]);

  // v0.5.4: 订阅战斗/叙事事件 → debounce 合并 PATCH /exp, 服务端权威返回后 apply 到 store
  useEffect(() => {
    const unsubscribe = subscribeCharacterExpEvents();
    return unsubscribe;
  }, []);

  // v0.5.4: GuildClassModal 自动显示: classId=null 且未被玩家手动关闭时
  const [guildClassDismissed, setGuildClassDismissed] = useState(false);
  const charId = useCharacterStore((s) => s.character?.characterId);
  const classId = useCharacterStore((s) => s.character?.classId);
  useEffect(() => {
    // 切换角色时重置 dismissed (GuildClassModal 的局部 UI 状态需要随 charId 重置)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGuildClassDismissed(false);
  }, [charId]);
  const guildClassOpen = classId === null && !guildClassDismissed;

  // v0.4-codex: 启动时恢复 localStorage / 从 inventory seed, 持久化 debounce 写
  useCodexInit();

  const handleQuickStart = async () => {
    const quickStartInfo = resolveStartingContext(storybook);
    const quickStartLocation = quickStartInfo.birthLocations[0];
    const demoChar: Character = {
      characterId: 'demo_' + Date.now(),
      playerId: 'demo_player', name: '艾琳·灰烬', race: '人类',
      background: '北方边境的流浪佣兵，因战乱失去家园，踏上冒险之路',
      appearance: '深棕色短发，琥珀色眼睛',
      attributes: { STR: 14, DEX: 16, CON: 12, INT: 10, WIS: 15, CHA: 13 },
      skills: [
        { id: 'sk_01', name: '战场急救', level: 3, maxLevel: 10, type: 'background' as const, relatedAttribute: 'WIS' as const, description: '在战场环境下快速止血和包扎伤口', acquiredAt: '出身技能', experience: 0, expToNext: 9 },
        { id: 'sk_02', name: '侦查', level: 2, maxLevel: 10, type: 'background' as const, relatedAttribute: 'WIS' as const, description: '察觉危险和隐藏的线索', acquiredAt: '出身技能', experience: 0, expToNext: 6 },
      ],
      inventory: { equipped: { weapon: { name: '磨损的长剑', quality: '普通', category: 'weapon', description: '一把磨损的铁制长剑，剑柄皮革已磨得发亮', effects: [{ id: 'demo_wpn', type: 'damage_bonus', value: 2, description: '伤害+2' }], itemId: 'demo_sword' }, armor: { name: '硬皮甲', quality: '普通', category: 'armor', description: '加固过的皮甲，提供基础防护', effects: [{ id: 'demo_arm', type: 'defense_bonus', value: 1, description: '防御+1' }], itemId: 'demo_armor' }, accessory: null }, backpack: [{ name: '治疗药水', category: 'consumable', quality: '普通', quantity: 2, description: '红色的治疗药水', effects: [{ id: 'demo_pot', type: 'hp_restore', value: 3, description: '恢复3点HP' }], itemId: 'demo_potion' }, { name: '火把', category: 'consumable', quality: '普通', quantity: 3, description: '提供照明的火把', effects: [], itemId: 'demo_torch' }], currency: { gold: 0, silver: 5, copper: 30 } },
      hp: 22, maxHp: 22,
      vital: { hunger: 20, thirst: 15, fatigue: 10, hygiene: 15, morale: 70, wound: 0, temperature: 20, encumbrance: 25 },
      reputation: { goodness: 0, violence: 5, lawfulness: 10, regional: {} },
      conditions: [],
      joinedRegion: quickStartInfo.regionId,
      joinedWorldDay: 1,
      currentLocalDay: 1,
      lastActionTime: new Date().toISOString(),
      currentRegion: quickStartInfo.regionId,
      currentSubRegion: quickStartInfo.subRegion,
      currentLocation: quickStartLocation?.name || quickStartInfo.subRegion,
      // v0.5.1: Level-EXP 基础字段
      level: 1,
      exp: 0,
      expToNext: 100,
      unspentAttributePoints: 0,
      // v0.5.2: 职业系统
      classId: null,
      classSkills: [],
      // v0.6.2: 抗性 + 学习过的能力
      elementalResistances: { ...ZERO_RESISTANCES },
      learnedAbilities: [],
      defaultLearnedAbilities: [],
      // v0.6.2: MP (默认 0 = 战士, 法师/祭司通过 setCharacter 注入)
      mp: 0, maxMp: 0,
      currentCoordinates: quickStartLocation?.coordinates
        ? { x: quickStartLocation.coordinates.x || 0, y: 0, z: quickStartLocation.coordinates.z || 0 }
        : { x: 0, y: 0, z: 0 },
      currentStructuredLocation: makeStructuredLocationSnapshot({
        region: quickStartInfo.regionId,
        regionName: quickStartInfo.regionName,
        subRegion: quickStartInfo.subRegion,
        specificPlace: quickStartLocation?.name || quickStartInfo.subRegion,
        description: '你正从自己的出身地启程。',
        coordinates: quickStartLocation?.coordinates
          ? { x: quickStartLocation.coordinates.x || 0, y: 0, z: quickStartLocation.coordinates.z || 0 }
          : { x: 0, y: 0, z: 0 },
      }),
      gameClock: 8,
      timeOfDay: '早晨',
      recentHistory: [],
    };
    startGame(demoChar);
  };

  const handleLoadCharacter = async (charData: ReturnType<typeof useCharacterStore.getState>['character']) => {
    if (!charData) return;
    setLoadingChar(charData.characterId);
    try {
      const migrated = migrateCharacterData(charData);
      await startGame(migrated);
    } finally {
      setLoadingChar(null);
    }
  };

  const handleCharacterCreated = (charData: ReturnType<typeof useCharacterStore.getState>['character']) => {
    if (charData) {
      addSavedChar(charData);
      startGame(charData);
    }
  };

  const startGame = async (charData: ReturnType<typeof useCharacterStore.getState>['character']) => {
    if (!charData) return;
    const hydratedStorybook = await hydrateStorybook({
      endpoint: serverEndpoint,
      apply: (storybookData) => useWorldStore.getState().setStorybook(storybookData),
    });
    const activeStorybook = hydratedStorybook ?? useWorldStore.getState().storybook;
    const runtimeState = resolveRuntimeStartState(charData, activeStorybook);
    const startInfo = runtimeState.startInfo;
    const preparedChar: Character = {
      ...charData,
      currentRegion: runtimeState.regionId,
      currentSubRegion: runtimeState.subRegion,
      currentLocation: runtimeState.currentLocation,
      currentCoordinates: runtimeState.coordinates,
      currentTerrain: runtimeState.terrain,
      currentWeather: runtimeState.weather,
      currentStructuredLocation: runtimeState.structuredLocation,
      gameClock: runtimeState.gameClock,
      timeOfDay: charData.timeOfDay || undefined,
    };

    setCharacter(preparedChar);
    setPhase('playing');
    setDay(preparedChar.currentLocalDay || 1);
    setWorldDay(preparedChar.currentLocalDay || preparedChar.joinedWorldDay || 1);
    setClock(runtimeState.gameClock);

    const startRegion = runtimeState.regionId;
    const startSub = runtimeState.subRegion;
    setRegion(startRegion);
    setSubRegion(startSub);
    setLocation(runtimeState.currentLocation);
    setCoordinates(runtimeState.coordinates);
    setTerrain(runtimeState.terrain || '未知地形');
    setWeather(runtimeState.weather || '晴朗');
    updateCurrentLocation(runtimeState.structuredLocation);
    addDayDivider(preparedChar.currentLocalDay || 1);
    const npcStore = useNPCStore.getState();
    for (const starterNPC of startInfo.keyNPCs) {
      const starterNpcId = makeStarterNPCId(startRegion, starterNPC.name);
      if (npcStore.npcs[starterNpcId]) continue;

      const templateKey = matchTemplateKeyForRole(starterNPC.role, activeStorybook?.npcRoleTemplates || []);
      const npc = templateKey
        ? npcGenerator.generateFromTemplate(templateKey, startRegion, startSub, {
            name: starterNPC.name,
            attitudeToPlayer: 15,
            source: 'storybook',
          })
        : npcGenerator.generateFromIntro({
            name: starterNPC.name,
            title: starterNPC.role,
            appearance: starterNPC.appearance || '',
            personality: starterNPC.personality,
            region: startRegion,
            relation_to_player: '开局时便已听闻其名的关键人物',
          });

      npc.npcId = starterNpcId;
      npc.title = starterNPC.role || npc.title;
      npc.role = starterNPC.role || npc.role;
      npc.subRegion = startSub;
      npc.source = 'storybook';
      npc.appearance = starterNPC.appearance || npc.appearance;
      npc.personality = starterNPC.personality || npc.personality;
      npc.background = `${startInfo.regionName}的关键人物，与你的旅途起点息息相关。`;
      npc.isMet = true;
      npc.relationship = {
        ...npc.relationship,
        attitude: Math.max(npc.relationship.attitude, 10),
        history: npc.relationship.history.length > 0 ? npc.relationship.history : ['开局时便听闻其名'],
        interactionCount: Math.max(npc.relationship.interactionCount, 1),
        level: 'acquaintance',
      };
      npcStore.registerNPC(npc);
    }
    await initPM();
    setDiceResult(null);
    await requestScene();
  };

  const handleMultiplayerCharacterReady = async (char: Character) => {
    if (!mpRoomId) return;

    const backgroundSummary = `${char.race} ${char.background}. ${char.appearance}`;

    if (currentMpSession?.status === 'spectating' || currentMpSession?.status === 'pending_intro') {
      const intro = await spectatorReady(
        mpRoomId,
        char.characterId,
        char.name,
        char,
        backgroundSummary,
      );
      useMultiplayerStore.getState().setEstimatedIntroRound(intro.estimatedIntroRound);
      useMultiplayerStore.getState().updatePlayersFromSync(
        useMultiplayerStore.getState().players.map((player) =>
          player.playerId === useMultiplayerStore.getState().currentPlayerId
            ? {
                ...player,
                characterId: char.characterId,
                characterName: char.name,
                characterBackground: backgroundSummary,
                isReady: true,
                status: 'pending_intro',
              }
            : player,
        ),
      );
    } else {
      await markCharacterReady(
        mpRoomId,
        char.characterId,
        char.name,
        char,
        backgroundSummary,
      );
      useMultiplayerStore.getState().markPlayerReady();
    }

    useCharacterStore.getState().setCharacter(char);
  };

  if (phase === 'title') {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-ambient overflow-y-auto relative">
        {/* 背景层：噪点 + 魔法阵网格 + 星点 */}
        <div className="absolute inset-0 arcane-grid pointer-events-none opacity-40" />
        <div className="stars" />

        <div className="max-w-lg w-full mx-auto px-6 py-12 space-y-10 relative z-10 noise-grain">
          {/* Logo */}
          <motion.div
            className="text-center space-y-3"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          >
            <div className="inline-block">
              <h1
                className="text-6xl font-display font-bold text-transparent bg-clip-text
                           bg-gradient-to-r from-gold-400 via-gold-500 to-amber-300
                           tracking-[0.15em] uppercase"
                style={{
                  textShadow: '0 0 80px rgba(212,184,132,.25), 0 0 32px rgba(212,184,132,.15)',
                }}
              >
                {worldName}
              </h1>
              <motion.div
                className="h-px bg-gradient-to-r from-transparent via-gold-500/50 to-transparent mt-3"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ delay: 0.4, duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
              />
            </div>

            {/* 卢恩符文分隔线 + 世界时代 */}
            <motion.div
              className="flex items-center justify-center gap-3 mt-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6, duration: 0.6 }}
            >
              <span className="text-gold-500 text-sm font-display">ᛟ</span>
              <div className="h-px flex-1 max-w-[80px] bg-gradient-to-r from-transparent via-gold-500/40 to-gold-500/60" />
              <span className="text-gold-500/80 text-xs font-display tracking-[0.3em] uppercase">
                {displayEra}
              </span>
              <div className="h-px flex-1 max-w-[80px] bg-gradient-to-l from-transparent via-gold-500/40 to-gold-500/60" />
              <span className="text-gold-500 text-sm font-display">ᛇ</span>
            </motion.div>

            <motion.p
              className="text-ink-300 text-sm font-sans tracking-wider mt-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8, duration: 0.6 }}
            >
              异步联机 · AI 跑团 · 多人共享世界
            </motion.p>
          </motion.div>

          {/* AI Config Warning */}
          <AnimatePresence>
            {!hasApiKey && (
              <motion.div
                key="ai-warning"
                className="bg-amber-950/20 border border-amber-700/30 rounded-2xl p-5 backdrop-blur-sm
                           shadow-[0_0_24px_rgba(245,158,11,0.08)]"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-amber-400 text-lg font-display">⚙</span>
                  <span className="text-amber-300 text-sm font-medium font-display tracking-wide">
                    需要配置 AI Agent
                  </span>
                </div>
                <p className="text-amber-500/70 text-xs leading-relaxed">
                  你需要提供自己的 AI API Key 来驱动游戏中的 Game Master。支持 DeepSeek、OpenAI 及兼容接口。
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action Buttons */}
          <motion.div
            className="space-y-3"
            initial="initial"
            animate="animate"
            variants={{
              initial: {},
              animate: { transition: { staggerChildren: 0.08, delayChildren: 0.9 } },
            }}
          >
            <TitleButton
              variant="primary"
              onClick={() => setShowWizard(true)}
              disabled={!hasApiKey}
            >
              创建新角色
            </TitleButton>
            <TitleButton
              variant="success"
              onClick={() => setShowMultiplayerSetup(true)}
            >
              多人联机
            </TitleButton>
            <TitleButton
              variant="ghost"
              onClick={handleQuickStart}
              disabled={!hasApiKey}
            >
              快速开始 · Demo 角色
            </TitleButton>
            <TitleButton
              variant="minimal"
              onClick={() => openModal('settings')}
            >
              设置
            </TitleButton>
            <button
              type="button"
              onClick={() => setShowDebugMode(true)}
              data-testid="title-debug-mode"
              className="w-full text-sm text-zinc-500 hover:text-zinc-300 transition py-2"
            >
              🐞 调试模式
            </button>
          </motion.div>

          {/* Saved Characters */}
          {savedChars.length > 0 && (
            <motion.div
              className="space-y-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.3, duration: 0.6 }}
            >
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-ink-500/50 to-transparent" />
                <span className="text-xs text-ink-400 tracking-widest uppercase font-display">
                  已有角色
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-ink-500/50 to-transparent" />
              </div>
              <motion.div
                className="space-y-2"
                initial="initial"
                animate="animate"
                variants={{
                  initial: {},
                  animate: { transition: { staggerChildren: 0.06, delayChildren: 1.4 } },
                }}
              >
                {savedChars.map((sc) => (
                  <motion.div
                    key={sc.characterId}
                    variants={{
                      initial: { opacity: 0, x: -8 },
                      animate: { opacity: 1, x: 0, transition: { duration: 0.3 } },
                    }}
                    whileHover={{ x: 2 }}
                    className="group bg-ink-900/80 border border-ink-700/50 hover:border-gold-500/30
                               rounded-xl p-4 flex items-center gap-4
                               transition-colors duration-300
                               hover:shadow-[0_0_24px_rgba(212,184,132,0.08)]"
                  >
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-gold-700/30 to-gold-500/20
                                    border border-gold-500/30 flex items-center justify-center
                                    text-lg font-bold text-gold-400 font-display shrink-0
                                    shadow-[inset_0_1px_0_rgba(212,184,132,0.15)]">
                      {sc.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink-100 font-medium truncate font-display tracking-wide">
                        {sc.name}
                      </div>
                      <div className="text-xs text-ink-400 mt-0.5 font-sans">
                        {resolveRegionName(storybook, sc.data?.currentRegion || sc.data?.joinedRegion || sc.region)}
                        {' · '}
                        {sc.data?.currentLocation || sc.data?.currentSubRegion || '旅途中'}
                        {' · 世界日 '}
                        <span className="numeric">{sc.data?.currentLocalDay || sc.worldDay}</span>
                      </div>
                      <div className="text-xs text-ink-500 truncate mt-0.5 font-narrative italic">
                        {sc.background}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0 opacity-60 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleLoadCharacter(sc.data)}
                        disabled={!hasApiKey || loadingChar !== null}
                        className="px-4 py-1.5 text-xs bg-gold-600/80 hover:bg-gold-500
                                   disabled:opacity-30 text-ink-950 font-medium rounded-lg
                                   transition-colors font-sans tracking-wide"
                      >
                        继续
                      </button>
                      <button
                        onClick={() => removeSavedChar(sc.characterId)}
                        className="px-2 py-1.5 text-xs text-ink-400 hover:text-rose-400
                                   hover:bg-rose-900/20 rounded-lg transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </motion.div>
          )}

          {/* Version */}
          <motion.div
            className="text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.6, duration: 0.6 }}
          >
            <span className="text-xs text-ink-500 numeric tracking-widest">
              v0.3.0 · {displayEra}
            </span>
          </motion.div>
        </div>

        {activeModal === 'settings' && <SettingsModal />}
        {showWizard && <CharacterCreationWizard onComplete={handleCharacterCreated} onCancel={() => setShowWizard(false)} />}
        <DebugModeModal open={showDebugMode} onClose={() => setShowDebugMode(false)} />
        {showMultiplayerSetup && <MultiplayerSetupModal onClose={() => setShowMultiplayerSetup(false)} />}
        {showLobby && mpRoomId && (
          <LobbyPanel
            onEnterGame={() => {
              setShowLobby(false);
              setPhase('playing');
            }}
            onCreateCharacter={() => setShowWizardInLobby(true)}
          />
        )}
        {showWizardInLobby && mpRoomId && (
          <CharacterCreationWizard
            onComplete={() => {}}
            onCancel={() => setShowWizardInLobby(false)}
            multiplayer={{
              roomId: mpRoomId,
              onReady: async (char) => {
                try {
                  await handleMultiplayerCharacterReady(char);
                } catch (e) {
                  console.error('Failed to mark ready:', e);
                }
                setShowWizardInLobby(false);
              },
            }}
          />
        )}
      </div>
    );
  }

  // Multiplayer game view
  if (mpGameMode === 'multiplayer' && mpRoomId) {
    return (
      <ErrorBoundary>
        <MultiplayerGameView onCreateCharacter={() => setShowWizardInLobby(true)} />
        {showWizardInLobby && (
          <CharacterCreationWizard
            onComplete={() => {}}
            onCancel={() => setShowWizardInLobby(false)}
            multiplayer={{
              roomId: mpRoomId,
              onReady: async (char) => {
                try {
                  await handleMultiplayerCharacterReady(char);
                } catch (e) {
                  console.error('Failed to mark ready:', e);
                }
                setShowWizardInLobby(false);
              },
            }}
          />
        )}
        {activeModal === 'settings' && <SettingsModal />}
      </ErrorBoundary>
    );
  }

  // Single player game view
  return (
    <ErrorBoundary>
      <CombatView />
      <TierUnlockModal />
      <GuildClassModal
        open={guildClassOpen}
        onClose={() => setGuildClassDismissed(true)}
      />
      <AppLayout
        onAutoPlayStart={startAutoPlay}
        onAutoPlayPause={pauseAutoPlay}
        onAutoPlayStop={stopAutoPlay}
        onAutoPlayStep={stepAutoPlay}
      />
      <WorldSyncNotifications />
      <DiceResultOverlay />
      <PMThinkingOverlay />
      {activeModal === 'settings' && <SettingsModal />}
      {activeModal === 'saveLoad' && <SaveLoadModal onClose={() => useUIStore.getState().closeModal()} />}
      {activeModal === 'backpack' && <BackpackModal onClose={() => useUIStore.getState().closeModal()} />}
      {activeModal === 'codex' && <CodexModal onClose={() => useUIStore.getState().closeModal()} />}
      {activeModal === 'memory' && <MemoryModal onClose={() => useUIStore.getState().closeModal()} />}
      <MapModal isOpen={mapModalOpen} onClose={closeMapModal} />
      {toasts.length > 0 && <ToastContainer />}
    </ErrorBoundary>
  );
}

/* ─────────────────────────────────────────────────────────────
   TitleButton — 标题页专用按钮
   variant: primary | success | ghost | minimal
   鼠标 hover 微缩放 + 1px 边框金色滑入；click 0.08s 缩放
   ───────────────────────────────────────────────────────────── */
type TitleButtonVariant = 'primary' | 'success' | 'ghost' | 'minimal';

const TITLE_BUTTON_BASE =
  'group relative w-full overflow-hidden rounded-2xl font-medium transition-shadow ' +
  'disabled:opacity-30 disabled:cursor-not-allowed border';

const TITLE_BUTTON_VARIANTS: Record<
  TitleButtonVariant,
  { wrap: string; text: string; pad: string; shadow: string; hoverShadow: string; textSize: string }
> = {
  primary: {
    wrap: 'bg-gradient-to-r from-indigo-600 to-purple-600 border-indigo-400/30 ' +
          'hover:border-gold-400/40',
    text: 'text-white',
    pad: 'py-4',
    shadow: 'shadow-xl shadow-indigo-900/40',
    hoverShadow: 'hover:shadow-[0_0_28px_rgba(99,102,241,0.4)]',
    textSize: 'text-base',
  },
  success: {
    wrap: 'bg-gradient-to-r from-emerald-600 to-teal-600 border-emerald-400/30 ' +
          'hover:border-gold-400/40',
    text: 'text-white',
    pad: 'py-3',
    shadow: 'shadow-lg shadow-emerald-900/30',
    hoverShadow: 'hover:shadow-[0_0_24px_rgba(16,185,129,0.35)]',
    textSize: 'text-sm',
  },
  ghost: {
    wrap: 'bg-white/5 hover:bg-white/10 border-ink-700/50 hover:border-gold-500/40',
    text: 'text-ink-200',
    pad: 'py-3',
    shadow: '',
    hoverShadow: 'hover:shadow-[0_0_20px_rgba(212,184,132,0.1)]',
    textSize: 'text-sm',
  },
  minimal: {
    wrap: 'bg-transparent hover:bg-white/5 border-ink-800/60 hover:border-ink-700/50',
    text: 'text-ink-500 hover:text-ink-300',
    pad: 'py-3',
    shadow: '',
    hoverShadow: '',
    textSize: 'text-sm',
  },
};

function TitleButton({
  children,
  onClick,
  disabled,
  variant = 'ghost',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: TitleButtonVariant;
}) {
  const v = TITLE_BUTTON_VARIANTS[variant];
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.02 }}
      whileTap={disabled ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
      className={`${TITLE_BUTTON_BASE} ${v.wrap} ${v.text} ${v.pad} ${v.shadow} ${v.hoverShadow} ${v.textSize}
                  font-sans tracking-wide`}
    >
      {/* 顶部金色高光线 — hover 时由 -100% 滑到 100% */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px
                   bg-gradient-to-r from-transparent via-gold-400/70 to-transparent
                   -translate-x-full group-hover:translate-x-full
                   transition-transform duration-700 ease-out"
      />
      {children}
    </motion.button>
  );
}
