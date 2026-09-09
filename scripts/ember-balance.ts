import { createAdventure } from "../src/game/adventure.js";
import assert from "node:assert/strict";
import type { AdventureGame, CombatAction } from "../src/game/adventure-types.js";

type Plan = "offense" | "defended" | "rage" | "rage-opener";
type Encounter = "ember" | "warder" | "pair";
const seeds = [2000, 500, 1500, 9844, 3000, 4000];

function fixture(seed: number, encounter: Encounter): AdventureGame {
  const saved = JSON.parse(createAdventure().save());
  saved.state.phase = "expedition";
  saved.state.position = encounter === "ember" ? { x: -3, y: 0, z: 8.1 } : { x: -3, y: 0, z: 25.5 };
  saved.state.selectedThreat = encounter === "ember" ? "scout" : "warder";
  for (const threat of saved.state.threats) {
    threat.rng = seed;
    if (threat.id === "ritual-guardian") continue;
    if (!(encounter === "ember" ? threat.id === "scout" : threat.id === "warder" || encounter === "pair" && threat.id === "patrol")) {
      threat.health = 0; threat.phase = "cleared"; threat.lootClaimed = true;
    }
  }
  return createAdventure({ save: JSON.stringify(saved) });
}

function queuePlan(game: AdventureGame, plan: Plan): void {
  const state = game.snapshot;
  const target = state.threats.find(t => t.id === state.selectedThreat)!;
  const move = target.windowAction;
  const ability = move?.ability ?? target.forecast[0]?.ability;
  const beat = Math.floor(move?.offsetSeconds ?? 0);
  let actions: (CombatAction | null)[] = ["strike", "strike", "strike"];
  if (plan !== "offense" && ability && ability.damage > 0) actions[beat] = "brace";
  if (plan === "rage-opener" && state.combat.phase === "idle") actions = ["brace", "bloodRage", null];
  if (plan === "rage" && ability && ability.damage === 0 && state.player.bloodRage === 0) {
    actions = ability.id !== "ember-ward" || beat === 2 ? ["strike", "strike", "bloodRage"] : beat === 0 ? ["bloodRage", null, "strike"] : ["strike", "bloodRage", null];
  }
  for (let slot = 0; slot < actions.length; slot++) {
    const action = actions[slot];
    if (!action) continue;
    const previousIds = new Set(game.snapshot.combat.queued.map(e => e.id));
    game.setAction(action, true); game.setAction(action, false);
    const queued = game.snapshot.combat.queued.find(e => !previousIds.has(e.id));
    if (!queued) throw new Error(`Cannot queue ${action}: ${game.snapshot.report}`);
    game.moveQueuedAction(queued.id, slot);
    if (!game.snapshot.combat.queued.some(e => e.id === queued.id && e.offsetSeconds === slot)) throw new Error(`Cannot place ${action} in slot ${slot + 1}`);
  }
}

function resolve(seed: number, plan: Plan, encounter: Encounter) {
  const game = fixture(seed, encounter);
  let elapsed = 0, planned = "", lastLog = 0;
  const rounds: object[] = [];
  const damage: string[] = [];
  const engaged = new Set<string>();
  while (elapsed < 180 && game.snapshot.phase !== "lost" && game.snapshot.threats.some(t => t.active && t.health > 0)) {
    const state = game.snapshot;
    for (const t of state.threats) if (t.aggro) engaged.add(t.id);
    const key = `${state.combat.cycle}:${state.combat.phase}`;
    if ((state.combat.phase === "idle" || state.combat.phase === "preparation") && key !== planned) {
      const target = state.threats.find(t => t.id === state.selectedThreat && t.health > 0) ?? state.threats.find(t => t.active && t.health > 0)!;
      if (target.id !== state.selectedThreat) game.selectTarget(target.id);
      queuePlan(game, plan); planned = key;
      rounds.push({ time: Number(elapsed.toFixed(2)), health: state.player.health, target: target.id, enemyHealth: target.health, ability: target.windowAction?.ability.id ?? target.forecast[0]?.ability.id, beat: Math.floor(target.windowAction?.offsetSeconds ?? 0) + 1, actions: game.snapshot.combat.queued.map(e => `${e.action}@${e.offsetSeconds}`) });
    }
    const target = game.snapshot.threats.find(t => t.id === game.snapshot.selectedThreat && t.health > 0);
    if (target) {
      const from = game.snapshot.player.position;
      game.setCameraForward(target.position.x - from.x, target.position.z - from.z);
      game.setAction("forward", encounter !== "ember" && Math.hypot(target.position.x - from.x, target.position.z - from.z) > 1.7);
    }
    game.advance(0.05); elapsed += 0.05;
    for (const event of game.snapshot.log) if (event.id > lastLog) {
      if (/hits you|Blood Rage costs|blocked by/.test(event.text)) damage.push(event.text);
      lastLog = event.id;
    }
  }
  game.setAction("forward", false);
  return { health: game.snapshot.player.health, enemyHealth: game.snapshot.threats.filter(t => t.active && t.health > 0).map(t => ({ id: t.id, health: t.health })), elapsed: Number(elapsed.toFixed(2)), engaged: [...engaged], rounds, damage };
}

for (const encounter of ["ember", "warder", "pair"] as const) {
  for (const seed of seeds) {
    const results = new Map<Plan, ReturnType<typeof resolve>>();
    for (const plan of (encounter === "ember" ? ["offense", "defended", "rage", "rage-opener"] : ["offense", "defended"]) as Plan[]) {
      const result = resolve(seed, plan, encounter);
      results.set(plan, result);
      console.log(JSON.stringify({ encounter, seed, plan, ...result }));
    }
    const offense = results.get("offense")!, defended = results.get("defended")!;
    assert.equal(defended.enemyHealth.length, 0, `${encounter}/${seed}: deliberate play must finish`);
    assert.ok(defended.health > offense.health, `${encounter}/${seed}: defense must preserve more health`);
    if (encounter === "ember") {
      const rage = results.get("rage-opener")!;
      assert.equal(rage.enemyHealth.length, 0, `${seed}: early Rage must finish`);
      assert.ok(rage.elapsed < defended.elapsed && rage.health > offense.health, `${seed}: early Rage must earn its commitment`);
    } else if (encounter === "pair") {
      assert.equal(offense.health, 0, `${seed}: committed attack spam must lose the double pull`);
      assert.ok(defended.health < 50, `${seed}: the double pull must remain costly`);
      assert.equal(defended.engaged.length, 2);
    }
  }
}
