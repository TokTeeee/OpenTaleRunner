/**
 * ClassSkillTreeModal 单元测试
 * v0.5.14
 *
 * 覆盖:
 * - isOpen=false: 不渲染
 * - isOpen=true: 渲染 12 节点 (4 tier × 3 slot)
 * - learned 节点 emerald 高亮
 * - close 按钮 → onClose
 * - Esc 键 → onClose
 * - 点击 overlay → onClose
 * - 点击节点 → 详情面板渲染
 * - 节点详情含 description
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ClassSkillTreeModal } from '../../../src/components/panels/CharacterPanel/ClassSkillTreeModal';

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ClassSkillTreeModal', () => {
  const noop = () => {};

  it('isOpen=false 时不渲染', () => {
    const { container } = render(
      <ClassSkillTreeModal
        classId="warrior"
        isOpen={false}
        onClose={noop}
        learnedNodes={[]}
        currentLevel={1}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('isOpen=true 渲染 12 个节点 (4 tier × 3 slot)', () => {
    render(
      <ClassSkillTreeModal
        classId="warrior"
        isOpen={true}
        onClose={noop}
        learnedNodes={[]}
        currentLevel={1}
      />,
    );
    const nodes = screen.getAllByTestId(/^skilltree-node-/);
    expect(nodes.length).toBe(12);
  });

  it('已学节点加 emerald 高亮', () => {
    render(
      <ClassSkillTreeModal
        classId="warrior"
        isOpen={true}
        onClose={noop}
        learnedNodes={['warrior_t1_1']}
        currentLevel={1}
      />,
    );
    const learned = screen.getByTestId('skilltree-node-warrior_t1_1');
    expect(learned.className).toContain('emerald');
  });

  it('未学节点不加 emerald 高亮 (默认白底)', () => {
    render(
      <ClassSkillTreeModal
        classId="warrior"
        isOpen={true}
        onClose={noop}
        learnedNodes={['warrior_t1_1']}
        currentLevel={1}
      />,
    );
    const available = screen.getByTestId('skilltree-node-warrior_t1_2');
    expect(available.className).not.toContain('emerald');
  });

  it('点击关闭按钮触发 onClose', () => {
    const onClose = vi.fn();
    render(
      <ClassSkillTreeModal
        classId="warrior"
        isOpen={true}
        onClose={onClose}
        learnedNodes={[]}
        currentLevel={1}
      />,
    );
    fireEvent.click(screen.getByTestId('skilltree-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc 键触发 onClose', () => {
    const onClose = vi.fn();
    render(
      <ClassSkillTreeModal
        classId="warrior"
        isOpen={true}
        onClose={onClose}
        learnedNodes={[]}
        currentLevel={1}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('点击 overlay (overlay 区域) 触发 onClose', () => {
    const onClose = vi.fn();
    render(
      <ClassSkillTreeModal
        classId="warrior"
        isOpen={true}
        onClose={onClose}
        learnedNodes={[]}
        currentLevel={1}
      />,
    );
    // v0.5.14-fix: Modal 用 createPortal 渲染到 document.body, 所以用 screen 而非 container
    const overlay = screen.getByTestId('class-skill-tree-modal');
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('v0.5.14-fix: Modal 用 createPortal 渲染到 document.body, 逃出 panel 的 transform containing block', () => {
    const wrapper = document.createElement('div');
    wrapper.style.transform = 'translateY(0)'; // 模拟 CharacterPanel 的 animate-in 造成的 containing block
    document.body.appendChild(wrapper);
    render(
      <ClassSkillTreeModal
        classId="warrior"
        isOpen={true}
        onClose={noop}
        learnedNodes={[]}
        currentLevel={1}
      />,
      { container: wrapper },
    );
    // Modal 应在 document.body 上, 不在 wrapper 内
    expect(wrapper.querySelector('[data-testid="class-skill-tree-modal"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="class-skill-tree-modal"]')).toBeTruthy();
    document.body.removeChild(wrapper);
  });

  it('点击节点 (非 overlay) 不触发 onClose, 改显示详情面板', () => {
    const onClose = vi.fn();
    render(
      <ClassSkillTreeModal
        classId="warrior"
        isOpen={true}
        onClose={onClose}
        learnedNodes={['warrior_t1_1']}
        currentLevel={1}
      />,
    );
    fireEvent.click(screen.getByTestId('skilltree-node-warrior_t1_1'));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('skilltree-detail')).toBeTruthy();
  });

  it('节点详情含 description 文案', () => {
    render(
      <ClassSkillTreeModal
        classId="warrior"
        isOpen={true}
        onClose={noop}
        learnedNodes={['warrior_t1_1']}
        currentLevel={1}
      />,
    );
    fireEvent.click(screen.getByTestId('skilltree-node-warrior_t1_1'));
    const detail = screen.getByTestId('skilltree-detail');
    expect(detail.textContent).toContain('蛮力');
    expect(detail.textContent).toContain('力量+1');
  });
});
