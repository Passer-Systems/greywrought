import { expect, test } from "bun:test";
import { createAdventure, createSharedAdventure } from "./adventure.js";
import type { AdventureGame } from "./adventure-types.js";
import { tap } from "./yard-test-fixtures.js";

/** Reachable first-clearing positions, with the trio's announced opening beats. */
function fixture() {
  const data = JSON.parse(createAdventure().save());
  Object.assign(data.state, { phase: "expedition", position: { x: -2.5, y: 0, z: 35 } });
  data.state.combat = { phase: "preparation", cycle: 1, elapsedSeconds: 0, queued: [], nextId: 1, ready: false };
  for (const t of data.state.threats) {
    if (t.id === "warder") { Object.assign(t, { health: 0, phase: "cleared", lootClaimed: true }); continue; }
    if (!t.active) continue;
    const offset = t.id === "patrol" ? 1 : 2;
    Object.assign(t, { aggro: true, phase: "preparation", joinCycle: 1, windowCycle: 1, specialOffset: offset, remainingSeconds: offset, castDuration: offset, comboOpened: true });
    if (t.id === "nest") t.position = { x: 0, y: 0, z: 35 };
    if (t.id === "patrol") t.position = { x: -7.5, y: 0, z: 35 };
    if (t.id === "scout") { t.position = { x: -4, y: 0, z: 32 }; t.head.ability = "fireball"; t.head.opened = true; }
  }
  const patrol = data.state.threats.find((t: { id: string }) => t.id === "patrol");
  if (patrol) patrol.health = 54;
  return data;
}
function combo(game: AdventureGame) {
  expect(game.queueBait({ x: 2.5, y: 0, z: 35 })).toBe(true);
  game.selectTarget("patrol"); tap(game, "strike");
  expect(game.snapshot.combat.queued).toHaveLength(2);
  game.moveQueuedAction(game.snapshot.combat.queued[1]!.id, 2);
}

test("Move and Attack plans preserve a forecast and resolve damage", () => {
  const game = createAdventure({ save: JSON.stringify(fixture()) }); combo(game);
  const before = game.save(), forecast = game.snapshot.combat.forecast!;
  expect(game.save()).toBe(before);
  expect(forecast.paths.some(path => path.actorId === "solo" && path.kind === "move")).toBe(true);
  expect(forecast.events.some(e => e.kind === "collision" && e.sourceId === "patrol" && e.targetId === "nest")).toBe(true);
  expect(forecast.events.some(e => e.kind === "interruption" && e.targetId === "nest")).toBe(true);
  expect(forecast.events.some(e => e.kind === "ignition")).toBe(true);
  expect(forecast.events.some(e => e.kind === "hit" && e.targetId === "patrol")).toBe(true);
  expect(forecast.events.some(e => e.kind === "hit" && e.sourceId === "nest" && e.targetId === "solo")).toBe(false);
  game.readyCombat();
  for (let i = 0; i < 240 && game.snapshot.combat.phase === "active"; i++) game.advance(1 / 60);
  for (const outcome of forecast.outcomes) expect(outcome.health).toBe(outcome.id === "solo" ? game.snapshot.player.health : game.snapshot.threats.find(t => t.id === outcome.id)!.health);
  expect(game.snapshot.threats.find(t => t.id === "patrol")!.health).toBe(0);
  expect(game.snapshot.combat.effects.some(e => e.kind === "ignition")).toBe(true);
  expect(game.snapshot.loot.some(l => l.sourceId === "patrol" && l.available)).toBe(true);
});

test("an already-fired projectile survives a save and restore", () => {
  const data = fixture(); data.state.position = { x: -4, y: 0, z: 35 };
  for (const t of data.state.threats) if (t.active && t.id !== "scout") Object.assign(t, { health: 0, phase: "cleared", aggro: false, lootClaimed: true });
  const scout = data.state.threats[0];
  Object.assign(scout, { staggered: true, phase: "recovery", remainingSeconds: 0 });
  Object.assign(scout.head, { volley: 3, castVolley: 3, pendingFireballs: 0, fireballs: [{ id: 1, origin: { x: -4, y: 0, z: 32 }, position: { x: -4, y: 0, z: 33 }, remainingSeconds: .6, duration: .9, damage: 18 }] });
  data.state.combat.phase = "active";
  const game = createAdventure({ save: JSON.stringify(data) }); game.advance(.7);
  expect(game.snapshot.player.health).toBe(82);
  expect(game.snapshot.threats[0]!.fireballs).toHaveLength(0);
  const live = fixture(); live.state.position = { x: -4, y: 0, z: 35 };
  for (const t of live.state.threats) if (t.active && t.id !== "scout") Object.assign(t, { health: 0, phase: "cleared", aggro: false, lootClaimed: true });
  Object.assign(live.state.threats[0], { phase: "action", specialOffset: 0, remainingSeconds: 1.3 });
  Object.assign(live.state.threats[0].head, { volley: 3, castVolley: 3, pendingFireballs: 2, nextFireballSeconds: .2, fireballs: scout.head.fireballs });
  live.state.combat.queued = [{ id: 1, action: "strike", targetId: "scout", destination: null, offsetSeconds: 0, cost: 0, status: "pending", reason: null }];
  live.state.combat.nextId = 2; live.state.combat.phase = "active";
  for (const health of [96, 6]) {
    live.state.threats[0].health = health;
    live.state.threats[0].head.pendingFireballs = 2;
    const interrupted = createAdventure({ save: JSON.stringify(live) }); interrupted.advance(.01);
    const saved = JSON.parse(interrupted.save());
    expect(saved.state.threats[0].head.pendingFireballs).toBe(health === 6 ? 0 : 2);
    expect(saved.state.threats[0].head.fireballs).toHaveLength(1);
    expect(interrupted.snapshot.threats[0]!.health === 0).toBe(health === 6);
    expect(interrupted.snapshot.threats[0]!.windowAction?.status === "cancelled").toBe(health === 6);
    const restored = createAdventure({ save: interrupted.save() });
    expect(restored.snapshot.threats[0]!.windowAction).toEqual(interrupted.snapshot.threats[0]!.windowAction);
    restored.advance(.7);
    expect(restored.snapshot.player.health).toBe(82);
    expect(restored.snapshot.threats[0]!.fireballs).toHaveLength(health === 6 ? 0 : 2);
  }
});

test("enemy-caused Watchman kills grant quest credit and normal loot to engaged players", () => {
  const data = fixture(); data.state.chapter.accepted = ["cold-hands", "roll-call"];
  data.state.position = { x: -2.5, y: 0, z: 35 };
  const scout = data.state.threats[0]; scout.health = 10; scout.position = { x: -1, y: 0, z: 35 };
  data.state.threats[1].position = { x: 1, y: 0, z: 37 };
  const game = createAdventure({ save: JSON.stringify(data) });
  expect(game.queueBait({ x: 2.5, y: 0, z: 35 })).toBe(true);
  const forecast = game.snapshot.combat.forecast!;
  expect(forecast.events.some(e => e.kind === "defeat" && e.sourceId === "patrol" && e.targetId === "scout")).toBe(true);
  game.readyCombat(); game.advance(3);
  expect(JSON.parse(game.save()).state.chapter.scoutDefeated).toBe(true);
  expect(game.snapshot.loot.some(l => l.sourceId === "scout" && l.available)).toBe(true);
});

test("Bait plan and interrupted swarm survive pause/save; shared forecast changes no real player", () => {
  const base = createSharedAdventure(); base.join("a", "Ada", "warrior"); base.join("b", "Bob", "mage");
  const data = JSON.parse(base.save()), solo = fixture().state;
  data.world.threats = solo.threats; data.clock = { phase: "preparation", cycle: 1, elapsedSeconds: 0 };
  Object.assign(data.characters[0].state, { phase: solo.phase, position: solo.position });
  for (const t of data.world.threats) if (t.aggro) { t.targetPlayerId = "a"; t.combatants = ["a"]; }
  const world = createSharedAdventure({ save: JSON.stringify(data) });
  const player = world.join("a", "Ada", "warrior"), town = world.join("b", "Bob", "mage");
  combo(player);
  const before = world.save(), forecast = player.snapshot.combat.forecast!;
  expect(forecast.playerId).toBe("a"); expect(world.save()).toBe(before); expect(town.snapshot.player.health).toBe(100);
  world.pause("a");
  const reopened = createSharedAdventure({ save: world.save() }); const restored = reopened.join("a", "Ada", "warrior");
  expect(restored.snapshot.combat.queued[0]!.destination).toEqual({ x: 2.5, y: 0, z: 35 });
  expect(reopened.resume("a")).toBe(true); restored.readyCombat(); reopened.advance(1.8);
  expect(restored.snapshot.threats.find(t => t.id === "nest")!.staggered).toBe(true);
  expect(restored.snapshot.combat.hazards).toHaveLength(1);
  reopened.pause("a"); const paused = restored.save(); reopened.advance(8); expect(restored.save()).toBe(paused);
  const again = createSharedAdventure({ save: reopened.save() }); const resumed = again.join("a", "Ada", "warrior");
  expect(resumed.snapshot.combat.hazards).toHaveLength(1); again.resume("a"); again.advance(1.2);
  expect(resumed.snapshot.threats.find(t => t.id === "patrol")!.health).toBe(0);
  expect(resumed.snapshot.combat.effects.some(e => e.kind === "ignition")).toBe(true);
});

test("the roadside trio announces a predictable opener, while a struck late arrival waits for the next cycle", () => {
  const data = fixture(); data.state.combat.phase = "idle"; data.state.combat.cycle = 0;
  for (const t of data.state.threats) if (t.aggro) Object.assign(t, { phase: "approach", windowCycle: 0, comboOpened: false });
  const game = createAdventure({ save: JSON.stringify(data) }); game.advance(.01);
  expect(game.snapshot.threats.find(t => t.id === "patrol")!.windowAction!.offsetSeconds).toBe(1);
  for (const id of ["nest", "scout"]) expect(game.snapshot.threats.find(t => t.id === id)!.windowAction!.offsetSeconds).toBe(2);
  expect(game.snapshot.threats[0]!.currentAbility.id).toBe("fireball");
  const late = fixture(); late.state.position = { x: -2, y: 0, z: 35 };
  late.state.threats[1].position = { x: -1, y: 0, z: 35 };
  const hound = late.state.threats.find((t: { id: string }) => t.id === "patrol");
  Object.assign(hound, { position: { x: 1, y: 0, z: 35 }, aggro: false, phase: "patrol", windowCycle: 0, joinCycle: 0 });
  late.state.combat.phase = "active";
  late.state.combat.queued = [{id:1,action:"strike",targetId:"patrol",destination:null,offsetSeconds:0,cost:0,status:"pending",reason:null}];
  late.state.combat.nextId = 2;
  const arrival = createAdventure({ save: JSON.stringify(late) }); arrival.advance(.1);
  const hit = arrival.snapshot.threats.find(t => t.id === "patrol")!;
  expect(hit.health).toBe(hound.health-9); expect(hit.joinsNextWindow).toBe(true); expect(hit.windowAction).toBeNull();
  arrival.advance(2.9);
  const next = arrival.snapshot.threats.find(t => t.id === "patrol")!;
  expect(next.actionSequence).toBe(0); expect(next.staggered).toBe(false); expect(next.windowAction).not.toBeNull();
});

test("irregular server frames execute all three beats and match the forecast through a saved partial frame", () => {
  const seed = createSharedAdventure(); seed.join("a", "Ada", "warrior");
  const data = JSON.parse(seed.save()), solo = fixture().state;
  data.world.threats = solo.threats; data.clock = { phase: "preparation", cycle: 1, elapsedSeconds: 0 };
  Object.assign(data.characters[0].state, { phase: solo.phase, position: solo.position });
  for (const t of data.world.threats) if (t.aggro) { t.targetPlayerId = "a"; t.combatants = ["a"]; }
  let world = createSharedAdventure({ save: JSON.stringify(data) }), game = world.join("a", "Ada", "warrior");
  combo(game); tap(game, "brace");
  const forecast = game.snapshot.combat.forecast!;
  const expected = forecast.outcomes.find(o => o.id === "a")!.health;
  expect(expected).toBeGreaterThanOrEqual(70);
  game.readyCombat();
  const frames = [.013, .0503, .0491, .0517, .008, .0432];
  for (let i = 0; i < 200 && game.snapshot.combat.phase === "active"; i++) {
    world.advance(frames[i % frames.length]!);
    if (i === 8) {
      world.pause("a"); world = createSharedAdventure({ save: world.save() }); game = world.join("a", "Ada", "warrior"); world.resume("a");
    }
    expect(game.snapshot.combat.queued.every(e => e.status !== "failed")).toBe(true);
  }
  expect(game.snapshot.player.health).toBe(expected);
  for (const outcome of forecast.outcomes.filter(o => o.id !== "a")) expect(game.snapshot.threats.find(t => t.id === outcome.id)!.health).toBe(outcome.health);
});
