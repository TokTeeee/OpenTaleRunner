export const EVENTS = {
  SCENE_LOADED: 'scene:loaded',
  DICE_PENDING: 'dice:pending',
  DICE_ROLLED: 'dice:rolled',
  NARRATIVE_RECEIVED: 'narrative:received',
  CRITICAL_SYNC_FLUSH: 'sync:critical_flush',
  DAY_COMPLETED: 'day:completed',
  GHOST_NPC_APPEARED: 'ghost:npc_appeared',
  NETWORK_OFFLINE: 'network:offline',
  NETWORK_ONLINE: 'network:online',
  WORLD_SYNCED: 'world:synced',
  WORLD_UPDATE_PUSHED: 'world:update_pushed',
  PM_ERROR: 'pm:error',
  ACTION_POINTS_CHANGED: 'action:points_changed',
  GM_ACTIVITY: 'gm:activity',
  // v0.5.1 — combat & narrative EXP hooks
  COMBAT_HIT: 'combat.hit',          // payload: { attacker, target, damage }
  COMBAT_KILL: 'combat.kill',        // payload: { killer, target, partyId }
  COMBAT_END: 'combat.end',          // payload: { outcome, partyId }
  NARRATIVE_SUBMIT: 'narrative.submit', // payload: { characterId, action }
  LEVEL_UP: 'character.level_up',    // payload: { characterId, oldLevel, newLevel }
  // v0.5.2 — class hooks
  CLASS_PICKED: 'character.class_picked',   // payload: { characterId, classId }
  CLASS_NODE_UNLOCKED: 'character.class_node_unlocked', // payload: { characterId, classId, nodeId, tier }
} as const;

export type EventName = typeof EVENTS[keyof typeof EVENTS];
