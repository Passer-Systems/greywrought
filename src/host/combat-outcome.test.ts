import { expect, test } from "bun:test";
import { createAdventure } from "../game/adventure.js";
import type { AdventureGame } from "../game/adventure-types.js";
import { finishCycle, tap } from "../game/yard-test-fixtures.js";
import { combatOutcome } from "./combat-outcome.js";

function fixture() {
  const save = JSON.parse(createAdventure().save());
  Object.assign(save.state, { phase: "expedition", position: { x: -2.5, y: 0, z: 25 } });
  save.state.combat = { phase: "preparation", cycle: 1, elapsedSeconds: 0, queued: [], nextId: 1, ready: false };
  for (const enemy of save.state.threats) {
    if (!enemy.active) continue;
    if (enemy.id !== "scout") { Object.assign(enemy, { health: 0, phase: "cleared", aggro: false, lootClaimed: true }); continue; }
    Object.assign(enemy, { position: { x: -2.5, y: 0, z: 30 }, aggro: true, phase: "preparation", joinCycle: 1, windowCycle: 1, specialOffset: .5, remainingSeconds: .5, castDuration: .5 });
    Object.assign(enemy.head, { ability: "kindle", opened: true });
  }
  return save;
}

function outcome(game: AdventureGame) {
  const snapshot = game.snapshot;
  expect(snapshot.combat.forecast).not.toBeNull();
  return combatOutcome(snapshot, snapshot.combat.forecast!);
}

test("Attack success, blocked hits, and defeat describe actual execution", () => {
  for (const state of ["connects", "blocked", "defeated"] as const) {
    const save = fixture();
    if (state === "blocked") {
      Object.assign(save.state, { selectedThreat: "ritual-guardian", ritualCalled: true, position: { x: 0, y: 0, z: 60 } });
      Object.assign(save.state.threats[0], { health: 0, phase: "cleared", aggro: false });
      Object.assign(save.state.threats.find((threat: { id: string }) => threat.id === "ritual-guardian"), {
        active: true, health: 200, phase: "preparation", position: { x: 2.5, y: 0, z: 60 },
        aggro: true, joinCycle: 1, windowCycle: 1, specialOffset: .5, remainingSeconds: .5, castDuration: .5,
        shield: 24, shieldSeconds: 2, abilityIndex: 2,
      });
    }
    if (state === "defeated") save.state.threats[0].health = 18;
    const game = createAdventure({ save: JSON.stringify(save) }); tap(game, "strike");
    expect(outcome(game)).toEqual({ text: `No damage · ${state === "defeated" ? "Cinder Watchman defeated" : `Attack ${state}`}`, tone: "safe" });
    const forecast = game.snapshot.combat.forecast!;
    expect(forecast.actions[0]?.result).toBe("executed");
    game.readyCombat(); finishCycle(game);
    const targetId = save.state.selectedThreat;
    expect(game.snapshot.threats.find(threat => threat.id === targetId)!.health).toBe(forecast.outcomes.find(result => result.id === targetId)!.health);
  }
});

test("range and cover failures come from execution, including range changed by Move", () => {
  for (const timing of ["before", "after"] as const) {
    const save = fixture(); save.state.position.z = 22.5;
    const game = createAdventure({ save: JSON.stringify(save) });
    expect(game.queueBait({ x: -2.5, y: 0, z: 27.5 })).toBe(true);
    tap(game, "strike"); game.setActionTiming(timing);
    expect(outcome(game)).toEqual(timing === "before" ? { text: "No damage · Attack out of range", tone: "warning" } : { text: "No damage · Attack connects", tone: "safe" });
  }
  const save = fixture(); save.state.archetype = "mage";
  save.state.position = { x: 4, y: 0, z: 37 }; save.state.threats[0].position = { x: 4, y: 0, z: 45 };
  const game = createAdventure({ save: JSON.stringify(save) }); tap(game, "strike");
  expect(outcome(game)).toEqual({ text: "No damage · Attack stopped by cover", tone: "warning" });
});

test("Defend healing cannot hide incoming damage", () => {
  const save = fixture(); save.state.archetype = "alchemist"; save.state.health = 70;
  Object.assign(save.state.threats[0].head, { ability: "fireball", volley: 1, castVolley: 1 });
  const game = createAdventure({ save: JSON.stringify(save) }); tap(game, "brace");
  const forecast = game.snapshot.combat.forecast!;
  expect(forecast.outcomes.find(result => result.id === "solo")!.health).toBe(74);
  expect(outcome(game)).toEqual({ text: "Take 2 damage · Defend activates", tone: "danger" });
  game.readyCombat(); finishCycle(game);
  expect(game.snapshot.player.health).toBe(74);
});

test("no action, unavailable targets and falling before an action remain explicit", () => {
  const save = fixture();
  const game = createAdventure({ save: JSON.stringify(save) });
  expect(outcome(game)).toEqual({ text: "No damage · No action planned", tone: "neutral" });
  tap(game, "strike");
  const unavailable = JSON.parse(game.save()); unavailable.state.combat.queued[0].targetId = "warder";
  expect(outcome(createAdventure({ save: JSON.stringify(unavailable) }))).toEqual({ text: "No damage · Target unavailable", tone: "warning" });
  save.state.health = 1; Object.assign(save.state.threats[0].head, { ability: "ember-beam" });
  const doomed = createAdventure({ save: JSON.stringify(save) });
  expect(doomed.queueBait({ x: -5, y: 0, z: 25 })).toBe(true); tap(doomed, "strike");
  const forecast = doomed.snapshot.combat.forecast!;
  expect(forecast.actions.find(action => action.action === "strike")?.result).toBe("not-executed");
  expect(outcome(doomed)).toEqual({ text: "You fall · Attack does not happen", tone: "danger" });
});

 test("stored class readiness stays visible while choosing a plan", () => {
  const save = fixture(); save.state.counterattackReady = true;
  const game = createAdventure({ save: JSON.stringify(save) });
  expect(outcome(game).text).toBe("No damage · No action planned · Counterattack ready (+12)");
});

test("enemy friendly fire names the victim and combines a volley without counting player attacks", () => {
  const snapshot = createAdventure({ save: JSON.stringify(fixture()) }).snapshot;
  const base = snapshot.combat.forecast!;
  const hit = { time: 1, kind: "hit" as const, sourceId: "scout", targetId: "patrol", position: snapshot.player.position, damage: 18, text: "", radius: 0, queueId: null };
  const result = combatOutcome(snapshot, { ...base, events: [hit, { ...hit, time: 1.2 }, { ...hit, sourceId: "solo", damage: 26 }, { ...hit, sourceId: "patrol", damage: 12 }] });
  expect(result.text).toBe("No damage · No action planned · Ash hound takes 36 friendly fire");
  expect(result.detail).toBe("Cinder Watchman hits Ash hound for 36 damage.");
  const dangerous = combatOutcome(snapshot, { ...base, events: [hit, { ...hit, targetId: "solo", damage: 8 }] });
  expect(dangerous.text).toContain("Take 8 damage");
  expect(dangerous.tone).toBe("danger");
});
