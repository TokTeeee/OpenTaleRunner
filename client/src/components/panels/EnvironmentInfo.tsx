import { useState, useEffect } from 'react';
import { useGameStore } from '../../stores/gameStore';
import { useWorldStore } from '../../stores/worldStore';
import { useNPCStore } from '../../stores/npcStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { usePMEngine } from '../../hooks/usePMEngine';
import { useLocalization } from '../../hooks/useLocalization';
import { usePartyStore } from '../../stores/partyStore';
import { buildPartyMemberFromGhost } from '../../services/party/inferAbilities';
import { eventBus } from '../../services/event/EventBus';
import { EVENTS } from '../../services/event/events';
import { RELATIONSHIP_LABELS } from '../../types/npc';
import type { GameNPC } from '../../types/npc';
import type { KnownLocation } from '../../types/game';
import type { NearbyPlayer } from '../../types/multiplayer';
import { estimateTravel } from '../../services/travel/TravelSystem';
import { fetchNearbyPlayers } from '../../services/multiplayer/SyncServices';
import { ImageClient } from '../../services/image/ImageClient';

function formatGameClock(clock: number): string {
  const normalized = ((clock % 24) + 24) % 24;
  const totalMinutes = Math.round(normalized * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function EnvironmentInfo() {
  const {
    currentRegion,
    currentSubRegion,
    currentLocation,
    currentStructuredLocation,
    coordinates,
    terrain,
    weather,
    knownLocations,
    gameClock,
    timeOfDay,
  } = useGameStore();
  const { t } = useLocalization();
  const worldDay = useWorldStore((s) => s.currentWorldDay);
  const ghostNPCs = useWorldStore((s) => s.ghostNPCs);
  const npcs = useNPCStore((s) => s.npcs);
  const knownNPCs = Object.values(npcs).filter(n => n.isMet && n.region === currentRegion);
  const unknownGhosts = ghostNPCs.filter(g => !knownNPCs.some(k => k.name === g.characterName));
  const { submitCustom } = usePMEngine();
  const storybook = useWorldStore((s) => s.storybook);
  const regionOptions = storybook?.regions || [];
  const currentRegionName = t(regionOptions.find((region) => region.id === currentRegion || region.name === currentRegion)?.name || currentRegion, 'regions') || currentRegion;
  const [activeNpc, setActiveNpc] = useState<GameNPC | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<KnownLocation | null>(null);
  const [pendingAction, setPendingAction] = useState<{ label: string; action: string; targetCoords?: { x: number; z: number } } | null>(null);
  const [terrainImage, setTerrainImage] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [nearbyPlayers, setNearbyPlayers] = useState<NearbyPlayer[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<NearbyPlayer | null>(null);
  const partyStore = usePartyStore();
  const imageGenEnabled = useSettingsStore((s) => s.imageGenEnabled);
  const imageGen = useSettingsStore((s) => s.imageGen);
  const displayPlace = currentStructuredLocation?.specificPlace || currentLocation || currentSubRegion || '未知地点';
  const displaySubRegion = t(currentStructuredLocation?.subRegion || currentSubRegion || '未知地带', 'locations');

  // Terrain illustration generation
  useEffect(() => {
    if (!imageGenEnabled || !terrain || !imageGen.apiKey && !useSettingsStore.getState().llm.apiKey) return;

    const cacheKey = `terrain:${terrain}:${currentRegion}`;
    let cancelled = false;

    (async () => {
      setImageLoading(true);
      try {
        const client = new ImageClient();
        const artPrefix = storybook?.narrativeGuide?.tone || 'fantasy oil painting style, dramatic lighting';
        const prompt = `${artPrefix}, ${terrain} terrain, ${currentRegionName} landscape, ${weather}`;
        const result = await client.generate(prompt, cacheKey);
        if (!cancelled && result) setTerrainImage(result);
      } catch { /* ignore */ }
      if (!cancelled) setImageLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- weather is intentionally read at request time; tracked for v0.4
  }, [terrain, currentRegion, currentRegionName, imageGenEnabled, imageGen.apiKey, storybook?.narrativeGuide?.tone]);

  useEffect(() => {
    if (!currentRegion) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const players = await fetchNearbyPlayers();
        if (!cancelled) setNearbyPlayers(players);
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 15000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [currentRegion]);

  // Location parts
  const nearbyLocations = [displaySubRegion].filter(Boolean);

  const confirmAction = () => {
    if (!pendingAction) return;
    if (pendingAction.targetCoords) {
      const travelEstimate = estimateTravel(coordinates, pendingAction.targetCoords, terrain);
      useGameStore.getState().startTravel(pendingAction.label, pendingAction.targetCoords, travelEstimate.hours);
    }
    submitCustom(pendingAction.action);
    setPendingAction(null);
  };

  const quickMove = (locationName: string) => {
    const target = knownLocations.find((loc) => loc.name.includes(locationName) || locationName.includes(loc.name));
    setPendingAction({
      label: `前往 ${locationName}`,
      action: `[前往${locationName}]`,
      targetCoords: target?.coordinates,
    });
  };

  const doExplore = () => {
    submitCustom('[探索周围环境]');
  };

  const npcAction = (npc: GameNPC, action: 'talk' | 'gift' | 'attack' | 'info') => {
    const verbMap = {
      talk: '交谈',
      gift: '赠礼',
      attack: '攻击',
      info: '了解信息',
    } as const;
    submitCustom(`[与${npc.name}${verbMap[action]}]`);
    setActiveNpc(null);
  };

  return (
    <div className="p-3 space-y-4 animate-in">
      {/* Pending action confirmation */}
      {pendingAction && (
        <TravelConfirmBar
          pending={pendingAction}
          onConfirm={confirmAction}
          onCancel={() => setPendingAction(null)}
        />
      )}

      {/* Location */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">📍 位置</div>
        <div className="glass rounded-xl p-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-gray-100 truncate">{displayPlace}</div>
              <div className="text-[10px] text-gray-500 mt-1 truncate">{currentRegionName || '未知区域'} · {displaySubRegion}</div>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-right shrink-0">
              <div className="text-[9px] uppercase tracking-[0.18em] text-amber-300/80">世界时间</div>
              <div className="text-[15px] font-semibold text-amber-200 leading-none mt-1">{formatGameClock(gameClock)}</div>
              <div className="text-[10px] text-amber-100/80 mt-1">第{worldDay}天 · {timeOfDay}</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-gray-600">
            {currentStructuredLocation?.description && (
              <span className="truncate">{currentStructuredLocation.description}</span>
            )}
          </div>
        </div>
      </div>

      {/* Environment */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">🌤 环境</div>
        <div className="glass rounded-xl p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-[11px]"><span className="text-gray-500 w-8">🌍</span><span className="text-gray-300">{t(terrain || '未知', 'terrains')}</span></div>
          <div className="flex items-center gap-2 text-[11px]"><span className="text-gray-500 w-8">🌤</span><span className="text-gray-300">{t(weather || '晴朗', 'weathers')}</span></div>
        </div>
        {/* Terrain Illustration */}
        {imageGenEnabled && (terrainImage || imageLoading) && (
          <div className="mt-2 rounded-xl overflow-hidden border border-white/[.04]">
            {imageLoading && !terrainImage ? (
              <div className="h-24 bg-gray-800/50 flex items-center justify-center text-[10px] text-gray-600">
                🎨 正在绘制地形插画...
              </div>
            ) : terrainImage ? (
              <img src={terrainImage} alt={`${terrain} landscape`} className="w-full h-auto opacity-90 hover:opacity-100 transition-opacity" />
            ) : null}
          </div>
        )}
      </div>

      {/* Quick Move */}
      <div>
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">🏃 快速移动</div>
        <div className="glass rounded-xl p-3 space-y-1.5">
          {nearbyLocations.length > 0 ? (
            nearbyLocations.map((loc, i) => (
              <button key={i} onClick={() => quickMove(loc)} className="w-full text-left text-[11px] text-gray-400 hover:text-indigo-300 px-2 py-1 rounded-lg hover:bg-white/[.03] transition-all">
                {loc}
              </button>
            ))
          ) : (
            <div className="text-[10px] text-gray-600">PM将在此显示可到达的地点</div>
          )}
          <button onClick={doExplore} className="w-full text-left text-[11px] text-emerald-400/70 hover:text-emerald-300 px-2 py-1 rounded-lg hover:bg-emerald-500/[.04] transition-all">
            🔍 探索周围
          </button>
        </div>
      </div>

      {/* Region Travel 远行 - 已搬到 WorldMap 中, 与坐标/定位整合 */}

      {/* Known Locations */}
      {knownLocations.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">📍 已探索</div>
          <div className="glass rounded-xl p-3 space-y-0.5">
            {knownLocations.slice(-8).reverse().map((loc, i) => (
              <div key={i}>
                <div
                  onClick={() => setSelectedLocation(selectedLocation?.name === loc.name ? null : loc)}
                  className={`flex items-center justify-between py-0.5 px-1 rounded cursor-pointer transition-colors ${selectedLocation?.name === loc.name ? 'bg-indigo-500/10' : 'hover:bg-white/[.02]'}`}>
                  <span className="text-[10px] text-gray-400 truncate flex-1 min-w-0">{loc.name}</span>
                  <span className="text-[9px] text-gray-600 ml-1">{selectedLocation?.name === loc.name ? '▲' : '▶'}</span>
                </div>
                {selectedLocation?.name === loc.name && (
                  <div className="ml-2 mt-1 mb-2 p-2 rounded-lg bg-white/[.02] border border-white/[.04] space-y-1.5 animate-in">
                    <div className="text-[10px] text-gray-300 font-medium">{loc.name}</div>
                    <div className="flex gap-1.5">
                      <button onClick={() => { setPendingAction({ label: `前往 ${loc.name}`, action: `[前往${loc.name.split('·').pop() || loc.name}]`, targetCoords: loc.coordinates }); }}
                        className="flex-1 text-[9px] py-1 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-colors">
                        🚶 前往
                      </button>
                      <button onClick={() => { submitCustom(`[在${loc.name.split('·').pop() || loc.name}搜索]`); setSelectedLocation(null); }}
                        className="flex-1 text-[9px] py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors">
                        🔍 搜索
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nearby NPCs */}
      {knownNPCs.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">👥 附近人物</div>
          <div className="space-y-1">
            {knownNPCs.map((npc) => (
              <div key={npc.npcId} className="relative">
                <div onClick={() => setActiveNpc(activeNpc?.npcId === npc.npcId ? null : npc)}
                  className={`glass rounded-lg p-2.5 flex items-center gap-2 cursor-pointer transition-all ${activeNpc?.npcId === npc.npcId ? 'border-indigo-500/30 bg-indigo-500/[.04]' : 'hover:border-indigo-500/20'}`}>
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-400/15 flex items-center justify-center text-[10px] text-indigo-300 font-bold shrink-0">
                    {npc.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-gray-300 truncate">{npc.name}</div>
                    <div className="text-[9px] text-gray-600">{RELATIONSHIP_LABELS[npc.relationship.level] || '陌生人'}</div>
                  </div>
                </div>
                {/* Action menu */}
                {activeNpc?.npcId === npc.npcId && (
                  <div className="mt-1 ml-8 space-y-0.5 animate-in">
                    <button onClick={() => npcAction(npc, 'talk')} className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg bg-white/[.02] hover:bg-indigo-500/10 text-gray-300 transition-all">💬 交谈</button>
                    <button onClick={() => npcAction(npc, 'gift')} className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg bg-white/[.02] hover:bg-amber-500/10 text-gray-300 transition-all">🎁 赠礼</button>
                    <button onClick={() => npcAction(npc, 'info')} className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg bg-white/[.02] hover:bg-blue-500/10 text-gray-300 transition-all">ℹ 了解信息</button>
                    {npc.isHostile && (
                      <button onClick={() => npcAction(npc, 'attack')} className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg bg-white/[.02] hover:bg-red-500/10 text-rose-400 transition-all">⚔ 攻击</button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nearby Real-time Players */}
      {nearbyPlayers.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">🟢 附近实时玩家</div>
          <div className="space-y-1">
            {nearbyPlayers.map((player) => {
              const isExpanded = selectedPlayer?.playerId === player.playerId;
              return (
                <div key={player.playerId}>
                  <div
                    onClick={() => setSelectedPlayer(isExpanded ? null : player)}
                    className={`glass rounded-lg p-2.5 border cursor-pointer transition-all ${
                      isExpanded
                        ? 'border-emerald-500/30 bg-emerald-500/[.04]'
                        : 'border-emerald-500/10 hover:border-emerald-500/20'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-400/15 flex items-center justify-center text-[10px] text-emerald-300 font-bold shrink-0">
                        {player.characterName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] text-emerald-300/90 truncate">{player.characterName}</div>
                        <div className="text-[9px] text-gray-600 mt-0.5">{player.subRegion || player.region}</div>
                      </div>
                      <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 shrink-0">
                        在线
                      </span>
                    </div>
                    {player.currentAction && (
                      <div className="text-[9px] text-gray-500 mt-1.5 ml-9">{player.currentAction}</div>
                    )}
                    {/* Expanded detail + actions */}
                    {isExpanded && (
                      <div className="mt-2 ml-9 space-y-1.5 animate-in">
                        <div className="text-[9px] text-gray-500 space-y-0.5">
                          <div>世界日 {player.worldDay} · 状态: {player.status || 'idle'}</div>
                          <div>坐标: X{player.coordinates.x} Z{player.coordinates.z}</div>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              submitCustom(`[观察${player.characterName}]`);
                            }}
                            className="text-[9px] px-2 py-1 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 transition-colors"
                          >
                            👁 观察
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              submitCustom(`[尝试与${player.characterName}打招呼]`);
                            }}
                            className="text-[9px] px-2 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                          >
                            💬 打招呼
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const member = buildPartyMemberFromGhost(
                                player.characterName,
                                player.currentAction || '探索世界',
                                `在${player.subRegion || player.region}相遇`,
                              );
                              const ok = partyStore.addMember({
                                ...member,
                                memberType: 'ghost_npc',
                                sourceId: player.playerId,
                              });
                              if (!ok) {
                                submitCustom(`[向${player.characterName}提出组队邀请，但队伍已满]`);
                              } else {
                                submitCustom(`[${player.characterName}加入了你的队伍]`);
                              }
                              eventBus.emit(EVENTS.CRITICAL_SYNC_FLUSH, {
                                reason: 'party_invite',
                                target: player.characterName,
                              });
                              setSelectedPlayer(null);
                            }}
                            className={`text-[9px] px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20 transition-colors ${
                              partyStore.canRecruit()
                                ? 'text-amber-400 hover:bg-amber-500/20'
                                : 'text-gray-600 cursor-not-allowed'
                            }`}
                            disabled={!partyStore.canRecruit()}
                            title={partyStore.canRecruit() ? '邀请组队' : '队伍已满'}
                          >
                            🤝 组队
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Unknown Ghost NPCs */}
      {unknownGhosts.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-2">👻 附近冒险者</div>
          <div className="space-y-1">
            {unknownGhosts.map((npc) => (
              <div key={npc.npcId} className="glass rounded-lg p-2.5">
                <div className="text-[11px] text-indigo-300/80">{npc.characterName}</div>
                <div className="text-[9px] text-gray-600 mt-0.5">{npc.currentIntent}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TravelConfirmBar({
  pending, onConfirm, onCancel,
}: {
  pending: { label: string; targetCoords?: { x: number; z: number } };
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const game = useGameStore.getState();
  const est = pending.targetCoords
    ? estimateTravel(game.coordinates, pending.targetCoords, game.terrain)
    : null;

  return (
    <div className="bg-amber-900/20 border border-amber-700/30 rounded-lg p-2.5 space-y-2">
      <div className="text-[11px] text-amber-300">确认{pending.label}？</div>
      {est && (
        <div className="flex gap-3 text-[9px]">
          <span className="text-gray-500">距离: {est.distanceKm.toFixed(1)}km</span>
          <span className="text-gray-500">预计: {est.displayTime}</span>
        </div>
      )}
      <div className="flex gap-2">
        <button onClick={onConfirm}
          className="flex-1 py-1 text-[10px] bg-amber-500/20 border border-amber-500/30 text-amber-300 rounded hover:bg-amber-500/30 transition-colors">
          确认出发
        </button>
        <button onClick={onCancel}
          className="flex-1 py-1 text-[10px] bg-white/5 border border-white/10 text-gray-400 rounded hover:bg-white/10 transition-colors">
          取消
        </button>
      </div>
    </div>
  );
}
