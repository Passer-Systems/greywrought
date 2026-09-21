export const WORLD_DAY_MILLISECONDS = 40 * 60_000;
export type WorldDayPhase = 'dawn' | 'day' | 'dusk' | 'night';
export interface WorldDay {
  readonly fraction: number;
  readonly hour: number;
  readonly phase: WorldDayPhase;
  readonly daylight: number;
  readonly twilight: number;
  readonly sunDirection: { readonly x: number; readonly y: number; readonly z: number };
  readonly moonDirection: { readonly x: number; readonly y: number; readonly z: number };
}
function smoothstep(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

export function worldDay(wallTimeMillis: number): WorldDay {
  const fraction = ((wallTimeMillis % WORLD_DAY_MILLISECONDS) + WORLD_DAY_MILLISECONDS) % WORLD_DAY_MILLISECONDS / WORLD_DAY_MILLISECONDS;
  const hour = fraction * 24;
  const angle = (fraction - .25) * Math.PI * 2;
  const sunDirection = { x: Math.cos(angle), y: Math.sin(angle) * Math.cos(Math.PI / 6), z: Math.sin(angle) * .5 };
  return {
    fraction, hour,
    phase: hour >= 5 && hour < 7 ? 'dawn' : hour >= 7 && hour < 17 ? 'day' : hour >= 17 && hour < 19 ? 'dusk' : 'night',
    daylight: smoothstep(-.12, .22, sunDirection.y),
    twilight: 1 - smoothstep(.02, .35, Math.abs(sunDirection.y)),
    sunDirection,
    moonDirection: { x: -sunDirection.x, y: -sunDirection.y, z: -sunDirection.z },
  };
}

export function formatWorldTime(wallTimeMillis: number): string {
  const minute = Math.floor(worldDay(wallTimeMillis).hour * 60);
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** Shared storm timing for rain, cloud cover, and sound, in server wall-clock seconds. */
export function worldRain(wallTimeSeconds: number): number {
  const hash = (i: number) => { const n = Math.sin(i * 127.1 + 91.7) * 43758.5453; return n - Math.floor(n); };
  const cycleIndex = Math.floor(wallTimeSeconds / 120);
  const cycle = ((wallTimeSeconds % 120) + 120) % 120;
  if (hash(cycleIndex + 1801) < .22) return 0;
  const start = 12 + hash(cycleIndex + 1901) * 22;
  const duration = 42 + hash(cycleIndex + 2001) * 34;
  const t = Math.max(0, Math.min(1, (cycle - start) / 10, (start + duration - cycle) / 10));
  return t * t * (3 - 2 * t);
}
