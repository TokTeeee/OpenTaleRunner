import { describe, expect, it } from 'vitest';
import { PromptBuilder } from '../../../src/services/engine/PromptBuilder';

describe('PromptBuilder', () => {
  it('tells the GM to use corner quotes for direct dialogue', () => {
    const prompt = new PromptBuilder().buildWorldLayer({});

    expect(prompt).toContain('直接对白一律使用「」或『』包裹');
    expect(prompt).toContain('店名、外号、强调词不要写成双引号对白');
  });

  // v0.5.15: 严禁 markdown 标签混入 narrative / choices 必须纯 JSON
  describe('v0.5.15 GM 严格 JSON 约束', () => {
    const builder = new PromptBuilder();
    const advance = builder.buildCombinedAdvancePrompt(
      { actionContext: { playerAction: '推开公会大门' }, character: undefined } as any,
      '成功',
    );

    it('advance prompt 包含 narrative 严禁 markdown 标签的硬规则', () => {
      expect(advance).toContain('narrative 字段必须是纯叙事文本');
      expect(advance).toContain('**时间流逝**');
      expect(advance).toContain('**当前位置**');
      expect(advance).toContain('markdown 标签');
    });

    it('advance prompt 包含 choices 字段只放选项文本的硬规则', () => {
      expect(advance).toContain('choices 字段只放选项文本');
      expect(advance).toContain('tendency 必须是英文枚举值');
    });

    it('advance prompt 强制返回纯 JSON (无代码块)', () => {
      expect(advance).toContain('返回纯 JSON');
      expect(advance).toContain('代码块');
    });
  });
});