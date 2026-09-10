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
});
