import type { CharacterArchetype } from "../host/character-profile.js";
import type { CombatAction } from "./adventure-types.js";
import { COMBAT_CELL_SIZE } from "./combat-grid.js";

export const MELEE_RANGE = 5;
export interface ClassActionSpec {
  readonly movementProfile: "stationary" | "mobile";
  readonly name: string; readonly icon: string; readonly description: string;
  readonly damage?: number; readonly range?: number; readonly cost?: number; readonly duration?: number;
  readonly block?: number; readonly heal?: number;
}
export interface ClassKit {
  readonly archetype: CharacterArchetype; readonly movementTiles: number; readonly movementSpeed: number; readonly combatMovementSpeed: number;
  readonly abilities: Readonly<Record<CombatAction, ClassActionSpec>>;
}
function kit(movementTiles: number, movementSpeed: number, strike: Omit<ClassActionSpec, "name" | "movementProfile">, brace: Omit<ClassActionSpec, "name" | "movementProfile">): ClassKit {
  return { archetype: "warrior", movementTiles, movementSpeed, combatMovementSpeed: movementTiles * COMBAT_CELL_SIZE, abilities: {
    bait: { movementProfile: "mobile", name: "Move", icon: "assets/ui/icons/spells/mobility-boots.png", description: `Choose multiple stops to move up to ${movementTiles} tiles in total. Backtracking counts toward your distance. Costs 1 stamina.`, cost: 1, range: movementTiles * COMBAT_CELL_SIZE, duration: 1 },
    strike: { ...strike, movementProfile: "stationary", name: "Attack" },
    brace: { ...brace, movementProfile: "mobile", name: "Defend" },
  } };
}
const kits: Readonly<Record<CharacterArchetype, ClassKit>> = {
  warrior: { ...kit(2, 5.2, { icon: "assets/ui/icons/spells/sword-strike.png", description: "Strike within 5 metres. After Defend blocks damage, your next Attack gains 12 damage.", damage: 18, range: MELEE_RANGE, cost: 0, duration: .25 }, { icon: "assets/ui/icons/spells/defensive-shield.png", description: "Absorb 24 damage. Blocking damage empowers your next Attack by 12. Does not stack.", block: 24, cost: 2 }), archetype: "warrior" },
  mage: { ...kit(2, 5.2, { icon: "assets/ui/icons/spells/wand-bolt.svg", description: "Fire an arcane bolt within 10 metres. Defend focuses your next Attack for 10 extra damage; Move breaks focus.", damage: 18, range: 10, cost: 0, duration: .25 }, { icon: "assets/ui/icons/spells/protective-ward.png", description: "Absorb 24 damage and focus your next Attack for 10 extra damage. Move breaks focus.", block: 24, cost: 2 }), archetype: "mage" },
  hunter: { ...kit(4, 6, { icon: "assets/ui/icons/spells/bow-shot.svg", description: "Shoot within 10 metres. Moving at least one tile first adds 8 damage to your Attack that turn.", damage: 18, range: 10, cost: 0, duration: .25 }, { icon: "assets/ui/icons/spells/defensive-shield.png", description: "Deflect incoming damage.", block: 24, cost: 2 }), archetype: "hunter" },
  alchemist: { ...kit(3, 5.6, { icon: "assets/ui/icons/spells/poison-vial.png", description: "Coat an enemy within 10 metres. The next Attack from anyone or a passing fireball ignites the residue for 12 damage within 3 metres, including allies.", damage: 16, range: 10, cost: 0, duration: .25 }, { icon: "assets/ui/icons/spells/healing-cross.png", description: "Restore health and absorb damage.", block: 16, heal: 6, cost: 2 }), archetype: "alchemist" },
  artificer: { ...kit(2, 5.2, { icon: "assets/ui/icons/spells/lightning-bolt.png", description: "Fire a rivet within 10 metres and expose a weak point. The next Attack from anyone consumes it for 6 extra damage.", damage: 20, range: 10, cost: 0, duration: .25 }, { icon: "assets/ui/icons/spells/protective-ward.png", description: "Deploy a barrier plate.", block: 28, cost: 3 }), archetype: "artificer" },
};
export function classKit(archetype: CharacterArchetype): ClassKit { return kits[archetype]; }
export function classAction(archetype: CharacterArchetype, action: CombatAction): ClassActionSpec {
  const spec = kits[archetype].abilities[action];
  if (archetype === "hunter" && action === "strike") return { ...spec, movementProfile: "mobile" };
  return archetype === "hunter" && action === "bait" ? { ...spec, description: spec.description + " Moving at least one tile empowers your next Attack this turn by 8 damage." } : spec;
}
