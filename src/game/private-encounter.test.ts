import { describe, expect, test } from "bun:test";
import { createSharedAdventure } from "./adventure.js";
import { earnedChapter, finishCycle, readyParty, travel } from "./yard-test-fixtures.js";

const tap = (game: ReturnType<ReturnType<typeof createSharedAdventure>["join"]>, action: Parameters<typeof game.setAction>[0]) => {
  game.setAction(action, true); game.setAction(action, false);
};

describe("private paused encounters", () => {
  test("a forked fighter gathers a new offering and earns a Roll from a later shared kill", () => {
    const seed = createSharedAdventure({ now: () => 1000 });
    for (const id of ["alice", "bob"]) seed.join(id, id, "mage");
    const saved = JSON.parse(seed.save());
    for (const character of saved.characters) {
      const chapter = earnedChapter(2); chapter.accepted.push("last-shift");
      chapter.equipment = { chest: "insulated-coat", mainhand: "yard-weapon" };
      Object.assign(character.state, { phase: "expedition", position: { x: 2, y: 0, z: 58.5 }, chapter, potions: 6 });
    }
    saved.world.ritualCalled = true;
    for (const threat of saved.world.threats) {
      if (threat.id === "ritual-guardian") Object.assign(threat, {
        active: true, health: 5, phase: "preparation", aggro: true, targetPlayerId: "alice",
        contributors: ["alice", "bob"], combatants: ["alice", "bob"], castDuration: 3, remainingSeconds: 3,
      });
      else Object.assign(threat, { health: 0, phase: "cleared", lootClaimed: true });
    }
    let world = createSharedAdventure({ save: JSON.stringify(saved), now: () => 1000 });
    let alice = world.join("alice", "alice", "mage"), bob = world.join("bob", "bob", "mage");
    expect(world.pause("bob")).toBe(true);
    expect(world.resume("bob")).toBe(true);
    bob.selectTarget("ritual-guardian"); tap(bob, "strike"); bob.readyCombat(); world.advance(.1);
    expect(bob.snapshot.threats.find(t => t.id === "ritual-guardian")!.health).toBe(0);
    bob.openLoot("ritual-guardian"); tap(bob, "takeLoot");
    expect(bob.snapshot.carriedRelics).toBe(0);
    expect(alice.snapshot.threats.find(t => t.id === "ritual-guardian")).toMatchObject({ active: true, health: 5, aggro: true });

    alice.selectTarget("ritual-guardian"); tap(alice, "strike"); alice.readyCombat(); world.advance(.1);
    expect(alice.snapshot.threats.find(t => t.id === "ritual-guardian")!.health).toBe(0);
    alice.openLoot("ritual-guardian"); tap(alice, "takeLoot");
    expect(alice.snapshot.carriedRelics).toBe(1);
    expect(world.rejoin("bob")).toBe(true);
    bob.openLoot("ritual-guardian"); tap(bob, "takeLoot");
    expect(bob.snapshot.carriedRelics).toBe(0);
    expect(bob.snapshot.cargo).toBe(0);
    finishCycle(bob, world);

    const walkBob = (x: number, z: number) => travel(bob,x,z,world);
    walkBob(-2, 32);
    tap(bob, "gather"); world.advance(2); tap(bob, "gather"); world.advance(2);
    expect(bob.snapshot.cargo).toBe(6);
    walkBob(2, 58.5);
    tap(bob, "ritual"); world.advance(1);
    expect(bob.snapshot.cargo).toBe(0);
    expect(bob.snapshot.threats.find(t => t.id === "ritual-guardian")).toMatchObject({ active: true, health: 200, aggro: true });
    const finalBlow = JSON.parse(world.save());
    finalBlow.world.threats.find((t: { id: string }) => t.id === "ritual-guardian").health = 5;
    world = createSharedAdventure({ save: JSON.stringify(finalBlow), now: () => 1000 });
    alice = world.join("alice", "alice", "mage"); bob = world.join("bob", "bob", "mage");
    bob.selectTarget("ritual-guardian"); tap(bob, "strike"); readyParty(alice, bob); world.advance(.1);
    expect(bob.snapshot.player.health).toBeGreaterThan(0);
    expect(bob.snapshot.threats.find(t => t.id === "ritual-guardian")!.health).toBe(0);
    finishCycle(bob,world);const corpse=bob.snapshot.loot.find(t=>t.sourceId==="ritual-guardian")!;travel(bob,corpse.position.x,corpse.position.z,world);
    bob.openLoot("ritual-guardian"); tap(bob, "takeLoot");
    expect(bob.snapshot.carriedRelics).toBe(1);
    expect(bob.snapshot.quests.find(q => q.id === "last-shift")!.status).toBe("ready");
    expect(alice.snapshot.carriedRelics).toBe(1);
  });

  test("a private Foreman kill leaves no rewards and permits another shared offering", () => {
    const seed = createSharedAdventure({ now: () => 1000 });
    seed.join("alice", "Alice", "mage");
    const saved = JSON.parse(seed.save());
    const chapter = earnedChapter(2); chapter.accepted.push("last-shift");
    Object.assign(saved.characters[0].state, {
      phase: "expedition", position: { x: 2, y: 0, z: 58.5 }, cargo: 12,
      chapter,
    });
    let world = createSharedAdventure({ save: JSON.stringify(saved), now: () => 1000 });
    let alice = world.join("alice", "Alice", "mage");
    tap(alice, "ritual"); world.advance(1);
    expect(alice.snapshot.cargo).toBe(6);
    expect(world.pause("alice")).toBe(true);
    expect(alice.snapshot.threats.find(t => t.id === "ritual-guardian")).toMatchObject({ active: true, health: 200, aggro: true });
    const forked = JSON.parse(world.save());
    expect(forked.world.ritualCalled).toBe(false);
    expect(forked.world.threats.find((t: { id: string }) => t.id === "ritual-guardian")).toMatchObject({ active: false, health: 200, phase: "dormant" });
    forked.instances[0].world.threats.find((t: { id: string }) => t.id === "ritual-guardian").health = 5;
    world = createSharedAdventure({ save: JSON.stringify(forked), now: () => 1000 });
    alice = world.join("alice", "Alice", "mage");
    expect(world.resume("alice")).toBe(true);
    alice.selectTarget("ritual-guardian"); tap(alice, "strike"); alice.readyCombat(); world.advance(.1);
    expect(alice.snapshot.threats.find(t => t.id === "ritual-guardian")!.health).toBe(0);
    alice.openLoot("ritual-guardian"); tap(alice, "takeLoot");
    expect(alice.snapshot.loot.every(loot => !loot.available)).toBe(true);
    expect(alice.snapshot.carriedRelics).toBe(0);
    expect(alice.snapshot.quests.find(q => q.id === "last-shift")!.status).toBe("active");
    expect(world.rejoin("alice")).toBe(true);
    world.advance(1);
    tap(alice, "ritual");
    expect(alice.snapshot.cargo).toBe(0);
    expect(alice.snapshot.ritualCalled).toBe(true);
    expect(alice.snapshot.threats.find(t => t.id === "ritual-guardian")).toMatchObject({ active: true, health: 200, aggro: true });
  });

  test.each(["dormant", "returning"])("saved abandoned Foreman in %s can be summoned again", phase => {
    const seed = createSharedAdventure({ now: () => 1000 });
    seed.join("alice", "Alice", "mage");
    const saved = JSON.parse(seed.save());
    Object.assign(saved.characters[0].state, { phase: "expedition", position: { x: 2, y: 0, z: 58.5 }, cargo: 6 });
    saved.world.ritualCalled = true;
    Object.assign(saved.world.threats.find((t: { id: string }) => t.id === "ritual-guardian"), { active: true, phase });
    const world = createSharedAdventure({ save: JSON.stringify(saved), now: () => 1000 });
    const alice = world.join("alice", "Alice", "mage");
    expect(alice.snapshot.ritualCalled).toBe(false);
    expect(alice.snapshot.threats.find(t => t.id === "ritual-guardian")).toMatchObject({ active: false, health: 200 });
    tap(alice, "ritual");
    expect(alice.snapshot.cargo).toBe(0);
    expect(alice.snapshot.threats.find(t => t.id === "ritual-guardian")).toMatchObject({ active: true, health: 200, aggro: true });
  });

  test("a private Foreman kill cannot replace a partner's ongoing shared fight", () => {
    const seed = createSharedAdventure({ now: () => 1000 });
    seed.join("alice", "Alice", "mage"); seed.join("bob", "Bob", "mage");
    const saved = JSON.parse(seed.save());
    for (const character of saved.characters) Object.assign(character.state, {
      phase: "expedition", position: { x: 2, y: 0, z: 58.5 }, cargo: 6,
    });
    saved.world.ritualCalled = true;
    Object.assign(saved.world.threats.find((t: { id: string }) => t.id === "ritual-guardian"), {
      active: true, health: 5, phase: "preparation", aggro: true, targetPlayerId: "alice",
      contributors: ["alice", "bob"], combatants: ["alice", "bob"], castDuration: 3, remainingSeconds: 3,
    });
    const world = createSharedAdventure({ save: JSON.stringify(saved), now: () => 1000 });
    const alice = world.join("alice", "Alice", "mage");
    const bob = world.join("bob", "Bob", "mage");
    expect(world.pause("alice")).toBe(true);
    expect(bob.snapshot.threats.find(t => t.id === "ritual-guardian")).toMatchObject({ active: true, health: 5, aggro: true, targetPlayerId: "bob" });
    expect(world.resume("alice")).toBe(true);
    alice.selectTarget("ritual-guardian"); tap(alice, "strike"); alice.readyCombat(); world.advance(.1);
    expect(alice.snapshot.threats.find(t => t.id === "ritual-guardian")!.health).toBe(0);
    expect(world.rejoin("alice")).toBe(true);
    world.advance(1);
    tap(alice, "ritual");
    expect(alice.snapshot.cargo).toBe(6);
    expect(bob.snapshot.threats.find(t => t.id === "ritual-guardian")).toMatchObject({ active: true, health: 5, aggro: true, targetPlayerId: "bob" });
  });

  test('forks preserve corpses and distinguish character names from the shared instance', () => {
    const seed = createSharedAdventure(); seed.join('shared', 'Shared', 'mage');
    const saved = JSON.parse(seed.save());
    Object.assign(saved.characters[0].state, {phase:'expedition', position:{x:-3,y:0,z:28}});
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
    alice.setCameraForward(-3, 36); alice.setAction("forward", true); world.advance(Math.hypot(3, 36) / 4.5); alice.setAction("forward", false);
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
    alice.setCameraForward(-3, 36);
    alice.setAction("forward", true);
    world.advance(Math.hypot(3, 36) / 4.5);
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
    expect(released.position).toEqual({ x: -3, y: 0, z: 30 });
    world.advance(10);
    const afterAdvance = JSON.parse(world.save()).world.threats.find((t: { id: string }) => t.id === "scout");
    expect(afterAdvance.position).toEqual({ x: -3, y: 0, z: 30 });
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
        character.state.position = { x: -3, y: 0, z: 28 };
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
    expect(shared.castDuration).toBeGreaterThanOrEqual(0);
    expect(shared.remainingSeconds).toBeCloseTo(castRemaining, 5);
    expect(shared.targetPlayerId).toBe("bob");
    expect(shared.combatants).toEqual(["bob"]);
    expect(world.players().map(player => player.id)).toEqual(["bob", "observer"]);
  });

  test("private save reopens paused and rejoin is gated by combat", () => {
    const world = createSharedAdventure({ now: () => 1000 });
    const alice = world.join("alice", "Alice", "warrior");
    alice.setCameraForward(-3, 36); alice.setAction("forward", true); world.advance(Math.hypot(3, 36) / 4.5); alice.setAction("forward", false);
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
    const seed = JSON.parse(createSharedAdventure({ now: () => 1000 }).save());
    for (const t of seed.world.threats) if (t.active && t.id !== "scout") Object.assign(t, { health: 0, phase: "cleared", lootClaimed: true, respawnAt: 121000 });
    const world = createSharedAdventure({ save: JSON.stringify(seed), now: () => 1000 });
    const alice = world.join("alice", "Alice", "warrior");
    const bob = world.join("bob", "Bob", "mage");
    for (const player of [alice, bob]) {
      player.setCameraForward(-3, 36);
      player.setAction("forward", true);
    }
    world.advance(Math.hypot(3, 36) / 4.5);
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
      if (bob.snapshot.combat.phase === "active") finishCycle(bob, world);
      tap(alice, "brace"); tap(bob, "strike"); readyParty(alice, bob); finishCycle(bob, world);
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
    saved.characters[0]!.state.position = { x: 0, y: 0, z: 25 };
    for (const id of ["scout", "patrol"]) {
      const threat = saved.world.threats.find(entry => entry.id === id)!;
      threat.health = 5; threat.phase = "preparation"; threat.aggro = true;
      threat.targetPlayerId = "alice"; threat.combatants = ["alice"];
      threat.position = { x: 0, y: 0, z: 25 }; threat.targetPosition = { x: 0, y: 0, z: 25 };
      threat.castDuration = 3; threat.remainingSeconds = 3;
    }
    const world = createSharedAdventure({ save: JSON.stringify(saved) });
    const alice = world.join("alice", "Alice", "warrior");
    world.pause("alice");
    const reopened = createSharedAdventure({ save: world.save() });
    const resumed = reopened.join("alice", "Alice", "warrior");
    expect(reopened.resume("alice")).toBe(true);
    expect(reopened.rejoin("alice")).toBe(false);
    resumed.selectTarget("scout"); tap(resumed, "strike"); resumed.readyCombat(); reopened.advance(0.1);
    expect(resumed.snapshot.threats.find(t => t.id === "scout")!.health).toBe(0);
    expect(reopened.rejoin("alice")).toBe(false);
    finishCycle(resumed, reopened);
    resumed.selectTarget("patrol"); tap(resumed, "strike"); resumed.readyCombat(); reopened.advance(0.1);
    expect(resumed.snapshot.threats.find(t => t.id === "patrol")!.health).toBe(0);
    expect(reopened.rejoin("alice")).toBe(true);
  });
});

describe('party encounter cohorts', () => {
  test('members share one paused world, advance once, restore together, and return to individual origins', () => {
    const seed = createSharedAdventure({ now: () => 1000 });
    seed.join('alice', 'Alice', 'mage'); seed.join('bob', 'Bob', 'warrior'); seed.join('observer', 'Observer', 'hunter');
    const saved = JSON.parse(seed.save());
    saved.characters[1].state.position.z = -9;
    const world = createSharedAdventure({ save: JSON.stringify(saved), now: () => 1000 });
    const alice = world.join('alice', 'Alice', 'mage'), bob = world.join('bob', 'Bob', 'warrior');
    const observer = world.join('observer', 'Observer', 'hunter');
    const origins = [alice.snapshot.player.position, bob.snapshot.player.position];
    expect(world.pause('bob', ['alice', 'bob'])).toBe(true);
    const sessionId = world.session('alice').id;
    expect(world.session('bob').id).toBe(sessionId);
    expect(world.players(sessionId).map(player => player.id).sort()).toEqual(['alice', 'bob']);
    expect(world.players().map(player => player.id)).toEqual(['observer']);
    expect(JSON.parse(world.save()).instances).toHaveLength(1);
    expect(world.resume('alice')).toBe(true);
    for (const player of [alice, bob, observer]) { player.setCameraForward(0, 1); player.setAction('forward', true); }
    world.advance(.2);
    expect(alice.snapshot.player.position.z - origins[0]!.z).toBeCloseTo(1.04, 5);
    expect(bob.snapshot.player.position.z - origins[1]!.z).toBeCloseTo(1.04, 5);
    expect(observer.snapshot.player.position.z).toBeCloseTo(-6.8, 5);
    expect(world.pause('bob')).toBe(true);
    const frozen = alice.snapshot.player.position;
    world.advance(.5);
    expect(alice.snapshot.player.position).toEqual(frozen);
    expect(world.session('alice').mode).toBe('paused');
    expect(world.session('bob').mode).toBe('paused');
    const restored = createSharedAdventure({ save: world.save(), now: () => 1000 });
    const returned = restored.join('alice', 'Alice', 'mage');
    expect(restored.session('bob').id).toBe(sessionId);
    expect(restored.resume('alice')).toBe(true);
    expect(restored.players(sessionId).map(player => player.id)).toEqual(['alice']);
    expect(restored.rejoin('alice')).toBe(true);
    expect(returned.snapshot.player.position).toEqual(origins[0]!);
    expect(restored.getPlayer('bob')!.snapshot.player.position).toEqual(origins[1]!);
    expect(restored.session('bob').mode).toBe('shared');
    expect(restored.players().map(player => player.id)).toEqual(['alice']);
    restored.join('bob', 'Bob', 'warrior');
    restored.leave('bob', ['alice', 'bob']);
    expect(restored.session('alice').id).toBe(restored.session('bob').id);
    expect(restored.session('alice').mode).toBe('paused');
    expect(restored.resume('alice')).toBe(true);
    expect(restored.players(restored.session('alice').id).map(player => player.id)).toEqual(['alice']);
    restored.join('bob', 'Bob', 'warrior');
    expect(restored.players(restored.session('alice').id)).toHaveLength(2);
  });

  test('party targets and clock stay shared, every fighter gates return, and private kills grant no rewards', () => {
    const seed = createSharedAdventure({ now: () => 1000 });
    for (const id of ['alice', 'bob', 'observer']) seed.join(id, id, 'mage');
    const saved = JSON.parse(seed.save());
    for (const member of saved.characters.slice(0, 2)) {
      const chapter = earnedChapter(2); chapter.accepted.push('last-shift');
      Object.assign(member.state, { phase: 'expedition', position: { x: 2, y: 0, z: 58.5 }, chapter });
    }
    saved.world.ritualCalled = true;
    for (const threat of saved.world.threats) {
      if (threat.id === 'ritual-guardian') Object.assign(threat, {
        active: true, health: 5, phase: 'preparation', aggro: true, targetPlayerId: 'bob',
        contributors: ['alice', 'bob'], combatants: ['bob'], castDuration: 3, remainingSeconds: 3,
      });
      else Object.assign(threat, { health: 0, phase: 'cleared', lootClaimed: true });
    }
    const world = createSharedAdventure({ save: JSON.stringify(saved), now: () => 1000 });
    const alice = world.join('alice', 'alice', 'mage'), bob = world.join('bob', 'bob', 'mage');
    const observer = world.join('observer', 'observer', 'mage');
    const experienceBefore = new Map([alice, bob].map(player => [player, player.snapshot.progression.experience]));
    expect(world.pause('alice', ['alice', 'bob'])).toBe(true);
    expect(alice.snapshot.threats.find(t => t.id === 'ritual-guardian')!.targetPlayerId).toBe('bob');
    expect(world.session('alice').canRejoin).toBe(false);
    expect(world.rejoin('alice')).toBe(false);
    expect(observer.snapshot.threats.find(t => t.id === 'ritual-guardian')!.active).toBe(false);
    expect(world.resume('bob')).toBe(true);
    tap(bob, 'brace'); readyParty(alice, bob); world.advance(.1);
    const clockBefore = alice.snapshot.combat.elapsedSeconds;
    world.advance(.1);
    expect(alice.snapshot.combat.elapsedSeconds - clockBefore).toBeCloseTo(.1, 5);
    expect(bob.snapshot.combat.elapsedSeconds).toBe(alice.snapshot.combat.elapsedSeconds);
    finishCycle(bob, world);
    bob.selectTarget('ritual-guardian'); tap(bob, 'strike'); readyParty(alice, bob); world.advance(.1);
    expect(alice.snapshot.threats.find(t => t.id === 'ritual-guardian')!.health).toBe(0);
    for (const player of [alice, bob]) {
      player.openLoot('ritual-guardian'); tap(player, 'takeLoot');
      expect(player.snapshot.carriedRelics).toBe(0);
      expect(player.snapshot.progression.experience).toBe(experienceBefore.get(player)!);
      expect(player.snapshot.quests.find(q => q.id === 'last-shift')!.status).toBe('active');
    }
    expect(world.rejoin('alice')).toBe(true);
    expect(world.session('bob').mode).toBe('shared');
  });

  test('a legacy single-owner private save migrates without losing its return position', () => {
    const seed = createSharedAdventure({ now: () => 1000 });
    seed.join('alice', 'Alice', 'mage'); seed.pause('alice');
    const saved = JSON.parse(seed.save()), instance = saved.instances[0];
    saved.version = 4; instance.ownerId = instance.members[0].id; instance.origin = instance.members[0].origin; delete instance.members;
    const world = createSharedAdventure({ save: JSON.stringify(saved), now: () => 1000 });
    world.join('alice', 'Alice', 'mage');
    expect(world.session('alice').origin).toEqual(instance.origin);
    expect(world.rejoin('alice')).toBe(true);
    expect(JSON.parse(world.save()).version).toBe(5);
  });
});

test('a surviving party member can return a dead companion without reviving them', () => {
  const seed = createSharedAdventure({ now: () => 1000 });
  seed.join('alice', 'Alice', 'mage'); seed.join('bob', 'Bob', 'warrior');
  seed.pause('alice', ['alice', 'bob']);
  const saved = JSON.parse(seed.save());
  Object.assign(saved.characters.find((member: { id: string }) => member.id === 'bob').state, { health: 0, phase: 'lost' });
  const world = createSharedAdventure({ save: JSON.stringify(saved), now: () => 1000 });
  const alice = world.join('alice', 'Alice', 'mage'), bob = world.join('bob', 'Bob', 'warrior');
  expect(world.session('bob').canRejoin).toBe(false);
  expect(world.resume('bob')).toBe(false); expect(world.rejoin('bob')).toBe(false);
  expect(world.session('alice').canRejoin).toBe(true);
  expect(world.resume('alice')).toBe(true); expect(world.rejoin('alice')).toBe(true);
  expect(world.session('alice').mode).toBe('shared'); expect(world.session('bob').mode).toBe('shared');
  expect(alice.snapshot.player.health).toBe(100);
  expect(bob.snapshot.player.health).toBe(0); expect(bob.snapshot.phase).toBe('lost');
  const restored = createSharedAdventure({ save: world.save(), now: () => 1000 });
  const dead = restored.join('bob', 'Bob', 'warrior');
  expect(dead.snapshot.player.health).toBe(0); expect(dead.snapshot.phase).toBe('lost');
});
