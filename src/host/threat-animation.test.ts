import { expect, test } from "bun:test";
import { AnimationClip, AnimationMixer, Group, LoopOnce, LoopRepeat } from "three";
import { CREATURE_APPEARANCES } from "./creature-appearances.js";
import { terrainHeight } from "../game/cave-layout.js";
import { createAdventure } from "../game/adventure.js";
import type { ThreatView } from "../game/adventure-types.js";
import { earnedChapter, tap } from "../game/yard-test-fixtures.js";
import { updateThreatAnimation, type ThreatAnimationState } from "./threat-animation.js";

function encounter() {
  const saved = JSON.parse(createAdventure({ archetype: "mage" }).save());
  const patrol = saved.state.threats.find((t: { id: string }) => t.id === "patrol");
  Object.assign(saved.state, { phase: "expedition", position: { ...patrol.position, z: patrol.position.z - 4 }, chapter: earnedChapter(2) });
  for (const t of saved.state.threats) if (t.active && t.id !== "patrol") Object.assign(t, { health: 0, phase: "cleared", lootClaimed: true });
  const game = createAdventure({ save: JSON.stringify(saved) });
  game.selectTarget("patrol"); tap(game, "strike"); game.advance(.01);
  return { game, hound: () => game.snapshot.threats.find(t => t.id === "patrol")! };
}

function animation(threat: ThreatView) {
  const mixer = new AnimationMixer(new Group());
  const clips = new Map(["Idle", "Run", "Walk", "Punch", "Jump", "HitRecieve_1", "Death"].map(name => [name, new AnimationClip(name, 1, [])]));
  const calls: string[] = [];
  const actor: ThreatAnimationState["actor"] = {
    action: null,
    play(name, loop = true) {
      calls.push(name);
      const action = mixer.clipAction(clips.get(name)!);
      if (actor.action !== action || !action.isRunning()) {
        actor.action?.stop();
        action.reset().setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1).play();
        action.clampWhenFinished = !loop;
      }
      actor.action = action;
      return action;
    },
  };
  const rig: ThreatAnimationState = { ...CREATURE_APPEARANCES.patrol!, actor, idle: "Idle", walk: "Run", attack: "Punch", hit: "HitRecieve_1", health: threat.health, sequence: threat.actionSequence, phase: threat.phase, attackTime: 0, beamTime: 0, hitTime: 0 };
  actor.play("Idle");
  return { rig, calls, render(snapshot: ThreatView, delta = 1 / 60) { const lean = updateThreatAnimation(rig, snapshot, delta); mixer.update(delta); return lean; } };
}

test("all committed Maul beats wait grounded throughout planning and their windup", () => {
  const { hound } = encounter();
  for (const beat of [0, 1, 2]) {
    const { rig, render } = animation(hound());
    for (const remainingSeconds of [beat, beat / 2, 0]) {
      const waiting = { ...hound(), phaseDuration: beat, remainingSeconds };
      for (let frame = 0; frame < 120; frame++) expect(render(waiting)).toBe(0);
      expect(rig.actor.action!.getClip().name).toBe("Idle");
      expect(rig.actor.action!.paused).toBe(false);
      expect(rig.actor.action!.isRunning()).toBe(true);
    }
  }
});

test("Maul poses follow real leap progress and return to idle over repeated combat cycles", () => {
  const { game, hound } = encounter();
  const { rig, render } = animation(hound());
  for (let cycle = 0; cycle < 3; cycle++) {
    render(hound());
    expect(rig.actor.action!.getClip().name).toBe("Idle");
    game.readyCombat();
    const samples: number[] = [];
    for (let frame = 0; frame < 240 && game.snapshot.combat.phase === "active"; frame++) {
      game.advance(1 / 60);
      const threat = hound();
      render(threat);
      if (threat.movementMode === "lunge") {
        samples.push(threat.motionProgress);
        expect(rig.actor.action!.getClip().name).toBe("Jump");
        expect(rig.actor.action!.paused).toBe(true);
        expect(rig.actor.action!.time).toBeCloseTo(threat.motionProgress, 6);
      }
    }
    expect(samples.length).toBeGreaterThan(20);
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(.8);
    expect(hound().position.y).toBeCloseTo(terrainHeight(hound().position.x, hound().position.z), 6);
    expect(game.snapshot.combat.phase).toBe("preparation");
    render(hound());
    expect(rig.actor.action!.getClip().name).toBe("Idle");
    expect(rig.actor.action!.paused).toBe(false);
  }
});

test("interrupted leap exits its sampled pose through hit, idle, another leap, and death", () => {
  const { hound } = encounter();
  const waiting = hound();
  const { rig, render, calls } = animation(waiting);
  const airborne: ThreatView = { ...waiting, phase: "action", movementMode: "lunge", motionProgress: .6, moving: true };
  render(airborne);
  expect(rig.actor.action!.getClip().name).toBe("Jump");
  const interrupted: ThreatView = { ...waiting, phase: "recovery", health: waiting.health - 18, staggered: true };
  render(interrupted);
  expect(rig.actor.action!.getClip().name).toBe("HitRecieve_1");
  expect(rig.actor.action!.paused).toBe(false);
  for (let frame = 0; frame < 30; frame++) render(interrupted);
  expect(rig.actor.action!.getClip().name).toBe("Idle");
  render({ ...waiting, health: interrupted.health });
  render({ ...airborne, health: interrupted.health, motionProgress: .1 });
  expect(rig.actor.action!.getClip().name).toBe("Jump");
  expect(rig.actor.action!.time).toBeCloseTo(.1, 6);
  const dead: ThreatView = { ...airborne, phase: "cleared", health: 0 };
  render(dead);
  for (let frame = 0; frame < 90; frame++) render(dead);
  expect(rig.actor.action!.getClip().name).toBe("Death");
  expect(calls.filter(name => name === "Death")).toHaveLength(1);
});
