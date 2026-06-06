import type { GameNPC, NPCSource } from '../../types/npc';
import type { Attributes, AttributeName } from '../../types/character';
import { generateId } from '../../utils/text';

interface NPCTemplate {
  type: string;
  attributes_base: Attributes;
  skills: Array<{ name: string; level: number; relatedAttribute: AttributeName; description: string }>;
  services: string[];
  canGrow: boolean;
  isHostileToCriminals?: boolean;
  mayKnowSecrets?: boolean;
}

// Default templates (fallback before server responds)
const DEFAULT_TEMPLATES: Record<string, NPCTemplate> = {
  merchant: {
    type: '商人',
    attributes_base: { STR: 9, DEX: 11, CON: 11, INT: 13, WIS: 13, CHA: 15 },
    skills: [
      { name: '估价', level: 5, relatedAttribute: 'INT', description: '准确判断物品价值' },
      { name: '谈判', level: 4, relatedAttribute: 'CHA', description: '在交易中获得更优价格' },
    ],
    services: ['买卖物品', '情报交易'],
    canGrow: true,
  },
  blacksmith: {
    type: '铁匠',
    attributes_base: { STR: 16, DEX: 12, CON: 14, INT: 12, WIS: 11, CHA: 10 },
    skills: [
      { name: '锻造', level: 5, relatedAttribute: 'STR', description: '打造和修复武器防具' },
      { name: '矿石鉴定', level: 3, relatedAttribute: 'INT', description: '识别矿石材质' },
    ],
    services: ['修理装备', '打造装备', '强化装备'],
    canGrow: true,
  },
  innkeeper: {
    type: '旅店老板',
    attributes_base: { STR: 10, DEX: 10, CON: 12, INT: 12, WIS: 14, CHA: 16 },
    skills: [
      { name: '察言观色', level: 4, relatedAttribute: 'WIS', description: '洞察客人的情绪和意图' },
      { name: '烹饪', level: 3, relatedAttribute: 'DEX', description: '制作恢复精力的食物' },
    ],
    services: ['休息恢复', '存储物品', '打听消息'],
    canGrow: false,
  },
  guard: {
    type: '守卫',
    attributes_base: { STR: 14, DEX: 12, CON: 14, INT: 10, WIS: 11, CHA: 11 },
    skills: [
      { name: '巡逻', level: 4, relatedAttribute: 'WIS', description: '察觉可疑人员和危险' },
      { name: '长矛术', level: 3, relatedAttribute: 'STR', description: '守卫标准战斗训练' },
    ],
    services: ['区域安保', '报告犯罪'],
    canGrow: true,
    isHostileToCriminals: true,
  },
  healer: {
    type: '治疗师',
    attributes_base: { STR: 9, DEX: 12, CON: 11, INT: 15, WIS: 16, CHA: 14 },
    skills: [
      { name: '治愈术式', level: 5, relatedAttribute: 'WIS', description: '使用术式治疗伤口和疾病' },
      { name: '草药学', level: 4, relatedAttribute: 'INT', description: '采集和配制治疗药物' },
    ],
    services: ['治疗HP', '解除负面状态', '出售治疗药水'],
    canGrow: true,
  },
  scholar: {
    type: '学者',
    attributes_base: { STR: 8, DEX: 10, CON: 10, INT: 17, WIS: 15, CHA: 13 },
    skills: [
      { name: '古代文字', level: 5, relatedAttribute: 'INT', description: '解读古代文献和符文' },
      { name: '历史知识', level: 4, relatedAttribute: 'INT', description: '各区域历史事件的知识' },
    ],
    services: ['鉴定遗物', '翻译古文', '提供历史线索'],
    canGrow: true,
    mayKnowSecrets: true,
  },
  hunter: {
    type: '猎人',
    attributes_base: { STR: 13, DEX: 16, CON: 14, INT: 11, WIS: 15, CHA: 10 },
    skills: [
      { name: '追踪', level: 5, relatedAttribute: 'WIS', description: '追踪猎物和人物的足迹' },
      { name: '弓术', level: 4, relatedAttribute: 'DEX', description: '熟练使用弓箭' },
    ],
    services: ['指引野外道路', '出售猎物和材料', '提供怪物情报'],
    canGrow: true,
  },
  adventurer_guild_staff: {
    type: '公会职员',
    attributes_base: { STR: 11, DEX: 12, CON: 13, INT: 14, WIS: 14, CHA: 16 },
    skills: [
      { name: '情报整理', level: 5, relatedAttribute: 'INT', description: '梳理和分析冒险情报' },
      { name: '交涉', level: 4, relatedAttribute: 'CHA', description: '与各方势力沟通协调' },
    ],
    services: ['任务发布', '冒险者登记', '情报提供'],
    canGrow: false,
  },
};

export class NPCGenerator {
  private templates: Record<string, NPCTemplate> = { ...DEFAULT_TEMPLATES };

  loadTemplates(templates: Record<string, NPCTemplate>): void {
    this.templates = { ...DEFAULT_TEMPLATES, ...templates };
  }

  getTemplateTypes(): string[] {
    return Object.keys(this.templates);
  }

  generateFromTemplate(templateKey: string, region: string, subRegion: string, options?: {
    name?: string;
    attitudeToPlayer?: number;
    source?: NPCSource;
  }): GameNPC {
    const tmpl = this.templates[templateKey] || this.templates.merchant;
    const now = new Date().toISOString();
    const name = options?.name || tmpl.type;
    const appearance = defaultAppearance(tmpl.type, region);
    const personality = defaultPersonality(tmpl.type);

    return {
      npcId: 'npc_' + generateId(),
      name,
      title: tmpl.type,
      role: tmpl.type,
      region,
      subRegion,
      appearance,
      background: `${region}的一名${tmpl.type}。${personality ? '性格' + personality.charAt(0) + '。' : ''}`,
      personality,
      motivation: `做好自己的本职工作。`,
      attributes: { ...tmpl.attributes_base },
      skills: tmpl.skills.map((s, i) => ({
        id: `npc_gen_sk_${i}`,
        name: s.name,
        level: s.level,
        maxLevel: 10,
        type: 'background' as const,
        relatedAttribute: s.relatedAttribute,
        description: s.description,
        acquiredAt: '职业训练',
        experience: 0,
        expToNext: s.level * 3,
      })),
      relationship: {
        attitude: options?.attitudeToPlayer ?? 0,
        level: 'stranger',
        firstMet: now,
        interactionCount: 0,
        history: [],
        playerKnowsAbout: [],
      },
      isHostile: false,
      canNegotiate: true,
      canBeRecruited: false,
      canGrow: tmpl.canGrow,
      source: options?.source || 'encounter',
      secrets: [],
      faction: '',
      isMet: true,
    };
  }

  // Generate an NPC from PM-provided intro data (dynamic NPCs created during play)
  generateFromIntro(intro: {
    name: string;
    title: string;
    appearance: string;
    personality: string;
    region: string;
    relation_to_player: string;
  }): GameNPC {
    const now = new Date().toISOString();
    const isClose = intro.relation_to_player?.includes('玩伴') ||
      intro.relation_to_player?.includes('朋友') ||
      intro.relation_to_player?.includes('家族');

    return {
      npcId: 'npc_cli_' + generateId(),
      name: intro.name,
      title: intro.title || '',
      role: intro.title || '',
      region: intro.region || '',
      subRegion: '',
      appearance: intro.appearance || '',
      background: `在冒险途中结识。${intro.relation_to_player || '偶然相遇的人'}`,
      personality: intro.personality || '',
      motivation: '探索自己的命运。',
      attributes: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 12 },
      skills: [],
      relationship: {
        attitude: isClose ? 25 : 10,
        level: isClose ? 'friend' : 'acquaintance',
        firstMet: now,
        interactionCount: 1,
        history: ['第一次相遇'],
        playerKnowsAbout: [],
      },
      isHostile: false,
      canNegotiate: true,
      canBeRecruited: isClose,
      canGrow: true,
      source: 'client_created',
      secrets: [],
      faction: '',
      isMet: true,
    };
  }
}

export const npcGenerator = new NPCGenerator();

function defaultAppearance(role: string, _region: string): string {
  const looks: Record<string, string> = {
    '商人': '穿着整洁的布衣，腰间挂着钱袋。面容精明，目光机敏。',
    '铁匠': '壮实的体格，裸露的手臂上满是肌肉和烫伤的疤痕。胡须被炉火熏得发灰。',
    '旅店老板': '和蔼可亲的中年人，围着洗得发白的围裙。笑容温暖但眼中透着精明。',
    '守卫': '身穿轻甲，腰间佩剑。站姿笔直，目光警惕地扫视着周围。',
    '治疗师': '穿着素净的长袍，身上带着淡淡的草药香气。手指修长，动作轻柔。',
    '学者': '戴着厚重的眼镜，头发有些凌乱。长袍上沾着墨水渍，手中常拿着书本。',
    '猎人': '瘦长精壮的身形，皮肤被日晒得黝黑。背着弓箭，走路悄无声息。',
    '农夫': '皮肤粗糙，双手布满老茧。穿着朴素的麻布衣，身形结实。',
    '祭司': '身着圣袍，手持权杖。目光温和而深邃，举止庄重。',
    '炼金术士': '穿着满是药渍的实验袍，戴着护目镜。手指因长期接触药剂而变色。',
    '公会职员': '身穿公会制服，胸前别着冒险者公会的徽章。笑容职业化，态度干练。',
  };
  return looks[role] || `一名典型的${role}`;
}

function defaultPersonality(role: string): string {
  const traits: Record<string, string> = {
    '商人': '精打细算，擅长讨价还价。对熟客会给予优惠，但对陌生人保持警惕。',
    '铁匠': '沉默寡言，但手艺精湛。说话直来直去，讨厌废话和讨价还价。',
    '旅店老板': '热情好客，喜欢打听各路消息。对每个客人都记得住名字和喜好。',
    '守卫': '忠于职守，话不多。对犯罪零容忍，对守法公民态度友好。',
    '治疗师': '温柔耐心，对待每个伤者如亲人。拒绝在非必要情况下使用治疗术式。',
    '学者': '好奇心和求知欲极强，喜欢引经据典。有时沉浸在自己的世界里。',
    '猎人': '沉默寡言但观察力敏锐。对自然有深厚的感情和了解。',
    '农夫': '朴实勤劳，对土地有着深厚的感情。不擅长和陌生人打交道。',
    '祭司': '虔诚而温和，对所有人一视同仁。说话常有哲学的意味。',
    '炼金术士': '思维敏捷但有点古怪。对药剂效果有着近乎偏执的追求。',
    '公会职员': '办事效率高，不苟言笑。对规章制度了如指掌。',
  };
  return traits[role] || '';
}

