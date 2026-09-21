import type { Position } from './adventure-types.js';
import { supportHeight } from './movement.js';

export const BELLRUNNER_STOPS = [
  { id: 'yard', name: 'Nine-Bell Yard', x: -8, z: -28 },
  { id: 'suture', name: 'Suture', x: 157, z: 117 },
  { id: 'brinewick', name: 'Brinewick', x: -125, z: 128 },
] as const;
export type BellrunnerStopId = typeof BELLRUNNER_STOPS[number]['id'];
export interface FlightState { readonly from: BellrunnerStopId; readonly to: BellrunnerStopId; readonly elapsed: number; }
export function bellrunnerStop(id: BellrunnerStopId) { return BELLRUNNER_STOPS.find(stop => stop.id === id)!; }
export function bellrunnerDock(id: BellrunnerStopId): Position {
  const stop = bellrunnerStop(id);
  return { x: stop.x, y: supportHeight(stop.x, stop.z), z: stop.z };
}
export function nearbyBellrunner(position: Position) {
  return BELLRUNNER_STOPS.find(stop => Math.hypot(position.x-stop.x, position.z-stop.z, position.y-supportHeight(stop.x,stop.z)) <= 4);
}
export function flightDuration(from: BellrunnerStopId, to: BellrunnerStopId): number {
  const a = bellrunnerStop(from), b = bellrunnerStop(to);
  return 8 + Math.hypot(b.x-a.x,b.z-a.z) / 11;
}
const smooth = (v: number) => v*v*(3-2*v);
export function flightPosition(flight: FlightState): Position {
  const a = bellrunnerDock(flight.from), b = bellrunnerDock(flight.to), duration = flightDuration(flight.from, flight.to);
  const elapsed = Math.max(0, Math.min(duration, flight.elapsed));
  const cruise = smooth(Math.max(0, Math.min(1, (elapsed-4)/(duration-8))));
  const bend = Math.sin(cruise*Math.PI)*20;
  const x = a.x+(b.x-a.x)*cruise, z = a.z+(b.z-a.z)*cruise+bend;
  const lift = smooth(Math.min(1, elapsed/4, (duration-elapsed)/4));
  return { x, y: a.y+(b.y-a.y)*cruise + (42 + Math.sin(cruise*Math.PI)*8)*lift, z };
}
export function flightFacing(flight: FlightState): Position {
  const a = bellrunnerStop(flight.from), b = bellrunnerStop(flight.to);
  const length = Math.hypot(b.x-a.x,b.z-a.z);
  return { x:(b.x-a.x)/length,y:0,z:(b.z-a.z)/length };
}
export function readFlight(value: unknown): FlightState | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object') throw Error('Invalid saved flight.');
  const f = value as Record<string, unknown>;
  const from = BELLRUNNER_STOPS.find(stop => stop.id === f.from), to = BELLRUNNER_STOPS.find(stop => stop.id === f.to);
  if (!from || !to || from === to || typeof f.elapsed !== 'number' || !Number.isFinite(f.elapsed) || f.elapsed < 0 || f.elapsed > flightDuration(from.id,to.id)) throw Error('Invalid saved flight.');
  return { from: from.id, to: to.id, elapsed: f.elapsed };
}
