import type { MultiplayerSaveData } from '../../types/multiplayer';
import { requestSaveData } from './MultiplayerAPI';

export const MULTIPLAYER_SAVE_KEY_PREFIX = 'aeslan-mp-save-';
export const MULTIPLAYER_SAVE_INDEX_KEY = 'aeslan-mp-save-index';

function getArchiveKey(archiveId: string): string {
  return `${MULTIPLAYER_SAVE_KEY_PREFIX}${archiveId}`;
}

function readIndex(): string[] {
  try {
    const raw = localStorage.getItem(MULTIPLAYER_SAVE_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

function writeIndex(archiveIds: string[]): void {
  localStorage.setItem(MULTIPLAYER_SAVE_INDEX_KEY, JSON.stringify(Array.from(new Set(archiveIds))));
}

export function persistArchive(archive: MultiplayerSaveData): MultiplayerSaveData {
  localStorage.setItem(getArchiveKey(archive.archiveId), JSON.stringify(archive));
  const nextIndex = [archive.archiveId, ...readIndex().filter((archiveId) => archiveId !== archive.archiveId)].slice(0, 50);
  writeIndex(nextIndex);
  return archive;
}

export async function saveGame(roomId: string, archiveName?: string): Promise<MultiplayerSaveData> {
  const archive = await requestSaveData(roomId);
  const namedArchive = archiveName ? { ...archive, archiveName } : archive;
  return persistArchive(namedArchive);
}

export function loadLocalArchives(): MultiplayerSaveData[] {
  const indexedArchives = readIndex()
    .map((archiveId) => {
      try {
        const raw = localStorage.getItem(getArchiveKey(archiveId));
        return raw ? JSON.parse(raw) as MultiplayerSaveData : null;
      } catch {
        return null;
      }
    })
    .filter((archive): archive is MultiplayerSaveData => Boolean(archive?.archiveId));

  if (indexedArchives.length > 0) {
    return indexedArchives.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }

  const archives: MultiplayerSaveData[] = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(MULTIPLAYER_SAVE_KEY_PREFIX)) continue;
    try {
      const archive = JSON.parse(localStorage.getItem(key) || '') as MultiplayerSaveData;
      if (archive?.archiveId) archives.push(archive);
    } catch {
      // Ignore malformed archives and rebuild the index from valid data.
    }
  }
  writeIndex(archives.map((archive) => archive.archiveId));
  return archives.sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function deleteLocalArchive(archiveId: string): void {
  localStorage.removeItem(getArchiveKey(archiveId));
  writeIndex(readIndex().filter((existingId) => existingId !== archiveId));
}

export function exportArchive(archiveId: string): void {
  const archive = loadLocalArchives().find((item) => item.archiveId === archiveId);
  if (!archive) {
    throw new Error('存档不存在');
  }

  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${archive.archiveName || archive.archiveId}.opentale-runner-mp-save.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importArchive(file: File): Promise<MultiplayerSaveData> {
  const raw = await file.text();
  const archive = JSON.parse(raw) as MultiplayerSaveData;
  if (!archive?.archiveId || !archive?.createdAt) {
    throw new Error('无效的多人存档文件');
  }
  return persistArchive(archive);
}