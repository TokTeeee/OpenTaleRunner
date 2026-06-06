import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore } from '../../src/stores/settingsStore';
import { resetClientStores } from '../utils/resetStores';

describe('settingsStore: LLM model hardcoded default removed (audit P2 fix)', () => {
  beforeEach(() => {
    resetClientStores();
  });
  afterEach(() => {
    resetClientStores();
  });

  it('initial llm.model is empty (audit: removed hardcoded deepseek-v4-pro default)', () => {
    const { llm } = useSettingsStore.getState();
    expect(llm.model).toBe('');
  });

  it('initial autoPlayLLM.model is empty', () => {
    const { autoPlayLLM } = useSettingsStore.getState();
    expect(autoPlayLLM.model).toBe('');
  });

  it('getLLMContext() 不再兜底到 deepseek-v4-pro — provider 有 default 时使用 provider default', () => {
    useSettingsStore.getState().setLLMConfig({ provider: 'deepseek', apiKey: 'test-key', model: '' });
    const ctx = useSettingsStore.getState().getLLMContext();
    // provider=deepseek 仍有 provider default (来自 getLLMProviderDefaults), 这不是硬编码, 合理
    expect(ctx?.model).toBe('deepseek-v4-pro');
  });

  it('getLLMContext() 在 custom provider 且无 model 时返回 model="" (审计: 移除硬编码兜底)', () => {
    useSettingsStore.getState().setLLMConfig({
      provider: 'custom',
      apiKey: 'test-key',
      endpoint: 'https://example.com',
      model: '',
    });
    const ctx = useSettingsStore.getState().getLLMContext();
    expect(ctx).not.toBeNull();
    expect(ctx?.model).toBe(''); // 修复前这里是 'deepseek-v4-pro', 修复后是 ''
  });

  it('getLLMContext() 保留用户已显式设置的值', () => {
    useSettingsStore.getState().setLLMConfig({
      provider: 'custom',
      apiKey: 'test-key',
      endpoint: 'https://example.com',
      model: 'my-custom-model-v1',
    });
    const ctx = useSettingsStore.getState().getLLMContext();
    expect(ctx?.model).toBe('my-custom-model-v1');
  });

  it('getAutoPlayLLMContext() 同样不再硬编码兜底', () => {
    useSettingsStore.getState().setAutoPlayUseSeparateConfig(true);
    useSettingsStore.getState().setAutoPlayLLMConfig({
      provider: 'custom',
      apiKey: 'test-key',
      endpoint: 'https://example.com',
      model: '',
    });
    const ctx = useSettingsStore.getState().getAutoPlayLLMContext();
    expect(ctx).not.toBeNull();
    expect(ctx?.model).toBe('');
  });
});
