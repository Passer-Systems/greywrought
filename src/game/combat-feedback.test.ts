import { describe, expect, test } from "bun:test";
import { createAdventure, createSharedAdventure } from "./adventure.js";
import type { AdventureGame } from "./adventure-types.js";
import type { CharacterArchetype } from "../host/character-profile.js";
import { earnedChapter, tap } from "./yard-test-fixtures.js";

function seed(archetype: CharacterArchetype = "mage") {
  const saved = JSON.parse(createAdventure({ archetype }).save());
  Object.assign(saved.state, { phase: "expedition", position: { x: -3, y: 0, z: 8.1 } });
  for (const enemy of saved.state.threats) {
    enemy.rng = 9844;
    if (enemy.active && enemy.id !== "scout") Object.assign(enemy, { health: 0, phase: "cleared", lootClaimed: true });
  }
  return saved;
}
function beam(game: AdventureGame, defense: "guard" | "brace") {
  game.advance(.001);
  const cast = game.snapshot.threats.find(t => t.id === "scout")!.cast!;
  game.advance(cast.remainingSeconds - .1);
  tap(game, defense);
  game.advance(.2);
}

describe("personal combat feedback", () => {
  test("reports absorbed block separately from damage after armor", () => {
    const saved = seed();
    saved.state.chapter = earnedChapter(1);
    saved.state.chapter.equipment.chest = "insulated-coat";
    const game = createAdventure({ save: JSON.stringify(saved) });
    beam(game, "guard");
    expect(game.snapshot.combatFeedback).toEqual([
      { id: 1, targetId: null, kind: "block", amount: 2 },
      { id: 2, targetId: null, kind: "damage", amount: 4 },
    ]);
    expect(game.snapshot.player.health).toBe(96);
  });

  test("full block emits absorption only, never shield activation", () => {
    const game = createAdventure({ save: JSON.stringify(seed()) });
    game.advance(.001);
    const remaining = game.snapshot.threats.find(t => t.id === "scout")!.cast!.remainingSeconds;
    game.advance(remaining - .1); tap(game, "brace");
    expect(game.snapshot.combatFeedback).toEqual([]);
    game.advance(.2);
    expect(game.snapshot.combatFeedback).toEqual([{ id: 1, targetId: null, kind: "block", amount: 8 }]);
    expect(game.snapshot.player.health).toBe(100);
  });

  test("enemy wards and overkill report actual enemy absorption and health loss", () => {
    const saved = seed();
    saved.state.threats[0].head.block = 6;
    saved.state.threats[0].head.blockSeconds = 2;
    saved.state.threats[0].health = 2;
    const game = createAdventure({ save: JSON.stringify(saved) });
    tap(game, "strike");
    expect(game.snapshot.combatFeedback).toEqual([
      { id: 1, targetId: "scout", kind: "block", amount: 6 },
      { id: 2, targetId: "scout", kind: "damage", amount: 2 },
    ]);
  });

  test("potions, Protective Tonic, and inn healing report capped recovery", () => {
    const potionSave = seed(); potionSave.state.health = 95; potionSave.state.potions = 1;
    const potion = createAdventure({ save: JSON.stringify(potionSave) }); tap(potion, "drinkPotion");
    expect(potion.snapshot.combatFeedback).toEqual([{ id: 1, targetId: null, kind: "heal", amount: 5 }]);
    const tonicSave = seed("alchemist"); tonicSave.state.health = 98;
    const tonic = createAdventure({ save: JSON.stringify(tonicSave) }); tonic.advance(.001); tap(tonic, "brace");
    expect(tonic.snapshot.combatFeedback).toEqual([{ id: 1, targetId: null, kind: "heal", amount: 2 }]);
    const innSave = seed(); Object.assign(innSave.state, { phase: "town", health: 97, position: { x: 5, y: 0, z: -11 } });
    const inn = createAdventure({ save: JSON.stringify(innSave) }); tap(inn, "rest"); tap(inn, "rest");
    expect(inn.snapshot.combatFeedback).toEqual([{ id: 1, targetId: null, kind: "heal", amount: 3 }]);
  });

  test("keeps distinct events between snapshots, copies entries, and clears on restore", () => {
    const game = createAdventure({ save: JSON.stringify(seed()) });
    tap(game, "strike"); game.advance(1.5);
    const feedback = game.snapshot.combatFeedback;
    expect(feedback).toEqual([
      { id: 1, targetId: "scout", kind: "damage", amount: 9 },
      { id: 2, targetId: "scout", kind: "damage", amount: 9 },
    ]);
    expect(game.snapshot.combatFeedback).toEqual(feedback);
    expect(game.snapshot.combatFeedback[0]).not.toBe(feedback[0]);
    expect(createAdventure({ save: game.save() }).snapshot.combatFeedback).toEqual([]);
  });

  test("misses describe resolved attacks and waiting autos emit nothing", () => {
    const waitingSave = seed("warrior"); waitingSave.state.position.z = 5;
    const waiting = createAdventure({ save: JSON.stringify(waitingSave) }); tap(waiting, "strike"); waiting.advance(.1);
    expect(waiting.snapshot.combatFeedback).toEqual([]);
    const saved = seed();
    Object.assign(saved.state.threats[0], { aggro: true, phase: "preparation", remainingSeconds: .1, castDuration: 3 });
    saved.state.position = { x: -3, y: 0, z: 21 };
    const missed = createAdventure({ save: JSON.stringify(saved) }); missed.advance(.2);
    expect(missed.snapshot.combatFeedback).toEqual([{ id: 1, targetId: null, kind: "miss", amount: 0 }]);
  });

  test("shared characters see only their own hits and received outcomes", () => {
    const initial = createSharedAdventure(); initial.join("a", "Ada", "mage"); initial.join("b", "Bram", "hunter");
    const saved = JSON.parse(initial.save()), solo = seed().state;
    for (const entry of saved.characters) Object.assign(entry.state, { phase: "expedition", position: { x: -3, y: 0, z: entry.id === "a" ? 8.1 : 7 } });
    saved.world.threats = solo.threats;
    const world = createSharedAdventure({ save: JSON.stringify(saved) });
    const a = world.join("a", "Ada", "mage"), b = world.join("b", "Bram", "hunter");
    tap(a, "strike"); tap(b, "strike"); tap(a, "strike"); tap(b, "strike");
    world.advance(.001);
    const remaining = a.snapshot.threats.find(t => t.id === "scout")!.cast!.remainingSeconds;
    world.advance(remaining - .1); tap(a, "guard"); world.advance(.2);
    expect(a.snapshot.combatFeedback).toEqual([
      { id: 1, targetId: "scout", kind: "damage", amount: 9 },
      { id: 2, targetId: null, kind: "block", amount: 2 },
      { id: 3, targetId: null, kind: "damage", amount: 6 },
    ]);
    expect(b.snapshot.combatFeedback).toEqual([{ id: 1, targetId: "scout", kind: "damage", amount: 9 }]);
    const restored = createSharedAdventure({ save: world.save() });
    expect(restored.join("a", "Ada", "mage").snapshot.combatFeedback).toEqual([]);
    expect(restored.join("b", "Bram", "hunter").snapshot.combatFeedback).toEqual([]);
  });
});
