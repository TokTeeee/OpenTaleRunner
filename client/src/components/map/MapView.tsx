import { useMapStore } from '../../stores/mapStore';
import { WorldMapView } from './WorldMapView';
import { RegionMapView } from './RegionMapView';
import { LocationMapView } from './LocationMapView';
import type { MapViewLevel } from '../../types/map';

const TAB_LABELS: Record<MapViewLevel, { icon: string; label: string }> = {
  world: { icon: '🌍', label: '世界' },
  region: { icon: '🗺', label: '区域' },
  location: { icon: '📍', label: '地点' },
};

export function MapView() {
  const { viewLevel, currentRegionId, currentLocationId, currentRegion, navigateBack } = useMapStore();

  // Build breadcrumb
  const breadcrumb = [];
  breadcrumb.push({ label: '世界', level: 'world' as MapViewLevel });
  if (currentRegionId && currentRegion) {
    breadcrumb.push({ label: currentRegion.name, level: 'region' as MapViewLevel });
  }
  if (currentLocationId) {
    breadcrumb.push({ label: '地点', level: 'location' as MapViewLevel });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center border-b border-white/[.04]">
        {(['world', 'region', 'location'] as MapViewLevel[]).map((level) => {
          const tab = TAB_LABELS[level];
          const isActive = viewLevel === level;
          const isDisabled = (level === 'region' && !currentRegionId) || (level === 'location' && !currentLocationId);
          return (
            <button
              key={level}
              disabled={isDisabled}
              onClick={() => !isDisabled && (level === 'world' ? navigateBack() : null)}
              className={`px-3 py-2 text-[11px] font-medium transition-all border-b-2 ${
                isActive
                  ? 'text-emerald-400 border-emerald-400'
                  : isDisabled
                    ? 'text-gray-700 border-transparent cursor-not-allowed'
                    : 'text-gray-500 border-transparent hover:text-gray-400'
              }`}
            >
              {tab.icon} {tab.label}
            </button>
          );
        })}
      </div>

      {/* Breadcrumb */}
      {breadcrumb.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 bg-white/[.02] border-b border-white/[.04] text-[10px]">
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-600">›</span>}
              <button
                onClick={() => {
                  if (item.level === 'world') navigateBack();
                  // region/location navigation handled by navigateBack
                }}
                className={`${i === breadcrumb.length - 1 ? 'text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {item.label}
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Map content */}
      <div className="flex-1 overflow-hidden">
        {viewLevel === 'world' && <WorldMapView />}
        {viewLevel === 'region' && <RegionMapView />}
        {viewLevel === 'location' && <LocationMapView />}
      </div>
    </div>
  );
}
