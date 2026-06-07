import { useCharacterStore } from '../../stores/characterStore';
import type { ConsequenceData } from '../../types/game';

/**
 * v0.5.13: 业务域 3 — skills
 * 改"我会什么"
 */
export function applySkills(
  cons: Pick<ConsequenceData, 'skillsModified'>,
): void {
  try {
    if (cons.skillsModified?.length) applySkillsModified(cons.skillsModified);
  } catch (err) {
    console.warn(`[applySkills] failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function applySkillsModified(modified: ConsequenceData['skillsModified']): void {
  const char = useCharacterStore.getState();
  if (!char.character) return;
  for (const sm of modified) {
    if (!sm || !sm.skillId) continue;
    char.modifySkill(sm.skillId, {
      newName: sm.newName,
      newDescription: sm.newDescription,
      levelChange: sm.levelChange,
    });
  }
}
