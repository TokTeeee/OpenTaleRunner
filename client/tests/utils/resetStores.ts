import { useAuthStore } from '../../src/stores/authStore';
import { useAutoPlayStore } from '../../src/stores/autoPlayStore';
import { useCharacterListStore } from '../../src/stores/characterListStore';
import { useCharacterStore } from '../../src/stores/characterStore';
import { useCombatStore, INITIAL_COMBAT_STATE } from '../../src/stores/combatStore';
import { useGameStore } from '../../src/stores/gameStore';
import { useItemRegistryStore } from '../../src/stores/itemRegistryStore';
import { useMultiplayerStore } from '../../src/stores/multiplayerStore';
import { useNPCStore } from '../../src/stores/npcStore';
import { usePartyStore } from '../../src/stores/partyStore';
import { useQTEStore } from '../../src/stores/qteStore';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { useUIStore } from '../../src/stores/uiStore';
import { useWorldStore } from '../../src/stores/worldStore';

export function resetClientStores(): void {
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