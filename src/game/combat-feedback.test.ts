import { describe, expect, test } from "bun:test";
import { createAdventure, createSharedAdventure } from "./adventure.js";
import type { CharacterArchetype } from "../host/character-profile.js";
import { finishGathering, earnedChapter, tap } from "./yard-test-fixtures.js";

function seed(archetype: CharacterArchetype = "mage") {
  const saved = JSON.parse(createAdventure({ archetype }).save());
  Object.assign(saved.state, { phase: "expedition", position: { x: -3, y: 0, z: 28.1 } });
  for (const enemy of saved.state.threats) {
    enemy.rng = 9844;
    if (enemy.active && enemy.id !== "scout") Object.assign(enemy, { health: 0, phase: "cleared", lootClaimed: true });
  }
  return saved;
}

describe("personal combat feedback", () => {
  test("reports absorbed block separately from damage after armor", () => {
    const opening = createAdventure({ save: JSON.stringify(seed()) }); opening.advance(.001); finishGathering(opening);
    const saved = JSON.parse(opening.save());
    saved.state.chapter = earnedChapter(1);
    saved.state.chapter.equipment.chest = "insulated-coat";
    saved.state.block = 2; saved.state.guardSeconds = 2;
    const game = createAdventure({ save: JSON.stringify(saved) });
    game.advance(.001); tap(game, "strike"); game.readyCombat(); game.advance(2.9);
    expect(game.snapshot.combatFeedback).toEqual([
      { id: 1, targetId: "scout", kind: "damage", amount: 20 },
      { id: 2, targetId: null, kind: "block", amount: 2 },
      { id: 3, targetId: null, kind: "damage", amount: 4 },
    ]);
    expect(game.snapshot.player.health).toBe(96);
  });

  test("full block emits absorption only, never shield activation", () => {
    const game = createAdventure({ save: JSON.stringify(seed()) });
    game.advance(.001); finishGathering(game);
    tap(game, "brace");
    expect(game.snapshot.combatFeedback).toEqual([]);
    game.readyCombat(); game.advance(2.9);
    expect(game.snapshot.combatFeedback).toEqual([{ id: 1, targetId: null, kind: "block", amount: 8 }]);
    expect(game.snapshot.player.health).toBe(100);
  });

  test("enemy wards and overkill report actual enemy absorption and health loss", () => {
    const opening = createAdventure({ save: JSON.stringify(seed()) }); opening.advance(.001); finishGathering(opening);
    const saved = JSON.parse(opening.save());
    saved.state.threats[0].head.block = 6;
    saved.state.threats[0].head.blockSeconds = 2;
    saved.state.threats[0].health = 2;
    const game = createAdventure({ save: JSON.stringify(saved) });
    tap(game, "strike"); game.readyCombat(); game.advance(.001);
    expect(game.snapshot.combatFeedback).toEqual([
      { id: 1, targetId: "scout", kind: "block", amount: 6 },
      { id: 2, targetId: "scout", kind: "damage", amount: 2 },
    ]);
  });

  test("potions, Protective Tonic, and inn healing report capped recovery", () => {
    const potionSave = seed(); potionSave.state.health = 95; potionSave.state.potions = 1;
    potionSave.state.phase = "town";
    const potion = createAdventure({ save: JSON.stringify(potionSave) }); potion.setAction("drinkPotion", true); potion.setAction("drinkPotion", false);
    expect(potion.snapshot.combatFeedback).toEqual([{ id: 1, targetId: null, kind: "heal", amount: 5 }]);
    const tonicSave = seed("alchemist"); tonicSave.state.health = 98;
    const tonic = createAdventure({ save: JSON.stringify(tonicSave) }); tonic.advance(.001); finishGathering(tonic); tap(tonic, "brace"); tonic.readyCombat(); tonic.advance(1.2);
    expect(tonic.snapshot.combatFeedback).toEqual([{ id: 1, targetId: null, kind: "heal", amount: 2 }, { id: 2, targetId: null, kind: "block", amount: 8 }]);
    const innSave = seed(); Object.assign(innSave.state, { phase: "town", health: 97, position: { x: 5, y: 0, z: -11 } });
    const inn = createAdventure({ save: JSON.stringify(innSave) }); tap(inn, "rest"); tap(inn, "rest");
    expect(inn.snapshot.combatFeedback).toEqual([{ id: 1, targetId: null, kind: "heal", amount: 3 }]);
  });

  test("keeps distinct events between snapshots, copies entries, and clears on restore", () => {
    const game = createAdventure({ save: JSON.stringify(seed()) });
    tap(game, "strike"); finishGathering(game); game.readyCombat(); game.advance(2.5);
    tap(game, "strike"); game.readyCombat(); game.advance(.01);
    const feedback = game.snapshot.combatFeedback;
    expect(feedback).toEqual([
      { id: 1, targetId: "scout", kind: "damage", amount: 18 },
      { id: 2, targetId: null, kind: "damage", amount: 8 },
      { id: 3, targetId: "scout", kind: "damage", amount: 18 },
    ]);
    expect(game.snapshot.combatFeedback).toEqual(feedback);
    expect(game.snapshot.combatFeedback[0]).not.toBe(feedback[0]);
    expect(createAdventure({ save: game.save() }).snapshot.combatFeedback).toEqual([]);
  });

  test("misses describe resolved attacks and unreachable strikes emit nothing", () => {
    const waitingSave = seed("warrior"); waitingSave.state.position.z = 24.9;
    const waiting = createAdventure({ save: JSON.stringify(waitingSave) }); tap(waiting, "strike"); waiting.readyCombat(); waiting.advance(.1);
    expect(waiting.snapshot.combatFeedback).toEqual([]);
    const saved = seed();
    Object.assign(saved.state.threats[0], { aggro: true, phase: "preparation", remainingSeconds: .1, castDuration: 3 });
    saved.state.position = { x: -3, y: 0, z: 41 };
    saved.state.combat.clock = { phase: "active", cycle: 1, elapsedSeconds: 2.9 };
    Object.assign(saved.state.threats[0], { windowCycle: 1, joinCycle: 1 });
    const missed = createAdventure({ save: JSON.stringify(saved) }); missed.advance(.2);
    expect(missed.snapshot.combatFeedback).toEqual([{ id: 1, targetId: null, kind: "miss", amount: 0 }]);
  });

  test("shared characters see only their own hits and received outcomes", () => {
    const initial = createSharedAdventure(); initial.join("a", "Ada", "mage"); initial.join("b", "Bram", "hunter");
    const saved = JSON.parse(initial.save()), solo = seed().state;
    for (const entry of saved.characters) Object.assign(entry.state, { phase: "expedition", position: { x: -3, y: 0, z: entry.id === "a" ? 28.1 : 27 } });
    saved.world.threats = solo.threats;
    const world = createSharedAdventure({ save: JSON.stringify(saved) });
    const a = world.join("a", "Ada", "mage"), b = world.join("b", "Bram", "hunter");
    world.advance(.01); finishGathering(a, world); tap(a, "brace"); tap(b, "strike");
    a.readyCombat(); b.readyCombat(); world.advance(2.9);
    expect(a.snapshot.combatFeedback).toEqual([
      { id: 1, targetId: null, kind: "block", amount: 8 },
    ]);
    expect(b.snapshot.combatFeedback).toEqual([{ id: 1, targetId: "scout", kind: "damage", amount: 18 }]);
    tap(a, "strike"); tap(b, "brace"); a.readyCombat(); b.readyCombat(); world.advance(.01);
    expect(a.snapshot.combatFeedback).toEqual([
      { id: 1, targetId: null, kind: "block", amount: 8 },
      { id: 2, targetId: "scout", kind: "damage", amount: 18 },
    ]);
    expect(b.snapshot.combatFeedback).toEqual([{ id: 1, targetId: "scout", kind: "damage", amount: 18 }]);
    const restored = createSharedAdventure({ save: world.save() });
    expect(restored.join("a", "Ada", "mage").snapshot.combatFeedback).toEqual([]);
    expect(restored.join("b", "Bram", "hunter").snapshot.combatFeedback).toEqual([]);
  });
});
