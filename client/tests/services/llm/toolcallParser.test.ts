import { describe, expect, it } from 'vitest';
import { parseToolCalls, buildOutputText } from '../../../src/services/llm/toolcallParser';

describe('toolcallParser: 从 LLM 输出中提取 <tool_call> 块', () => {
  it('纯 narrative 无 toolcall', () => {
    const raw = '三只哥布林从树丛后跃出, 虎视眈眈地盯着你。';
    const result = parseToolCalls(raw);
    expect(result.narrative).toBe(raw);
    expect(result.toolCalls).toEqual([]);
    expect(result.parseWarnings).toEqual([]);
  });

  it('单个 toolcall + narrative', () => {
    const raw = '三只哥布林从树丛后跃出。\n<tool_call>{"name":"startCombat","arguments":{"trigger":"ambush","enemies":[]}}</tool_call>\n战斗开始。';
    const result = parseToolCalls(raw);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toEqual({
      name: 'startCombat',
      arguments: { trigger: 'ambush', enemies: [] },
    });
    // 提取后 narrative 中不应包含 <tool_call> 标签
    expect(result.narrative).not.toContain('<tool_call>');
    expect(result.narrative).toContain('三只哥布林');
    expect(result.narrative).toContain('战斗开始');
  });

  it('多个 toolcall 按出现顺序提取', () => {
    const raw = `开始
<tool_call>{"name":"startCombat","arguments":{"trigger":"ambush"}}</tool_call>
中段
<tool_call>{"name":"endCombat","arguments":{"outcome":"victory"}}</tool_call>
结束`;
    const result = parseToolCalls(raw);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls[0].name).toBe('startCombat');
    expect(result.toolCalls[1].name).toBe('endCombat');
  });

  it('arguments 包含嵌套对象', () => {
    const raw = `<tool_call>{"name":"startCombat","arguments":{"enemies":[{"name":"goblin","hp":12,"attributes":{"STR":8,"DEX":14}}]}}</tool_call>`;
    const result = parseToolCalls(raw);
    expect(result.toolCalls[0].arguments).toEqual({
      enemies: [{ name: 'goblin', hp: 12, attributes: { STR: 8, DEX: 14 } }],
    });
  });

  it('arguments 包含字符串内的双引号 (转义) 不被错误切分', () => {
    const raw = `<tool_call>{"name":"startCombat","arguments":{"narrativeOpening":"他说: \\"来吧!\\""}}</tool_call>`;
    const result = parseToolCalls(raw);
    expect(result.toolCalls[0].arguments).toEqual({
      narrativeOpening: '他说: "来吧!"',
    });
  });

  it('损坏 JSON 走 warn 跳过, 不抛错', () => {
    const raw = '<tool_call>这不是 JSON</tool_call>';
    const result = parseToolCalls(raw);
    expect(result.toolCalls).toEqual([]);
    expect(result.parseWarnings).toHaveLength(1);
    expect(result.parseWarnings[0]).toContain('not valid JSON');
  });

  it('缺 name 字段走 warn 跳过', () => {
    const raw = '<tool_call>{"arguments":{"x":1}}</tool_call>';
    const result = parseToolCalls(raw);
    expect(result.toolCalls).toEqual([]);
    expect(result.parseWarnings).toHaveLength(1);
    expect(result.parseWarnings[0]).toContain("missing 'name' field");
  });

  it('未闭合的 toolcall 标签走 warn', () => {
    const raw = '前面<tool_call>没闭合';
    const result = parseToolCalls(raw);
    expect(result.toolCalls).toEqual([]);
    expect(result.parseWarnings).toHaveLength(1);
    expect(result.parseWarnings[0]).toContain('never closed');
  });

  it('缺失 arguments 字段默认为空对象', () => {
    const raw = '<tool_call>{"name":"ping"}</tool_call>';
    const result = parseToolCalls(raw);
    expect(result.toolCalls[0]).toEqual({ name: 'ping', arguments: {} });
  });

  it('空 narrative 也不报错', () => {
    const result = parseToolCalls('');
    expect(result.narrative).toBe('');
    expect(result.toolCalls).toEqual([]);
  });

  it('arguments 是字符串而非对象时默认空对象', () => {
    const raw = '<tool_call>{"name":"ping","arguments":"oops"}</tool_call>';
    const result = parseToolCalls(raw);
    expect(result.toolCalls[0].arguments).toEqual({});
  });
});

describe('toolcallParser: buildOutputText 反向构造', () => {
  it('空 toolcall 列表直接返回 narrative', () => {
    expect(buildOutputText('narrative only', [])).toBe('narrative only');
  });

  it('toolcall 列表拼接为 toolcall 块', () => {
    const text = buildOutputText('narrative', [
      { name: 'a', arguments: { x: 1 } },
      { name: 'b', arguments: { y: 2 } },
    ]);
    expect(text).toContain('narrative');
    expect(text).toContain('<tool_call>{"name":"a","arguments":{"x":1}}</tool_call>');
    expect(text).toContain('<tool_call>{"name":"b","arguments":{"y":2}}</tool_call>');
  });

  it('buildOutputText → parseToolCalls 圆环不丢字段', () => {
    const original = [
      { name: 'startCombat', arguments: { trigger: 'ambush', enemies: [] } },
      { name: 'endCombat', arguments: { outcome: 'victory' } },
    ];
    const text = buildOutputText('text', original);
    const result = parseToolCalls(text);
    expect(result.toolCalls).toEqual(original);
  });
});
