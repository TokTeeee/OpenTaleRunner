/**
 * 角色槽选择器 — inherit模式加入房间时使用
 */

import { useState } from 'react';
import type { CharacterSlot } from '../../types/multiplayer';

interface Props {
  slots: CharacterSlot[];
  onSelect: (slotId: string) => void;
  onCancel: () => void;
}

export function CharacterSlotSelector({ slots, onSelect, onCancel }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  const unclaimed = slots.filter(s => !s.claimedByPlayerId);
  const claimed = slots.filter(s => s.claimedByPlayerId);

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-200">选择要扮演的角色</h3>
      <p className="text-sm text-gray-400">这个房间继承了一个多人存档，请选择一个角色槽来认领</p>

      {/* 未认领的角色 */}
      {unclaimed.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-emerald-400">可选角色</div>
          {unclaimed.map((slot) => (
            <button
              key={slot.slotId}
              onClick={() => setSelected(slot.slotId)}
              className={`w-full text-left p-4 rounded-lg border transition-colors ${
                selected === slot.slotId
                  ? 'bg-indigo-900/30 border-indigo-500'
                  : 'bg-gray-800 border-gray-700 hover:border-gray-500'
              }`}
            >
              <div className="font-semibold text-gray-200">{slot.characterName}</div>
              <div className="text-xs text-gray-400 mt-0.5">{slot.characterSummary}</div>
            </button>
          ))}
        </div>
      )}

      {/* 已认领的角色 */}
      {claimed.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500">已认领角色</div>
          {claimed.map((slot) => (
            <div key={slot.slotId} className="p-4 rounded-lg bg-gray-800/50 border border-gray-700/50 opacity-60">
              <div className="font-semibold text-gray-400">{slot.characterName}</div>
              <div className="text-xs text-gray-500 mt-0.5">{slot.characterSummary}</div>
              <div className="text-xs text-gray-600 mt-1">已被认领</div>
            </div>
          ))}
        </div>
      )}

      {/* 操作 */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          className="flex-1 py-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-500 transition-colors text-sm"
        >
          取消
        </button>
        <button
          onClick={() => selected && onSelect(selected)}
          disabled={!selected}
          className="flex-1 py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-medium transition-colors text-sm"
        >
          确认选择
        </button>
      </div>
    </div>
  );
}
