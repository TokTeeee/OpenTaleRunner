import { useMapStore } from '../../stores/mapStore';
import { WorldMapView } from './WorldMapView';
import { RegionMapView } from './RegionMapView';
import { LocationMapView } from './LocationMapView';
import type { MapViewLevel } from '../../types/map';

export function MapView() {
  const { viewLevel, currentRegionId, currentLocationId, currentRegion, playerLocationId, navigateBack } = useMapStore();

  // Build breadcrumb
  const breadcrumb: { label: string; level: MapViewLevel }[] = [];
  breadcrumb.push({ label: '世界', level: 'world' });
  if (currentRegionId && currentRegion) {
    breadcrumb.push({ label: currentRegion.name, level: 'region' });
  }
  if (currentLocationId && playerLocationId === currentLocationId) {
    breadcrumb.push({ label: '地点', level: 'location' });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      {breadcrumb.length > 1 && (
        <div className="flex items-center gap-1 px-3 py-1.5 bg-white/[.02] border-b border-white/[.04] text-[10px]">
          {breadcrumb.map((item, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span className="text-gray-600">›</span>}
              <button
                onClick={() => {
                  if (item.level === 'world') {
                    const { viewLevel } = useMapStore.getState();
                    if (viewLevel === 'location') navigateBack();
                    if (useMapStore.getState().viewLevel === 'region') navigateBack();
                  } else if (item.level === 'region') {
                    if (useMapStore.getState().viewLevel === 'location') navigateBack();
                  }
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
