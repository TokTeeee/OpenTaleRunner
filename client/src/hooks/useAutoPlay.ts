/**
 * AutoPlay UI 绑定 Hook。
 * 负责把 AutoPlayEngine、submitAction 管线和 ActivityReporter 连接起来，
 * 对组件暴露开始、暂停、停止、单步执行等可直接消费的控制接口。
 */
import { useRef, useEffect, useCallback } from 'react';
import { AutoPlayEngine } from '../services/autoPlay/AutoPlayEngine';
import { activityReporter } from '../services/activity/ActivityReporter';
import { usePMEngine } from './usePMEngine';

export function useAutoPlay() {
  const { submitAction } = usePMEngine();
  const engineRef = useRef<AutoPlayEngine | null>(null);
  const submitRef = useRef(submitAction);

  useEffect(() => {
    submitRef.current = submitAction;
  }, [submitAction]);

  const getEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new AutoPlayEngine((action: string) => submitRef.current(action));
    }
    return engineRef.current;
  }, []);

  const startAutoPlay = useCallback(() => {
    getEngine().start();
  }, [getEngine]);

  const pauseAutoPlay = useCallback(() => {
    getEngine().pause();
  }, [getEngine]);

  const stopAutoPlay = useCallback(() => {
    getEngine().stop();
  }, [getEngine]);

  const stepAutoPlay = useCallback(() => {
    getEngine().step();
  }, [getEngine]);

  const startActivityReporter = useCallback(() => {
    activityReporter.start();
  }, []);

  const stopActivityReporter = useCallback(() => {
    activityReporter.stop();
  }, []);

  useEffect(() => {
    return () => {
      engineRef.current?.stop();
      activityReporter.stop();
    };
  }, []);

  return {
    startAutoPlay,
    pauseAutoPlay,
    stopAutoPlay,
    stepAutoPlay,
    startActivityReporter,
    stopActivityReporter,
  };
}