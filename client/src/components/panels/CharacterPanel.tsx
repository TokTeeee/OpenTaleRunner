import { useState } from 'react';
import { useCharacterStore } from '../../stores/characterStore';
import { ATTRIBUTE_LABELS, VITAL_LABELS, VITAL_ICONS, VITAL_MAX } from '../../types/character';
import type { Attributes, Character, Reputation } from '../../types/character';
import { ItemChip } from '../items/ItemChip';
import { SkillsSection } from './CharacterPanel/SkillsSection';
import { ResistanceDisplay } from './CharacterPanel/ResistanceDisplay';
import { ClassSkillTreeModal } from './CharacterPanel/ClassSkillTreeModal';
import { getClass } from '../../data/classes';  // v0.5.14 (用于头部职业名)

const ATTR_ICONS: Record<string, string> = { STR: '💪', DEX: '🏃', CON: '❤️', INT: '🧠', WIS: '👁', CHA: '👑' };

export function CharacterPanel() {
  const character = useCharacterStore((s) => s.character);
  const [classModalOpen, setClassModalOpen] = useState(false);  // v0.5.14
  const [pending, setPending] = useState<Partial<Attributes>>({});
  if (!character) return <div className="p-4 text-gray-600 text-xs text-center">尚未创建角色</div>;

  const attrs = character.attributes;
  const unspentPoints = character.unspentAttributePoints ?? 0;
  const pendingTotal = Object.values(pending).reduce((s, v) => s + v, 0);
  const remaining = unspentPoints - pendingTotal;
  const hpPct = (character.hp / character.maxHp) * 100;
  const classDef = character.classId ? getClass(character.classId) : null;  // v0.5.14

  return (
    <div className="p-3 space-y-3 animate-in overflow-y-auto" style={{ maxHeight: 'calc(100vh - 120px)' }}>
      {/* Avatar + Name (v0.5.14: 职业可点击) */}
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500/30 to-purple-500/30 border border-indigo-400/20 flex items-center justify-center text-lg font-bold text-indigo-300 font-serif shrink-0">
          {character.name[0]}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-200 truncate">{character.name}</div>
          <div className="text-[11px] text-gray-500">
            种族：{character.race}，
            {classDef ? (
              <button
                onClick={() => setClassModalOpen(true)}
                data-testid="panel-class-button"
                data-clickable="true"
                className="text-amber-400 underline cursor-pointer hover:text-amber-300 ml-0.5"
              >
                职业：{classDef.name} ▼
              </button>
            ) : (
              <span
                data-testid="panel-class-none"
                className="text-gray-600 ml-0.5"
              >
                职业：无职业
              </span>
            )}
          </div>
        </div>
      </div>

      {/* HP */}
      <div>
        <div className="flex justify-between text-[10px] mb-1"><span className="text-rose-400/80">❤️ HP</span><span className="text-gray-500">{character.hp}/{character.maxHp}</span></div>
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden"><div className="h-full rounded-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all" style={{ width: `${hpPct}%` }} /></div>
      </div>

      {/* v0.5.1 — Level & EXP bar */}
      <LevelBar character={character} />

      {/* Attribute Radar Chart */}
      <AttributeRadar attributes={attrs} />

      {/* Vital Stats */}
      {character.vital && (
      <div>
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1.5">状态</div>
        <div className="space-y-1">
          {Object.entries(character.vital).map(([k, v]) => {
            // 体温字段语义特殊: 摄氏度 (30-42℃), 不用 VITAL_MAX 100 算百分比
            if (k === 'temperature') {
              const temp = typeof v === 'number' ? v : 37;
              const tempPct = Math.max(2, Math.min(100, ((temp - 30) / 12) * 100));
              const isNormal = temp >= 36 && temp <= 37.5;
              const isDanger = temp < 34 || temp > 40;
              const barColor = isDanger
                ? 'bg-gradient-to-r from-rose-500 to-rose-400'
                : isNormal
                ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
                : 'bg-gradient-to-r from-amber-500 to-amber-400';
              return (
                <div key={k} className="flex items-center gap-1.5">
                  <span className="text-[11px] w-4 text-center">{VITAL_ICONS[k as keyof typeof VITAL_ICONS]}</span>
                  <span className="text-[10px] text-gray-500 w-7">{VITAL_LABELS[k as keyof typeof VITAL_LABELS]}</span>
                  <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${tempPct}%` }} />
                  </div>
                  <span className="text-[9px] text-gray-600 w-8 text-right font-mono">{temp.toFixed(1)}℃</span>
                </div>
              );
            }
            const pct = Math.max(2, (v / VITAL_MAX) * 100);
            const isGood = ['hunger', 'thirst', 'fatigue', 'hygiene', 'wound'].includes(k) ? v < 40 : v > 60;
            const barColor = isGood
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
              : v > 70 ? 'bg-gradient-to-r from-amber-500 to-amber-400'
              : 'bg-gradient-to-r from-indigo-500 to-purple-400';
            return (
              <div key={k} className="flex items-center gap-1.5">
                <span className="text-[11px] w-4 text-center">{VITAL_ICONS[k as keyof typeof VITAL_ICONS]}</span>
                <span className="text-[10px] text-gray-500 w-7">{VITAL_LABELS[k as keyof typeof VITAL_LABELS]}</span>
                <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[9px] text-gray-600 w-6 text-right">{v}</span>
              </div>
            );
          })}
        </div>
      </div>
      )}

      {/* Attributes (v0.6.4: 分配模式 +1/-1) */}
      <div className="mt-1.5">
        <div className="grid grid-cols-2 gap-1" data-testid="attribute-grid">
          {Object.entries(attrs).map(([k, v]) => {
            const key = k as keyof Attributes;
            const pendingDelta = pending[key] ?? 0;
            const isPending = pendingDelta > 0;
            return (
              <div key={k} className="flex items-center gap-1.5 bg-white/5 px-2 py-1 rounded text-[10px]">
                <span className="w-4 text-center">{ATTR_ICONS[k] || '●'}</span>
                <span className="text-gray-400 w-8">{ATTRIBUTE_LABELS[key]}</span>
                <span className={`font-mono ml-auto font-semibold ${isPending ? 'text-yellow-300' : 'text-gray-200'}`}>
                  {v + pendingDelta}
                </span>
                {unspentPoints > 0 && (
                  <>
                    {isPending && (
                      <button
                        data-testid={`attr-minus-${k}`}
                        onClick={() => setPending((p) => {
                          const next = { ...p };
                          next[key] = (next[key] ?? 0) - 1;
                          if (next[key] <= 0) delete next[key];
                          return next;
                        })}
                        className="w-4 h-4 rounded bg-white/10 text-gray-400 hover:bg-white/20 text-[9px] leading-none"
                      >
                        -
                      </button>
                    )}
                    <button
                      data-testid={`attr-plus-${k}`}
                      disabled={remaining <= 0}
                      onClick={() => setPending((p) => ({ ...p, [key]: (p[key] ?? 0) + 1 }))}
                      className="w-4 h-4 rounded bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 text-[9px] leading-none disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      +
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
        {unspentPoints > 0 && pendingTotal > 0 && (
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-cyan-300/80">剩余 {remaining} 点</span>
            <button
              data-testid="attr-confirm"
              onClick={() => {
                useCharacterStore.getState().allocateAttribute(pending);
                setPending({});
              }}
              className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
            >
              确认分配
            </button>
            <button
              data-testid="attr-reset"
              onClick={() => setPending({})}
              className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-gray-400 hover:bg-white/20"
            >
              重置
            </button>
          </div>
        )}
      </div>

      {/* v0.5.14 — SkillsSection 合并 3 种 chip (origin蓝/learned绿/available黄) */}
      <SkillsSection />

      {/* v0.6.2 — 8 元素抗性 (always render, even all-zero for transparency) */}
      <div data-testid="panel-resistances">
        <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">抗性</div>
        <ResistanceDisplay resistances={character.elementalResistances} />
      </div>

      {/* Equipment (v0.5.14: 折叠) */}
      <details data-testid="panel-equipment-details" className="text-[10px]">
        <summary className="cursor-pointer text-gray-600 uppercase tracking-wider hover:text-gray-400 list-none">
          🗡 装备
        </summary>
        <div className="mt-1 text-gray-400">
          🗡 {character.inventory.equipped.weapon?.name ?? '空手'} · 🛡 {character.inventory.equipped.armor?.name ?? '布衣'}
        </div>
      </details>

      {/* Currency (v0.5.14: 折叠) */}
      {character.inventory?.currency && (
        <details data-testid="panel-currency-details" className="text-[10px]">
          <summary className="cursor-pointer text-gray-600 uppercase tracking-wider hover:text-gray-400 list-none">
            💰 货币
          </summary>
          <div className="mt-1 flex gap-3">
            <span className="text-amber-400">{character.inventory.currency.gold}🪙</span>
            <span className="text-gray-400">{character.inventory.currency.silver}⚪</span>
            <span className="text-amber-700">{character.inventory.currency.copper}🟤</span>
          </div>
        </details>
      )}

      {/* Backpack summary (v0.5.14: 折叠) */}
      {character.inventory?.backpack?.length > 0 && (
        <details data-testid="panel-backpack-details" className="text-[10px]">
          <summary className="cursor-pointer text-gray-600 uppercase tracking-wider hover:text-gray-400 list-none">
            🎒 背包 ({character.inventory.backpack.length}件)
          </summary>
          <div className="mt-1 flex flex-wrap gap-1">
            {character.inventory.backpack.slice(0, 6).map((item, i) => (
              <ItemChip key={i} item={item} variant="minimal" onClick={() => {}} />
            ))}
            {character.inventory.backpack.length > 6 && <span className="text-[9px] text-gray-600">+{character.inventory.backpack.length - 6}</span>}
          </div>
        </details>
      )}

      {/* Reputation — collapsible */}
      <ReputationSection rep={character.reputation} />

      {/* Conditions */}
      {character.conditions.length > 0 && (
        <div>
          <div className="text-[10px] text-rose-400/80 uppercase tracking-wider mb-1">异常</div>
          {character.conditions.map((c, i) => <div key={i} className="text-[10px] text-rose-400/80">{c}</div>)}
        </div>
      )}

      {/* v0.5.14 — 职业技能树 Modal (头部按钮触发) */}
      <ClassSkillTreeModal
        classId={character.classId ?? ''}
        isOpen={classModalOpen}
        onClose={() => setClassModalOpen(false)}
        learnedNodes={(character.classSkills ?? []).map((n) => n.nodeId)}
        currentLevel={character.level ?? 1}
        learnedAbilities={character.learnedAbilities.map((la) => la.abilityId)}
        unspentSkillPoints={character.unspentSkillPoints ?? 0}
      />
    </div>
  );
}

function ReputationSection({ rep }: { rep: Reputation }) {
  // v0.5.14: 改为 <details> 折叠, 不再用 useState
  const goodPct = Math.abs(rep.goodness);
  const isGood = rep.goodness >= 0;
  const lawfulPct = Math.abs(rep.lawfulness);
  const isLawful = rep.lawfulness >= 0;

  // Compass coordinates: lawful=right, chaotic=left; good=up, evil=down
  const compassX = rep.lawfulness;
  const compassY = -rep.goodness; // negative Y = good (up in SVG)
  const compassCx = 40, compassCy = 40, compassR = 32;
  const dotX = compassCx + (compassX / 100) * compassR;
  const dotY = compassCy + (compassY / 100) * compassR;

  return (
    <details data-testid="panel-reputation-details" className="text-[10px]">
      <summary className="cursor-pointer text-gray-600 uppercase tracking-wider hover:text-gray-400 list-none">
        📊 声望
      </summary>
      <div className="space-y-2 mt-1 animate-in">
          {/* Compass — 2D Good/Evil × Lawful/Chaotic */}
          <div className="flex justify-center">
            <svg width="80" height="80" viewBox="0 0 80 80">
              {/* Cross hairs */}
              <line x1="8" y1="40" x2="72" y2="40" stroke="#333" strokeWidth="0.5" />
              <line x1="40" y1="8" x2="40" y2="72" stroke="#333" strokeWidth="0.5" />
              {/* Labels */}
              <text x="40" y="8" textAnchor="middle" fill="#4ade80" fontSize="7">善</text>
              <text x="40" y="78" textAnchor="middle" fill="#f87171" fontSize="7">恶</text>
              <text x="76" y="42" textAnchor="middle" fill="#60a5fa" fontSize="7">法</text>
              <text x="4" y="42" textAnchor="middle" fill="#fbbf24" fontSize="7">混</text>
              {/* Quadrant arcs */}
              <rect x="8" y="8" width="32" height="32" fill="rgba(74,222,128,0.05)" rx="16" />
              <rect x="40" y="8" width="32" height="32" fill="rgba(96,165,250,0.05)" rx="16" />
              <rect x="8" y="40" width="32" height="32" fill="rgba(251,191,36,0.05)" rx="16" />
              <rect x="40" y="40" width="32" height="32" fill="rgba(248,113,113,0.05)" rx="16" />
              {/* Position dot */}
              <circle cx={dotX} cy={dotY} r="3" fill="#c4b5fd" stroke="#a78bfa" strokeWidth="0.5" />
            </svg>
          </div>
          {/* Bars */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 w-8">善恶</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${isGood ? 'bg-gradient-to-r from-indigo-500 to-blue-400' : 'bg-gradient-to-r from-red-500 to-rose-400'}`}
                style={{ width: `${goodPct}%`, marginLeft: isGood ? '50%' : `${50 - goodPct}%` }} />
              <div className="w-px h-full bg-white/10 mx-auto" style={{ marginTop: '-6px' }} />
            </div>
            <span className={`text-[9px] w-8 text-right ${isGood ? 'text-blue-400' : 'text-red-400'}`}>{rep.goodness > 0 ? '+' : ''}{rep.goodness}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 w-8">暴力</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-red-400 transition-all" style={{ width: `${rep.violence}%` }} />
            </div>
            <span className="text-[9px] text-amber-400 w-8 text-right">{rep.violence}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 w-8">守法</span>
            <div className="flex-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className={`h-full rounded-full transition-all ${isLawful ? 'bg-gradient-to-r from-emerald-500 to-green-400' : 'bg-gradient-to-r from-orange-500 to-red-400'}`}
                style={{ width: `${lawfulPct}%`, marginLeft: isLawful ? '50%' : `${50 - lawfulPct}%` }} />
              <div className="w-px h-full bg-white/10 mx-auto" style={{ marginTop: '-6px' }} />
            </div>
            <span className={`text-[9px] w-8 text-right ${isLawful ? 'text-emerald-400' : 'text-red-400'}`}>{rep.lawfulness > 0 ? '+' : ''}{rep.lawfulness}</span>
          </div>
          {/* Regional reputations */}
          {Object.keys(rep.regional).length > 0 && (
            <div className="pt-1">
              <div className="text-[9px] text-gray-600 mb-1">区域声望</div>
              {Object.entries(rep.regional).slice(0, 5).map(([r, v]) => (
                <div key={r} className="flex items-center gap-2">
                  <span className="text-[9px] text-gray-500 w-12 truncate">{r}</span>
                  <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                    <div className={`h-full rounded-full ${v >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`} style={{ width: `${Math.abs(v)}%` }} />
                  </div>
                  <span className={`text-[9px] w-7 text-right ${v >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{v > 0 ? '+' : ''}{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
    </details>
  );
}

function AttributeRadar({ attributes }: { attributes: Attributes }) {
  const RADIUS = 32;   // v0.5.14: 55 → 32 (适配 140×100 紧凑布局)
  const CX = 70;       // 居中
  const CY = 50;       // 居中
  const MAX = 18;
  const ATTRS = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'] as const;
  const LABELS: Record<string, string> = { STR: '力量', DEX: '敏捷', CON: '体质', INT: '智力', WIS: '感知', CHA: '魅力' };
  const COLORS = ['#818cf8', '#34d399', '#f87171', '#60a5fa', '#fbbf24', '#c084fc'];

  const [hovered, setHovered] = useState<string | null>(null);

  const points = ATTRS.map((attr, i) => {
    const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
    const val = attributes[attr];
    const r = (val / MAX) * RADIUS;
    return { x: CX + r * Math.cos(angle), y: CY + r * Math.sin(angle), attr, val, angle };
  });

  const gridLevels = [0.25, 0.5, 0.75, 1.0];

  return (
    <div data-testid="attribute-radar">
      <div className="text-[10px] text-gray-600 uppercase tracking-wider mb-1">属性</div>
      <div className="flex justify-center">
        <svg width="140" height="100" viewBox="0 0 140 100">
          {/* Grid */}
          {gridLevels.map(level => {
            const r = level * RADIUS;
            const pts = ATTRS.map((_, i) => {
              const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
              return `${CX + r * Math.cos(angle)},${CY + r * Math.sin(angle)}`;
            }).join(' ');
            return (
              <polygon key={level} points={pts} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="0.5" />
            );
          })}
          {/* Axis lines */}
          {ATTRS.map((_, i) => {
            const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
            const ex = CX + RADIUS * Math.cos(angle);
            const ey = CY + RADIUS * Math.sin(angle);
            return <line key={i} x1={CX} y1={CY} x2={ex} y2={ey} stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />;
          })}
          {/* Data polygon */}
          <polygon
            points={points.map(p => `${p.x},${p.y}`).join(' ')}
            fill="rgba(99,102,241,0.15)"
            stroke="rgba(129,140,248,0.5)"
            strokeWidth="1.2"
          />
          {/* Data points with hover */}
          {points.map((p, i) => {
            const isHovered = hovered === p.attr;
            return (
              <g key={i}>
                <circle
                  cx={p.x} cy={p.y} r={isHovered ? 5 : 2.5}
                  fill={COLORS[i]} stroke="rgba(0,0,0,0.3)" strokeWidth="0.5"
                  className="transition-all duration-200 cursor-pointer"
                  style={{ filter: isHovered ? `drop-shadow(0 0 5px ${COLORS[i]}80)` : 'none' }}
                  onMouseEnter={() => setHovered(p.attr)}
                  onMouseLeave={() => setHovered(null)}
                />
                {isHovered && (
                  <text x={p.x} y={p.y - 8} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="bold">
                    {LABELS[p.attr]}: {p.val}
                  </text>
                )}
              </g>
            );
          })}
          {/* Labels + scores */}
          {points.map((p, i) => {
            const lr = RADIUS + 10;
            const lx = CX + lr * Math.cos(p.angle);
            const ly = CY + lr * Math.sin(p.angle) + 3;
            return (
              <text key={i} x={lx} y={ly} textAnchor="middle" fill="#9ca3af" fontSize="7">
                {LABELS[p.attr]} {p.val}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// v0.5.1 — LevelBar
// ---------------------------------------------------------------------------

function LevelBar({ character }: { character: Character }) {
  const level = character.level ?? 1;
  const exp = character.exp ?? 0;
  const expToNext = character.expToNext ?? 100;
  const unspentPoints = character.unspentAttributePoints ?? 0;
  const unspentSkillPts = character.unspentSkillPoints ?? 0;
  const pct = expToNext > 0 ? Math.min(100, (exp / expToNext) * 100) : 100;
  const isMaxLevel = level >= 20 && expToNext === 0;
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1">
        <span className="text-amber-300/80">⚔️ Lv.{level}</span>
        {isMaxLevel ? (
          <span className="text-yellow-400/80 font-semibold">MAX</span>
        ) : (
          <span className="text-gray-500">{exp}/{expToNext}</span>
        )}
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-yellow-400 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {unspentPoints > 0 && (
        <div className="mt-1 text-[10px] text-cyan-300/80">
          ✨ {unspentPoints} 个属性点待分配
        </div>
      )}
      {unspentSkillPts > 0 && (
        <div className="mt-0.5 text-[10px] text-purple-300/80">
          🔮 {unspentSkillPts} 个技能点待分配
        </div>
      )}
    </div>
  );
}
