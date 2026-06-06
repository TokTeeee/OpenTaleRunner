import type { GameSnapshot } from '../../types/hooks';
import { useGameStore } from '../../stores/gameStore';
import { useCharacterStore } from '../../stores/characterStore';

export function buildSnapshot(): GameSnapshot {
  const game = useGameStore.getState();
  const char = useCharacterStore.getState().character;

  const partyData: GameSnapshot['party'] = { members: [], size: 0 };

  return {
    currentDay: game.currentDay,
    gameClock: game.gameClock,
    timeOfDay: game.timeOfDay,
    terrain: game.terrain,
    weather: game.weather,
    currentRegion: game.currentRegion,
    character: {
      hp: char?.hp ?? 0,
      maxHp: char?.maxHp ?? 20,
      vital: char?.vital ?? { hunger: 50, thirst: 50, fatigue: 50, hygiene: 50, morale: 50, wound: 0, temperature: 37, encumbrance: 0 },
      conditions: char?.conditions ?? [],
      attributes: char?.attributes ?? { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      equipped: {
        weapon: char?.inventory?.equipped?.weapon?.name ?? '',
        armor: char?.inventory?.equipped?.armor?.name ?? '',
        accessory: char?.inventory?.equipped?.accessory?.name ?? '',
      },
    },
    party: partyData,
  };
}

