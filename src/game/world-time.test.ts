import { expect, test } from 'bun:test';
import { WORLD_DAY_MILLISECONDS, formatWorldTime, worldDay } from './world-time.js';

const atHour = (hour: number) => hour / 24 * WORLD_DAY_MILLISECONDS;
test('the shared day repeats every forty minutes across reconnects and midnight', () => {
  const stamp = 1_789_920_000_123;
  expect(worldDay(stamp + WORLD_DAY_MILLISECONDS)).toEqual(worldDay(stamp));
  expect(worldDay(-1)).toEqual(worldDay(WORLD_DAY_MILLISECONDS - 1));
  expect(formatWorldTime(atHour(6))).toBe('06:00');
  expect(formatWorldTime(WORLD_DAY_MILLISECONDS)).toBe('00:00');
  expect(formatWorldTime(WORLD_DAY_MILLISECONDS - 1)).toBe('23:59');
});

test('sun rises in the east, crosses the sky, then gives way to the opposing moon', () => {
  expect(worldDay(atHour(6))).toMatchObject({ phase: 'dawn', sunDirection: { x: 1, y: 0, z: 0 } });
  expect(worldDay(atHour(12)).daylight).toBe(1);
  expect(worldDay(atHour(12)).sunDirection.y).toBeGreaterThan(.8);
  expect(worldDay(atHour(18)).sunDirection.x).toBe(-1);
  expect(worldDay(atHour(18)).phase).toBe('dusk');
  expect(worldDay(0).daylight).toBe(0);
  expect(worldDay(0).moonDirection.y).toBeGreaterThan(.8);
  for (let hour = 0; hour < 24; hour++) {
    const { sunDirection: sun, moonDirection: moon } = worldDay(atHour(hour));
    expect(Math.hypot(sun.x, sun.y, sun.z)).toBeCloseTo(1, 12);
    expect([moon.x + sun.x, moon.y + sun.y, moon.z + sun.z]).toEqual([0, 0, 0]);
  }
});

test('illumination and celestial positions cross dawn, dusk and midnight continuously', () => {
  for (const hour of [0, 5, 6, 7, 17, 18, 19, 24]) {
    const before = worldDay(atHour(hour) - 1), after = worldDay(atHour(hour) + 1);
    expect(Math.abs(before.daylight - after.daylight)).toBeLessThan(.0001);
    expect(Math.abs(before.twilight - after.twilight)).toBeLessThan(.0001);
    expect(Math.hypot(before.sunDirection.x - after.sunDirection.x, before.sunDirection.y - after.sunDirection.y, before.sunDirection.z - after.sunDirection.z)).toBeLessThan(.0001);
  }
});
