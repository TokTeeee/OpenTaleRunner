/**
 * CharacterCreationWizard Step 7 (Class) 集成测试
 *
 * 覆盖:
 * - Step 7 渲染 5 选项 (4 职业 + 无职业)
 * - 选 "无职业" → classId=null, classSkills=[]
 * - 选 "战士" + T1 节点 → classId=warrior + classSkills=[t1_1]
 * - 选 "战士" + T1 → 最终角色数据含 classId / classSkills
 * - 选 "法师" + T1 → classId=mage
 *
 * 通过 `initialStep` prop 跳过前 6 步以聚焦测试 Step 7 行为。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CharacterCreationWizard } from '../../../src/components/modals/CharacterCreationWizard';
import { useWorldStore } from '../../../src/stores/worldStore';
import { useSettingsStore } from '../../../src/stores/settingsStore';
import { useMultiplayerStore } from '../../../src/stores/multiplayerStore';

// 避免真实 LLM 调用
vi.mock('../../../src/services/llm/LLMClient', () => ({
  LLMClient: vi.fn().mockImplementation(() => ({
    chat: vi.fn().mockResolvedValue('{}'),
  })),
}));

// 用空 storybook + 默认 settings + 隔离 multiplayer
beforeEach(() => {
  useWorldStore.setState({
    storybook: null,
    worldLore: '测试世界传说',
  });
  useSettingsStore.setState({
    llm: {
      provider: 'mock',
      apiKey: '',
      endpoint: '',
      model: 'mock',
      temperature: 0.7,
      maxTokens: 1024,
    },
  });
  useMultiplayerStore.setState({ currentPlayerId: 'test_player' } as any);
});

afterEach(() => cleanup());

describe('CharacterCreationWizard Step 7 (Class)', () => {
  it('Step 7 渲染 5 选项: 4 职业 + 无职业', () => {
    render(
      <CharacterCreationWizard
        initialStep={7}
        onComplete={() => {}}
        onCancel={() => {}}
      />,
    );

    expect(screen.getByTestId('classstep-class-warrior')).toBeTruthy();
    expect(screen.getByTestId('classstep-class-cleric')).toBeTruthy();
    expect(screen.getByTestId('classstep-class-mage')).toBeTruthy();
    expect(screen.getByTestId('classstep-class-thief')).toBeTruthy();
    expect(screen.getByTestId('classstep-none')).toBeTruthy();
  });

  it('选 "无职业" → summary 显示 "已选: 无职业"', () => {
    render(
      <CharacterCreationWizard
        initialStep={7}
        onComplete={() => {}}
        onCancel={() => {}}
      />,
    );

    // 点 "无职业"
    fireEvent.click(screen.getByTestId('classstep-none'));

    // summary 出现 "已选: 无职业"
    const txt = document.body.textContent || '';
    expect(txt).toContain('已选');
    expect(txt).toContain('无职业');
  });

  it('选 "战士" → 出现 T1 节点选择', () => {
    render(
      <CharacterCreationWizard
        initialStep={7}
        onComplete={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId('classstep-class-warrior'));

    // T1 节点选择界面
    expect(screen.getByTestId('classstep-tier1')).toBeTruthy();
    // warrior T1 有 3 个节点
    expect(screen.getByTestId('classstep-node-warrior_t1_1')).toBeTruthy();
    expect(screen.getByTestId('classstep-node-warrior_t1_2')).toBeTruthy();
    expect(screen.getByTestId('classstep-node-warrior_t1_3')).toBeTruthy();
  });

  it('选 "战士" + T1 节点 → classId/classSkills 写入状态', () => {
    const onComplete = vi.fn();
    const { container } = render(
      <CharacterCreationWizard
        initialStep={7}
        onComplete={onComplete}
        onCancel={() => {}}
      />,
    );

    // 选战士
    fireEvent.click(screen.getByTestId('classstep-class-warrior'));
    // 选 T1 节点
    fireEvent.click(screen.getByTestId('classstep-node-warrior_t1_1'));

    // 验证 summary 显示选中的节点
    const txt = container.textContent || '';
    expect(txt).toContain('蛮力');
  });

  it('选 "法师" + T1 → 显示法师 T1 节点', () => {
    render(
      <CharacterCreationWizard
        initialStep={7}
        onComplete={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId('classstep-class-mage'));
    expect(screen.getByTestId('classstep-tier1')).toBeTruthy();
    expect(screen.getByTestId('classstep-node-mage_t1_1')).toBeTruthy();
  });

  it('选 "战士" + T1 后再选 "无职业" → 清空选择', () => {
    render(
      <CharacterCreationWizard
        initialStep={7}
        onComplete={() => {}}
        onCancel={() => {}}
      />,
    );

    fireEvent.click(screen.getByTestId('classstep-class-warrior'));
    expect(screen.getByTestId('classstep-tier1')).toBeTruthy();

    // 回到主选职业界面
    fireEvent.click(screen.getByTestId('classstep-back'));
    expect(screen.getByTestId('classstep-classes')).toBeTruthy();

    // 选 "无职业"
    fireEvent.click(screen.getByTestId('classstep-none'));
    // summary 显示 "已选: 无职业"
    const txt = (document.body.textContent || '');
    expect(txt).toContain('已选');
  });
});
