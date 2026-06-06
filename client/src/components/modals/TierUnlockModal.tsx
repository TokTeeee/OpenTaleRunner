/**
 * v0.5.3 — TierUnlockModal
 *
 * 当角色达到 L5/L10/L15 且当前 tier 未选节点时, 自动弹出
 * 让玩家在该 tier 的 3 个节点中选一个.
 *
 * 隐藏条件:
 * - character 为空
 * - 战斗进行中 (phase=active/resolving)
 * - 没有 classId
 * - 当前没有 pending tier choice
 *
 * 选完节点后通过 setClass 追加新 skill, modal 自动消失 (重渲染时 pendingTierChoice 返回 null).
 */
import { useCharacterStore } from '../../stores/characterStore';
import { useCombatStore, isCombatActive } from '../../stores/combatStore';
import { getClass } from '../../data/classes';
import { pendingTierChoice } from '../../services/class/classService';
import { useAuthStore } from '../../stores/authStore';
import { getBaseUrl } from '../../services/sync/HttpClient';

export function TierUnlockModal() {
  const character = useCharacterStore((s) => s.character);
  const setClass = useCharacterStore((s) => s.setClass);
  const phase = useCombatStore((s) => s.phase);

  if (!character) return null;
  if (character.classId === null) return null;
  // 战斗中隐藏 (避免遮挡 QTE 提示)
  if (isCombatActive({ phase })) return null;
  const tier = pendingTierChoice(character);
  if (tier === null) return null;
  const def = getClass(character.classId);
  if (!def) return null;
  const tierNodes = def.nodes.filter((n) => n.tier === tier);

  const handlePick = (nodeId: string) => {
    const newSkill = {
      classId: character.classId!,
      nodeId,
      unlockedAt: character.currentLocalDay,
    };
    setClass(character.classId!, [...character.classSkills, newSkill]);
    // 异步 PATCH 服务端 (best-effort)
    void (async () => {
      try {
        const token = useAuthStore.getState().token || '';
        const baseUrl = getBaseUrl();
        await fetch(`${baseUrl}/api/v1/characters/${character.characterId}/class`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            classId: character.classId,
            classSkills: [...character.classSkills, newSkill],
          }),
        });
      } catch {
        /* 失败保留本地状态 */
      }
    })();
  };

  return (
    <div
      data-testid="tier-unlock-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="bg-gray-900 border border-amber-700 rounded-lg max-w-md w-full p-5 max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-4">
          <h3 className="text-lg font-bold text-amber-300">🆙 职业晋升 · 选择 T{tier} 专精</h3>
          <p className="text-xs text-gray-400 mt-2">
            {def.icon} {def.name} — 你已达到 L{tier * 5}, 可在该层级选一个专精节点.
          </p>
        </div>
        <div className="space-y-2">
          {tierNodes.map((node) => (
            <button
              key={node.id}
              data-testid={`tier-node-${node.id}`}
              onClick={() => handlePick(node.id)}
              className="w-full text-left p-3 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-200 text-sm">{node.name}</span>
                <span className="text-[10px] text-gray-500">T{node.tier}·{node.slot}</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">{node.description}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
