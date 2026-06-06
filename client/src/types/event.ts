/** 事件等级 */
export type EventLevel = 'Major' | 'Late' | 'Mid' | 'Early' | 'Minor';

export const EVENT_LEVEL_LABELS: Record<EventLevel, string> = {
  Major: '重大事件', Late: '后期事件', Mid: '中期事件', Early: '前期事件', Minor: '微事件',
};

export const EVENT_LEVEL_COLORS: Record<EventLevel, string> = {
  Major: 'text-red-400', Late: 'text-amber-400', Mid: 'text-blue-400', Early: 'text-gray-400', Minor: 'text-gray-600',
};

/** 事件模板 (服务端返回) */
export interface EventTemplate {
  template_id: string;
  name: string;
  level: EventLevel;
  region: string;
  description: string;
  template_narrative: string;
  is_claimed: boolean;
  instance: EventInstance | null;
}

/** 事件实例 */
export interface EventInstance {
  id: string;
  discovered_by: string;
  status: 'discovered' | 'active' | 'completed';
  progress: string;
}

/** 事件触发响应 */
export interface EventTriggerResponse {
  instance_id: string;
  claimed: boolean;
  discovered_by: string;
  status: string;
  message?: string;
}
