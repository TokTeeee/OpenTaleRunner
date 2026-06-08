/**
 * v0.6.2 — 全客户端 store 重置工具
 * 供测试 (e2e / 集成 / 单元) 调用, 把所有 Zustand store 还原到 initial state.
 *
 * v0.6.2 兼容性说明:
 * characterStore 走 `getInitialState()` (character: null) — v0.6.2 新字段
 * (elementalResistances / learnedAbilities / defaultLearnedAbilities /
 * mp / maxMp) 都在 Character 内部, character=null 时这些字段随之消失.
 *
 * 历史: 旧版 resetClientStores (在 tests/utils/) 是此文件的早期实现, 已被
 * 此处 resetAllStores 取代, 仅保留 re-export 以避免大面积修改测试.
 */
import { useAuthStore } from '../stores/authStore';
import { useAutoPlayStore } from '../stores/autoPlayStore';
import { useCharacterListStore } from '../stores/characterListStore';
import { useCharacterStore } from '../stores/characterStore';
import { useCombatStore, INITIAL_COMBAT_STATE } from '../stores/combatStore';
import { useGameStore } from '../stores/gameStore';
import { useItemRegistryStore } from '../stores/itemRegistryStore';
import { useMultiplayerStore } from '../stores/multiplayerStore';
import { useNPCStore } from '../stores/npcStore';
import { usePartyStore } from '../stores/partyStore';
import { useQTEStore } from '../stores/qteStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useUIStore } from '../stores/uiStore';
import { useWorldStore } from '../stores/worldStore';

export function resetAllStores(): void {
  // 通用 stores: 直接用 getInitialState() 还原
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  useAuthStore.setState(useAuthStore.getInitialState(), true);
  useCharacterStore.setState(useCharacterStore.getInitialState(), true);
  useCharacterListStore.setState(useCharacterListStore.getInitialState(), true);
  useGameStore.setState(useGameStore.getInitialState(), true);
  useNPCStore.setState(useNPCStore.getInitialState(), true);
  useWorldStore.setState(useWorldStore.getInitialState(), true);
  useMultiplayerStore.setState(useMultiplayerStore.getInitialState(), true);
  usePartyStore.setState(usePartyStore.getInitialState(), true);
  useAutoPlayStore.setState(useAutoPlayStore.getInitialState(), true);
  useUIStore.setState(useUIStore.getInitialState(), true);
  useItemRegistryStore.setState(useItemRegistryStore.getInitialState(), true);

  // v0.4 战斗系统: 重置 combatStore (merge 而非 replace, 保留 mutators) + qteStore
  useCombatStore.setState({ ...INITIAL_COMBAT_STATE, active: false, isPlayerTurn: false });
  useQTEStore.getState().reset();
}
