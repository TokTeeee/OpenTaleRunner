import { useState } from 'react';
import { CharacterPanel } from '../panels/CharacterPanel';
import { SocialPanel } from '../panels/SocialPanel';
import { PartyPanel } from '../panels/PartyPanel';
import { useUIStore } from '../../stores/uiStore';
import { usePartyStore } from '../../stores/partyStore';

export function LeftPanel() {
  const [tab, setTab] = useState<'character' | 'social' | 'party'>('character');
  const partyCount = usePartyStore((s) => s.members.length);

  return (
    <div className="w-[260px] shrink-0 border-r border-white/[.03] flex flex-col glass-strong z-20">
      <div className="flex border-b border-white/[.04]">
        <button onClick={() => setTab('character')}
          className={`flex-1 py-2.5 text-[11px] font-medium transition-all ${tab === 'character' ? 'text-indigo-400 border-b border-indigo-400 bg-indigo-500/[.04]' : 'text-gray-600 hover:text-gray-400'}`}>角色</button>
        <button onClick={() => setTab('social')}
          className={`flex-1 py-2.5 text-[11px] font-medium transition-all ${tab === 'social' ? 'text-emerald-400 border-b border-emerald-400 bg-emerald-500/[.04]' : 'text-gray-600 hover:text-gray-400'}`}>社交</button>
        <button onClick={() => setTab('party')}
          className={`flex-1 py-2.5 text-[11px] font-medium transition-all relative ${tab === 'party' ? 'text-amber-400 border-b border-amber-400 bg-amber-500/[.04]' : 'text-gray-600 hover:text-gray-400'}`}>
          队伍
          {partyCount > 0 && (
            <span className="absolute -top-0.5 -right-1 text-[8px] px-1 rounded-full bg-amber-500/20 text-amber-400">
              {partyCount}
            </span>
          )}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tab === 'character' && <CharacterPanel />}
        {tab === 'social' && <SocialPanel />}
        {tab === 'party' && <PartyPanel />}
      </div>
      <div className="border-t border-white/[.04] p-2 space-y-0.5">
        <button onClick={() => useUIStore.getState().openModal('settings')} className="w-full text-left text-[11px] text-gray-600 hover:text-gray-300 px-2.5 py-1.5 rounded-lg hover:bg-white/[.04] transition-all">设置</button>
        <button onClick={() => useUIStore.getState().openModal('saveLoad')} className="w-full text-left text-[11px] text-gray-600 hover:text-gray-300 px-2.5 py-1.5 rounded-lg hover:bg-white/[.04] transition-all">角色存档</button>
        <button className="w-full text-left text-[11px] text-gray-600 hover:text-rose-400 px-2.5 py-1.5 rounded-lg hover:bg-rose-500/[.04] transition-all">退出</button>
      </div>
    </div>
  );
}
