import type { ThreatView } from "../game/adventure-types.js";
import type { ForestActor } from "./frostwood-assets.js";

export interface ThreatAnimationState {
  readonly actor: Pick<ForestActor, "play" | "action">;
  readonly idle: string;
  readonly walk: string;
  readonly attack: string;
  readonly hit: string;
  readonly lunge?: string;
  health: number;
  sequence: number;
  attackTime: number;
  beamTime: number;
  phase: ThreatView["phase"];
  hitTime: number;
}

export function updateThreatAnimation(rig: ThreatAnimationState, threat: ThreatView, delta: number): number {
  const maul = threat.currentAbility.id === "maul";
  const lungeClip = rig.lunge ?? "Gallop_Jump";
  const attackClip = maul ? lungeClip : threat.currentAbility.id === "foreman-pulse" ? "Shoot" : threat.currentAbility.id === "foreman-shield" ? "Idle" : rig.attack;
  const phaseProgress = threat.phaseDuration > 0 ? Math.max(0, Math.min(1, 1 - threat.remainingSeconds / threat.phaseDuration)) : 0;
  const changed = threat.phase !== rig.phase;
  if (threat.actionSequence > rig.sequence && ["ember-beam", "foreman-pulse"].includes(threat.currentAbility.id)) { rig.attackTime = 0.3; rig.beamTime = 0.18; }
  if (threat.phase === "cleared") {
    if(rig.health>0) rig.actor.play("Death",false,undefined,0.08);
  } else if (threat.movementMode === "lunge") {
    const action = rig.actor.action?.getClip().name === lungeClip ? rig.actor.action : rig.actor.play(lungeClip,false,undefined,0.04);
    action.paused = true; action.time = action.getClip().duration * threat.motionProgress;
  } else if (rig.attackTime > 0) {
    const action = rig.actor.action?.getClip().name === attackClip ? rig.actor.action : rig.actor.play(attackClip,false,0.3,0.03);
    action.paused = true; action.time = action.getClip().duration * (1 - rig.attackTime/0.3);
  } else if(threat.phase === "action" && !maul) {
    const action = changed ? rig.actor.play(attackClip,false,undefined,0.035) : rig.actor.action!;
    action.paused = true;
    const impactStart = 0.3;
    action.time = action.getClip().duration * (impactStart + (1-impactStart) * phaseProgress);
  } else if(threat.health < rig.health && threat.health>0) {
    rig.hitTime=0.3; rig.actor.play(rig.hit,false,0.3,0.04);
  } else if(threat.phase === "preparation" && !maul && !threat.moving && rig.hitTime<=delta) {
    const action = changed || rig.actor.action?.getClip().name !== attackClip ? rig.actor.play(attackClip,false,undefined,0.12) : rig.actor.action;
    action.paused = true;
    action.time = action.getClip().duration * 0.3 * phaseProgress;
  } else if(rig.hitTime<=delta || changed) {
    rig.actor.play(threat.movementMode === "circle" ? "Walk" : threat.moving ? rig.walk : rig.idle);
  }
  rig.hitTime=Math.max(0,rig.hitTime-delta);
  rig.attackTime=Math.max(0,rig.attackTime-delta);
  rig.phase = threat.phase;
  rig.sequence = threat.actionSequence;
  rig.health = threat.health;
  // A leap pose belongs to actual motion, never to the stationary planning wait.
  return threat.phase === "preparation" && !maul && !threat.moving ? phaseProgress : 0;
}
