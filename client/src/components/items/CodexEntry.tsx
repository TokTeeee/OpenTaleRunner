import type { DiscoveryRecord } from '../../stores/codexStore';
import { QUALITY_COLORS, CATEGORY_ICONS, CATEGORY_LABELS } from '../../types/item';

export interface CodexEntryProps {
  record: DiscoveryRecord;
  selected?: boolean;
  onClick?: () => void;
}

export function CodexEntry({ record, selected = false, onClick }: CodexEntryProps) {
  const qualityClass = QUALITY_COLORS[record.quality] || 'text-gray-200';
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="codex-entry"
      data-signature={record.signature}
      data-selected={selected}
      data-is-new={record.isNew}
      className={`w-full text-left p-2 rounded-lg border transition-colors ${
        selected
          ? 'bg-indigo-900/30 border-indigo-500/40'
          : 'bg-gray-800/30 border-transparent hover:bg-gray-800/50'
      }`}
    >
      <div className="flex items-center gap-1">
        <span className="text-base leading-none">{CATEGORY_ICONS[record.category]}</span>
        <span className={`text-xs truncate ${qualityClass}`}>{record.name}</span>
        {record.isNew && (
          <span data-testid="codex-entry-new" className="text-amber-300 text-xs shrink-0">✨</span>
        )}
      </div>
      <div className="text-[9px] text-gray-500 mt-0.5">
        {CATEGORY_LABELS[record.category]} · {record.quality} · 遇到 {record.encounterCount} 次
      </div>
    </button>
  );
}
