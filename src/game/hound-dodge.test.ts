import { test, expect } from "bun:test";
import { createAdventure } from "./adventure.js";
import { earnedChapter, tap } from "./yard-test-fixtures.js";

test("Maul keeps its landing fixed while a committed retreat avoids it", () => {
  const saved = JSON.parse(createAdventure({ archetype: "mage" }).save());
  Object.assign(saved.state, { phase: "expedition", position: { x: -6, y: 0, z: 30 }, chapter: earnedChapter(2) });
  for (const t of saved.state.threats) if (t.active && t.id !== "patrol") Object.assign(t, { health: 0, phase: "cleared", lootClaimed: true });
  const game = createAdventure({ save: JSON.stringify(saved) });
  game.selectTarget("patrol"); tap(game, "strike"); game.advance(.01);
  const hound = () => game.snapshot.threats.find(t => t.id === "patrol")!;
  expect(hound().cast!.ability.id).toBe("maul");
  const standing = createAdventure({ save: game.save() }); standing.readyCombat(); standing.advance(4);
  expect(standing.snapshot.player.health).toBeLessThan(100);
  tap(game, "disengage"); game.moveQueuedAction(game.snapshot.combat.queued[1]!.id, hound().windowAction!.offsetSeconds);
  const slot = hound().windowAction!.offsetSeconds;
  game.readyCombat(); game.advance(slot + .01);
  const landing = hound().targetPosition;
  game.advance(.65);
  expect(hound().targetPosition).toEqual(landing);
  expect(game.snapshot.player.health).toBe(100);
  expect(hound().lastActionHit).toBe(false);
  expect(game.snapshot.player.position.z).toBeLessThan(30);
});
