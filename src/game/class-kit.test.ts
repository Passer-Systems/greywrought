import { describe, expect, test } from "bun:test";
import { createAdventure } from "./adventure.js";
import { classKit } from "./class-kit.js";
import type { AdventureGame } from "./adventure-types.js";
import type { CharacterArchetype } from "../host/character-profile.js";

function expedition(archetype: CharacterArchetype): AdventureGame {
  const saved = JSON.parse(createAdventure({ archetype }).save()) as { state: Record<string, unknown> };
  saved.state.phase = "expedition";
  saved.state.position = { x: -3, y: 0, z: 8 };
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
    }
  });

  test("class powers preserve spent stamina through a save", () => {
    for (const archetype of ["warrior", "mage", "hunter", "alchemist", "artificer"] as const) {
      const game = expedition(archetype); game.selectTarget("scout"); game.advance(.01);
      game.setAction("bloodRage", true); game.setAction("bloodRage", false);
      expect(game.snapshot.player.stamina).toBe(4);
      expect(game.snapshot.player.bloodRage).toBe(1);
      const restored = createAdventure({ archetype, save: game.save() });
      expect(restored.snapshot.player.stamina).toBe(4);
      expect(restored.snapshot.player.bloodRage).toBe(1);
    }
  });
});

test("class powers preserve their distinct health costs through Block and can end a journey", () => {
  for (const archetype of ["warrior", "mage", "hunter", "alchemist", "artificer"] as const) {
    const game = expedition(archetype); game.advance(.01);
    const saved = JSON.parse(game.save());
    Object.assign(saved.state, { health: 50, bloodRage: 3, rageDrainSeconds: .1, block: 24, guardSeconds: 2 });
    const charged = createAdventure({ save: JSON.stringify(saved) }); charged.advance(.1);
    expect(charged.snapshot.player.health).toBe(archetype === "hunter" ? 50 : 47);
    expect(charged.snapshot.player.block).toBe(24);
    if (archetype !== "hunter") {
      saved.state.health = 1;
      const dying = createAdventure({ save: JSON.stringify(saved) }); dying.advance(.1);
      expect(dying.snapshot.phase).toBe("lost"); expect(dying.snapshot.player.health).toBe(0);
    }
  }
});

test("power stacks decay after leaving combat while their remaining health cost applies", () => {
  const saved = JSON.parse(createAdventure().save());
  Object.assign(saved.state, { bloodRage: 3, rageDrainSeconds: 5 });
  const safe = createAdventure({ save: JSON.stringify(saved) });
  safe.advance(1.999); expect(safe.snapshot.player.bloodRage).toBe(3);
  safe.advance(.001); expect(safe.snapshot.player.bloodRage).toBe(2);
  safe.advance(4); expect(safe.snapshot.player.bloodRage).toBe(0);
  expect(safe.snapshot.player.health).toBe(99);
});
