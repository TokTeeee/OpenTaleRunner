import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eventBus } from '../../src/services/event/EventBus';
import { EVENTS } from '../../src/services/event/events';

describe('v0.5.1 — EventBus constants exist and are emit/listen-able', () => {
  const collected: { event: string; payload: unknown }[] = [];
  const handlers: Array<{ event: string; fn: (p: unknown) => void }> = [];

  beforeEach(() => {
    collected.length = 0;
    handlers.length = 0;
  });
  afterEach(() => {
    for (const h of handlers) eventBus.off(h.event, h.fn);
  });

  function listen(event: string) {
    const fn = (p: unknown) => collected.push({ event, payload: p });
    eventBus.on(event, fn);
    handlers.push({ event, fn });
  }

  it('COMBAT_HIT fires with attackerId/targetId/damage', () => {
    listen(EVENTS.COMBAT_HIT);
    eventBus.emit(EVENTS.COMBAT_HIT, { attackerId: 'a', targetId: 'b', damage: 7, isCrit: false });
    expect(collected).toEqual([{ event: EVENTS.COMBAT_HIT, payload: { attackerId: 'a', targetId: 'b', damage: 7, isCrit: false } }]);
  });

  it('COMBAT_KILL fires on lethal hit', () => {
    listen(EVENTS.COMBAT_KILL);
    eventBus.emit(EVENTS.COMBAT_KILL, { killerId: 'a', targetId: 'b', targetName: 'Goblin' });
    expect(collected[0].payload).toMatchObject({ targetName: 'Goblin' });
  });

  it('COMBAT_END fires for victory/defeat/fled', () => {
    listen(EVENTS.COMBAT_END);
    eventBus.emit(EVENTS.COMBAT_END, { outcome: 'victory' });
    eventBus.emit(EVENTS.COMBAT_END, { outcome: 'defeat' });
    eventBus.emit(EVENTS.COMBAT_END, { outcome: 'fled' });
    expect(collected.map((c) => (c.payload as { outcome: string }).outcome)).toEqual(['victory', 'defeat', 'fled']);
  });

  it('NARRATIVE_SUBMIT fires with characterId + action', () => {
    listen(EVENTS.NARRATIVE_SUBMIT);
    eventBus.emit(EVENTS.NARRATIVE_SUBMIT, { characterId: 'c1', action: 'attack' });
    expect(collected[0].payload).toMatchObject({ characterId: 'c1', action: 'attack' });
  });

  it('LEVEL_UP fires with oldLevel/newLevel', () => {
    listen(EVENTS.LEVEL_UP);
    eventBus.emit(EVENTS.LEVEL_UP, { characterId: 'c1', oldLevel: 1, newLevel: 2 });
    expect(collected[0].payload).toMatchObject({ characterId: 'c1', oldLevel: 1, newLevel: 2 });
  });
});
