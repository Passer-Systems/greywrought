import type { AdventureAction, AdventureSnapshot } from "../game/adventure-types.js";
import { YARD } from "../game/yard-content.js";

export const usableItemDragType = "application/x-greywrought-usable-item";
interface UsableItem {
  readonly id: string;
  readonly action: AdventureAction;
  readonly name: string;
  readonly icon: string;
  readonly stackable: boolean;
  quantity(snapshot: AdventureSnapshot): number;
  available(snapshot: AdventureSnapshot): boolean;
  label(snapshot: AdventureSnapshot): string;
  description(snapshot: AdventureSnapshot): string;
}
export const usableItems = [
  {
    id: "hearthstone", action: "hearthstone", name: "Hearthstone", icon: "spells/earth-stone.png", stackable: false,
    quantity: () => 1,
    available: (s: AdventureSnapshot) => s.phase !== "lost" && !s.player.inCombat && s.player.currentAction !== "hearthstone",
    label: (s: AdventureSnapshot) => s.player.inCombat ? "Unavailable in combat" : s.player.currentAction === "hearthstone" ? "Returning…" : "Return to town",
    description: () => `Returns you to ${YARD.settlement} after 5 seconds. Moving or entering combat interrupts the cast. Reusable outside combat.`,
  },
  {
    id: "potions", action: "drinkPotion", name: "Health potion", icon: "items/health-potion-red.png", stackable: true,
    quantity: (s: AdventureSnapshot) => s.potions,
    available: (s: AdventureSnapshot) => s.phase !== "lost" && !(s.player.inCombat && s.combat.phase === "active") && s.potions > 0 && s.player.health < s.player.maximumHealth,
    label: (s: AdventureSnapshot) => s.potions < 1 ? "No potions" : s.player.inCombat && s.combat.phase === "active" ? "Wait for your next turn" : s.player.health >= s.player.maximumHealth ? "Health full" : "Drink potion",
    description: (s: AdventureSnapshot) => `Restores ${s.potionHealing} health. Can be used while planning a turn.`,
  },
] as const satisfies readonly UsableItem[];
export function usableItem(id: string | undefined): UsableItem | undefined {
  return usableItems.find(item => item.id === id);
}
