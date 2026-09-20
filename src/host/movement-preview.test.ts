import { expect, test } from 'bun:test';
import { createAdventure } from '../game/adventure.js';
import type { CombatForecast } from '../game/adventure-types.js';
import { createMovementPreview } from './movement-preview.js';

test('hover requests ignore countdown, invalidate for plans, and discard stale replies', async () => {
  const base = createAdventure().snapshot;
  const snapshot = { ...base, combat: { ...base.combat, phase: 'preparation' as const } };
  const replies: Array<(forecast: CombatForecast | null) => void> = [];
  const controller = createMovementPreview(() => new Promise(resolve => replies.push(resolve)));
  const a = { x: 0, y: 0, z: 0 }, b = { x: 2.5, y: 0, z: 0 };
  controller.update(snapshot, a);
  controller.update({ ...snapshot, combat: { ...snapshot.combat, remainingSeconds: 28, elapsedSeconds: 2 } }, a);
  expect(replies).toHaveLength(1);
  controller.update(snapshot, b);
  const forecast: CombatForecast = { playerId: 'solo', paths: [], events: [], outcomes: [] };
  replies[0]!(forecast); await Promise.resolve();
  expect(controller.forecast).toBeNull();
  replies[1]!(forecast); await Promise.resolve();
  expect(controller.forecast).toBe(forecast);
  controller.update({ ...snapshot, combat: { ...snapshot.combat, availableStamina: 1 } }, b);
  expect(replies).toHaveLength(3);
  controller.clear(); replies[2]!(forecast); await Promise.resolve();
  expect(controller.forecast).toBeNull();
});
