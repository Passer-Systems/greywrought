import { expect, test } from "bun:test";
import { createSharedAdventure } from "./adventure.js";
import { tap } from "./yard-test-fixtures.js";

function rangedBee() {
  const seed = createSharedAdventure(); seed.join("mage", "Mage", "mage");
  const save = JSON.parse(seed.save());
  Object.assign(save.characters[0].state, { phase: "expedition", position: { x: 7.5, y: 0, z: 25 } });
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
    tap(mage, "strike");
    mage.readyCombat(); world.advance(.01);
    expect(bee().health).toBe(54); expect(bee().aggro).toBe(true);
    expect(bee().targetPlayerId).toBe("mage");
    expect(mage.snapshot.log.some(entry => entry.text.includes("enrages the Hearth Keeper"))).toBe(true);
    const cast = bee().cast!;
    expect(cast.duration).toBeGreaterThanOrEqual(0); expect(cast.duration).toBeLessThanOrEqual(2);
    expect(cast.ability.name).toBe("Furnace Burst");
    expect(cast.ability.damage).toBeGreaterThanOrEqual(16);
    world.advance(Math.max(0, cast.remainingSeconds - .1));
    expect(mage.snapshot.player.health).toBe(100); expect(bee().actionSequence).toBe(0);
    for (let elapsed = 0; elapsed < 10 && bee().actionSequence === 0; elapsed += .05) world.advance(.05);
    expect(bee().actionSequence).toBe(1);
    expect(bee().lastActionHit).toBe(true);
    expect(mage.snapshot.player.health).toBe(100 - bee().currentAbility.damage);
    if (block) {
      while (mage.snapshot.combat.phase === "active") world.advance(.05);
      const health = mage.snapshot.player.health;
      tap(mage, "brace"); mage.readyCombat(); world.advance(2.5);
      expect(bee().actionSequence).toBe(2);
      expect(mage.snapshot.player.health).toBe(health);
    }
  }
});
