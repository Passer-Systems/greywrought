import type { CharacterArchetype } from "../host/character-profile.js";
import type { CombatAction } from "./adventure-types.js";
import { COMBAT_CELL_SIZE } from "./combat-grid.js";

export const MELEE_RANGE = 5;
export interface ClassActionSpec {
  readonly name?: string; readonly icon: string; readonly description: string;
  readonly damage?: number; readonly range?: number; readonly cost?: number; readonly duration?: number;
  readonly block?: number; readonly heal?: number;
}
export interface ClassKit {
  readonly archetype: CharacterArchetype; readonly movementTiles: number; readonly movementSpeed: number;
  readonly abilities: Readonly<Record<CombatAction, ClassActionSpec>>;
}
function kit(movementTiles: number, movementSpeed: number, strike: ClassActionSpec, brace: ClassActionSpec): ClassKit {
  return { archetype: "warrior", movementTiles, movementSpeed, abilities: {
    bait: { name: "Move", icon: "assets/ui/icons/spells/mobility-boots.png", description: `Move up to ${movementTiles} grid tiles. Costs 1 stamina.`, cost: 1, range: movementTiles * COMBAT_CELL_SIZE, duration: .45 },
    strike: { ...strike, name: "Attack" },
    brace: { ...brace, name: "Defend" },
  } };
}
const kits: Readonly<Record<CharacterArchetype, ClassKit>> = {
  warrior: { ...kit(2, 5.2, { icon: "assets/ui/icons/spells/sword-strike.png", description: "Strike an enemy within 5 metres.", damage: 9, range: MELEE_RANGE, cost: 0, duration: .25 }, { icon: "assets/ui/icons/spells/defensive-shield.png", description: "Absorb incoming damage.", block: 24, cost: 2 }), archetype: "warrior" },
  mage: { ...kit(2, 5.2, { icon: "assets/ui/icons/spells/wand-bolt.svg", description: "Fire a ranged arcane bolt.", damage: 9, range: 10, cost: 0, duration: .25 }, { icon: "assets/ui/icons/spells/protective-ward.png", description: "Raise an arcane barrier.", block: 24, cost: 2 }), archetype: "mage" },
  hunter: { ...kit(4, 6, { icon: "assets/ui/icons/spells/bow-shot.svg", description: "Fire a ranged shot.", damage: 9, range: 10, cost: 0, duration: .25 }, { icon: "assets/ui/icons/spells/defensive-shield.png", description: "Deflect incoming damage.", block: 24, cost: 2 }), archetype: "hunter" },
  alchemist: { ...kit(3, 5.6, { icon: "assets/ui/icons/spells/poison-vial.png", description: "Throw a caustic vial.", damage: 8, range: 10, cost: 0, duration: .25 }, { icon: "assets/ui/icons/spells/healing-cross.png", description: "Restore health and absorb damage.", block: 16, heal: 6 }), archetype: "alchemist" },
  artificer: { ...kit(2, 5.2, { icon: "assets/ui/icons/spells/lightning-bolt.png", description: "Fire a clockwork rivet.", damage: 10, range: 10, cost: 0, duration: .25 }, { icon: "assets/ui/icons/spells/protective-ward.png", description: "Deploy a barrier plate.", block: 28, cost: 3 }), archetype: "artificer" },
};
export function classKit(archetype: CharacterArchetype): ClassKit { return kits[archetype]; }
export function classAction(archetype: CharacterArchetype, action: CombatAction): ClassActionSpec { return kits[archetype].abilities[action]; }
