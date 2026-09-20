import { describe, expect, test } from "bun:test";
import { createAdventure } from "./adventure.js";
import { classKit } from "./class-kit.js";
import type { AdventureGame } from "./adventure-types.js";
import type { CharacterArchetype } from "../host/character-profile.js";

function expedition(archetype: CharacterArchetype): AdventureGame {
  const saved = JSON.parse(createAdventure({ archetype }).save()) as { state: Record<string, unknown> };
  saved.state.phase = "expedition";
  saved.state.position = { x: -3, y: 0, z: 28 };
  saved.state.chapter = { accepted: ["roll-call", "last-shift"], completed: ["roll-call", "last-shift"], scoutDefeated: true, level: 3, ownedGear: [], equipment: { chest: null, mainhand: null } };
  return createAdventure({ archetype, save: JSON.stringify(saved) });
}

describe("new class kits", () => {
  test("every class has exactly Attack, Defend and Move", () => {
    expect(classKit("alchemist").abilities.strike.name).toBe("Attack");
    expect(classKit("artificer").abilities.strike.name).toBe("Attack");
    for (const kind of ["warrior","mage","hunter","alchemist","artificer"] as const) expect(Object.values(classKit(kind).abilities).map(a=>a.name).sort()).toEqual(["Attack","Defend","Move"]);
    expect(classKit("artificer").abilities.brace.block).toBeGreaterThan(24);
  });

  test("alchemist and artificer can persist, target, and resolve their ranged strike", () => {
    for (const archetype of ["alchemist", "artificer"] as const) {
      const game = expedition(archetype);
      game.selectTarget("scout");
      game.setAction("strike", true); game.setAction("strike", false);
      game.readyCombat(); game.advance(0.01); game.advance(1.01);
      expect(game.snapshot.threats.find(threat => threat.id === "scout")?.health).toBeLessThan(96);
      const restored = createAdventure({ archetype, save: game.save() });
      expect(restored.snapshot.player.archetype).toBe(archetype);
    }
  });
});
