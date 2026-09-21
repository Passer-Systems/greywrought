import type { CharacterArchetype } from "../host/character-profile.js";
import type { CombatAction } from "./adventure-types.js";
import { COMBAT_CELL_SIZE } from "./combat-grid.js";

export const MELEE_RANGE = 5;
export interface ClassActionSpec {
  readonly target?: "self" | "unit";
  readonly movementProfile: "stationary" | "mobile";
  readonly name: string; readonly icon: string; readonly description: string;
  readonly damage?: number; readonly range?: number; readonly cost?: number; readonly duration?: number;
  readonly block?: number; readonly heal?: number;
}
export interface ClassKit {
  readonly archetype: CharacterArchetype; readonly movementTiles: number; readonly movementSpeed: number; readonly combatMovementSpeed: number;
  readonly abilities: Readonly<Record<CombatAction, ClassActionSpec>>;
}
export const SPRINT_COST = 30;
export const SPECIAL_COST = 40;
const specials: Readonly<Record<CharacterArchetype, ClassActionSpec>> = {
  warrior: { name: "Whirlwind", icon: "assets/ui/icons/spells/whirlwind.svg", description: "Sweep all engaged enemies within 5 metres for 30 damage. Can be used while moving.", target: "self", movementProfile: "mobile", damage: 30, range: 5, cost: SPECIAL_COST, duration: .25 },
  hunter: { name: "Piercing Arrow", icon: "assets/ui/icons/spells/ranged-projectile.png", description: "Fire through your target and engaged enemies in a narrow 15-metre line for 32 damage. Stops at cover. Requires a momentary stop.", target: "unit", movementProfile: "stationary", damage: 32, range: 15, cost: SPECIAL_COST, duration: .25 },
  mage: { name: "Frost Nova", icon: "assets/ui/icons/spells/frost-spell.png", description: "Burst for 20 damage within 5 metres and halve enemy pursuit speed for the rest of this turn. Can be used while moving.", target: "self", movementProfile: "mobile", damage: 20, range: 5, cost: SPECIAL_COST, duration: .25 },
  alchemist: { name: "Volatile Flask", icon: "assets/ui/icons/spells/fire-spell.png", description: "Throw a flask up to 10 metres for 24 damage to engaged enemies within 3 metres. Applies combustible residue, or ignites existing residue. Requires a momentary stop.", target: "unit", movementProfile: "stationary", damage: 24, range: 10, cost: SPECIAL_COST, duration: .25 },
  artificer: { name: "Disruptor Shot", icon: "assets/ui/icons/spells/arcane-starburst.png", description: "Deal 26 damage within 10 metres and interrupt the enemy’s committed attack. Requires a momentary stop.", target: "unit", movementProfile: "stationary", damage: 26, range: 10, cost: SPECIAL_COST, duration: .25 },
};
function kit(archetype: CharacterArchetype, movementTiles: number, movementSpeed: number, strike: Omit<ClassActionSpec, "name" | "movementProfile">, brace: Omit<ClassActionSpec, "name" | "movementProfile">): ClassKit {
  return { archetype, movementTiles, movementSpeed, combatMovementSpeed: movementTiles * COMBAT_CELL_SIZE, abilities: {
    bait: { movementProfile: "mobile", name: "Move", icon: "assets/ui/icons/spells/mobility-boots.png", description: `Choose multiple stops to move up to ${movementTiles} tiles in total. Backtracking counts toward your distance. Wait in quarter-second beats before moving. Free. Sprint doubles your distance and speed for 30 energy.`, cost: 0, range: movementTiles * COMBAT_CELL_SIZE, duration: 1 },
    strike: { ...strike, movementProfile: "stationary", name: "Attack" },
    brace: { ...brace, movementProfile: "mobile", name: "Defend" },
    special: specials[archetype],
  } };
}
const kits: Readonly<Record<CharacterArchetype, ClassKit>> = {
  warrior: { ...kit("warrior", 2, 5.2, { icon: "assets/ui/icons/spells/sword-strike.png", description: "Strike within 5 metres. After Defend blocks damage, your next Attack gains 12 damage.", damage: 18, range: MELEE_RANGE, cost: 0, duration: .25 }, { icon: "assets/ui/icons/spells/defensive-shield.png", description: "Absorb 24 damage. Blocking damage empowers your next Attack by 12. Does not stack.", block: 24, cost: 0 }), archetype: "warrior" },
  mage: { ...kit("mage", 2, 5.2, { icon: "assets/ui/icons/spells/wand-bolt.svg", description: "Fire an arcane bolt within 10 metres. Defend focuses your next Attack for 10 extra damage; Move breaks focus.", damage: 18, range: 10, cost: 0, duration: .25 }, { icon: "assets/ui/icons/spells/protective-ward.png", description: "Absorb 24 damage and focus your next Attack for 10 extra damage. Move breaks focus.", block: 24, cost: 0 }), archetype: "mage" },
  hunter: { ...kit("hunter", 4, 6, { icon: "assets/ui/icons/spells/bow-shot.svg", description: "Shoot within 12.5 metres. Moving at least one tile first adds 8 damage to your Attack that turn.", damage: 18, range: 12.5, cost: 0, duration: .25 }, { icon: "assets/ui/icons/spells/defensive-shield.png", description: "Deflect incoming damage.", block: 24, cost: 0 }), archetype: "hunter" },
  alchemist: { ...kit("alchemist", 3, 5.6, { icon: "assets/ui/icons/spells/poison-vial.png", description: "Coat an enemy within 10 metres. The next Attack from anyone or a passing fireball ignites the residue for 12 damage within 3 metres, including allies.", damage: 16, range: 10, cost: 0, duration: .25 }, { icon: "assets/ui/icons/spells/healing-cross.png", description: "Restore health and absorb damage.", block: 16, heal: 6, cost: 0 }), archetype: "alchemist" },
  artificer: { ...kit("artificer", 2, 5.2, { icon: "assets/ui/icons/spells/lightning-bolt.png", description: "Fire a rivet within 10 metres and expose a weak point. The next Attack from anyone consumes it for 6 extra damage.", damage: 20, range: 10, cost: 0, duration: .25 }, { icon: "assets/ui/icons/spells/protective-ward.png", description: "Deploy a barrier plate.", block: 28, cost: 0 }), archetype: "artificer" },
};
export function classKit(archetype: CharacterArchetype): ClassKit { return kits[archetype]; }
export function classAction(archetype: CharacterArchetype, action: CombatAction): ClassActionSpec {
  const spec = kits[archetype].abilities[action];
  if (archetype === "hunter" && action === "strike") return { ...spec, movementProfile: "mobile" };
  return archetype === "hunter" && action === "bait" ? { ...spec, description: spec.description + " Moving at least one tile empowers your next Attack this turn by 8 damage." } : spec;
}
