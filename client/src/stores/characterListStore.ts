import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Character } from '../types/character';

interface SavedCharacter {
  characterId: string;
  name: string;
  race: string;
  background: string;
  region: string;
  worldDay: number;
  savedAt: string;
  data: Character;
}

interface CharacterListState {
  savedCharacters: SavedCharacter[];
  addCharacter: (char: Character) => void;
  removeCharacter: (id: string) => void;
  updateCharacterDay: (id: string, day: number) => void;
  getCharacter: (id: string) => SavedCharacter | undefined;
}

export const useCharacterListStore = create<CharacterListState>()(
  persist(
    (set, get) => ({
      savedCharacters: [],
      addCharacter: (char) =>
        set((s) => ({
          savedCharacters: [
            ...s.savedCharacters.filter((c) => c.characterId !== char.characterId),
            {
              characterId: char.characterId,
              name: char.name,
              race: char.race,
              background: char.background.slice(0, 60),
              region: char.currentRegion || char.joinedRegion,
              worldDay: char.currentLocalDay,
              savedAt: new Date().toISOString(),
              data: char,
            },
          ],
        })),
      removeCharacter: (id) =>
        set((s) => ({ savedCharacters: s.savedCharacters.filter((c) => c.characterId !== id) })),
      updateCharacterDay: (id, day) =>
        set((s) => ({
          savedCharacters: s.savedCharacters.map((c) =>
            c.characterId === id ? { ...c, worldDay: day, savedAt: new Date().toISOString() } : c,
          ),
        })),
      getCharacter: (id) => get().savedCharacters.find((c) => c.characterId === id),
    }),
    { name: 'aeslan-characters' },
  ),
);
