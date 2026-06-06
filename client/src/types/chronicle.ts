export interface ChronicleLogEntry {
  entryId: string;
  playerId: string;
  characterName: string;
  worldDay: number;
  localDay: number;
  location: {
    region: string;
    subRegion: string;
    coordinates: { x: number; y: number; z: number };
  };
  action: {
    summary: string;
    playerChoice: string;
    wasCustomInput: boolean;
    absurdityLevel: number;
    difficulty: number;
    rollResult: string;
    rollDetail: {
      dice: number[];
      modifier: number;
      total: number;
      dc: number;
    };
  };
  narrativeOutput: string;
  consequences: Record<string, unknown>;
  timestamp: string;
  syncStatus: 'pending' | 'synced' | 'failed';
}

export interface ChronicleLogBatch {
  playerId: string;
  entries: ChronicleLogEntry[];
  lastWorldDay: number;
}
