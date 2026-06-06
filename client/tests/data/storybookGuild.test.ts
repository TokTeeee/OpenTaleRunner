/**
 * v0.5.3 — Storybook / npc_templates 预置冒险者公会 + NPC 结构验证
 *
 * 覆盖:
 * - storybook.json 加载合法 JSON
 * - royal_plains → 光辉城 sub_region 包含 adventurer_guild_1 POI
 * - POI services 包含 class_selection + tier_unlock
 * - royal_plains.key_npcs 包含 guild_class_officer_alden
 * - npc_templates.json 包含 guild_class_officer 模板
 * - guild_class_officer.npcId == "guild_class_officer_alden"
 * - guild_class_officer.services 包含 class_selection + tier_unlock
 */
import { describe, it, expect } from 'vitest';
import storybook from '../../storybook.json';
import npcTemplates from '../../npc_templates.json';

describe('storybook v0.5.3 — adventurer guild POI', () => {
  it('storybook.json 加载合法', () => {
    expect(storybook).toBeTruthy();
    expect((storybook as any).version).toBe(1);
  });

  it('royal_plains region 存在', () => {
    const regions = (storybook as any).regions as any[];
    const royalPlains = regions.find((r) => r.id === 'royal_plains');
    expect(royalPlains).toBeTruthy();
  });

  it('royal_plains → 光辉城 sub_region 包含 adventurer_guild_1 POI', () => {
    const regions = (storybook as any).regions as any[];
    const royalPlains = regions.find((r) => r.id === 'royal_plains');
    const guanghui = royalPlains.sub_regions.find((s: any) => s.name === '光辉城');
    expect(guanghui).toBeTruthy();
    expect(guanghui.points_of_interest).toBeTruthy();
    const guild = guanghui.points_of_interest.find((p: any) => p.id === 'adventurer_guild_1');
    expect(guild).toBeTruthy();
    expect(guild.type).toBe('guild');
    expect(guild.npcId).toBe('guild_class_officer_alden');
  });

  it('POI services 包含 class_selection + tier_unlock', () => {
    const regions = (storybook as any).regions as any[];
    const royalPlains = regions.find((r) => r.id === 'royal_plains');
    const guild = royalPlains.sub_regions
      .find((s: any) => s.name === '光辉城')
      .points_of_interest.find((p: any) => p.id === 'adventurer_guild_1');
    expect(guild.services).toContain('class_selection');
    expect(guild.services).toContain('tier_unlock');
  });

  it('royal_plains.key_npcs 包含 guild_class_officer_alden', () => {
    const regions = (storybook as any).regions as any[];
    const royalPlains = regions.find((r) => r.id === 'royal_plains');
    const alden = royalPlains.key_npcs.find(
      (n: any) => n.id === 'guild_class_officer_alden' || n.name === '公会主事·奥尔登',
    );
    expect(alden).toBeTruthy();
    expect(alden.role).toContain('职业');
  });
});

describe('npc_templates v0.5.3 — guild_class_officer', () => {
  it('npc_templates.json 加载合法', () => {
    expect(npcTemplates).toBeTruthy();
  });

  it('包含 guild_class_officer 模板', () => {
    const tpl = (npcTemplates as any).npc_templates.templates.guild_class_officer;
    expect(tpl).toBeTruthy();
    expect(tpl.type).toBe('公会职业注册官');
  });

  it('npcId == "guild_class_officer_alden"', () => {
    const tpl = (npcTemplates as any).npc_templates.templates.guild_class_officer;
    expect(tpl.npcId).toBe('guild_class_officer_alden');
  });

  it('services 包含 class_selection + tier_unlock', () => {
    const tpl = (npcTemplates as any).npc_templates.templates.guild_class_officer;
    expect(tpl.services).toContain('class_selection');
    expect(tpl.services).toContain('tier_unlock');
  });

  it('greeting 文案非空', () => {
    const tpl = (npcTemplates as any).npc_templates.templates.guild_class_officer;
    expect(tpl.greeting).toBeTruthy();
    expect(tpl.greeting.length).toBeGreaterThan(0);
  });
});
