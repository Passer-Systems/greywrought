import { terrainHeight } from "./cave-layout.js";
import { expect, test } from "bun:test";
import { createAdventure, createSharedAdventure } from "./adventure.js";
import { finishGathering, tap, retreatUntilReleased, finishCycle } from "./yard-test-fixtures.js";

function seed(id: "nest" | "patrol") {
  const saved = JSON.parse(createAdventure({ archetype: "mage" }).save());
  Object.assign(saved.state, { phase: "expedition", position: id === "nest" ? { x: 7.5, y: 0, z: 22.5 } : { x: -17.5, y: terrainHeight(-17.5, 40), z: 40 } });
  for (const t of saved.state.threats) if (t.active && t.id !== id) Object.assign(t, { health: 0, phase: "cleared", lootClaimed: true });
  return saved;
}

for (const id of ["nest", "patrol"] as const) {
  test(`${id} freezes player and enemy positions during planning, then executes the committed attack`, () => {
    const game = createAdventure({ save: JSON.stringify(seed(id)) });
    game.selectTarget(id); tap(game, "strike"); game.advance(.01);
    const enemy = () => game.snapshot.threats.find(t => t.id === id)!;
    const before = enemy(), health = game.snapshot.player.health, position = game.snapshot.player.position;
    game.setCameraForward(0, -1); game.setAction("forward", true); game.advance(1); game.setAction("forward", false);
    expect(enemy().position).toEqual(before.position);
    expect(enemy().moving).toBe(false);
    expect(enemy().targetPosition).toEqual(before.targetPosition);
    expect(game.snapshot.player.position).toEqual(position);
    expect(enemy().windowAction).toEqual(before.windowAction);
    expect(enemy().remainingSeconds).toBe(before.remainingSeconds);
    expect(enemy().actionSequence).toBe(before.actionSequence);
    expect(enemy().health).toBe(before.health);
    expect(game.snapshot.player.health).toBe(health);
    expect(game.snapshot.combat.phase).toBe("preparation");
    expect(game.snapshot.combat.remainingSeconds).toBeCloseTo(29, 1);
    const forecast=game.snapshot.combat.forecast!.outcomes.find(p=>p.id==="solo")!;
    game.readyCombat(); finishCycle(game);
    expect(game.snapshot.player.health).toBe(forecast.health);
    expect(enemy().actionSequence).toBeGreaterThan(before.actionSequence);
  });

  test(`${id} breaks contact, heals, and returns home after an executed planned retreat`, () => {
    const saved = seed(id);
    saved.state.threats.find((t: { id: string }) => t.id === id).health = 30;
    const game = createAdventure({ save: JSON.stringify(saved) });
    game.selectTarget(id); tap(game, "strike"); game.advance(.01);
    const enemy = () => game.snapshot.threats.find(t => t.id === id)!;
    const home = enemy().homePosition;
    const start=game.snapshot.player.position;
    retreatUntilReleased(game,id);
    expect(enemy().aggro).toBe(false);
    expect(enemy().health).toBe(72);
    expect(enemy().phase).toBe("returning");
    expect(enemy().windowAction).toBeNull();
    expect(game.snapshot.player.position.z).toBeLessThan(start.z-5);
    const gap = () => Math.hypot(enemy().position.x - home.x, enemy().position.z - home.z);
    const releasedHealth = game.snapshot.player.health;
    expect(releasedHealth).toBeGreaterThan(0);
    const before = gap(); game.advance(.5); expect(gap()).toBeLessThan(before);
    for (let i = 0; i < 1200 && enemy().phase === "returning"; i++) game.advance(1 / 60);
    expect(enemy().phase).toBe("patrol");
    expect(gap()).toBeLessThan(.1);
    expect(game.snapshot.player.health).toBe(releasedHealth);
  });

  test(`${id} keeps its shared target frozen through planning and private pause, then executes after Ready`, () => {
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
    expect(enemy().position).toEqual(before.position);
    expect(enemy().windowAction).toEqual(before.windowAction);
    expect(world.pause("target")).toBe(true);
    const paused = game.snapshot; world.advance(2);
    expect(enemy().position).toEqual(paused.threats.find(t => t.id === id)!.position);
    expect(game.snapshot.combat).toEqual(paused.combat);
    expect(world.resume("target")).toBe(true);
    game.setAction("forward", true); world.advance(1);
    expect(enemy().position).toEqual(paused.threats.find(t => t.id === id)!.position);
    expect(enemy().windowAction).toEqual(before.windowAction);
    expect(game.snapshot.player.health).toBe(100);
    game.setAction("forward",false);
    const origin=game.snapshot.player.position;
    expect(game.queueBait({x:origin.x,y:0,z:origin.z-5})).toBe(true);game.readyCombat();finishCycle(game,world);
    expect(game.snapshot.player.position.z).toBeLessThan(origin.z);
    expect(enemy().actionSequence).toBeGreaterThan(before.actionSequence);
  });
}

test("late arrivals remain frozen during planning and cannot attack until the next cycle", () => {
  const saved = seed("patrol");
  saved.state.position = { x: 0, y: 0, z: 30 };
  Object.assign(saved.state.threats.find((t: { id: string }) => t.id === "patrol"), { position: { x: -5, y: 0, z: 30 }, targetPosition: { x: -5, y: 0, z: 30 } });
  const bee = saved.state.threats.find((t: { id: string }) => t.id === "nest");
  Object.assign(bee, { remainingSeconds: 60, health: 72, phase: "patrol", lootClaimed: false, position: { x: 5, y: 0, z: 30 }, targetPosition: { x: 5, y: 0, z: 30 } });
  const game = createAdventure({ save: JSON.stringify(saved) });
  game.selectTarget("patrol"); tap(game, "strike"); game.advance(.01);
  finishGathering(game); game.selectTarget("nest"); tap(game, "strike");
  const enemy = () => game.snapshot.threats.find(t => t.id === "nest")!;
  const before = enemy().position; game.advance(1);
  expect(enemy().position).toEqual(before);
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
