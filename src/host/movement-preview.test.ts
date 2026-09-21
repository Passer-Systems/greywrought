import { expect, test } from 'bun:test';
import { createAdventure } from '../game/adventure.js';
import type { CombatForecast } from '../game/adventure-types.js';
import { createMovementPreview } from './movement-preview.js';

test('hover requests ignore countdown, invalidate for plans, and discard stale replies', async () => {
  const base = createAdventure().snapshot;
  const snapshot = { ...base, threats: base.threats.map((threat, index) => index === 0 ? { ...threat, aggro: true } : threat), combat: { ...base.combat, phase: 'preparation' as const } };
  const replies: Array<(forecast: CombatForecast | null) => void> = [];
  const controller = createMovementPreview(() => new Promise(resolve => replies.push(resolve)));
  const a = { x: 0, y: 0, z: 0 }, b = { x: 2.5, y: 0, z: 0 };
  controller.update(snapshot, a);
  controller.update({ ...snapshot, combat: { ...snapshot.combat, remainingSeconds: 28, elapsedSeconds: 2 } }, a);
  expect(replies).toHaveLength(1);
  controller.update(snapshot, b);
  const forecast: CombatForecast = { playerId: 'solo', paths: [], events: [], outcomes: [], actions: [] };
  replies[0]!(forecast); await Promise.resolve();
  expect(controller.forecast).toBeNull();
  replies[1]!(forecast); await Promise.resolve();
  expect(controller.forecast).toBe(forecast);
  controller.update({ ...snapshot, combat: { ...snapshot.combat, availableStamina: 1 } }, b);
  expect(replies).toHaveLength(3);
  controller.clear(); replies[2]!(forecast); await Promise.resolve();
  expect(controller.forecast).toBeNull();
});

test('hover preview ignores preparation drift but refreshes on combat state changes', () => {
  const base = createAdventure().snapshot;
  const snapshot = { ...base, combat: { ...base.combat, phase: 'preparation' as const } };
  let requests = 0;
  const controller = createMovementPreview(async () => { requests++; return null; });
  const destination = { x: 2.5, y: 0, z: 0 };
  controller.update(snapshot, destination);
  const drifting = { ...snapshot, threats: snapshot.threats.map(threat => ({ ...threat, position: { ...threat.position, x: threat.position.x + .1 }, targetPosition: { ...threat.targetPosition, x: threat.targetPosition.x + .1 } })) };
  controller.update(drifting, destination);
  expect(requests).toBe(1);
  controller.update({ ...drifting, threats: drifting.threats.map((threat, index) => index === 0 ? { ...threat, health: threat.health - 1 } : threat) }, destination);
  expect(requests).toBe(2);
});

test('changing the route refreshes a preview even when its final tile stays the same', async () => {
  const base = createAdventure().snapshot;
  const snapshot = { ...base, combat: { ...base.combat, phase: 'preparation' as const } };
  const requests: Array<readonly unknown[]> = [];
  const replies: Array<(forecast: CombatForecast | null) => void> = [];
  const controller = createMovementPreview((destination, via) => {
    requests.push([destination, via]); return new Promise(resolve => replies.push(resolve));
  });
  const end = { x: 0, y: 0, z: 0 }, stop = { x: 2.5, y: 0, z: 0 };
  controller.update(snapshot, end);
  controller.update(snapshot, end, [stop]);
  expect(requests).toEqual([[end, []], [end, [stop]]]);
  const forecast: CombatForecast = { playerId: 'solo', paths: [], events: [], outcomes: [], actions: [] };
  replies[0]!(forecast); await Promise.resolve();
  expect(controller.pending).toBe(true); expect(controller.forecast).toBeNull();
  replies[1]!(forecast); await Promise.resolve();
  expect(controller.pending).toBe(false); expect(controller.forecast).toBe(forecast);
});

test('Sprint refreshes an uncommitted route preview', () => {
  const base=createAdventure().snapshot;
  const snapshot={...base,combat:{...base.combat,phase:'preparation' as const}};
  let requests=0;
  const controller=createMovementPreview(async()=>{requests++;return null;});
  const destination={x:2.5,y:0,z:0};
  controller.update(snapshot,destination);
  controller.update({...snapshot,combat:{...snapshot.combat,sprinting:true}},destination);
  expect(requests).toBe(2);
});
