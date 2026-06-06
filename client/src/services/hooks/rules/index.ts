/** 规则统一注册入口 — App 启动时 import 此文件即可加载所有规则 */
import { systemHooks } from '../SystemHooks';
import { logger } from '../../../utils/logger';

// Wire error callback
systemHooks.onError((ns, id, err) => {
  logger.warn('Hooks', `[${ns}] 规则 "${id}" 执行失败: ${(err as Error)?.message || err}`);
});

// Import all rule modules (side-effect: self-register via systemHooks.add)
import './timeVitalRules';
import './restRules';
import './combatRules';
import './environmentRules';
import './conditionRules';
// 审计 P3 修复: 文档承诺 7 个规则文件, 原仅 5 个, 补全 item/party
import './itemRules';
import './partyRules';

// Debug: expose hooks snapshot to browser console
if (typeof window !== 'undefined') {
  ((window as unknown) as Record<string, unknown>).__aeslanHooks = () => {
    const dump = systemHooks.dump();
    console.table(Object.entries(dump).flatMap(([ns, entries]) =>
      entries.map(e => ({ namespace: ns, ...e }))
    ));
    return dump;
  };
}

logger.info('Hooks', `Loaded ${systemHooks.getNamespaces().length} hook namespaces`);
