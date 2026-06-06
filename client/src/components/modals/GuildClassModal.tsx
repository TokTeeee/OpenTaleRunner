/**
 * v0.5.3 — GuildClassModal
 *
 * 冒险者公会的职业授予界面 (v0.5.3 后置入口, 给角色创建时跳过职业的玩家补选):
 * - 仅当 character.classId === null 时显示
 * - 玩家先选 4 基础职业之一, 再选该职业的 T1 节点
 * - 选完调 useCharacterStore.setClass(...) + onClose
 * - 服务端同步: 通过 PATCH /api/v1/characters/{id}/class 异步执行
 *   (失败时保留本地状态, 下次进入公会自动重试)
 */
import { useState } from 'react';
import { useCharacterStore } from '../../stores/characterStore';
import { CLASS_LIST, getClass } from '../../data/classes';
import { useAuthStore } from '../../stores/authStore';
import { getBaseUrl } from '../../services/sync/HttpClient';
import type { ClassId, ClassNode } from '../../types/class';
import type { ClassSkillNode } from '../../types/character';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function GuildClassModal({ open, onClose }: Props) {
  const character = useCharacterStore((s) => s.character);
  const setClass = useCharacterStore((s) => s.setClass);
  const [pickingClass, setPickingClass] = useState<ClassId | null>(null);

  if (!open || !character) return null;
  if (character.classId) return null; // modal 隐藏, 玩家已选职业

  const handleNodePick = (node: ClassNode) => {
    if (!pickingClass) return;
    const newSkill: ClassSkillNode = {
      classId: pickingClass,
      nodeId: node.id,
      unlockedAt: character.currentLocalDay,
    };
    // 1. 本地立即更新
    setClass(pickingClass, [newSkill]);
    // 2. 立即关闭 modal (避免阻塞 UI)
    onClose();
    // 3. 异步 PATCH 服务端 (失败保留本地状态, 不影响 UI)
    void (async () => {
      try {
        const token = useAuthStore.getState().token || '';
        const baseUrl = getBaseUrl();
        await fetch(
          `${baseUrl}/api/v1/characters/${character.characterId}/class`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ classId: pickingClass, classSkills: [newSkill] }),
          },
        );
      } catch {
        /* 失败保留本地状态 */
      }
    })();
  };

  if (pickingClass) {
    const def = getClass(pickingClass);
    const t1Nodes = (def?.nodes ?? []).filter((n) => n.tier === 1);
    return (
      <div
        data-testid="guild-class-modal"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      >
        <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-md w-full p-5 max-h-[90vh] overflow-y-auto">
          <div className="text-center mb-4">
            <h3 className="text-lg font-bold text-gray-200">选择 T1 专精</h3>
            <p className="text-xs text-gray-500 mt-1">
              {def?.icon} {def?.name} — 选一个 T1 节点作为你的初始专精
            </p>
          </div>
          <div className="space-y-2">
            {t1Nodes.map((node) => (
              <button
                key={node.id}
                data-testid={`t1-node-${node.id}`}
                onClick={() => handleNodePick(node)}
                className="w-full text-left p-3 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-750 transition-colors"
              >
                <div className="font-medium text-gray-200 text-sm">{node.name}</div>
                <div className="text-xs text-gray-400 mt-1">{node.description}</div>
              </button>
            ))}
          </div>
          <button
            data-testid="class-option-back"
            onClick={() => setPickingClass(null)}
            className="w-full mt-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            ← 返回职业选择
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="guild-class-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="bg-gray-900 border border-gray-700 rounded-lg max-w-md w-full p-5 max-h-[90vh] overflow-y-auto">
        <div className="text-center mb-4">
          <h3 className="text-lg font-bold text-gray-200">⚜ 冒险者公会 · 职业授予</h3>
          <p className="text-xs text-gray-400 mt-2">
            公会主事·奥尔登："新面孔?来,告诉我你想成为什么."
          </p>
        </div>
        <div className="space-y-2">
          {CLASS_LIST.map((cls) => (
            <button
              key={cls.id}
              data-testid={`class-option-${cls.id}`}
              onClick={() => setPickingClass(cls.id)}
              className="w-full text-left p-3 rounded-lg border border-gray-700 bg-gray-800 hover:bg-gray-750 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-200 text-sm">{cls.icon} {cls.name}</span>
                <span className="text-[10px] text-gray-500">主属性 {cls.primaryAttribute.toUpperCase()}</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">{cls.description}</div>
            </button>
          ))}
        </div>
        <button
          data-testid="class-option-cancel"
          onClick={onClose}
          className="w-full mt-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
        >
          暂不选择 (离开公会)
        </button>
      </div>
    </div>
  );
}
