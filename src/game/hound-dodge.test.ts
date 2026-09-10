import { test, expect } from "bun:test";
import { createAdventure } from "./adventure.js";
import { tap } from "./yard-test-fixtures.js";

test("Maul gives a three-second warning, then locks its landing long enough to dodge on foot", () => {
  const saved = JSON.parse(createAdventure({ archetype: "mage" }).save());
  Object.assign(saved.state, { phase: "expedition", position: { x: -6, y: 0, z: 17 } });
  for (const t of saved.state.threats) if (t.active && t.id !== "patrol") Object.assign(t, { health: 0, phase: "cleared", lootClaimed: true });
  const game = createAdventure({ save: JSON.stringify(saved) });
  game.selectTarget("patrol"); tap(game, "strike"); game.advance(.01); tap(game, "strike");
  const hound = () => game.snapshot.threats.find(t => t.id === "patrol")!;
  const cast = hound().cast!;
  expect(cast.ability.id).toBe("maul"); expect(cast.duration).toBeGreaterThanOrEqual(3);
  game.advance(cast.remainingSeconds + .001);
  expect(hound().movementMode).toBe("lunge"); expect(game.snapshot.player.health).toBe(100);
  const landing = hound().targetPosition;
  const standing = createAdventure({ save: game.save() }); standing.advance(.66);
  expect(standing.snapshot.player.health).toBeLessThan(100);
  game.advance(.15); game.setCameraForward(1, 0); game.setAction("forward", true); game.advance(.51); game.setAction("forward", false);
  expect(hound().targetPosition).toEqual(landing); expect(hound().lastActionHit).toBe(false);
  expect(game.snapshot.player.health).toBe(100); expect(hound().phase).toBe("recovery");
  const before = hound().health; tap(game, "strike"); game.advance(.01);
  expect(hound().health).toBeLessThan(before);
});
