import { YARD_GUARDS, type YardGuardId } from "./yard-guards.js";
import { BELLRUNNER_STOPS, flightMasterId, type FlightMasterId } from "./bellrunner.js";
import { terrainHeight } from "./cave-layout.js";
import type { GearItemId } from "./yard-content.js";

export const VENDORS = [
  { id: "weapon-vendor", name: "Tamsin", trade: "Weapons", position: { x: -13, y: terrainHeight(-13, -28), z: -28 }, item: "travel-weapon", price: 9 },
  { id: "armor-vendor", name: "Brann", trade: "Armor", position: { x: 13, y: terrainHeight(13, -28), z: -28 }, item: "padded-coat", price: 6 },
  { id: "shield-vendor", name: "Sella", trade: "Shields", position: { x: -9, y: terrainHeight(-9, -32), z: -32 }, item: "yard-shield", price: 12 },
  { id: "suture-vendor", name: "Mend-7", trade: "Reclaimed weapons", position: { x: 149, y: terrainHeight(149, 110), z: 110 }, item: "travel-weapon", price: 9 },
  { id: "brinewick-vendor", name: "Mother Vitriol", trade: "Salt-cured armor", position: { x: -117, y: terrainHeight(-117, 118), z: 118 }, item: "padded-coat", price: 6 },
] as const satisfies readonly { id: string; name: string; trade: string; position: { x: number; y: number; z: number }; item: GearItemId; price: number }[];
export type VendorId = typeof VENDORS[number]["id"];
export const REST_SPOTS = [
  { id: "inn", name: "Rowan", lodging: "The Missing Bell", position: { x: 5, y: terrainHeight(5,-11), z: -11 }, greeting: "Come warm yourself by the hearth; rest is on the house." },
  { id: "suture-inn", name: "Still-Here", lodging: "The Empty Shift", position: { x: 161, y: terrainHeight(161,128), z: 128 }, greeting: "Your pulse is uneven. Sit. I have kept the kettle warm for eighty winters." },
  { id: "brinewick-inn", name: "Sister Sable", lodging: "The Drowned Saint", position: { x: -131, y: terrainHeight(-131,118), z: 118 }, greeting: "Leave your boots by the copper saint. The voices in the walls are only dreaming." },
] as const;
export type RestSpotId = typeof REST_SPOTS[number]["id"];
export type NpcId = "mara" | "bank" | YardGuardId | FlightMasterId | RestSpotId | VendorId;
export const NPC_IDS: readonly NpcId[] = ["mara", "bank", ...YARD_GUARDS.map(guard=>guard.id), ...BELLRUNNER_STOPS.map(stop => flightMasterId(stop.id)), ...REST_SPOTS.map(v => v.id), ...VENDORS.map(v => v.id)];
export const REGIONAL_GREETINGS: Partial<Record<NpcId, string>> = {
  "suture-vendor": "The kings are dust, but a good edge remains a good edge. I have repaired these for hands like yours.",
  "brinewick-vendor": "Salt for the flesh, copper for the thinking dead. Wear this when the mire begins to sing.",
};
export const experienceForLevel = (level: number): number => 50 * level * (level - 1);
export const levelForExperience = (experience: number): number => Math.floor((1 + Math.sqrt(1 + experience / 12.5)) / 2);
export const enemyCoins = (level: number): number => level * 3;
