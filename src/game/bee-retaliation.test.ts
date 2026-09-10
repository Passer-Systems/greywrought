import { expect, test } from "bun:test";
import { createSharedAdventure } from "./adventure.js";
import { tap } from "./yard-test-fixtures.js";

function rangedBee() {
  const seed = createSharedAdventure(); seed.join("mage", "Mage", "mage");
  const save = JSON.parse(seed.save());
  Object.assign(save.characters[0].state, { phase: "expedition", position: { x: -8, y: 0, z: 20 } });
  for (const threat of save.world.threats) {
    threat.rng = 9844;
    if (threat.id !== "nest" && threat.active) Object.assign(threat, { health: 0, phase: "cleared", lootClaimed: true });
  }
  const world = createSharedAdventure({ save: JSON.stringify(save) });
  const mage = world.join("mage", "Mage", "mage"); mage.selectTarget("nest");
  return { world, mage, bee: () => mage.snapshot.threats.find(t => t.id === "nest")! };
}

test("a ranged hit enrages the bee, which closes and retaliates only after its announced cast", () => {
  for (const block of [false, true]) {
    const { world, mage, bee } = rangedBee();
    expect(bee().aggro).toBe(false); expect(bee().canStrike).toBe(true);
    tap(mage, "strike"); world.advance(.01); tap(mage, "strike");
    expect(bee().health).toBe(63); expect(bee().aggro).toBe(true);
    expect(bee().targetPlayerId).toBe("mage");
    expect(mage.snapshot.log.some(entry => entry.text.includes("enrages the Briar bee"))).toBe(true);
    const cast = bee().cast!;
    expect(cast.duration).toBeGreaterThanOrEqual(3);
    expect(cast.ability.name).toBe("Enraged Swarm");
    expect(cast.ability.damage).toBeGreaterThanOrEqual(16);
    world.advance(cast.remainingSeconds - .1);
    expect(mage.snapshot.player.health).toBe(100); expect(bee().actionSequence).toBe(0);
    if (block) tap(mage, "brace");
    world.advance(.5);
    expect(bee().actionSequence).toBe(1); expect(bee().lastActionHit).toBe(true);
    expect(mage.snapshot.player.health).toBe(block ? 100 : 100 - cast.ability.damage);
  }
});
