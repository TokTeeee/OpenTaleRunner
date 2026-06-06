import { describe, expect, it } from 'vitest';
import { buildNarrativeSegments, guessSpeakerName } from '../../../src/services/narrative/dialogueSegments';

describe('dialogueSegments', () => {
  it('attributes preferred corner-quoted dialogue to the nearest npc name in context', () => {
    const segments = buildNarrativeSegments('莉亚笑着说：「欢迎回来。」 她把水袋递给你。', ['莉亚']);

    expect(segments).toEqual([
      { id: 'seg-0', kind: 'narration', text: '莉亚笑着说：' },
      { id: 'seg-1', kind: 'dialogue', text: '欢迎回来。', speakerName: '莉亚' },
      { id: 'seg-2', kind: 'narration', text: '她把水袋递给你。' },
    ]);
  });

  it('keeps supporting legacy double-quoted dialogue when speech context is explicit', () => {
    const segments = buildNarrativeSegments('莉亚笑着说：“欢迎回来。” 她把水袋递给你。', ['莉亚']);

    expect(segments[1]).toEqual({ id: 'seg-1', kind: 'dialogue', text: '欢迎回来。', speakerName: '莉亚' });
  });

  it('does not split quoted titles or references into dialogue blocks', () => {
    const content = '穿过下城区嘈杂的街道，你找到了那家名为“断角鹿”的廉价旅馆。推开吱呀作响的木门，你向老板娘打听了“老猎人”。';

    expect(buildNarrativeSegments(content, ['老板娘'])).toEqual([
      { id: 'seg-0', kind: 'narration', text: content },
    ]);
  });

  it('infers a non-pronoun speaker from speech verbs when no npc names match', () => {
    expect(guessSpeakerName('旅店老板低声说', [])).toBe('旅店老板');
    expect(guessSpeakerName('她低声说', [])).toBeUndefined();
  });
});