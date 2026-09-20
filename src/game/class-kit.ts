import type { CharacterArchetype } from "../host/character-profile.js";
import type { CombatAction } from "./adventure-types.js";
import { COMBAT_CELL_SIZE } from "./combat-grid.js";

export const MELEE_RANGE = 5;

export interface ClassActionSpec {
  readonly name: string;
  /** Path is resolved by the host against the static asset root. */
  readonly icon: string;
  readonly description: string;
  readonly damage?: number;
  readonly range?: number;
  readonly cost?: number;
  readonly duration?: number;
  readonly block?: number;
  readonly heal?: number;
  readonly powerDamagePerStack?: number;
}

export interface ClassKit {
  readonly archetype: CharacterArchetype;
  readonly movementTiles: number;
  readonly movementSpeed: number;
  readonly abilities: Readonly<Record<CombatAction, ClassActionSpec>>;
  readonly powerName: string;
  readonly powerStackName: string;
}

function tactics(movementTiles: number) { return {
  bait: { name: "Bait", icon: "assets/ui/icons/spells/mobility-boots.png", description: `Movement ${movementTiles}: move up to ${movementTiles} tiles toward chosen ground on this beat. Lure enemies into each other. Costs 1 stamina.`, cost: 1, range: movementTiles * COMBAT_CELL_SIZE, duration: .45 },
  shove: { name: "Shove", icon: "assets/ui/icons/spells/sword-strike.png", description: "Push an enemy within 5 metres. Collisions hurt and stagger both enemies, interrupting their attacks. Costs 1 stamina.", cost: 1, range: MELEE_RANGE },
  finish: { name: "Finish", icon: "assets/ui/icons/spells/sword-strike.png", description: "Strike within 5 metres for 12 damage, or 54 against a staggered enemy. Costs 1 stamina.", cost: 1, range: MELEE_RANGE, damage: 12 },
} as const; }
const common = {
  brace: { name: "Block", icon: "assets/ui/icons/spells/defensive-shield.png", description: "Raise your guard and absorb incoming damage." },
  jab: { name: "Auto Attack", icon: "assets/ui/icons/spells/sword-strike.png", description: "A free close attack." },
  guard: { name: "Guard", icon: "assets/ui/icons/spells/protective-ward.png", description: "A quick defensive stance." },
  drinkPotion: { name: "Health Potion", icon: "assets/ui/icons/items/health-potion-red.png", description: "Restore health." },
} as const;

const kits: Readonly<Record<CharacterArchetype, ClassKit>> = {
  warrior: {
    archetype: "warrior", movementTiles: 2, movementSpeed: 5.2, powerName: "Blood Rage", powerStackName: "Rage",
    abilities: {
      ...tactics(2),
      strike: { name: "Sword Strike", icon: "assets/ui/icons/spells/sword-strike.png", description: "Strike an enemy within 5 metres.", damage: 9, range: MELEE_RANGE, cost: 0, duration: .25 },
      brace: { ...common.brace, description: "Absorb 24 damage for 2 seconds. Costs 2 stamina." }, disengage: { name: "Disengage", icon: "assets/ui/icons/spells/mobility-boots.png", description: "Strike an enemy within 5 metres for 6, then leap backward and root it briefly. Costs 1 stamina.", damage: 6, range: MELEE_RANGE, cost: 1, duration: .8 },
      bloodRage: { name: "Blood Rage", icon: "assets/ui/icons/spells/fire-spell.png", description: "Build Rage while remaining in combat; each stack adds attack damage but drains health.", cost: 1, powerDamagePerStack: 4 },
      jab: common.jab, guard: common.guard, drinkPotion: common.drinkPotion,
    },
  },
  mage: {
    archetype: "mage", movementTiles: 2, movementSpeed: 5.2, powerName: "Overchannel", powerStackName: "Arcane Charge",
    abilities: {
      ...tactics(2),
      strike: { name: "Arcane Bolt", icon: "assets/ui/icons/spells/wand-bolt.svg", description: "A ranged wand bolt.", damage: 9, range: 10, cost: 0, duration: .25 },
      brace: { name: "Arcane Barrier", icon: "assets/ui/icons/spells/protective-ward.png", description: "Absorb 24 damage for 2 seconds. Costs 2 stamina.", block: 24, cost: 2 },
      disengage: { name: "Froststep", icon: "assets/ui/icons/spells/frost-spell.png", description: "Blast the enemy, then blink backward and root it until you land.", damage: 6, range: 10, cost: 1, duration: .8 },
      bloodRage: { name: "Overchannel", icon: "assets/ui/icons/spells/energy-burst.png", description: "Build Arcane Charge in combat: +4 spell damage per stack, draining 1 health per stack every 5 seconds.", cost: 1, powerDamagePerStack: 4 },
      jab: { name: "Wand Bolt", icon: "assets/ui/icons/spells/wand-bolt.svg", description: "A free close wand bolt." }, guard: common.guard, drinkPotion: common.drinkPotion,
    },
  },
  hunter: {
    archetype: "hunter", movementTiles: 4, movementSpeed: 6, powerName: "Keen Focus", powerStackName: "Focus",
    abilities: {
      ...tactics(4),
      strike: { name: "Aimed Shot", icon: "assets/ui/icons/spells/bow-shot.svg", description: "A ranged bow shot.", damage: 9, range: 10, cost: 0, duration: .25 },
      brace: { name: "Deflect", icon: "assets/ui/icons/spells/defensive-shield.png", description: "Absorb 24 damage for 2 seconds. Costs 2 stamina.", block: 24, cost: 2 },
      disengage: { name: "Parting Shot", icon: "assets/ui/icons/spells/bow-shot.svg", description: "Shoot the enemy, then leap backward and root it until you land.", damage: 6, range: 10, cost: 1, duration: .8 },
      bloodRage: { name: "Keen Focus", icon: "assets/ui/icons/spells/ranged-projectile.png", description: "Build Focus in combat for +4 shot damage per stack. Focus decays outside combat; it does not drain health.", cost: 1, powerDamagePerStack: 4 },
      jab: { name: "Quick Shot", icon: "assets/ui/icons/spells/bow-shot.svg", description: "A free quick shot." }, guard: common.guard, drinkPotion: common.drinkPotion,
    },
  },
  alchemist: {
    archetype: "alchemist", movementTiles: 3, movementSpeed: 5.6, powerName: "Volatile Mixture", powerStackName: "Reagent",
    abilities: {
      ...tactics(3),
      strike: { name: "Reagent Toss", icon: "assets/ui/icons/spells/poison-vial.png", description: "Throw a caustic vial from 10 metres for ranged damage.", damage: 8, range: 10, cost: 0, duration: .25 },
      brace: { name: "Protective Tonic", icon: "assets/ui/icons/spells/healing-cross.png", description: "Restore 6 health and gain 16 block for 2 seconds.", block: 16, heal: 6 },
      disengage: { name: "Caustic Escape", icon: "assets/ui/icons/spells/poison-vial.png", description: "Splash acid at the enemy, then retreat and leave it snared.", damage: 8, range: 10, cost: 1, duration: .8 },
      bloodRage: { name: "Volatile Mixture", icon: "assets/ui/icons/spells/energy-burst.png", description: "Prime reagents: +3 vial damage per stack, draining 1 health per stack every 5 seconds.", cost: 1, powerDamagePerStack: 3 },
      jab: { name: "Quick Vial", icon: "assets/ui/icons/spells/poison-vial.png", description: "A free short-range reagent toss." },
      guard: { name: "Antidote Guard", icon: "assets/ui/icons/spells/healing-cross.png", description: "A brief stabilizing guard." }, drinkPotion: common.drinkPotion,
    },
  },
  artificer: {
    archetype: "artificer", movementTiles: 2, movementSpeed: 5.2, powerName: "Overclock", powerStackName: "Charge",
    abilities: {
      ...tactics(2),
      strike: { name: "Rivet Shot", icon: "assets/ui/icons/spells/lightning-bolt.png", description: "Fire a clockwork rivet from 10 metres.", damage: 10, range: 10, cost: 0, duration: .25 },
      brace: { name: "Barrier Plate", icon: "assets/ui/icons/spells/protective-ward.png", description: "Deploy 28 block for 2 seconds. The rivet tool needs 3 stamina to plate it.", block: 28, cost: 3 },
      disengage: { name: "Recoil Snare", icon: "assets/ui/icons/spells/mobility-boots.png", description: "Blast the enemy with a tool recoil, then retreat and pin it briefly.", damage: 7, range: 10, cost: 1, duration: .8 },
      bloodRage: { name: "Overclock", icon: "assets/ui/icons/spells/lightning-bolt.png", description: "Overclock your rivet tool in combat. Each Charge adds damage and strains the rig.", cost: 1, powerDamagePerStack: 5 },
      jab: { name: "Arc Tool", icon: "assets/ui/icons/spells/lightning-bolt.png", description: "A free close-range arc strike." },
      guard: { name: "Emergency Plating", icon: "assets/ui/icons/spells/protective-ward.png", description: "A brief reinforced guard." }, drinkPotion: common.drinkPotion,
    },
  },
};

export function classKit(archetype: CharacterArchetype): ClassKit { return kits[archetype]; }
export function classAction(archetype: CharacterArchetype, action: CombatAction): ClassActionSpec { return kits[archetype].abilities[action]; }
