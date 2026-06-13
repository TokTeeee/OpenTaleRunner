import { useMapStore } from '../../stores/mapStore';
import { useGameStore } from '../../stores/gameStore';
import type { LocationChange } from '../../types/map';

/**
 * Sync gameStore location changes to mapStore.
 * Called when GM updates the player's location.
 */
export function syncMapLocationFromGame(): void {
  const game = useGameStore.getState();
  const map = useMapStore.getState();

  // If no world map exists, nothing to sync
  if (!map.worldMap) return;

  const currentRegion = game.currentRegion;
  const currentLocation = game.currentLocation;

  // Try to find matching region in world map
  if (currentRegion) {
    const matchedRegion = map.worldMap.regions.find(r =>
      r.id === currentRegion || r.name === currentRegion || r.name.includes(currentRegion)
    );

    if (matchedRegion && matchedRegion.id !== map.playerRegionId) {
      map.updatePlayerPosition({ regionId: matchedRegion.id });
    }

    // Try to find matching location in current region
    if (currentLocation && map.currentRegion?.id === matchedRegion?.id) {
      const matchedLocation = map.currentRegion.locations.find(l =>
        l.name === currentLocation || l.name.includes(currentLocation) || currentLocation.includes(l.name)
      );

      if (matchedLocation && matchedLocation.id !== map.playerLocationId) {
        map.updatePlayerPosition({ locationId: matchedLocation.id });
      }
    }
  }
}

/**
 * Parse a LocationChange from GM response and apply it to mapStore.
 * This is for future structured locationChange output from GM.
 */
export function applyLocationChange(change: LocationChange): void {
  const map = useMapStore.getState();
  if (!map.worldMap) return;

  switch (change.type) {
    case 'region': {
      const region = map.worldMap.regions.find(r => r.id === change.targetId || r.name === change.targetId);
      if (region) {
        map.updatePlayerPosition({ regionId: region.id });
      }
      break;
    }
    case 'location': {
      if (map.currentRegion) {
        const loc = map.currentRegion.locations.find(l => l.id === change.targetId || l.name === change.targetId);
        if (loc) {
          map.updatePlayerPosition({ locationId: loc.id });
        }
      }
      break;
    }
    case 'building': {
      if (map.locationMap) {
        const building = map.locationMap.buildings.find(b => b.id === change.targetId || b.name === change.targetId);
        if (building) {
          map.updatePlayerPosition({ locationPos: { x: building.tileX, y: building.tileY } });
        }
      }
      break;
    }
  }
}
