import { MapView } from '../map/MapView';
import { useUIStore } from '../../stores/uiStore';

export function WorldMap() {
  const openMapModal = useUIStore((s) => s.openMapModal);

  return (
    <div className="flex flex-col h-full">
      <button
        onClick={openMapModal}
        className="mb-2 w-full text-[11px] py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-emerald-400/70 hover:bg-emerald-500/10 transition-all"
      >
        🗺️ 打开全屏地图
      </button>
      <div className="flex-1 overflow-hidden">
        <MapView />
      </div>
    </div>
  );
}
