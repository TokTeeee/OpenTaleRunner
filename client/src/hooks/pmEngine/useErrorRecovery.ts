import { useCallback } from 'react';
import { logger } from '../../utils/logger';
import { eventBus } from '../../services/event/EventBus';
import { EVENTS } from '../../services/event/events';
import { setPmErrorShared } from './shared';

/**
 * v0.5.11: 错误恢复抽象。
 * - handlePMError(err, context): 统一记录 + 推 PM_ERROR 事件 + 写 shared error
 * - clearError(): 清 shared error
 *
 * 从 usePMInitialization 抽出。5 个上层 export 签名不变。
 */
export function useErrorRecovery() {
  const handlePMError = useCallback((err: unknown, context: string) => {
    const msg = (err as Error).message || String(err);
    logger.error('PM', `${context}失败: ${msg}`);
    setPmErrorShared(`${context} 失败: ${msg.slice(0, 80)}`);
    eventBus.emit(EVENTS.PM_ERROR, { context, message: msg });
  }, []);

  const clearError = useCallback(() => {
    setPmErrorShared(null);
  }, []);

  return { handlePMError, clearError };
}
