import { describe, expect, it } from 'vitest';
import { PromptBuilder } from '../../../src/services/engine/PromptBuilder';

describe('PromptBuilder', () => {
  it('tells the GM to use corner quotes for direct dialogue', () => {
    const prompt = new PromptBuilder().buildWorldLayer({});

    expect(prompt).toContain('直接对白一律使用「」或『』包裹');
    expect(prompt).toContain('店名、外号、强调词不要写成双引号对白');
  });
});