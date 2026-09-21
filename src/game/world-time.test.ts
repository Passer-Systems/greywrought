import { expect, test } from 'bun:test';
import { WORLD_DAY_MILLISECONDS, formatWorldTime, worldDay } from './world-time.js';

const midnight = Date.parse('2026-07-15T00:00:00-07:00');
const atHour = (hour: number) => midnight + hour * 3_600_000;
test('the shared Seattle day runs at real time across reconnects and midnight', () => {
  expect(WORLD_DAY_MILLISECONDS).toBe(86_400_000);
  const stamp = atHour(10) + 123;
  expect(worldDay(stamp + WORLD_DAY_MILLISECONDS)).toEqual(worldDay(stamp));
  expect(worldDay(stamp + 60_000).hour - worldDay(stamp).hour).toBeCloseTo(1 / 60, 12);
  expect(formatWorldTime(atHour(6))).toBe('06:00');
  expect(formatWorldTime(atHour(24))).toBe('00:00');
  expect(formatWorldTime(atHour(24) - 1)).toBe('23:59');
});

test('sun rises in the east, crosses the sky, then gives way to the opposing moon', () => {
  expect(worldDay(atHour(6))).toMatchObject({ phase: 'dawn', sunDirection: { x: 1, y: 0, z: 0 } });
  expect(worldDay(atHour(12)).daylight).toBe(1);
  expect(worldDay(atHour(12)).sunDirection.y).toBeGreaterThan(.8);
  expect(worldDay(atHour(18)).sunDirection.x).toBe(-1);
  expect(worldDay(atHour(18)).phase).toBe('dusk');
  expect(worldDay(atHour(0)).daylight).toBe(0);
  expect(worldDay(atHour(0)).moonDirection.y).toBeGreaterThan(.8);
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

test('Seattle clock follows Pacific standard and daylight time, including both DST transitions', () => {
  for (const [stamp, expected] of [
    ['2026-01-15T20:00:00Z', '12:00'],
    ['2026-07-15T19:00:00Z', '12:00'],
    ['2026-03-08T09:59:59.999Z', '01:59'],
    ['2026-03-08T10:00:00Z', '03:00'],
    ['2026-11-01T08:59:59.999Z', '01:59'],
    ['2026-11-01T09:00:00Z', '01:00'],
  ] as const) expect(formatWorldTime(Date.parse(stamp))).toBe(expected);
});

test('frame calls reuse the realm minute while preserving seconds and milliseconds', () => {
  const original = Intl.DateTimeFormat.prototype.formatToParts;
  let conversions = 0;
  Intl.DateTimeFormat.prototype.formatToParts = function (...args) {
    conversions++;
    return original.apply(this, args);
  };
  try {
    const stamp = Date.parse('2028-07-15T19:23:00Z');
    for (const milliseconds of [0, 1, 16, 500, 30_000, 59_999]) {
      expect(worldDay(stamp + milliseconds).hour).toBeCloseTo(12 + 23 / 60 + milliseconds / 3_600_000, 12);
      expect(formatWorldTime(stamp + milliseconds)).toBe('12:23');
    }
    expect(conversions).toBe(1);
    expect(formatWorldTime(stamp + 60_000)).toBe('12:24');
    expect(conversions).toBe(2);
  } finally { Intl.DateTimeFormat.prototype.formatToParts = original; }
});
