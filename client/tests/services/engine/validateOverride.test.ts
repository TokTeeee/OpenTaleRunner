import { describe, it, expect, beforeEach } from 'vitest';
import { PromptBuilder } from '../../../src/services/engine/PromptBuilder';
import type { PromptOverride } from '../../../src/types/world';

describe('validateOverride', () => {
  let builder: PromptBuilder;

  beforeEach(() => {
    builder = new PromptBuilder();
  });

  it('rejects queryProtocol override with non-whitelisted field', () => {
    const o: PromptOverride = {
      id: 'test1' as any,
      slot: 'queryProtocol',
      scope: 'global',
      mode: 'append',
      content: 'INVALID_FIELD: foo',
    };
    const result = (builder as any).validateOverride(o, 'queryProtocol');
    expect(result).toBeTruthy();
    expect(result).toMatch(/whitelist|field/i);
  });

  it('accepts queryProtocol override with whitelisted field', () => {
    const o: PromptOverride = {
      id: 'test2' as any,
      slot: 'queryProtocol',
      scope: 'global',
      mode: 'append',
      content: 'SCENE: 地点',
    };
    const result = (builder as any).validateOverride(o, 'queryProtocol');
    expect(result).toBeNull();
  });

  it('rejects override with content > 2000 chars', () => {
    const o: PromptOverride = {
      id: 'test3' as any,
      slot: 'narrativeGuide',
      scope: 'global',
      mode: 'append',
      content: 'a'.repeat(2001),
    };
    const result = (builder as any).validateOverride(o, 'narrativeGuide');
    expect(result).toMatch(/length|2000/i);
  });

  it('accepts override with content exactly 2000 chars', () => {
    const o: PromptOverride = {
      id: 'test4' as any,
      slot: 'narrativeGuide',
      scope: 'global',
      mode: 'append',
      content: 'a'.repeat(2000),
    };
    const result = (builder as any).validateOverride(o, 'narrativeGuide');
    expect(result).toBeNull();
  });

  it('narrative slot allows free mode (not restricted to replace)', () => {
    const o: PromptOverride = {
      id: 'test5' as any,
      slot: 'narrativeGuide',
      scope: 'global',
      mode: 'prepend',
      content: 'valid content',
    };
    const result = (builder as any).validateOverride(o, 'narrativeGuide');
    expect(result).toBeNull();
  });

  it('jsonSchema slot is always replace mode (mode ignored by validate)', () => {
    // 即使 o.mode = 'append', validateOverride 不报错 (由 applyOverrides 强制 replace)
    const o: PromptOverride = {
      id: 'test6' as any,
      slot: 'jsonSchemaAdvance',
      scope: 'global',
      mode: 'append',
      content: '{"type":"object"}',
    };
    const result = (builder as any).validateOverride(o, 'jsonSchemaAdvance');
    expect(result).toBeNull();
  });

  it('checks whitelist before length (whitelist fail returns whitelist error)', () => {
    const o: PromptOverride = {
      id: 'test7' as any,
      slot: 'queryProtocol',
      scope: 'global',
      mode: 'append',
      content: 'INVALID: ' + 'a'.repeat(2001),
    };
    const result = (builder as any).validateOverride(o, 'queryProtocol');
    expect(result).toMatch(/whitelist/i);
  });
});
