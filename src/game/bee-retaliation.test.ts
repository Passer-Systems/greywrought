import { expect, test } from "bun:test";
import { createSharedAdventure, getMonsterLore } from "./adventure.js";
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

test("a bee enrages under a 9-metre wand attack, closes, and retaliates on its announced turn", () => {
  for (const block of [false, true]) {
    const { world, mage, bee } = rangedBee();
    expect(bee().aggro).toBe(false); expect(bee().canStrike).toBe(true);
    tap(mage, "strike"); world.advance(.01);
    expect(bee().health).toBe(63); expect(bee().aggro).toBe(true);
    expect(bee().targetPlayerId).toBe("mage"); expect(bee().joinsNextWindow).toBe(true);
    expect(mage.snapshot.log.some(entry => entry.text.includes("enrages the Briar bee"))).toBe(true);
    tap(mage, "strike"); tap(mage, "strike");
    world.advance(mage.snapshot.combat.remainingSeconds); world.advance(1);
    expect(mage.snapshot.combat.phase).toBe("preparation"); expect(mage.snapshot.combat.remainingSeconds).toBe(5);
    expect(bee().health).toBe(45); expect(bee().aggro).toBe(true);
    const gap = Math.hypot(bee().position.x - mage.snapshot.player.position.x, bee().position.z - mage.snapshot.player.position.z);
    expect(gap).toBeLessThanOrEqual(3.01); expect(bee().actionSequence).toBe(0);
    const announced = bee().windowAction!;
    expect(announced.ability.name).toBe("Enraged Swarm"); expect([.35, 1.35, 2.35]).toContain(announced.offsetSeconds);
    expect(announced.ability.damage).toBeGreaterThanOrEqual(16);
    for (let slot = 0; slot < 3; slot++) tap(mage, block && slot === Math.floor(announced.offsetSeconds) ? "brace" : "strike");
    world.advance(5 + announced.offsetSeconds - .001);
    expect(mage.snapshot.player.health).toBe(100); expect(bee().actionSequence).toBe(0);
    world.advance(.002);
    expect(bee().actionSequence).toBe(1); expect(bee().lastActionHit).toBe(true);
    expect(mage.snapshot.player.health).toBe(block ? 100 : 100 - announced.ability.damage);
    expect(bee().health).toBeGreaterThan(0);
  }
  expect(getMonsterLore().find(t => t.id === "nest")!.opener).toContain("five-second preparation");
});
