import { describe, expect, test } from "bun:test";
import { createAdventure } from "./adventure.js";
import type { AdventureAction, AdventureGame, ThreatView } from "./adventure-types.js";

function tap(game: AdventureGame, action: AdventureAction): void {
  game.setAction(action, true);
  game.setAction(action, false);
}
function walk(game: AdventureGame, x: number, z: number): void {
  const from = game.snapshot.player.position;
  const dx = x - from.x, dz = z - from.z;
  game.setCameraForward(dx, dz);
  game.setAction("forward", true);
  game.advance(Math.hypot(dx, dz) / 4.5);
  game.setAction("forward", false);
  expect(game.snapshot.player.position.x).toBeCloseTo(x, 6);
  expect(game.snapshot.player.position.z).toBeCloseTo(z, 6);
}
function threat(game: AdventureGame, id: string): ThreatView {
  const target = game.snapshot.threats.find(t => t.id === id);
  if (!target) throw new Error(`Missing test threat ${id}`);
  return target;
}
function enter(game: AdventureGame): void {
  walk(game, 0, 5);
  expect(game.snapshot.phase).toBe("expedition");
}
function approachWarder(): AdventureGame {
  const game = createAdventure();
  enter(game);
  walk(game, -8, 5);
  walk(game, -8, 24);
  walk(game, -3, 26.6);
  expect(game.snapshot.player.health).toBe(100);
  expect(threat(game, "warder").phase).toBe("preparation");
  return game;
}
function finish(game: AdventureGame, id: string): void {
  game.selectTarget(id);
  while (threat(game, id).health > 0) {
    game.advance(game.snapshot.player.actionCooldown);
    tap(game, "strike");
    expect(game.snapshot.phase).toBe("expedition");
  }
}

describe("Frostwood expedition", () => {
  test("movement is normalized; opposite keys cancel; mouse forward overrides S; jump is edged", () => {
    const game = createAdventure();
    game.setAction("left", true); game.setAction("right", true);
    game.advance(1);
    expect(game.snapshot.player.position).toEqual({ x: 0, y: 0, z: -8 });
    game.setAction("left", false);
    game.setAction("forward", true);
    game.advance(0.5);
    expect(Math.hypot(game.snapshot.player.position.x, game.snapshot.player.position.z + 8)).toBeCloseTo(2.25);
    game.setAction("right", false); game.setAction("forward", false);
    game.setAction("backward", true);
    game.setMouseForward(true);
    const before = game.snapshot.player.position.z;
    game.advance(0.5);
    expect(game.snapshot.player.position.z - before).toBeCloseTo(2.25);
    expect(game.snapshot.player.backpedaling).toBe(false);
    game.setMouseForward(false); game.advance(0.1);
    expect(game.snapshot.player.backpedaling).toBe(true);
    game.setAction("backward", false);
    game.setAction("jump", true);
    game.advance(0.2);
    expect(game.snapshot.player.position.y).toBeGreaterThan(0.7);
    expect(game.snapshot.player.grounded).toBe(false);
    game.advance(1);
    game.setAction("jump", true); game.advance(0.1);
    expect(game.snapshot.player.grounded).toBe(true);
    game.setAction("jump", false); tap(game, "jump"); game.advance(0.1);
    expect(game.snapshot.player.grounded).toBe(false);
  });

  test("gate walls match the opening and town is safe", () => {
    const game = createAdventure();
    walk(game, 6, -8);
    game.setCameraForward(0, 1); game.setAction("forward", true); game.advance(3);
    game.setAction("forward", false);
    expect(game.snapshot.player.position.z).toBeLessThan(-0.49);
    expect(game.snapshot.phase).toBe("town");
    game.advance(20);
    expect(game.snapshot.player.health).toBe(100);
    walk(game, 0, game.snapshot.player.position.z);
    enter(game);
  });

  test("forecast waits its full preparation; fixed damage lands once; brace halves it and retreat evades", () => {
    const normal = approachWarder();
    const braced = createAdventure({ save: normal.save() });
    const retreat = createAdventure({ save: normal.save() });
    const forecast = threat(normal, "warder");
    tap(braced, "brace");
    walk(retreat, -3, 23);
    normal.advance(forecast.remainingSeconds - 0.01);
    braced.advance(forecast.remainingSeconds - 0.01);
    expect(normal.snapshot.player.health).toBe(100);
    expect(threat(normal, "warder").damage).toBe(forecast.damage);
    normal.advance(0.011); braced.advance(0.011);
    retreat.advance(3);
    expect(normal.snapshot.player.health).toBe(100 - forecast.damage);
    expect(braced.snapshot.player.health).toBe(100 - forecast.damage / 2);
    expect(retreat.snapshot.player.health).toBe(100);
    expect(threat(normal, "warder").phase).toBe("action");
    expect(threat(normal, "warder").targetPosition).toEqual(forecast.position);
    normal.advance(0.36);
    expect(threat(normal, "warder").phase).toBe("recovery");
    expect(normal.snapshot.player.health).toBe(100 - forecast.damage);
  });

  test("lookout alarms increase presence, kills give no supplies or stats, and nest opens the east path", () => {
    const game = createAdventure();
    enter(game); walk(game, -3, 8);
    const before = game.snapshot.presence;
    game.advance(3.1);
    expect(game.snapshot.presence - before).toBeGreaterThan(3);
    expect(game.snapshot.player.health).toBe(100);
    expect(threat(game, "scout").damage).toBe(0);
    game.selectTarget("scout");
    game.setAction("strike", true);
    game.advance(2.1);
    game.setAction("strike", true);
    expect(threat(game, "scout").health).toBe(9);
    game.setAction("strike", false); tap(game, "strike");
    expect(threat(game, "scout").phase).toBe("cleared");
    const clearedSequence = threat(game, "scout").actionSequence;
    game.advance(8);
    expect(threat(game, "scout").actionSequence).toBe(clearedSequence);
    expect(game.snapshot.supplies).toBe(15);
    expect(game.snapshot.player.maximumHealth).toBe(100);
    walk(game, 1.9, 17);
    walk(game, 1.9, 20);
    game.setCameraForward(1, 0); game.setAction("forward", true); game.advance(1);
    game.setAction("forward", false);
    expect(game.snapshot.player.position.x).toBeLessThanOrEqual(2);
    finish(game, "nest");
    walk(game, 5, 20);
    expect(threat(game, "nest").phase).toBe("cleared");
    expect(game.snapshot.supplies).toBe(15);
  });

  test("Mara sells in range; healing conserves full-health potions; one gathered batch restores supplies 12 to 15", () => {
    const game = createAdventure();
    tap(game, "buyPotion"); expect(game.snapshot.potions).toBe(0);
    walk(game, 3.4, -7.5); tap(game, "interact");
    game.setAction("buyPotion", true); game.setAction("buyPotion", true);
    expect(game.snapshot.potions).toBe(1);
    expect(game.snapshot.supplies).toBe(12);
    game.setAction("buyPotion", false);
    tap(game, "drinkPotion"); expect(game.snapshot.potions).toBe(1);
    walk(game, 0, -3); enter(game);
    expect(game.snapshot.shopOpen).toBe(false);
    walk(game, -2, 12); tap(game, "gather");
    expect(game.snapshot.cargo).toBe(3);
    expect(game.snapshot.resourceRemaining).toBe(9);
    expect(game.snapshot.player.health).toBe(92);
    tap(game, "drinkPotion"); expect(game.snapshot.player.health).toBe(100);
    expect(game.snapshot.potions).toBe(0);
    walk(game, 0, 5); walk(game, 0, -1);
    expect(game.snapshot.phase).toBe("town");
    expect(game.snapshot.supplies).toBe(15);
    expect(game.snapshot.cargo).toBe(0);
    enter(game);
    expect(game.snapshot.resourceRemaining).toBe(12);
    expect(game.snapshot.threats.every(t => t.health === t.maximumHealth)).toBe(true);
  });

  test("clearing the warder removes harvest damage; town rest restores health", () => {
    const game = approachWarder();
    finish(game, "warder");
    walk(game, -8, 26.6); walk(game, -8, 12); walk(game, -2, 12);
    const health = game.snapshot.player.health;
    expect(health).toBeLessThan(100);
    tap(game, "gather"); expect(game.snapshot.player.health).toBe(health);
    walk(game, 0, 5); walk(game, 0, -1); tap(game, "rest");
    expect(game.snapshot.player.health).toBe(100);
  });

  test("six cores call the guardian; six strikes claim a relic; return banks it and remaining cores", () => {
    const game = createAdventure();
    enter(game); walk(game, -2, 12);
    for (let i = 0; i < 4; i += 1) { tap(game, "gather"); game.advance(2); }
    expect(game.snapshot.cargo).toBe(12);
    expect(game.snapshot.resourceRemaining).toBe(0);
    walk(game, -10, 12); walk(game, -10, 43); walk(game, 2, 43);
    tap(game, "ritual");
    expect(game.snapshot.ritualCalled).toBe(true);
    expect(game.snapshot.cargo).toBe(6);
    expect(threat(game, "ritual-guardian").remainingSeconds).toBe(3);
    walk(game, 2, 43.4);
    finish(game, "ritual-guardian");
    expect(game.snapshot.carriedRelics).toBe(1);
    expect(game.snapshot.bankedRelics).toBe(0);
    walk(game, -10, 43.4); walk(game, -10, 5); walk(game, 0, 5); walk(game, 0, -1);
    expect(game.snapshot.bankedRelics).toBe(1);
    expect(game.snapshot.carriedRelics).toBe(0);
    expect(game.snapshot.supplies).toBe(21);
    enter(game);
    expect(game.snapshot.ritualCalled).toBe(false);
    expect(threat(game, "ritual-guardian").active).toBe(false);
    expect(game.snapshot.bankedRelics).toBe(1);
  });

  test("save retains committed combat and jump state without held controls; malformed saves fail", () => {
    const game = approachWarder();
    tap(game, "brace"); tap(game, "jump"); game.setAction("left", true); game.advance(0.1);
    const saved = game.save();
    const loaded = createAdventure({ save: saved });
    expect(loaded.save()).toBe(saved);
    expect(loaded.snapshot.threats).toEqual(game.snapshot.threats);
    const position = loaded.snapshot.player.position;
    loaded.advance(0.1);
    expect(loaded.snapshot.player.position.x).toBe(position.x);
    expect(loaded.snapshot.player.position.z).toBe(position.z);
    expect(loaded.snapshot.player.position.y).not.toBe(position.y);
    expect(createAdventure({ archetype: "hunter" }).snapshot.player.archetype).toBe("hunter");
    for (const bad of ["broken", "{}", saved.replace('"version":2', '"version":99'),
      saved.replace('"selectedThreat":"scout"', '"selectedThreat":"missing"'),
      saved.replace('"health":100', '"health":null')]) {
      expect(() => createAdventure({ save: bad })).toThrow();
    }
    expect(() => createAdventure({ save: saved, archetype: "mage" })).toThrow();
  });

  test("loss is permanent and saved: stores are gone and neither rest nor movement revives", () => {
    const game = approachWarder();
    game.advance(120);
    expect(game.snapshot.phase).toBe("lost");
    expect(game.snapshot.player.health).toBe(0);
    expect(game.snapshot.supplies).toBe(0);
    const lost = createAdventure({ save: game.save() });
    const position = lost.snapshot.player.position;
    tap(lost, "rest"); tap(lost, "drinkPotion"); lost.setAction("forward", true); lost.advance(1);
    expect(lost.snapshot.player.position).toEqual(position);
    expect(lost.snapshot.phase).toBe("lost");
  });

  test("hostiles acquire in range, approach, then hold the committed attack position", () => {
    const game = createAdventure();
    enter(game); walk(game, -8, 5); walk(game, -8, 22);
    expect(threat(game, "warder").disposition).toBe("hostile");
    expect(threat(game, "warder").aggro).toBe(false);
    expect(threat(game, "warder").position).toEqual(threat(game, "warder").homePosition);
    walk(game, -8, 24);
    const approaching = threat(game, "warder");
    expect(approaching.aggro).toBe(true);
    expect(approaching.phase).toBe("approach");
    expect(approaching.moving).toBe(true);
    game.advance(1.5);
    const committed = threat(game, "warder");
    expect(committed.phase).toBe("preparation");
    expect(committed.position).not.toEqual(committed.homePosition);
    expect(committed.targetPosition).toEqual(committed.position);
    expect(committed.moving).toBe(false);
    walk(game, -10, 24);
    expect(threat(game, "warder").position).toEqual(committed.position);
    expect(threat(game, "warder").targetPosition).toEqual(committed.targetPosition);
    expect(threat(game, "warder").damage).toBe(committed.damage);
    const reopened = createAdventure({ save: game.save() });
    expect(reopened.snapshot.threats).toEqual(game.snapshot.threats);
    reopened.advance(threat(reopened, "warder").remainingSeconds + 0.01);
    expect(reopened.snapshot.player.health).toBe(100);
  });

  test("neutral nest ignores proximity, retaliates when hit, and disengages beyond its territory", () => {
    const game = createAdventure();
    enter(game); walk(game, 0, 17); walk(game, 4.2, 17.65);
    game.advance(10);
    expect(threat(game, "nest").disposition).toBe("neutral");
    expect(threat(game, "nest").aggro).toBe(false);
    expect(threat(game, "nest").actionSequence).toBe(0);
    expect(game.snapshot.player.health).toBe(100);
    game.selectTarget("nest"); tap(game, "strike");
    expect(threat(game, "nest").aggro).toBe(true);
    expect(threat(game, "nest").phase).toBe("preparation");
    expect(threat(game, "nest").remainingSeconds).toBe(3);
    const reopened = createAdventure({ save: game.save() });
    expect(threat(reopened, "nest").aggro).toBe(true);
    const damage = threat(reopened, "nest").damage;
    reopened.advance(3.02);
    expect(reopened.snapshot.player.health).toBe(100 - damage);
    walk(game, 0, 12);
    expect(threat(game, "nest").aggro).toBe(false);
    expect(threat(game, "nest").phase).toBe("dormant");
  });

  test("leash releases a pursuing hostile and it walks home without following into town", () => {
    const game = createAdventure();
    enter(game); walk(game, -8, 5); walk(game, -8, 24);
    game.advance(1);
    const moved = threat(game, "warder").position;
    expect(moved).not.toEqual(threat(game, "warder").homePosition);
    walk(game, -8, 20);
    const returning = threat(game, "warder");
    expect(returning.aggro).toBe(false);
    expect(returning.phase).toBe("returning");
    expect(returning.moving).toBe(true);
    expect(returning.position).not.toEqual(returning.homePosition);
    const reloaded = createAdventure({ save: game.save() });
    reloaded.advance(3);
    expect(threat(reloaded, "warder").phase).toBe("dormant");
    expect(threat(reloaded, "warder").position).toEqual(returning.homePosition);
    walk(reloaded, 0, 5); walk(reloaded, 0, -1);
    reloaded.advance(10);
    expect(reloaded.snapshot.player.health).toBe(100);
    expect(reloaded.snapshot.threats.every(t => !t.aggro)).toBe(true);
  });

  test("live v1 journeys migrate progress and committed warnings; undamaged nests become neutral", () => {
    const legacy = { version: 1, state: {
      phase: "expedition", archetype: "hunter", position: { x: -2, y: 0, z: 12 }, verticalSpeed: 0,
      health: 73, supplies: 21, cargo: 6, resourceRemaining: 6, potions: 2, carriedRelics: 0,
      bankedRelics: 1, presence: 20, ritualCalled: false, actionCooldown: 1, guardSeconds: 2,
      attackSequence: 3, selectedThreat: "warder", report: "Three frost cores gathered.",
      threats: [
        { id: "scout", health: 0, active: true, phase: "cleared", remainingSeconds: 0, actionSequence: 2, lastActionHit: false, damage: 0 },
        { id: "nest", health: 24, active: true, phase: "preparation", remainingSeconds: 2, actionSequence: 0, lastActionHit: false, damage: 8 },
        { id: "warder", health: 21, active: true, phase: "preparation", remainingSeconds: 1.25, actionSequence: 1, lastActionHit: false, damage: 10 },
        { id: "patrol", health: 36, active: true, phase: "dormant", remainingSeconds: 0, actionSequence: 0, lastActionHit: false, damage: 10 },
        { id: "ritual-guardian", health: 48, active: false, phase: "dormant", remainingSeconds: 0, actionSequence: 0, lastActionHit: false, damage: 20 },
      ],
    } };
    const game = createAdventure({ save: JSON.stringify(legacy) });
    expect(game.snapshot.player.position).toEqual(legacy.state.position);
    expect(game.snapshot.player.archetype).toBe("hunter");
    expect(game.snapshot.player.health).toBe(73);
    expect(game.snapshot.supplies).toBe(21);
    expect(game.snapshot.cargo).toBe(6);
    expect(game.snapshot.resourceRemaining).toBe(6);
    expect(game.snapshot.potions).toBe(2);
    expect(game.snapshot.bankedRelics).toBe(1);
    expect(threat(game, "scout").phase).toBe("cleared");
    expect(threat(game, "warder").health).toBe(21);
    expect(threat(game, "warder").remainingSeconds).toBe(1.25);
    expect(threat(game, "warder").damage).toBe(10);
    expect(threat(game, "warder").targetPosition).toEqual({ x: -3, y: 0, z: 30 });
    expect(threat(game, "nest").aggro).toBe(false);
    expect(threat(game, "nest").phase).toBe("dormant");
    expect(createAdventure({ save: game.save() }).save()).toBe(game.save());
    const dead = createAdventure({ save: JSON.stringify({ ...legacy, state: { ...legacy.state,
      phase: "lost", health: 0, supplies: 0, cargo: 0, potions: 0, carriedRelics: 0, bankedRelics: 0,
    } }) });
    dead.advance(20); tap(dead, "rest");
    expect(dead.snapshot.phase).toBe("lost");
    expect(dead.snapshot.player.health).toBe(0);
  });
});
