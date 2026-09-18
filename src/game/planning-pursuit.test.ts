import { expect, test } from "bun:test";
import { createAdventure, createSharedAdventure } from "./adventure.js";
import { tap } from "./yard-test-fixtures.js";

function seed(id: "nest" | "patrol") {
  const saved = JSON.parse(createAdventure({ archetype: "mage" }).save());
  Object.assign(saved.state, { phase: "expedition", position: id === "nest" ? { x: -8, y: 0, z: 15 } : { x: -6, y: 0, z: 10 } });
  for (const t of saved.state.threats) if (t.active && t.id !== id) Object.assign(t, { health: 0, phase: "cleared", lootClaimed: true });
  return saved;
}

for (const id of ["nest", "patrol"] as const) {
  test(`${id} follows a fleeing player during planning without advancing its committed attack`, () => {
    const game = createAdventure({ save: JSON.stringify(seed(id)) });
    game.selectTarget(id); tap(game, "strike"); game.advance(.01);
    const enemy = () => game.snapshot.threats.find(t => t.id === id)!;
    const before = enemy(), health = game.snapshot.player.health;
    game.setCameraForward(0, -1); game.setAction("forward", true); game.advance(1); game.setAction("forward", false);
    expect(enemy().position.z).toBeLessThan(before.position.z);
    expect(enemy().moving).toBe(true);
    expect(enemy().targetPosition).not.toEqual(before.targetPosition);
    expect(enemy().windowAction).toEqual(before.windowAction);
    expect(enemy().remainingSeconds).toBe(before.remainingSeconds);
    expect(enemy().actionSequence).toBe(before.actionSequence);
    expect(enemy().health).toBe(before.health);
    expect(game.snapshot.player.health).toBe(health);
    expect(game.snapshot.combat.phase).toBe("preparation");
    expect(game.snapshot.combat.remainingSeconds).toBeCloseTo(29, 1);
  });

  test(`${id} breaks contact, heals, and returns home after a planning retreat`, () => {
    const saved = seed(id);
    saved.state.threats.find((t: { id: string }) => t.id === id).health = 30;
    const game = createAdventure({ save: JSON.stringify(saved) });
    game.selectTarget(id); tap(game, "strike"); game.advance(.01);
    const enemy = () => game.snapshot.threats.find(t => t.id === id)!;
    const home = enemy().homePosition;
    game.setCameraForward(-game.snapshot.player.position.x, -game.snapshot.player.position.z); game.setAction("forward", true);
    for (let i = 0; i < 200 && enemy().aggro; i++) game.advance(.05);
    game.setAction("forward", false);
    expect(enemy().aggro).toBe(false);
    expect(enemy().health).toBe(72);
    expect(enemy().phase).toBe("returning");
    expect(enemy().windowAction).toBeNull();
    expect(enemy().actionSequence).toBe(0);
    const gap = () => Math.hypot(enemy().position.x - home.x, enemy().position.z - home.z);
    const before = gap(); game.advance(.5); expect(gap()).toBeLessThan(before);
    for (let i = 0; i < 1200 && enemy().phase === "returning"; i++) game.advance(1 / 60);
    expect(enemy().phase).toBe("patrol");
    expect(gap()).toBeLessThan(.1);
    expect(game.snapshot.player.health).toBe(100);
  });

  test(`${id} follows its shared target and resumes pursuit only after a private pause ends`, () => {
    const base = createSharedAdventure(); base.join("observer", "Observer", "mage"); base.join("target", "Target", "mage");
    const saved = JSON.parse(base.save()), solo = seed(id).state;
    saved.world.threats = solo.threats;
    Object.assign(saved.characters[1].state, { phase: solo.phase, position: solo.position });
    const world = createSharedAdventure({ save: JSON.stringify(saved) });
    world.join("observer", "Observer", "mage"); const game = world.join("target", "Target", "mage");
    game.selectTarget(id); tap(game, "strike"); world.advance(.01);
    const enemy = () => game.snapshot.threats.find(t => t.id === id)!;
    const before = enemy(); game.setCameraForward(0, -1); game.setAction("forward", true); world.advance(1);
    expect(enemy().targetPlayerId).toBe("target");
    expect(enemy().position.z).toBeLessThan(before.position.z);
    expect(enemy().windowAction).toEqual(before.windowAction);
    expect(world.pause("target")).toBe(true);
    const paused = game.snapshot; world.advance(2);
    expect(enemy().position).toEqual(paused.threats.find(t => t.id === id)!.position);
    expect(game.snapshot.combat).toEqual(paused.combat);
    expect(world.resume("target")).toBe(true);
    game.setAction("forward", true); world.advance(1);
    expect(enemy().position.z).toBeLessThan(paused.threats.find(t => t.id === id)!.position.z);
    expect(enemy().windowAction).toEqual(before.windowAction);
    expect(game.snapshot.player.health).toBe(100);
  });
}

test("late arrivals approach during planning but cannot attack until the next cycle", () => {
  const saved = seed("patrol"), bee = saved.state.threats.find((t: { id: string }) => t.id === "nest");
  Object.assign(bee, { health: 72, phase: "patrol", lootClaimed: false, position: { x: 0, y: 0, z: 17 }, targetPosition: { x: 0, y: 0, z: 17 } });
  const game = createAdventure({ save: JSON.stringify(saved) });
  game.selectTarget("patrol"); tap(game, "strike"); game.advance(.01);
  game.selectTarget("nest"); tap(game, "strike");
  const enemy = () => game.snapshot.threats.find(t => t.id === "nest")!;
  const before = enemy().position; game.advance(1);
  expect(enemy().position.x).toBeLessThan(before.x);
  expect(enemy().joinsNextWindow).toBe(true);
  expect(enemy().windowAction).toBeNull();
  expect(enemy().actionSequence).toBe(0);
  expect(game.snapshot.player.health).toBe(100);
  game.readyCombat(); game.advance(2.9);
  expect(enemy().actionSequence).toBe(0);
  game.advance(.2);
  expect(enemy().joinsNextWindow).toBe(false);
  expect(enemy().windowAction).not.toBeNull();
});
