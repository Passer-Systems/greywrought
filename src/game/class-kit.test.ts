import { describe, expect, test } from "bun:test";
import { createAdventure } from "./adventure.js";
import { classKit } from "./class-kit.js";
import type { AdventureGame } from "./adventure-types.js";
import type { CharacterArchetype } from "../host/character-profile.js";

function expedition(archetype: CharacterArchetype): AdventureGame {
  const saved = JSON.parse(createAdventure({ archetype }).save()) as { state: Record<string, unknown> };
  saved.state.phase = "expedition";
  saved.state.position = { x: 0, y: 0, z: 2.5 };
  saved.state.chapter = { accepted: ["roll-call", "last-shift"], completed: ["roll-call", "last-shift"], scoutDefeated: true, level: 3, ownedGear: [], equipment: { chest: null, mainhand: null } };
  return createAdventure({ archetype, save: JSON.stringify(saved) });
}

describe("new class kits", () => {
  test("kits expose distinct identity and ranged signature moves", () => {
    expect(classKit("alchemist").abilities.strike.name).toBe("Reagent Toss");
    expect(classKit("alchemist").abilities.disengage.name).toBe("Caustic Escape");
    expect(classKit("artificer").abilities.strike.name).toBe("Rivet Shot");
    expect(classKit("artificer").abilities.brace.block).toBeGreaterThan(24);
  });

  test("alchemist and artificer can persist, target, and resolve their ranged strike", () => {
    for (const archetype of ["alchemist", "artificer"] as const) {
      const game = expedition(archetype);
      game.selectTarget("scout");
      game.setAction("strike", true); game.setAction("strike", false);
      game.advance(0.01); game.advance(1.01);
      expect(game.snapshot.threats.find(threat => threat.id === "scout")?.health).toBeLessThan(96);
      const restored = createAdventure({ archetype, save: game.save() });
      expect(restored.snapshot.player.archetype).toBe(archetype);
      expect(restored.snapshot.combat.queued.length).toBe(game.snapshot.combat.queued.length);
    }
  });

  test("class powers preserve their costs through a pending save", () => {
    for (const archetype of ["warrior", "mage", "hunter", "alchemist", "artificer"] as const) {
      const game = expedition(archetype); game.selectTarget("scout");
      game.setAction("bloodRage", true); game.setAction("bloodRage", false);
      const restored = createAdventure({ archetype, save: game.save() });
      expect(restored.snapshot.combat.queued[0]?.cost).toBe(classKit(archetype).abilities.bloodRage.cost ?? 1);
    }
  });
});
