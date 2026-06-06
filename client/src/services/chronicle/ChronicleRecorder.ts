import type { ChronicleLogEntry, ChronicleLogBatch } from '../../types/chronicle';
import type { HistoryEntry } from '../../types/character';
import { generateId } from '../../utils/text';

export class ChronicleRecorder {
  private entries: ChronicleLogEntry[] = [];
  private playerId: string;
  private characterName: string;

  constructor(playerId: string, characterName: string) {
    this.playerId = playerId;
    this.characterName = characterName;
  }

  recordEntry(entry: Omit<ChronicleLogEntry, 'entryId' | 'playerId' | 'characterName' | 'syncStatus'>): void {
    const fullEntry: ChronicleLogEntry = {
      ...entry,
      entryId: generateId(),
      playerId: this.playerId,
      characterName: this.characterName,
      syncStatus: 'pending',
    };
    this.entries.push(fullEntry);
  }

  getEntries(worldDay?: number): ChronicleLogEntry[] {
    if (worldDay) {
      return this.entries.filter((e) => e.worldDay === worldDay);
    }
    return [...this.entries];
  }

  getRecentEntries(limit: number): HistoryEntry[] {
    return this.entries.slice(-limit).map((e) => ({
      worldDay: e.worldDay,
      region: e.location.region,
      summary: e.action.summary,
    }));
  }

  getPendingEntries(): ChronicleLogEntry[] {
    return this.entries.filter((e) => e.syncStatus === 'pending');
  }

  markSynced(entryIds: string[]): void {
    for (const e of this.entries) {
      if (entryIds.includes(e.entryId)) {
        e.syncStatus = 'synced';
      }
    }
  }

  packDailyLogs(worldDay: number): ChronicleLogBatch {
    const dayEntries = this.entries.filter(
      (e) => e.worldDay === worldDay && e.syncStatus === 'pending',
    );
    return {
      playerId: this.playerId,
      entries: dayEntries,
      lastWorldDay: worldDay,
    };
  }

  countByDay(worldDay: number): number {
    return this.entries.filter((e) => e.worldDay === worldDay).length;
  }

  toJSON(): ChronicleLogEntry[] {
    return this.entries;
  }

  fromJSON(entries: ChronicleLogEntry[]): void {
    this.entries = entries;
  }

  rebind(playerId: string, characterName: string, clearEntries = false): void {
    this.playerId = playerId;
    this.characterName = characterName;
    if (clearEntries) {
      this.entries = [];
    }
  }

  getPlayerId(): string {
    return this.playerId;
  }

  getCharacterName(): string {
    return this.characterName;
  }
}
