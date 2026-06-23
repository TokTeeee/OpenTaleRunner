import { MapView } from '../map/MapView';

export function MapModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-[90vw] h-[85vh] bg-zinc-900/95 border border-white/[.06] rounded-xl shadow-2xl overflow-hidden">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-30 text-gray-500 hover:text-white text-lg leading-none"
        >
          ✕
        </button>
        <MapView />
      </div>
    </div>
  );
}
