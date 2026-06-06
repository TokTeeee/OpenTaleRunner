import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useSettingsStore, DEFAULT_QTE_CONFIG } from '../../src/stores/settingsStore';
import { resetClientStores } from '../utils/resetStores';

describe('settingsStore: v0.4 QTE config', () => {
  beforeEach(() => {
    resetClientStores();
  });
  afterEach(() => {
    resetClientStores();
  });

  it('initial qte config matches DEFAULT_QTE_CONFIG', () => {
    const { qte } = useSettingsStore.getState();
    expect(qte).toEqual(DEFAULT_QTE_CONFIG);
  });

  it('initial qte.enabled is false (v0.4 默认关闭)', () => {
    const { qte } = useSettingsStore.getState();
    expect(qte.enabled).toBe(false);
  });

  it('setQTEConfig 局部更新字段', () => {
    useSettingsStore.getState().setQTEConfig({ enabled: true });
    const { qte } = useSettingsStore.getState();
    expect(qte.enabled).toBe(true);
    expect(qte.attackMaxRounds).toBe(DEFAULT_QTE_CONFIG.attackMaxRounds);
    expect(qte.magicBaseMs).toBe(DEFAULT_QTE_CONFIG.magicBaseMs);
  });

  it('setQTEConfig 多字段同时更新', () => {
    useSettingsStore.getState().setQTEConfig({
      enabled: true,
      attackMaxRounds: 3,
      magicBaseMs: 4000,
      damageScale: 0.5,
    });
    const { qte } = useSettingsStore.getState();
    expect(qte).toEqual({
      enabled: true,
      attackMaxRounds: 3,
      magicBaseMs: 4000,
      damageScale: 0.5,
    });
  });

  it('QTE 默认 damageScale = 0.3 (spec §9.5 ±30%)', () => {
    expect(DEFAULT_QTE_CONFIG.damageScale).toBe(0.3);
  });

  it('QTE 默认 attackMaxRounds = 5 (spec §9.3 clamp 上限)', () => {
    expect(DEFAULT_QTE_CONFIG.attackMaxRounds).toBe(5);
  });
});
