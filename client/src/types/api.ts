import type { Encounter, GhostNPC, RegionData, WorldChronicleEntry } from './world';

export interface PullResult {
  worldDay: number;
  regionStates: Record<string, RegionData>;
  chronicle: WorldChronicleEntry[];
  newEncounters: Encounter[];
  ghostNPCs: GhostNPC[];
  lastSyncTime?: string;
  reason?: string;
}

export interface PushResult {
  uploaded: number;
  failed: number;
  newEncounters: Encounter[];
}

export interface SyncResult {
  pulledWorldDay: number;
  pulledChronicleCount: number;
  pushedLogCount: number;
  newEncounters: Encounter[];
  newGhostNPCs: GhostNPC[];
  lastSyncTime?: string;
}

export interface ApiError {
  code: string;
  message: string;
  status: number;
}
