import { useEffect, useState } from 'react';
import { useCharacterListStore } from '../../stores/characterListStore';
import { SaveManager } from '../../services/save/SaveManager';
import type { ArchiveIndexEntry } from '../../services/save/SaveManager';
import type { DomainName } from '../../types/save';
import { useCharacterStore } from '../../stores/characterStore';

const DOMAIN_LABELS: Record<DomainName, string> = {
  character: '角色',
  npcs: 'NPC',
  items: '物品',
  chronicle: '编年史',
  world: '世界',
};

function genArchiveId(): string {
  return `arc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export function SaveLoadModal({ onClose }: { onClose: () => void }) {
  const saved = useCharacterListStore((s) => s.savedCharacters);
  const removeChar = useCharacterListStore((s) => s.removeCharacter);
  const hasCharacter = useCharacterStore((s) => !!s.character);

  const [archives, setArchives] = useState<ArchiveIndexEntry[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [lastLoadErrors, setLastLoadErrors] = useState<string[]>([]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- archive list refresh; refactor to SWR/derived in v0.4
    setArchives(SaveManager.listArchives());
  }, [feedback]);

  const handleQuickSave = () => {
    if (!hasCharacter) {
      setFeedback({ type: 'err', text: '当前无角色, 无法快速存档' });
      return;
    }
    try {
      const id = genArchiveId();
      SaveManager.saveArchive(id, `快速存档 ${new Date().toLocaleTimeString()}`);
      setFeedback({ type: 'ok', text: '已保存 4 域独立存档' });
    } catch (e) {
      setFeedback({ type: 'err', text: e instanceof Error ? e.message : '保存失败' });
    }
  };

  const handleLoad = (archiveId: string) => {
    const result = SaveManager.loadArchive(archiveId);
    if (!result.archive) {
      setFeedback({ type: 'err', text: '存档不存在或版本不兼容' });
      return;
    }
    const errs = Object.entries(result.domainErrors).map(([d, msg]) => `${DOMAIN_LABELS[d as DomainName] || d}: ${msg}`);
    setLastLoadErrors(errs);
    if (errs.length === 0) {
      setFeedback({ type: 'ok', text: '已加载 4 域完整存档' });
    } else {
      setFeedback({ type: 'err', text: `部分域加载失败: ${errs.join('; ')}` });
    }
  };

  const handleDelete = (archiveId: string) => {
    SaveManager.deleteArchive(archiveId);
    setFeedback({ type: 'ok', text: '已删除' });
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60]">
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-[520px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <h2 className="text-lg font-bold text-gray-200">存档管理</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl">{'\u2715'}</button>
        </div>

        {feedback && (
          <div className={`mx-4 mt-3 px-3 py-2 rounded text-xs ${feedback.type === 'ok' ? 'bg-emerald-900/30 text-emerald-300 border border-emerald-800/50' : 'bg-rose-900/30 text-rose-300 border border-rose-800/50'}`}>
            {feedback.text}
          </div>
        )}

        {lastLoadErrors.length > 0 && (
          <div className="mx-4 mt-2 px-3 py-2 rounded text-[11px] bg-amber-900/20 text-amber-300 border border-amber-800/50">
            <div className="font-semibold mb-1">⚠ 加载时域级错误:</div>
            <ul className="list-disc pl-4 space-y-0.5">
              {lastLoadErrors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* v2 4 域独立存档 */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-indigo-300">📦 4 域独立存档 (v2)</h3>
              <button
                onClick={handleQuickSave}
                className="text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors">
                快速保存
              </button>
            </div>
            {archives.length === 0 ? (
              <div className="text-center text-gray-600 py-4 text-xs">尚无 v2 存档, 点击"快速保存"创建一个</div>
            ) : (
              <div className="space-y-2">
                {archives.map((arc) => (
                  <div key={arc.archiveId} className="bg-gray-800/50 border border-gray-700 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="text-sm text-gray-200 font-medium flex-1">
                        {arc.archiveName || arc.archiveId}
                      </div>
                      <button
                        onClick={() => handleLoad(arc.archiveId)}
                        className="text-xs px-2 py-0.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded transition-colors">
                        加载
                      </button>
                      <button
                        onClick={() => handleDelete(arc.archiveId)}
                        className="text-xs text-red-400 hover:text-red-300 px-2 py-0.5 hover:bg-red-900/20 rounded transition-colors">
                        删除
                      </button>
                    </div>
                    <div className="text-[10px] text-gray-500">
                      世界日 {arc.worldDay} · {new Date(arc.updatedAt).toLocaleString()}
                    </div>
                    <div className="flex gap-2 mt-1.5 text-[10px]">
                      {(['character', 'npcs', 'items', 'chronicle'] as DomainName[]).map((d) => {
                        const m = arc.domains[d];
                        return (
                          <span
                            key={d}
                            className={`px-1.5 py-0.5 rounded ${m ? 'bg-indigo-900/30 text-indigo-300' : 'bg-gray-800/50 text-gray-600'}`}>
                            {DOMAIN_LABELS[d]}{m ? ` (${m.recordCount})` : ''}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* v1 角色列表 (旧系统) */}
          <section className="border-t border-gray-800 pt-3">
            <h3 className="text-xs font-semibold text-gray-500 mb-2">角色列表 (v1 旧系统)</h3>
            {saved.length === 0 ? (
              <div className="text-center text-gray-600 py-2 text-xs">暂无</div>
            ) : (
              <div className="space-y-2">
                {saved.map((sc) => (
                  <div key={sc.characterId} className="bg-gray-800/30 border border-gray-700/50 rounded-lg p-2 flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-indigo-900/40 border border-indigo-800 flex items-center justify-center text-xs font-bold text-indigo-400 shrink-0">{sc.name[0]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-300">{sc.name}</div>
                      <div className="text-[10px] text-gray-500">{sc.region} · 世界日 {sc.worldDay}</div>
                    </div>
                    <button onClick={() => removeChar(sc.characterId)} className="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5 hover:bg-red-900/20 rounded transition-colors">删除</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="border-t border-gray-800 p-3 flex justify-end">
          <div className="text-xs text-gray-500 self-center">v2 存档含 Character / NPC / Item / Chronicle 4 域独立</div>
        </div>
      </div>
    </div>
  );
}
