import { describe, expect, test } from "bun:test";
import { createSharedAdventure } from "./adventure.js";

const tap = (game: ReturnType<ReturnType<typeof createSharedAdventure>["join"]>, action: Parameters<typeof game.setAction>[0]) => {
  game.setAction(action, true); game.setAction(action, false);
};

describe("private paused encounters", () => {
  test('forks preserve corpses and distinguish character names from the shared instance', () => {
    const seed = createSharedAdventure(); seed.join('shared', 'Shared', 'mage');
    const saved = JSON.parse(seed.save());
    Object.assign(saved.characters[0].state, {phase:'expedition', position:{x:-3,y:0,z:8}});
    const corpse = saved.world.threats.find((t: {id:string}) => t.id === 'nest');
    Object.assign(corpse, {health:0, phase:'cleared', lootClaimed:true, respawnAt:Date.now()+1000});
    const world = createSharedAdventure({save:JSON.stringify(saved)}), game = world.join('shared','Shared','mage');
    world.advance(.01); world.pause('shared');
    expect(world.session('shared').id).not.toBe('shared');
    expect(game.snapshot.threats.find(t=>t.id==='nest')!.health).toBe(0);
    expect(world.players()).toHaveLength(0);
    const restored = createSharedAdventure({save:world.save(), now:()=>Date.now()+3_600_000});
    const returned = restored.join('shared','Shared','mage'); restored.advance(3);
    expect(returned.snapshot.threats.find(t=>t.id==='nest')!.health).toBe(0);
    expect(returned.snapshot.loot.every(t=>!t.available)).toBe(true);
  });
  test("disconnect forks the engaged character and leaves the shared player moving", () => {
    const world = createSharedAdventure({ now: () => 1000 });
    const alice = world.join("alice", "Alice", "warrior");
    const bob = world.join("bob", "Bob", "mage");
    alice.setCameraForward(-3, 16); alice.setAction("forward", true); world.advance(Math.hypot(3, 16) / 4.5); alice.setAction("forward", false);
    alice.selectTarget("scout"); tap(alice, "strike"); world.advance(0.25);
    expect(world.session("alice").mode).toBe("shared");
    expect(alice.snapshot.threats.find(t => t.id === "scout")?.aggro).toBe(true);
    expect(alice.snapshot.threats.find(t => t.id === "scout")?.cast).not.toBeNull();
    expect(world.pause("alice")).toBe(true);
    const paused = alice.snapshot;
    expect(world.session("alice").mode).toBe('paused');
    const bobBefore = bob.snapshot.player.position;
    world.advance(2);
    expect(alice.snapshot.player.position).toEqual(paused.player.position);
    expect(alice.snapshot.threats.find(t => t.id === "scout")?.remainingSeconds).toBe(paused.threats.find(t => t.id === "scout")?.remainingSeconds);
    expect(bob.snapshot.player.position).toEqual(bobBefore);
    expect(world.resume("alice")).toBe(true);
    expect(world.session("alice").mode).toBe("private");
    const acceptedBefore = alice.snapshot.quests.find(q => q.id === "cold-hands")?.status;
    alice.interactNpc("mara"); alice.quest("cold-hands", "accept");
    expect(alice.snapshot.quests.find(q => q.id === "cold-hands")?.status).toBe(acceptedBefore);
    expect(world.pause("alice")).toBe(true);
    expect(world.session("alice").mode).toBe("paused");
    expect(world.resume("alice")).toBe(true);
    world.advance(0.5);
    expect(alice.snapshot.player.actionCooldown).toBeLessThanOrEqual(paused.player.actionCooldown);
    expect(world.players(world.session("alice").id)).toHaveLength(1);
    expect(world.players()).toHaveLength(1);
  });

  test("disconnecting the sole fighter releases the shared threat back home", () => {
    const world = createSharedAdventure({ now: () => 1000 });
    const alice = world.join("alice", "Alice", "warrior");
    alice.setCameraForward(-3, 16);
    alice.setAction("forward", true);
    world.advance(Math.hypot(3, 16) / 4.5);
    alice.setAction("forward", false);
    alice.selectTarget("scout");
    tap(alice, "strike");
    world.advance(0.25);
    const sharedThreat = alice.snapshot.threats.find(t => t.id === "scout")!;
    expect(sharedThreat.aggro).toBe(true);
    expect(sharedThreat.targetPlayerId).toBe("alice");
    expect(world.pause("alice")).toBe(true);
    const released = JSON.parse(world.save()).world.threats.find((t: { id: string }) => t.id === "scout");
    expect(released.aggro).toBe(false);
    expect(released.targetPlayerId).toBeNull();
    expect(released.combatants).toEqual([]);
    expect(released.health).toBe(96);
    expect(released.phase).toBe("patrol");
    expect(released.position).toEqual({ x: -3, y: 0, z: 10 });
    world.advance(10);
    const afterAdvance = JSON.parse(world.save()).world.threats.find((t: { id: string }) => t.id === "scout");
    expect(afterAdvance.position).toEqual({ x: -3, y: 0, z: 10 });
    expect(world.session("alice").mode).toBe("paused");
  });

  test("an engaged partner keeps the shared cast while an unengaged observer stays out", () => {
    const seed = createSharedAdventure();
    seed.join("alice", "Alice", "warrior");
    seed.join("bob", "Bob", "mage");
    seed.join("observer", "Observer", "hunter");
    const saved = JSON.parse(seed.save()) as { characters: Array<{ id: string; state: Record<string, unknown> }> };
    for (const character of saved.characters) {
      if (character.id === "alice" || character.id === "bob") {
        character.state.phase = "expedition";
        character.state.position = { x: -3, y: 0, z: 8 };
      }
    }
    const world = createSharedAdventure({ save: JSON.stringify(saved), now: () => 1000 });
    const alice = world.join("alice", "Alice", "warrior");
    const bob = world.join("bob", "Bob", "mage");
    world.join("observer", "Observer", "hunter");
    alice.selectTarget("scout"); tap(alice, "strike"); world.advance(0.2);
    bob.selectTarget("scout"); tap(bob, "strike"); world.advance(0.2);
    const before = bob.snapshot.threats.find(t => t.id === "scout")!;
    expect(alice.snapshot.player.inCombat).toBe(true);
    expect(bob.snapshot.player.inCombat).toBe(true);
    expect(before.cast).not.toBeNull();
    const castRemaining = before.cast!.remainingSeconds;
    const health = before.health;

    expect(world.pause("alice")).toBe(true);
    const shared = JSON.parse(world.save()).world.threats.find((t: { id: string }) => t.id === "scout");
    expect(shared.health).toBe(health);
    expect(shared.castDuration).toBeGreaterThan(0);
    expect(shared.remainingSeconds).toBeCloseTo(castRemaining, 5);
    expect(shared.targetPlayerId).toBe("bob");
    expect(shared.combatants).toEqual(["bob"]);
    expect(world.players().map(player => player.id)).toEqual(["bob", "observer"]);
  });

  test("private save reopens paused and rejoin is gated by combat", () => {
    const world = createSharedAdventure({ now: () => 1000 });
    const alice = world.join("alice", "Alice", "warrior");
    alice.setCameraForward(-3, 16); alice.setAction("forward", true); world.advance(Math.hypot(3, 16) / 4.5); alice.setAction("forward", false);
    alice.selectTarget("scout"); tap(alice, "strike"); world.advance(0.2);
    world.pause("alice");
    const restored = createSharedAdventure({ save: world.save(), now: () => 1000 });
    const reopened = restored.join("alice", "Alice", "warrior");
    expect(restored.session("alice").mode).toBe("paused");
    expect(restored.resume("alice")).toBe(true);
    expect(reopened.snapshot.threats.find(t => t.id === "scout")?.aggro).toBe(true);
    expect(restored.rejoin("alice")).toBe(false);
    expect(restored.session("alice").mode).toBe("private");
    expect(reopened.snapshot.player.health).toBe(alice.snapshot.player.health);
  });

  test("combat membership follows a replacement target and clears only after the encounter ends", () => {
    const world = createSharedAdventure({ now: () => 1000 });
    const alice = world.join("alice", "Alice", "warrior");
    const bob = world.join("bob", "Bob", "mage");
    for (const player of [alice, bob]) {
      player.setCameraForward(-3, 16);
      player.setAction("forward", true);
    }
    world.advance(Math.hypot(3, 16) / 4.5);
    alice.setAction("forward", false); bob.setAction("forward", false);
    alice.selectTarget("scout"); tap(alice, "strike"); world.advance(0.25);
    expect(alice.snapshot.player.inCombat).toBe(true);
    // A second participant joining the same encounter becomes a combatant too;
    // target selection must not make the first participant lose membership.
    bob.selectTarget("scout"); tap(bob, "strike"); world.advance(0.2);
    expect(bob.snapshot.player.inCombat).toBe(true);
    expect(alice.snapshot.player.inCombat).toBe(true);
    const scout = bob.snapshot.threats.find(t => t.id === "scout")!;
    expect(scout.targetPlayerId).toBe("alice");
    // Killing the sole remaining threat clears the membership for Bob.
    bob.selectTarget("scout");
    for (let i = 0; i < 30 && bob.snapshot.threats.find(t => t.id === "scout")!.health > 0; i++) {
      tap(bob, "strike"); world.advance(1.6);
    }
    expect(bob.snapshot.threats.find(t => t.id === "scout")!.health).toBe(0);
    expect(bob.snapshot.player.inCombat).toBe(false);
    expect(alice.snapshot.player.inCombat).toBe(false);
  });

  test("private rejoin stays gated until every engaged threat ends", () => {
    const seed = createSharedAdventure();
    seed.join("alice", "Alice", "warrior");
    const saved = JSON.parse(seed.save()) as {
      world: { threats: Array<Record<string, unknown>> };
      characters: Array<{ state: Record<string, unknown> }>;
    };
    saved.characters[0]!.state.phase = "expedition";
    saved.characters[0]!.state.position = { x: 0, y: 0, z: 5 };
    for (const id of ["scout", "patrol"]) {
      const threat = saved.world.threats.find(entry => entry.id === id)!;
      threat.health = 5; threat.phase = "preparation"; threat.aggro = true;
      threat.targetPlayerId = "alice"; threat.combatants = ["alice"];
      threat.position = { x: 0, y: 0, z: 5 }; threat.targetPosition = { x: 0, y: 0, z: 5 };
      threat.castDuration = 3; threat.remainingSeconds = 3;
    }
    const world = createSharedAdventure({ save: JSON.stringify(saved) });
    const alice = world.join("alice", "Alice", "warrior");
    world.pause("alice");
    const reopened = createSharedAdventure({ save: world.save() });
    const resumed = reopened.join("alice", "Alice", "warrior");
    expect(reopened.resume("alice")).toBe(true);
    expect(reopened.rejoin("alice")).toBe(false);
    resumed.selectTarget("scout"); tap(resumed, "strike"); reopened.advance(0.1);
    expect(resumed.snapshot.threats.find(t => t.id === "scout")!.health).toBe(0);
    expect(reopened.rejoin("alice")).toBe(false);
    reopened.advance(1.6);
    resumed.selectTarget("patrol"); tap(resumed, "strike"); reopened.advance(0.1);
    expect(resumed.snapshot.threats.find(t => t.id === "patrol")!.health).toBe(0);
    expect(reopened.rejoin("alice")).toBe(true);
  });
});
