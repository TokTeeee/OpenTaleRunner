import { useUIStore } from '../../stores/uiStore';

export function WorldMap() {
  const openMapModal = useUIStore((s) => s.openMapModal);

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="text-gray-500 text-xs">地图已移至全屏模式</div>
      <button
        onClick={openMapModal}
        className="text-[11px] px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
      >
        🗺️ 打开全屏地图
      </button>
    </div>
  );
}
