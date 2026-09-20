import type { GearItemId } from "./yard-content.js";

export const VENDORS = [
  { id: "weapon-vendor", name: "Tamsin", trade: "Weapons", position: { x: -13, y: 0, z: -28 }, item: "travel-weapon", price: 9 },
  { id: "armor-vendor", name: "Brann", trade: "Armor", position: { x: 13, y: 0, z: -28 }, item: "padded-coat", price: 6 },
  { id: "shield-vendor", name: "Sella", trade: "Shields", position: { x: -9, y: 0, z: -32 }, item: "yard-shield", price: 12 },
] as const satisfies readonly { id: string; name: string; trade: string; position: { x: number; y: number; z: number }; item: GearItemId; price: number }[];
export type VendorId = typeof VENDORS[number]["id"];
export type NpcId = "mara" | "inn" | "bank" | VendorId;
export const NPC_IDS: readonly NpcId[] = ["mara", "inn", "bank", ...VENDORS.map(v => v.id)];
export const experienceForLevel = (level: number): number => 50 * level * (level - 1);
export const levelForExperience = (experience: number): number => Math.floor((1 + Math.sqrt(1 + experience / 12.5)) / 2);
export const enemyExperience = (level: number): number => level * 10;
export const enemyCoins = (level: number): number => level * 3;
