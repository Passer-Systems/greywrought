import type { CharacterArchetype } from "../host/character-profile.js";
import type { CombatAction } from "./adventure-types.js";

export const YARD = {
  settlement: "Nine-Bell Yard",
  region: "The Last Shift",
  inn: "The Missing Bell",
  gate: "Yard gate",
  resource: "Coolant crystals",
  works: "Ninth Bell Engine",
  questTitle: "The shift that never ended",
} as const;

export type QuestId = "cold-hands" | "roll-call" | "last-shift";
export type QuestStatus = "locked" | "available" | "active" | "ready" | "completed";
export type QuestOperation = "accept" | "turnIn";
export type GearItemId = "insulated-coat" | "yard-weapon";
export type GearSlot = "chest" | "mainhand";
export interface QuestView {
  readonly id: QuestId;
  readonly status: QuestStatus;
  readonly progress: number;
  readonly required: number;
  readonly canAccept: boolean;
  readonly canTurnIn: boolean;
}
export interface ProgressionView {
  readonly level: number;
  readonly ownedGear: readonly GearItemId[];
  readonly equipment: Readonly<Record<GearSlot, GearItemId | null>>;
  readonly unlockedActions: readonly CombatAction[];
  readonly attackBonus: number;
  readonly damageReduction: number;
}
export interface QuestDefinition {
  readonly id: QuestId;
  readonly giver: "mara" | "inn";
  readonly giverName: string;
  readonly title: string;
  readonly prerequisite: QuestId | null;
  readonly required: number;
  readonly objective: string;
  readonly destinationId: string;
  readonly offer: string;
  readonly underway: string;
  readonly completion: string;
  readonly after: string;
  readonly reward: { readonly gear: GearItemId | null; readonly potions: number; readonly supplies: number; readonly level: number; readonly ability: CombatAction | null };
}

export const QUESTS: readonly QuestDefinition[] = [
  {
    id: "cold-hands", giver: "mara", giverName: "Mara", title: "Cold Hands, Warm Bodies",
    prerequisite: null, required: 3, objective: "Bring 3 coolant crystals to Mara", destinationId: "frost-cores",
    offer: "Hold this cup a moment. Both hands. Good—you can still feel the heat. The people upstairs can't. The old works has been venting through our well since the ninth bell began ringing again. I can keep their fever down, but my cooling jars are empty. Bring me three blue coolant crystals from the broken line beyond the gate. Don't touch the live roots barehanded. Come back to me with them; selling them won't help my patients.",
    underway: "Three coolant crystals, from the broken line beyond the gate. The roots still carry a charge while the linekeeper is alive. Bring the crystals here. I'll have a coat ready for you.",
    completion: "There. Hear the water stop boiling? That buys us a night. This coat belonged to the last line inspector. I stitched the burn holes shut. Wear it—you have to come back for it to be worth my time. Rowan knows who restarted the bell. He has been pretending not to hear it.",
    after: "The jars are cold again. I can leave the beds long enough to work. Ask Rowan about the ninth bell.",
    reward: { gear: "insulated-coat", potions: 2, supplies: 0, level: 2, ability: null },
  },
  {
    id: "roll-call", giver: "inn", giverName: "Rowan", title: "A Name on the Roll",
    prerequisite: "cold-hands", required: 1, objective: "Disable the Cinder Watchman and return to Rowan", destinationId: "scout",
    offer: "The ninth bell ended a shift. Eight for the work; one to count everyone home. I used to do the counting. When the works shut down, I signed the last roll without finding every name on it. Now that watchman at the broken line is calling my crew back. Put its furnace out and read the number on its collar. I need to know which roll the foreman is using.",
    underway: "The Cinder Watchman guards the broken coolant line. Have your block ready before it sees you. After it falls, bring me word of its collar number. You won't quiet the foreman by racing past everything it still commands.",
    completion: "Nine. Of course it is. My last roll. I wrote 'all accounted for' because the gate wouldn't open until I did. Some of them were still inside. Take my working weapon. I'll show you how we backed away from a live press: strike, leave the reach, never wait for the second stroke. The foreman still holds the roll. Bring it home. I will read every name this time.",
    after: "I put the old roll book on the table. No more empty lines. When you bring the last one home, I'll be here.",
    reward: { gear: "yard-weapon", potions: 0, supplies: 3, level: 2, ability: "disengage" },
  },
  {
    id: "last-shift", giver: "inn", giverName: "Rowan", title: "Clock Out",
    prerequisite: "roll-call", required: 1, objective: "Recover the Last Shift Roll and return it to Rowan", destinationId: "ritual-site",
    offer: "Six coolant crystals will wake the Ninth Bell Engine. Its foreman kept us alive through a hundred bad shifts. It also sealed the doors on the last one. It cannot accept that a person might never answer. Read the moves it announces. Save your block for its pulse, get clear of the press, and use its shielded turn to recover. You have a coat, a proper weapon, and a way out of reach. Use all three. Bring me the roll from its remains.",
    underway: "Wake the engine with six carried crystals. Defeat Foreman Nine, take the Last Shift Roll from its remains, and bring it to me. We are ending a shift, not collecting a trophy.",
    completion: "Give it here. No—stay. Someone should hear them. Hessa Venn. Parel Doss. Idren Vale. Senn, who never used a second name. I should have waited at the gate. I can't do that night again. I can stop asking the living to finish it. Your place at this table is paid for. As long as the roof holds.",
    after: "The ninth bell is quiet. I still count everyone who comes through that door. Now I ask their names first.",
    reward: { gear: null, potions: 2, supplies: 12, level: 3, ability: "bloodRage" },
  },
];

export const GEAR = {
  "insulated-coat": { slot: "chest", name: "Line Inspector's Coat", icon: "items/shield-emblem", attackBonus: 0, damageReduction: 2, description: "Mara's patched work coat. Reduces each incoming hit by 2 after Block, to a minimum of 1 damage." },
  "yard-weapon": { slot: "mainhand", name: "Yard weapon", icon: "spells/sword-strike", attackBonus: 3, damageReduction: 0, description: "A maintained working weapon from Rowan's crew. Adds 3 damage to attacks." },
} as const;

export function gearName(id: GearItemId, archetype: CharacterArchetype): string {
  return id === "insulated-coat" ? GEAR[id].name : archetype === "mage" ? "Linemender's Wand" : archetype === "hunter" ? "Yardwatch Bow" : "Shiftkeeper's Blade";
}

export function questDefinition(id: QuestId): QuestDefinition {
  return QUESTS.find(quest => quest.id === id)!;
}
