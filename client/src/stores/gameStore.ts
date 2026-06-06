/**
 * 游戏运行时状态中心。
 * 保存当前会话的短生命周期数据：阶段、时间、位置、消息流、可选行动、等待态、骰子结果与旅行状态。
 * 所有 UI 面板都应从这里读取会话态，而不是在组件内复制业务状态。
 */
import { create } from 'zustand';
import type { GamePhase, Choice, Message, DiceResult, KnownLocation, StructuredLocation } from '../types/game';

interface TravelState {
  targetLocation: string;
  targetCoords: { x: number; z: number };
  startCoords: { x: number; z: number };
  totalHours: number;
  elapsedHours: number;
  startedAt: number; // Date.now()
}

function getTimeOfDay(clock: number): string {
  if (clock < 6) return '深夜';
  if (clock < 9) return '清晨';
  if (clock < 12) return '上午';
  if (clock < 14) return '正午';
  if (clock < 17) return '午后';
  if (clock < 20) return '傍晚';
  return '夜晚';
}

interface GameState {
  phase: GamePhase;
  currentDay: number;
  gameClock: number;
  timeOfDay: string;
  currentRegion: string;
  currentSubRegion: string;
  currentLocation: string;
  coordinates: { x: number; y: number; z: number };
  terrain: string;
  weather: string;

  messages: Message[];
  currentChoices: Choice[];
  isWaitingForPM: boolean;
  isWaitingForPlayer: boolean;
  streamingText: string;
  currentDiceResult: DiceResult | null;
  sceneModifier: number;
  atmosphere: { mood: string; dangerLevel: string };
  knownLocations: KnownLocation[];
  currentStructuredLocation: StructuredLocation | null;
  locationHistory: StructuredLocation[];
  gmActivity: string[];
  recentActions: string[];
  travelState: TravelState | null;
  isDebugMode: boolean;

  setPhase: (phase: GamePhase) => void;
  setDay: (day: number) => void;
  setClock: (clock: number) => void;
  advanceClock: (hours: number) => void;
  setRegion: (region: string) => void;
  setSubRegion: (sub: string) => void;
  setLocation: (loc: string) => void;
  setCoordinates: (c: { x: number; y: number; z: number }) => void;
  setTerrain: (t: string) => void;
  setWeather: (w: string) => void;
  addMessage: (msg: Message) => void;
  setMessages: (messages: Message[]) => void;
  upsertMessage: (message: Message) => void;
  addDayDivider: (day: number) => void;
  setChoices: (choices: Choice[]) => void;
  setWaitingForPM: (v: boolean) => void;
  setWaitingForPlayer: (v: boolean) => void;
  setStreamingText: (t: string) => void;
  appendStreamingText: (t: string) => void;
  clearStreaming: () => void;
  setDiceResult: (r: DiceResult | null) => void;
  setSceneModifier: (m: number) => void;
  setAtmosphere: (a: { mood: string; dangerLevel: string }) => void;
  addKnownLocation: (loc: string, coords?: { x: number; z: number }) => void;
  updateCurrentLocation: (loc: Partial<StructuredLocation>) => void;
  setStructuredLocation: (loc: StructuredLocation | null) => void;
  setGmActivity: (a: string) => void;
  clearGmActivity: () => void;
  addRecentAction: (action: string) => void;
  startTravel: (target: string, targetCoords: { x: number; z: number }, totalHours: number) => void;
  updateTravel: (elapsedHours: number) => void;
  clearTravel: () => void;
  clearSession: () => void;
  setDebugMode: (v: boolean) => void;
}

export const useGameStore = create<GameState>((set) => ({
  phase: 'title', currentDay: 1, gameClock: 8, timeOfDay: '上午',
  currentRegion: '', currentSubRegion: '',
  currentLocation: '', coordinates: { x: 0, y: 0, z: 0 },
  terrain: '', weather: '晴朗',
  messages: [], currentChoices: [], isWaitingForPM: false, isWaitingForPlayer: false,
  streamingText: '', currentDiceResult: null, sceneModifier: 0,
  atmosphere: { mood: '平凡', dangerLevel: 'low' },
  knownLocations: [],
  currentStructuredLocation: null,
  locationHistory: [],
  gmActivity: [],
  recentActions: [],
  travelState: null,
  isDebugMode: false,

  setPhase: (phase) => set({ phase }),
  setDay: (day) => set({ currentDay: day }),
  setClock: (clock) => {
    const normalized = ((clock % 24) + 24) % 24;
    set({ gameClock: normalized, timeOfDay: getTimeOfDay(normalized) });
  },
  advanceClock: (hours) => set((s) => {
    let clock = s.gameClock + hours;
    let day = s.currentDay;
    while (clock >= 24) { clock -= 24; day++; }
    return { gameClock: clock, timeOfDay: getTimeOfDay(clock), currentDay: day };
  }),
  setRegion: (region) => set({ currentRegion: region }),
  setSubRegion: (sub) => set({ currentSubRegion: sub }),
  setLocation: (loc) => set({ currentLocation: loc }),
  setCoordinates: (c) => set({ coordinates: c }),
  setTerrain: (t) => set({ terrain: t }),
  setWeather: (w) => set({ weather: w }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  setMessages: (messages) => set({ messages }),
  upsertMessage: (message) => set((s) => {
    const index = s.messages.findIndex((existing) => existing.id === message.id);
    if (index === -1) {
      return { messages: [...s.messages, message] };
    }
    const nextMessages = [...s.messages];
    nextMessages[index] = message;
    return { messages: nextMessages };
  }),
  addDayDivider: (day) => set((s) => ({ messages: [...s.messages, { id: 'div_' + Date.now(), type: 'divider', content: `── 世界日第${day}天 ──`, timestamp: Date.now() }] })),
  setChoices: (choices) => set({ currentChoices: choices, isWaitingForPlayer: true }),
  setWaitingForPM: (v) => set({ isWaitingForPM: v }),
  setWaitingForPlayer: (v) => set({ isWaitingForPlayer: v }),
  setStreamingText: (t) => set({ streamingText: t }),
  appendStreamingText: (t) => set((s) => ({ streamingText: s.streamingText + t })),
  clearStreaming: () => set({ streamingText: '' }),
  setDiceResult: (r) => set({ currentDiceResult: r }),
  setSceneModifier: (m) => set({ sceneModifier: m }),
  setAtmosphere: (a) => set({ atmosphere: a }),
  addKnownLocation: (loc, coords) => set((s) => {
    if (s.knownLocations.some(l => l.name === loc)) {
      return { knownLocations: s.knownLocations.map(l => l.name === loc ? { ...l, visitedCount: l.visitedCount + 1 } : l) };
    }
    return { knownLocations: [...s.knownLocations, {
      name: loc,
      region: s.currentRegion,
      coordinates: coords ? { x: coords.x, z: coords.z } : { x: s.coordinates.x, z: s.coordinates.z },
      discoveredAt: new Date().toISOString(),
      visitedCount: 1,
    }] };
  }),
  updateCurrentLocation: (loc) => set((s) => {
    const prev = s.currentStructuredLocation;
    const now = new Date().toISOString();
    const samePlace = prev
      && prev.region === (loc.region ?? prev.region)
      && prev.subRegion === (loc.subRegion ?? prev.subRegion)
      && prev.specificPlace === (loc.specificPlace ?? prev.specificPlace);

    if (samePlace && prev) {
      // Just update description/coordinates on same place, bump visit count
      return {
        currentStructuredLocation: {
          ...prev,
          ...loc,
          lastVisitedAt: now,
          visitCount: prev.visitCount + 1,
          coordinates: loc.coordinates ?? prev.coordinates,
        },
      };
    }

    // New location — push old to history, create new
    const newLoc: StructuredLocation = {
      region: loc.region ?? s.currentRegion,
      regionName: loc.regionName ?? prev?.regionName ?? s.currentRegion,
      subRegion: loc.subRegion ?? s.currentSubRegion,
      specificPlace: loc.specificPlace ?? prev?.specificPlace ?? s.currentSubRegion,
      description: loc.description ?? prev?.description ?? '',
      coordinates: loc.coordinates ?? s.coordinates,
      firstVisitedAt: now,
      lastVisitedAt: now,
      visitCount: 1,
      isKnown: s.knownLocations.some(l => l.name === (loc.specificPlace || loc.subRegion || s.currentSubRegion)),
    };

    const history = prev ? [...s.locationHistory, prev].slice(-50) : s.locationHistory;

    return {
      currentStructuredLocation: newLoc,
      locationHistory: history,
    };
  }),
  setStructuredLocation: (loc) => set({ currentStructuredLocation: loc }),
  setGmActivity: (a) => set((s) => {
    if (!a) {
      return { gmActivity: [] };
    }

    const last = s.gmActivity[s.gmActivity.length - 1];
    if (last === a) {
      return { gmActivity: s.gmActivity };
    }

    return { gmActivity: [...s.gmActivity, a].slice(-6) };
  }),
  clearGmActivity: () => set({ gmActivity: [] }),
  addRecentAction: (a) => set((s) => ({ recentActions: [a, ...s.recentActions.filter(x => x !== a)].slice(0, 5) })),
  startTravel: (target, targetCoords, totalHours) => set((s) => ({
    travelState: {
      targetLocation: target,
      targetCoords,
      startCoords: { x: s.coordinates.x, z: s.coordinates.z },
      totalHours,
      elapsedHours: 0,
      startedAt: Date.now(),
    },
  })),
  updateTravel: (elapsedHours) => set((s) => {
    if (!s.travelState) return s;
    const elapsed = s.travelState.elapsedHours + elapsedHours;
    const { startCoords, targetCoords, totalHours } = s.travelState;
    const t = Math.min(1, totalHours > 0 ? elapsed / totalHours : 1);
    const x = startCoords.x + (targetCoords.x - startCoords.x) * t;
    const z = startCoords.z + (targetCoords.z - startCoords.z) * t;
    if (elapsed >= totalHours) {
      return { coordinates: { ...s.coordinates, x, z }, travelState: null };
    }
    return { coordinates: { ...s.coordinates, x, z }, travelState: { ...s.travelState, elapsedHours: elapsed } };
  }),
  clearTravel: () => set({ travelState: null }),
  clearSession: () => set({ messages: [], currentChoices: [], isWaitingForPM: false, isWaitingForPlayer: false, streamingText: '', currentDiceResult: null }),
  setDebugMode: (v) => set({ isDebugMode: v }),
}));
