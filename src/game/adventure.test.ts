import { describe, expect, test } from "bun:test";
import { COMBAT_RULES, createAdventure, getMonsterLore } from "./adventure.js";
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
function positioned(x: number, z: number): AdventureGame {
  const saved = JSON.parse(createAdventure().save());
  saved.state.phase = "expedition"; saved.state.position = {x,y:0,z};
  return createAdventure({save:JSON.stringify(saved)});
}
function approachWarder(): AdventureGame {
  const game = positioned(1.8,24.1);
  game.advance(1.5);
  expect(game.snapshot.player.health).toBe(100);
  expect(threat(game,"warder").phase).toBe("preparation");
  return game;
}
function finish(game: AdventureGame, id: string): void {
  game.selectTarget(id);
  for (let attempts=0; threat(game,id).health>0 && attempts<20; attempts++) {
    game.advance(Math.max(game.snapshot.player.actionCooldown, game.snapshot.player.stamina === 0 ? game.snapshot.player.staminaRecoverySeconds : 0));
    tap(game, "strike");
    game.advance(COMBAT_RULES.strike.duration);
    expect(game.snapshot.phase).toBe("expedition");
  }
  expect(threat(game,id).health).toBe(0);
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

  test("forecast commits before damage; a timely brace absorbs the strike; leaving the committed area evades", () => {
    const normal = approachWarder();
    const braced = createAdventure({save:normal.save()});
    const forecast = threat(normal,"warder");
    normal.advance(forecast.remainingSeconds); braced.advance(forecast.remainingSeconds);
    tap(braced,"brace");
    expect(normal.snapshot.player.health).toBe(100);
    expect(threat(normal,"warder").damage).toBe(forecast.damage);
    expect(threat(normal,"warder").phase).toBe("action");
    const retreat=createAdventure({save:normal.save()});
    const area=threat(normal,"warder").targetPosition;
    const from=retreat.snapshot.player.position;
    const dx=from.x-area.x,dz=from.z-area.z,length=Math.hypot(dx,dz);
    walk(retreat,from.x,from.z-1);
    retreat.advance(0.35);
    normal.advance(0.35); braced.advance(0.35);
    expect(normal.snapshot.player.health).toBe(100-forecast.damage);
    expect(braced.snapshot.player.health).toBe(100);
    expect(braced.snapshot.player.block).toBe(10-forecast.damage);
    expect(retreat.snapshot.player.health).toBe(100);
    expect(threat(normal,"warder").phase).toBe("recovery");
    expect(threat(normal,"warder").actionSequence).toBe(1);
    normal.advance(0.1);
    expect(normal.snapshot.player.health).toBe(100-forecast.damage);
  });

  test("first head has a targeted beam; kills give no supplies or stats; nest opens the east path", () => {
    const game=positioned(-3,8.1);
    game.advance(3.02);
    expect(game.snapshot.player.health).toBe(98);
    expect(threat(game,"scout").autoAttack?.name).toBe("Ember Beam");
    expect(threat(game,"scout").currentAbility.name).toBe("Fireball ×1");
    game.selectTarget("scout");
    game.setAction("strike",true); game.advance(2.1); game.setAction("strike",true);
    expect(threat(game,"scout").health).toBe(69);
    game.setAction("strike",false); finish(game,"scout");
    const sequence=threat(game,"scout").actionSequence;
    game.advance(8); expect(threat(game,"scout").actionSequence).toBe(sequence);
    expect(game.snapshot.supplies).toBe(15);
    expect(game.snapshot.player.maximumHealth).toBe(100);
    walk(game,1.9,17); walk(game,1.9,20);
    game.setCameraForward(1,0); game.setAction("forward",true); game.advance(1); game.setAction("forward",false);
    expect(game.snapshot.player.position.x).toBeLessThanOrEqual(2);
    finish(game,"nest"); walk(game,5,20);
    expect(threat(game,"nest").phase).toBe("cleared");
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
    walk(game, -2, 12); const beforeHarvest=game.snapshot.player.health; tap(game, "gather");
    expect(game.snapshot.cargo).toBe(3);
    expect(game.snapshot.resourceRemaining).toBe(9);
    expect(game.snapshot.player.health).toBe(beforeHarvest-8);
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

  test("clearing the warder removes harvest damage; inn rest restores health", () => {
    const game = approachWarder();
    finish(game, "warder");
    walk(game, -8, 26.6); walk(game, -8, 12); walk(game, -2, 12);
    const health = game.snapshot.player.health;
    expect(health).toBeLessThan(100);
    tap(game, "gather"); expect(game.snapshot.player.health).toBe(health);
    walk(game, 0, 5); walk(game, 0, -1); const beforeRest=game.snapshot.player.health; tap(game, "rest");
    expect(game.snapshot.player.health).toBe(beforeRest);
    walk(game, 5, -11); tap(game, "interact");
    expect(game.snapshot.innOpen).toBe(true);
    expect(game.snapshot.shopOpen).toBe(false);
    expect(game.snapshot.log.at(-1)?.text).toContain("Rowan says:");
    tap(game, "rest");
    expect(game.snapshot.player.health).toBe(100);
    expect(game.snapshot.log.at(-1)?.text).toContain(`recover ${100-beforeRest} health`);
    tap(game, "closeInn");
    expect(game.snapshot.innOpen).toBe(false);
    tap(game, "interact"); walk(game, 0, -8);
    expect(game.snapshot.innOpen).toBe(false);
  });

  test("combat history preserves arrival damage, consumed block, a miss and repeated messages", () => {
    const game=approachWarder(); game.selectTarget("warder");
    tap(game,"strike"); game.advance(COMBAT_RULES.strike.duration);
    expect(game.snapshot.log.at(-1)?.text).toBe("You lunge at Root warder for 9 damage.");
    game.advance(threat(game,"warder").remainingSeconds); tap(game,"brace");
    const damage=threat(game,"warder").damage,health=game.snapshot.player.health;
    game.advance(threat(game,"warder").remainingSeconds+0.35);
    expect(game.snapshot.player.health).toBe(health);
    expect(game.snapshot.log.at(-1)?.text).toContain("0 damage ("+damage+" blocked by Brace)");
    game.advance(threat(game,"warder").remainingSeconds);
    game.advance(threat(game,"warder").remainingSeconds);
    const area=threat(game,"warder").targetPosition;
    const saved=JSON.parse(game.save()); saved.state.position={x:area.x-6,y:0,z:area.z};
    const miss=createAdventure({save:JSON.stringify(saved)}),before=miss.snapshot.player.health;
    miss.advance(0.35);
    expect(miss.snapshot.player.health).toBe(before);
    expect(miss.snapshot.log.at(-1)?.text).toContain("misses you");
    tap(miss,"drinkPotion"); tap(miss,"drinkPotion");
    expect(miss.snapshot.log.slice(-2).map(e=>e.text)).toEqual(["No health potions. Visit Mara in Hearthstead.","No health potions. Visit Mara in Hearthstead."]);
    const count=miss.snapshot.log.length; miss.advance(0.01);
    expect(miss.snapshot.log.length).toBe(count);
    expect(new Set(miss.snapshot.log.map(e=>e.id)).size).toBe(count);
  });

  test("six cores call the guardian; six strikes claim a relic; return banks it and remaining cores", () => {
    const prepared=JSON.parse(positioned(2,43).save());
    prepared.state.cargo=12; prepared.state.resourceRemaining=0;
    const game=createAdventure({save:JSON.stringify(prepared)});
    tap(game, "ritual");
    expect(game.snapshot.ritualCalled).toBe(true);
    expect(game.snapshot.cargo).toBe(6);
    expect(threat(game, "ritual-guardian").remainingSeconds).toBe(3);
    walk(game, 2, 43.4);
    finish(game, "ritual-guardian");
    expect(game.snapshot.carriedRelics).toBe(0);
    const corpse = threat(game, "ritual-guardian").position;
    walk(game, corpse.x, corpse.z);
    tap(game, "interact");
    expect(game.snapshot.lootOpenId).toBe("ritual-guardian");
    tap(game, "takeLoot");
    expect(game.snapshot.carriedRelics).toBe(1);
    game.openLoot("ritual-guardian"); tap(game, "takeLoot");
    expect(game.snapshot.carriedRelics).toBe(1);
    expect(game.snapshot.bankedRelics).toBe(0);
    const v2 = game.save().replace('"version":7', '"version":2').replaceAll('"phase":"patrol"','"phase":"dormant"')
      .replace(/,"lootClaimed":(?:true|false)/g, "").replace(/,"carriedSalvage":\d+/g, "");
    const migrated = createAdventure({ save: v2 });
    expect(migrated.snapshot.carriedRelics).toBe(1);
    expect(migrated.snapshot.loot.find(item => item.sourceId === "ritual-guardian")?.available).toBe(false);
    migrated.openLoot("ritual-guardian"); tap(migrated, "takeLoot");
    expect(migrated.snapshot.carriedRelics).toBe(1);
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
    for (const bad of ["broken", "{}", saved.replace('"version":7', '"version":99'),
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

  test("hostiles acquire in range, approach and pursue during preparation", () => {
    const game = createAdventure();
    enter(game); walk(game, 1.8, 5); walk(game, 1.8, 22);
    expect(threat(game, "warder").disposition).toBe("hostile");
    expect(threat(game, "warder").aggro).toBe(false);
    expect(threat(game, "warder").position).toEqual(threat(game, "warder").homePosition);
    walk(game, 1.8, 24.1);
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
    expect(threat(game, "warder").position).not.toEqual(committed.position);
    expect(threat(game, "warder").targetPosition).toEqual(threat(game,"warder").position);
    expect(threat(game, "warder").damage).toBe(committed.damage);
    const reopened = createAdventure({ save: game.save() });
    expect(reopened.snapshot.threats).toEqual(game.snapshot.threats);
    const healthBefore=reopened.snapshot.player.health;
    reopened.advance(threat(reopened, "warder").remainingSeconds);
    expect(reopened.snapshot.player.health).toBe(healthBefore);
    expect(threat(reopened,"warder").phase).toBe("action");
  });

  test("neutral nest ignores proximity, retaliates when hit, and disengages beyond its territory", () => {
    const game = positioned(4.2,17.65);
    game.advance(10);
    expect(threat(game, "nest").disposition).toBe("neutral");
    expect(threat(game, "nest").aggro).toBe(false);
    expect(threat(game, "nest").actionSequence).toBe(0);
    expect(game.snapshot.player.health).toBe(100);
    game.selectTarget("nest"); tap(game, "strike"); game.advance(COMBAT_RULES.strike.duration);
    expect(threat(game, "nest").aggro).toBe(true);
    expect(threat(game, "nest").phase).toBe("preparation");
    expect(threat(game, "nest").remainingSeconds).toBeCloseTo(3,1);
    const reopened = createAdventure({ save: game.save() });
    expect(threat(reopened, "nest").aggro).toBe(true);
    const damage = threat(reopened, "nest").damage;
    reopened.advance(3.35);
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
    const returnedHealth=reloaded.snapshot.player.health;
    reloaded.advance(10);
    expect(reloaded.snapshot.player.health).toBe(returnedHealth);
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
    legacy.state.ritualCalled = true;
    legacy.state.carriedRelics = 1;
    const guardian = legacy.state.threats.find(t => t.id === "ritual-guardian")!;
    guardian.active = true; guardian.health = 0; guardian.phase = "cleared";
    const oldRelic = createAdventure({ save: JSON.stringify(legacy) });
    expect(oldRelic.snapshot.carriedRelics).toBe(1);
    expect(oldRelic.snapshot.loot.find(item => item.sourceId === "ritual-guardian")?.available).toBe(false);
    expect(oldRelic.snapshot.loot.find(item => item.sourceId === "scout")?.available).toBe(true);
  });

  test("corpse loot is manual, nearby and claimed once; salvage persists then banks on extraction", () => {
    const game = createAdventure();
    enter(game); walk(game, -3, 8);
    game.openLoot("scout"); tap(game, "takeLoot");
    expect(game.snapshot.lootOpenId).toBe(null);
    expect(game.snapshot.carriedSalvage).toBe(0);
    finish(game, "scout");
    expect(game.snapshot.carriedSalvage).toBe(0);
    expect(game.snapshot.supplies).toBe(15);
    const loot = game.snapshot.loot.find(item => item.sourceId === "scout")!;
    expect(loot.available).toBe(true);
    expect(loot.reachable).toBe(true);
    expect(loot.position).toEqual(threat(game, "scout").position);
    const reopened = createAdventure({ save: game.save() });
    expect(reopened.snapshot.loot).toEqual(game.snapshot.loot);
    game.selectTarget("warder");
    tap(game, "interact");
    expect(game.snapshot.lootOpenId).toBe("scout");
    walk(game, -3, 6);
    expect(game.snapshot.lootOpenId).toBe(null);
    game.openLoot("scout"); tap(game, "takeLoot");
    expect(game.snapshot.carriedSalvage).toBe(0);
    walk(game, -3, 8); tap(game, "interact"); tap(game, "closeLoot");
    expect(game.snapshot.lootOpenId).toBe(null);
    game.openLoot("scout"); tap(game, "takeLoot");
    expect(game.snapshot.carriedSalvage).toBe(1);
    expect(game.snapshot.cargo).toBe(0);
    expect(game.snapshot.supplies).toBe(15);
    expect(game.snapshot.lootOpenId).toBe(null);
    expect(game.snapshot.loot[0]?.available).toBe(false);
    const claimed = createAdventure({ save: game.save() });
    claimed.openLoot("scout"); tap(claimed, "takeLoot");
    expect(claimed.snapshot.carriedSalvage).toBe(1);
    expect(claimed.snapshot.lootOpenId).toBe(null);
    walk(claimed, 0, 5); walk(claimed, 0, -1);
    expect(claimed.snapshot.supplies).toBe(16);
    expect(claimed.snapshot.carriedSalvage).toBe(0);
    enter(claimed);
    expect(claimed.snapshot.loot).toEqual([]);
    expect(claimed.snapshot.carriedSalvage).toBe(0);
    expect(claimed.snapshot.supplies).toBe(16);
    walk(game, -8, 8); walk(game, -8, 24); walk(game, -3, 26.6);
    game.advance(120);
    expect(game.snapshot.phase).toBe("lost");
    expect(game.snapshot.carriedSalvage).toBe(0);
    expect(game.snapshot.supplies).toBe(0);
    game.openLoot("scout"); tap(game, "takeLoot");
    expect(game.snapshot.lootOpenId).toBe(null);
    expect(createAdventure({ save: game.save() }).snapshot.carriedSalvage).toBe(0);
  });

  test("moving creatures leave their loot where they died and current saves require claim flags", () => {
    const game = approachWarder();
    finish(game, "warder");
    const corpse = threat(game, "warder").position;
    expect(corpse).not.toEqual(threat(game, "warder").homePosition);
    expect(game.snapshot.loot.find(item => item.sourceId === "warder")?.position).toEqual(corpse);
    game.advance(8);
    expect(threat(game, "warder").position).toEqual(corpse);
    const v2 = game.save().replace('"version":7', '"version":2').replaceAll('"phase":"patrol"','"phase":"dormant"')
      .replace(/,"lootClaimed":(?:true|false)/g, "").replace(/,"carriedSalvage":\d+/g, "");
    const migrated = createAdventure({ save: v2 });
    expect(migrated.snapshot.player.health).toBe(game.snapshot.player.health);
    expect(migrated.snapshot.player.position).toEqual(game.snapshot.player.position);
    expect(migrated.snapshot.loot.find(item => item.sourceId === "warder")?.position).toEqual(corpse);
    expect(migrated.snapshot.loot.find(item => item.sourceId === "warder")?.available).toBe(true);
    const broken = game.save().replace('"lootClaimed":false', '"lootClaimed":null');
    expect(() => createAdventure({ save: broken })).toThrow();
  });
});

function wolfPositioned(x: number,z: number): AdventureGame {
  const saved=JSON.parse(positioned(x,z).save());
  const head=saved.state.threats.find((t:{id:string})=>t.id==="scout");
  Object.assign(head,{health:0,phase:"cleared",remainingSeconds:0,aggro:false,lootClaimed:true});
  const wolf=saved.state.threats.find((t:{id:string})=>t.id==="patrol");
  wolf.position={x:-3,y:0,z:10};wolf.targetPosition={...wolf.position};
  return createAdventure({save:JSON.stringify(saved)});
}
function houndMaul(): AdventureGame {
  const game=wolfPositioned(-3,8.1); game.advance(0.01);
  expect(game.snapshot.player.health).toBe(96);
  expect(threat(game,"patrol").autoAttackSequence).toBe(1);
  expect(threat(game,"patrol").phase).toBe("preparation");
  expect(threat(game,"patrol").remainingSeconds).toBeCloseTo(5);
  return game;
}

describe("first hound and three combat choices",()=>{
  test("patrols move in town, keep their moving positions on entry, and acquire from that position",()=>{
    const game=createAdventure();
    const start=threat(game,"patrol");
    expect(start.phase).toBe("patrol");
    expect(start.autoAttack).toMatchObject({id:"bite",damage:4,range:2,noticeSeconds:0});
    expect(start.nextAbility).toMatchObject({id:"maul",damage:9,range:3,noticeSeconds:5});
    game.advance(1);
    expect(threat(game,"patrol").position).not.toEqual(start.position);
    expect(threat(game,"patrol").moving).toBe(true);
    expect(threat(game,"patrol").aggro).toBe(false);
    const saved=JSON.parse(game.save()); saved.state.position={x:0,y:0,z:1.99};
    const gate=createAdventure({save:JSON.stringify(saved)});
    const before=threat(gate,"patrol").position;
    gate.setAction("forward",true); gate.advance(0.01);
    expect(gate.snapshot.phase).toBe("expedition");
    expect(Math.hypot(threat(gate,"patrol").position.x-before.x,threat(gate,"patrol").position.z-before.z)).toBeLessThan(0.05);
    const moved=JSON.parse(game.save()); moved.state.phase="expedition";
    moved.state.threats.find((t:{id:string})=>t.id==="patrol").position={x:-6,y:0,z:14};
    moved.state.position={x:-6,y:0,z:19};
    const acquire=createAdventure({save:JSON.stringify(moved)}); acquire.advance(0.01);
    expect(threat(acquire,"patrol").aggro).toBe(true);
    expect(threat(acquire,"patrol").phase).toBe("preparation");
  });

  test("Bite has its own clock while Maul warns five seconds, translates, lands once and recovers",()=>{
    const game=houndMaul(),warning=threat(game,"patrol");
    expect(warning.currentAbility.id).toBe("maul"); expect(warning.autoAttack?.id).toBe("bite");
    game.advance(4.99); expect(threat(game,"patrol").actionSequence).toBe(0);
    game.advance(0.01);
    const committed=threat(game,"patrol");
    expect(committed.phase).toBe("action"); expect(committed.phaseDuration).toBe(0.65);
    const health=game.snapshot.player.health;
    game.advance(0.325);
    expect(threat(game,"patrol").position).not.toEqual(committed.position);
    expect(threat(game,"patrol").position.y).toBeCloseTo(0.9);
    expect(threat(game,"patrol").targetPosition).toEqual(committed.targetPosition);
    game.advance(0.325);
    expect(game.snapshot.player.health).toBe(health-9);
    expect(threat(game,"patrol").actionSequence).toBe(1);
    expect(threat(game,"patrol").phase).toBe("recovery");
    expect(threat(game,"patrol").nextAttackSeconds).toBe(5);
    const landing=threat(game,"patrol").position;
    game.advance(2);
    expect(threat(game,"patrol").position).toEqual(landing);
    expect(threat(game,"patrol").nextAttackSeconds).toBeCloseTo(3);
    expect(threat(game,"patrol").phase).toBe("preparation");
  });

  test("circling faces the player, notice does not reset, and recovery cannot pursue",()=>{
    const game=houndMaul(),before=threat(game,"patrol");
    walk(game,-3,4.6);
    const after=threat(game,"patrol");
    expect(after.position).not.toEqual(before.position);
    expect(after.moving).toBe(true);
    const dx=game.snapshot.player.position.x-after.position.x,dz=game.snapshot.player.position.z-after.position.z;
    expect(after.facing.x).toBeCloseTo(dx/Math.hypot(dx,dz));
    expect(after.facing.z).toBeCloseTo(dz/Math.hypot(dx,dz));
    expect(after.remainingSeconds).toBeCloseTo(before.remainingSeconds-3.5/4.5);
    expect(after.damage).toBe(before.damage);
    const saved=JSON.parse(game.save()),wolf=saved.state.threats.find((t:{id:string})=>t.id==="patrol");
    wolf.phase="recovery";wolf.remainingSeconds=2;wolf.wolf.motion=null;wolf.position.y=0;
    const recovery=createAdventure({save:JSON.stringify(saved)}),position=threat(recovery,"patrol").position;
    recovery.setCameraForward(1,0); recovery.setAction("forward",true); recovery.advance(0.5);
    expect(threat(recovery,"patrol").moving).toBe(false);
    expect(threat(recovery,"patrol").position).toEqual(position);
  });

  test("Lunge owns smooth movement, hits on arrival, preserves held controls, and rejects invalid range",()=>{
    const game=wolfPositioned(-3,4.5); game.selectTarget("patrol");
    expect(threat(game,"patrol").canStrike).toBe(true);
    tap(game,"strike");
    expect(threat(game,"patrol").health).toBe(54);
    expect(game.snapshot.player.maneuver).toBe("lunge");
    expect(game.snapshot.player.stamina).toBe(2);
    expect(game.snapshot.player.actionCooldown).toBe(1);
    game.setCameraForward(1,0); game.setAction("forward",true);
    game.advance(0.125);
    expect(game.snapshot.player.position.z).toBeGreaterThan(4.5);
    expect(game.snapshot.player.position.z).toBeLessThan(8.5);
    expect(game.snapshot.player.facing).toEqual({x:0,y:0,z:1});
    expect(threat(game,"patrol").health).toBe(54);
    game.advance(0.125);
    expect(threat(game,"patrol").health).toBe(45);
    expect(game.snapshot.player.attackSequence).toBe(1);
    expect(game.snapshot.player.maneuver).toBe("none");
    const landed=game.snapshot.player.position; game.advance(0.1);
    expect(game.snapshot.player.position.x).toBeCloseTo(landed.x+0.45);
    const far=wolfPositioned(10,6); far.selectTarget("patrol");
    tap(far,"strike"); tap(far,"disengage");
    expect(far.snapshot.player.stamina).toBe(3);
    expect(far.snapshot.player.attackSequence).toBe(0);
    expect(threat(far,"patrol").health).toBe(54);
  });

  test("Disengage roots until landing, saves midair, and releases into the wolf's real recovery",()=>{
    const game=houndMaul(); game.selectTarget("patrol");
    const enemy=threat(game,"patrol").position;
    tap(game,"disengage");
    expect(threat(game,"patrol").health).toBe(48);
    expect(threat(game,"patrol").rootedSeconds).toBe(0.8);
    game.advance(0.4);
    expect(game.snapshot.player.position.y).toBeCloseTo(1.2);
    expect(threat(game,"patrol").position).toEqual(enemy);
    const saved=game.save(),reopened=createAdventure({save:saved});
    expect(reopened.save()).toBe(saved);
    game.advance(0.39);reopened.advance(0.39);expect(reopened.save()).toBe(game.save());
    expect(threat(game,"patrol").rootedSeconds).toBeGreaterThan(0);
    game.advance(0.01);reopened.advance(0.01);expect(reopened.save()).toBe(game.save());
    expect(game.snapshot.player.grounded).toBe(true);
    expect(threat(game,"patrol").rootedSeconds).toBe(0);
    game.advance(0.5);
    expect(threat(game,"patrol").position).not.toEqual(enemy);
    expect(threat(game,"patrol").aggro).toBe(true);
  });

  test("root pauses pursuit without pausing Maul notice",()=>{
    const game=houndMaul(); game.selectTarget("patrol");
    tap(game,"disengage");
    const enemy=threat(game,"patrol"); game.advance(0.4);
    expect(threat(game,"patrol").position).toEqual(enemy.position);
    expect(threat(game,"patrol").remainingSeconds).toBeCloseTo(4.6);
    expect(threat(game,"patrol").moving).toBe(false);
  });

  test("block is consumed across hits, expires at two seconds, and brace spends two stamina",()=>{
    const game=wolfPositioned(-3,8.1); tap(game,"brace");
    expect(game.snapshot.player.block).toBe(10);
    tap(game,"brace"); expect(game.snapshot.player.block).toBe(10);
    expect(game.snapshot.player.stamina).toBe(1);
    game.advance(0.02);
    expect(game.snapshot.player.health).toBe(100);
    expect(game.snapshot.player.block).toBe(6);
    const saved=JSON.parse(game.save());
    const h=saved.state.threats.find((t:{id:string})=>t.id==="patrol");
    h.abilityIndex=1; h.damage=9; h.phase="action"; h.remainingSeconds=0.1;
    const second=createAdventure({save:JSON.stringify(saved)}); second.advance(0.1);
    expect(second.snapshot.player.health).toBe(97);
    expect(second.snapshot.player.block).toBe(0);
    expect(second.snapshot.player.guardSeconds).toBe(0);
    const expiry=wolfPositioned(10,6); tap(expiry,"brace"); expiry.advance(1.99);
    expect(expiry.snapshot.player.block).toBe(10);
    expect(expiry.snapshot.player.stamina).toBe(1);
    tap(expiry,"brace"); expect(expiry.snapshot.player.guardSeconds).toBeCloseTo(0.01);
    expiry.advance(0.01); expect(expiry.snapshot.player.block).toBe(0);
    tap(expiry,"brace"); expect(expiry.snapshot.player.block).toBe(10);
    expect(expiry.snapshot.player.stamina).toBe(0);
  });

  test("maneuvers respect gate walls and thicket, and ordinary jumps cannot cast them",()=>{
    const gate=wolfPositioned(4,5); const saved=JSON.parse(gate.save());
    saved.state.threats.find((t:{id:string})=>t.id==="patrol").position={x:4,y:0,z:7};
    const leap=createAdventure({save:JSON.stringify(saved)}); leap.selectTarget("patrol"); tap(leap,"disengage"); leap.advance(0.8);
    expect(leap.snapshot.player.position.z).toBeGreaterThan(4);
    expect(leap.snapshot.player.grounded).toBe(true);
    expect(threat(leap,"patrol").rootedSeconds).toBe(0);
    const nest=wolfPositioned(1.9,20); nest.selectTarget("nest"); tap(nest,"strike"); nest.advance(0.25);
    expect(nest.snapshot.player.position.x).toBeLessThanOrEqual(2);
    expect(threat(nest,"nest").health).toBe(15);
    tap(nest,"jump"); nest.advance(0.1); tap(nest,"disengage");
    expect(nest.snapshot.player.stamina).toBe(2);
    const blocked=JSON.parse(wolfPositioned(1.9,20).save());
    blocked.state.threats.find((t:{id:string})=>t.id==="patrol").position={x:5,y:0,z:20};
    const wall=createAdventure({save:JSON.stringify(blocked)}); wall.selectTarget("patrol");
    expect(threat(wall,"patrol").canStrike).toBe(false); tap(wall,"strike");
    expect(wall.snapshot.player.stamina).toBe(3);
  });

  test("v3 keeps character, loot and already-resolved hits while converting old guard and scout warnings",()=>{
    const legacy=JSON.parse(wolfPositioned(-3,8.1).save()); legacy.version=3;
    Object.assign(legacy.state,{health:73,supplies:27,cargo:6,resourceRemaining:6,potions:2,carriedSalvage:1,guardSeconds:2,bankedRelics:1});
    for(const t of legacy.state.threats){
      delete t.patrolIndex;delete t.moving;delete t.abilityIndex;
      if(t.phase==="patrol")t.phase="dormant";
      if(t.id==="scout")Object.assign(t,{health:12,lootClaimed:false,damage:0,phase:"action",remainingSeconds:0.2,actionSequence:3,aggro:true});
      if(t.id==="nest")Object.assign(t,{health:0,phase:"cleared",lootClaimed:true});
    }
    delete legacy.state.block;delete legacy.state.maneuver;
    const game=createAdventure({save:JSON.stringify(legacy)});
    expect(game.snapshot.player).toMatchObject({health:73,block:5,guardSeconds:2,maneuver:"none"});
    expect(game.snapshot).toMatchObject({supplies:27,cargo:6,resourceRemaining:6,potions:2,carriedSalvage:1,bankedRelics:1});
    expect(threat(game,"scout")).toMatchObject({health:12,phase:"preparation",actionSequence:3});
    expect(game.snapshot.loot.find(t=>t.sourceId==="nest")?.available).toBe(false);
    game.advance(0.2);
    expect(game.snapshot.player.health).toBe(73);
    expect(threat(game,"scout").actionSequence).toBe(3);
    expect(createAdventure({save:game.save()}).save()).toBe(game.save());
    const warned=structuredClone(legacy);
    Object.assign(warned.state.threats.find((t:{id:string})=>t.id==="scout"),{phase:"preparation",remainingSeconds:1.25});
    const warning=createAdventure({save:JSON.stringify(warned)});
    expect(threat(warning,"scout")).toMatchObject({remainingSeconds:5,damage:3,currentAbility:{id:"fireball"}});
  });

  test("save/reopen during Bite follow-through, Lunge and patrol never grants an extra hit",()=>{
    const bite=wolfPositioned(-3,8.1); bite.advance(0.02);
    const reopened=createAdventure({save:bite.save()}); reopened.advance(0.3);
    expect(reopened.snapshot.player.health).toBe(96);
    expect(threat(reopened,"patrol").autoAttackSequence).toBe(1);
    const lunge=wolfPositioned(-3,4.5); lunge.selectTarget("patrol"); tap(lunge,"strike"); lunge.advance(0.1);
    const loaded=createAdventure({save:lunge.save()}); loaded.advance(0.15); lunge.advance(0.15);
    expect(loaded.save()).toBe(lunge.save());
    expect(threat(loaded,"patrol").health).toBe(45);
    loaded.advance(0.1); expect(threat(loaded,"patrol").health).toBe(45);
    const patrol=createAdventure(); patrol.advance(1);
    const restored=createAdventure({save:patrol.save()}); patrol.advance(1); restored.advance(1);
    expect(restored.save()).toBe(patrol.save());
  });
});

function wolfFixture(playerX: number, playerZ: number, wolfX = -3, wolfZ = 12): AdventureGame {
  const saved=JSON.parse(wolfPositioned(playerX,playerZ).save()),t=saved.state.threats.find((t:{id:string})=>t.id==="patrol");
  Object.assign(t,{aggro:true,phase:"preparation",remainingSeconds:5,abilityIndex:1,damage:9,
    position:{x:wolfX,y:0,z:wolfZ},targetPosition:{x:playerX,y:0,z:playerZ}});
  t.wolf.rng=0;
  return createAdventure({save:JSON.stringify(saved)});
}

describe("wolf hops, commitment and independent contact attacks",()=>{
  test("each diagonal hop draws its own left/right coin and saved airborne motion resumes exactly",()=>{
    const game=wolfFixture(-3,22);
    const origin=threat(game,"patrol").position;
    game.advance(0.25);
    const first=threat(game,"patrol");
    expect(first.movementMode).toBe("hop");
    expect(first.position.y).toBeCloseTo(0.6);
    expect(first.position.x-origin.x).toBeCloseTo(first.position.z-origin.z);
    const save=game.save(),reopened=createAdventure({save});
    expect(reopened.save()).toBe(save);
    game.advance(0.25);reopened.advance(0.25);
    expect(reopened.save()).toBe(game.save());
    const firstLanding=threat(game,"patrol").position;
    game.advance(0.01);
    const second=JSON.parse(game.save()).state.threats.find((t:{id:string})=>t.id==="patrol").wolf;
    expect(second.rng).toBe(1196435762);
    const secondDirection={x:second.motion.destination.x-firstLanding.x,z:second.motion.destination.z-firstLanding.z};
    const facing={x:-3-firstLanding.x,z:22-firstLanding.z};
    expect(facing.x*secondDirection.z-facing.z*secondDirection.x).toBeLessThan(0);
    const rightSave=JSON.parse(wolfFixture(-3,22).save());rightSave.state.threats.find((t:{id:string})=>t.id==="patrol").wolf.rng=1000;
    const right=createAdventure({save:JSON.stringify(rightSave)});right.advance(0.25);
    expect(threat(right,"patrol").position.x).toBeLessThan(origin.x);
  });

  test("Maul holds its launch facing and endpoint while the player dodges, with saved progress",()=>{
    const game=wolfFixture(0,12,-4,12);
    game.advance(5);
    const launched=threat(game,"patrol"),health=game.snapshot.player.health;
    expect(launched.movementMode).toBe("lunge");
    expect(launched.attackOrigin).toEqual(launched.position);
    expect(launched.targetPosition).toEqual({x:0,y:0,z:12});
    game.setCameraForward(0,1);game.setAction("forward",true);game.advance(0.3);
    const middle=threat(game,"patrol");
    expect(middle.targetPosition).toEqual(launched.targetPosition);
    expect(middle.facing).toEqual(launched.facing);
    expect(middle.attackOrigin).toEqual(launched.attackOrigin);
    const saved=game.save(),reopened=createAdventure({save:saved});
    expect(reopened.save()).toBe(saved);
    game.setAction("forward",false);game.advance(0.35);reopened.advance(0.35);
    expect(reopened.save()).toBe(game.save());
    expect(threat(game,"patrol").position).toEqual(launched.targetPosition);
    expect(threat(game,"patrol").phase).toBe("recovery");
    expect(game.snapshot.player.health).toBeLessThanOrEqual(health);
  });

  test("a full Disengage dodges Maul; a ready Bite waits for recovery then pursues to actual contact",()=>{
    const saved=JSON.parse(wolfFixture(0,12,-2,12).save()),t=saved.state.threats.find((t:{id:string})=>t.id==="patrol");
    t.remainingSeconds=0.01;t.wolf.nextAttackSeconds=0.01;t.wolf.contacted=true;t.wolf.autoAttackSeconds=0.7;
    const game=createAdventure({save:JSON.stringify(saved)});game.advance(0.01);
    game.selectTarget("patrol");tap(game,"disengage");
    game.advance(0.8);
    expect(game.snapshot.player.position.x).toBeCloseTo(5);
    expect(game.snapshot.player.health).toBe(100);
    expect(threat(game,"patrol").lastActionHit).toBe(false);
    const landed=threat(game,"patrol").position;
    game.advance(1.85);
    expect(threat(game,"patrol").position).toEqual(landed);
    expect(threat(game,"patrol").nextAttackSeconds).toBeCloseTo(3);
    expect(threat(game,"patrol").autoAttackSeconds).toBe(0);
    game.advance(0.1);
    expect(threat(game,"patrol").movementMode).toBe("bite");
    expect(game.snapshot.player.health).toBe(100);
    game.advance(0.7);
    expect(game.snapshot.player.health).toBe(96);
    expect(threat(game,"patrol").autoAttackSequence).toBe(1);
    expect(threat(game,"patrol").autoAttackSeconds).toBeGreaterThan(3);
  });

  test("Bite and Maul can overlap in contact and consume one block pool",()=>{
    const saved=JSON.parse(wolfFixture(0,12,-2,12).save()),t=saved.state.threats.find((t:{id:string})=>t.id==="patrol");
    t.remainingSeconds=0.01;t.wolf.nextAttackSeconds=0.01;t.wolf.contacted=true;t.wolf.autoAttackSeconds=0.66;
    const game=createAdventure({save:JSON.stringify(saved)});tap(game,"brace");game.advance(0.67);
    expect(game.snapshot.player.health).toBe(97);
    expect(game.snapshot.player.block).toBe(0);
    expect(threat(game,"patrol").actionSequence).toBe(1);
    expect(threat(game,"patrol").autoAttackSequence).toBe(1);
    expect(game.snapshot.log.filter(e=>e.channel==="combat"&&e.text.includes("hits you")).length).toBe(2);
  });

  test("ready Bite cannot damage through cover or chase during recovery; town cancels both",()=>{
    const saved=JSON.parse(wolfFixture(4,17,-1,20).save()),t=saved.state.threats.find((t:{id:string})=>t.id==="patrol");
    t.wolf.contacted=true;t.wolf.autoAttackSeconds=0;t.phase="recovery";t.remainingSeconds=2;
    const game=createAdventure({save:JSON.stringify(saved)}),position=threat(game,"patrol").position;
    game.advance(1);
    expect(game.snapshot.player.health).toBe(100);
    expect(threat(game,"patrol").position).toEqual(position);
    const townSave=JSON.parse(game.save());townSave.state.phase="town";townSave.state.position={x:0,y:0,z:-1};
    const town=createAdventure({save:JSON.stringify(townSave)});town.advance(8);
    expect(town.snapshot.player.health).toBe(100);
    expect(threat(town,"patrol").aggro).toBe(false);
    expect(threat(town,"patrol").autoAttackSequence).toBe(0);
  });

  test("Maul endpoint and translation stop at thicket, and hop cannot cross gate walls",()=>{
    const saved=JSON.parse(wolfFixture(5,17,5,25).save()),t=saved.state.threats.find((t:{id:string})=>t.id==="patrol");
    t.remainingSeconds=0.01;t.wolf.nextAttackSeconds=0.01;
    // Keep the combat fixture inside its leash while crossing the real thicket boundary.
    t.position={x:1.9,y:0,z:20};saved.state.position={x:5,y:0,z:20};
    const game=createAdventure({save:JSON.stringify(saved)});game.advance(0.01);
    const launched=threat(game,"patrol");
    expect(launched.targetPosition.x).toBeLessThanOrEqual(2);
    game.advance(0.65);
    expect(threat(game,"patrol").position.x).toBeLessThanOrEqual(2);
    expect(game.snapshot.player.health).toBe(100);
    const gateSave=JSON.parse(wolfFixture(0,2.1,4,5).save());
    gateSave.state.threats.find((t:{id:string})=>t.id==="patrol").wolf.contacted=true;
    const gate=createAdventure({save:JSON.stringify(gateSave)});gate.advance(0.5);
    const pos=threat(gate,"patrol").position;
    expect(pos.x<=3||pos.z>4).toBe(true);
  });

  test("v4 preserves character and active warning, and never repeats its already applied Bite",()=>{
    const legacy=JSON.parse(houndMaul().save());legacy.version=4;
    const wolf=legacy.state.threats.find((t:{id:string})=>t.id==="patrol");delete wolf.wolf;
    Object.assign(wolf,{phase:"action",remainingSeconds:0.3,abilityIndex:0,damage:4,actionSequence:1});
    for(const t of legacy.state.threats)delete t.wolf;
    const game=createAdventure({save:JSON.stringify(legacy)});
    expect(game.snapshot.player.health).toBe(96);
    expect(threat(game,"patrol").phase).toBe("preparation");
    expect(threat(game,"patrol").nextAttackSeconds).toBe(5);
    game.advance(0.3);expect(game.snapshot.player.health).toBe(96);
    expect(createAdventure({save:game.save()}).save()).toBe(game.save());
  });
});

test("a wolf that has never bitten still pursues after the first Maul is dodged",()=>{
  const saved=JSON.parse(wolfFixture(0,12,-3.4,12).save()),t=saved.state.threats.find((t:{id:string})=>t.id==="patrol");
  t.remainingSeconds=0.01;t.wolf.nextAttackSeconds=0.01;t.wolf.autoAttackSeconds=0;t.wolf.contacted=false;
  const game=createAdventure({save:JSON.stringify(saved)});game.advance(0.01);
  game.selectTarget("patrol");tap(game,"disengage");game.advance(0.8);
  expect(game.snapshot.player.health).toBe(100);
  expect(threat(game,"patrol").lastActionHit).toBe(false);
  expect(threat(game,"patrol").autoAttackSequence).toBe(0);
  expect(JSON.parse(game.save()).state.threats.find((t:{id:string})=>t.id==="patrol").wolf.contacted).toBe(false);
  game.advance(1.85);
  expect(threat(game,"patrol").autoAttackSeconds).toBe(0);
  game.advance(0.1);expect(threat(game,"patrol").movementMode).toBe("bite");
  game.advance(1.2);
  expect(game.snapshot.player.health).toBe(96);
  expect(threat(game,"patrol").autoAttackSequence).toBe(1);
});


describe("Ember head",()=>{
  test("stored ward opens immediately in actual range; pairs reveal two timed effects and Beam is independent",()=>{
    const game=positioned(-3,8.1);
    expect(threat(game,"scout").forecast).toMatchObject([{status:"stored",ability:{id:"ember-ward"}}]);
    game.advance(0.01);
    expect(game.snapshot.player.health).toBe(99);
    expect(threat(game,"scout").block).toBe(6);
    expect(threat(game,"scout").forecast).toMatchObject([
      {remainingSeconds:5,status:"pending",ability:{id:"fireball"}},
      {remainingSeconds:5,status:"pending",ability:{id:"ember-ward"}},
    ]);
    game.advance(3); expect(game.snapshot.player.health).toBe(98);
    game.advance(1.1); expect(threat(game,"scout").fireballs).toHaveLength(1);
    expect(threat(game,"scout").forecast[0]?.remainingSeconds).toBeCloseTo(0.9);
    tap(game,"brace"); game.advance(0.89); expect(game.snapshot.player.health).toBe(98);
    expect(game.snapshot.player.block).toBe(10);
    game.advance(0.01); expect(game.snapshot.player.block).toBe(7);
    expect(threat(game,"scout").currentActivity?.ability.id).toBe("ember-ward");
    expect(threat(game,"scout").forecast).toMatchObject([{ability:{id:"kindle"}},{ability:{id:"fireball"}}]);
    expect(threat(game,"scout").forecast[0]!.remainingSeconds).toBeCloseTo(10,6);
    expect(threat(game,"scout").forecast[1]!.remainingSeconds).toBeCloseTo(15,6);
    game.advance(1); expect(threat(game,"scout").autoAttackSequence).toBe(3);
    expect(game.snapshot.player.block).toBe(6);
    const distant=JSON.parse(positioned(9,10).save());
    Object.assign(distant.state.threats[0],{aggro:true,phase:"approach"});
    const approach=createAdventure({save:JSON.stringify(distant)});approach.advance(0.1);
    expect(threat(approach,"scout").forecast[0]?.status).toBe("stored");
    expect(approach.snapshot.player.health).toBe(100);
    approach.advance(2);expect(threat(approach,"scout").autoAttackSequence).toBe(1);
  });
  test("finished Ward exposes Kindle and committed gaps of five and three seconds preserve notice",()=>{
    const game=positioned(-3,8.1);game.advance(0.01);game.selectTarget("scout");
    tap(game,"strike");game.advance(0.25);
    expect(threat(game,"scout").health).toBe(69);
    expect(threat(game,"scout").block).toBe(0);
    game.advance(9.75);
    const pair=threat(game,"scout");
    expect(pair.block).toBe(0);
    expect(pair.forecast).toMatchObject([{ability:{id:"kindle"},remainingSeconds:5},{ability:{id:"fireball",damage:6},remainingSeconds:10}]);
    game.advance(5);expect(threat(game,"scout").volley).toBe(2);
    expect(threat(game,"scout").forecast).toHaveLength(2);
    game.advance(4.1);expect(threat(game,"scout").fireballs).toHaveLength(1);
    game.advance(0.2);expect(threat(game,"scout").fireballs).toHaveLength(2);
    game.advance(0.7);expect(threat(game,"scout").currentActivity?.ability.id).toBe("fireball");
    game.advance(0.2);
    expect(threat(game,"scout").forecast).toMatchObject([{ability:{id:"kindle"},remainingSeconds:5},{ability:{id:"fireball",damage:9},remainingSeconds:8}]);
    game.advance(5);expect(threat(game,"scout").volley).toBe(3);
    expect(threat(game,"scout").forecast[0]?.remainingSeconds).toBeCloseTo(3);
  });
  test("current activity is separate from two future moves whose countdowns survive pair completion",()=>{
    const game=positioned(-3,8.1);game.advance(0.01);game.advance(5);
    const ward=threat(game,"scout");
    expect(ward.currentActivity).toMatchObject({ability:{id:"ember-ward"},remainingSeconds:5,status:"active"});
    expect(ward.forecast.map(e=>e.ability.id)).toEqual(["kindle","fireball"]);
    expect(ward.forecast[0]!.remainingSeconds).toBeCloseTo(10,6);
    expect(ward.forecast[1]!.remainingSeconds).toBeCloseTo(15,6);
    const before=game.save();void game.snapshot;expect(game.save()).toBe(before);
    game.advance(5);
    expect(threat(game,"scout").currentActivity).toBe(null);
    for(const [i,e] of threat(game,"scout").forecast.entries())expect(e.remainingSeconds).toBeCloseTo(ward.forecast[i]!.remainingSeconds-5);
    game.advance(9.1);
    const flying=threat(game,"scout");
    expect(flying.currentActivity).toMatchObject({ability:{id:"fireball",damage:6},status:"active"});
    expect(flying.currentActivity?.remainingSeconds).toBeCloseTo(1.1);
    expect(flying.forecast.map(e=>e.ability.id)).toEqual(["kindle","fireball"]);
    expect(flying.forecast[0]!.remainingSeconds).toBeCloseTo(6.1);
    expect(flying.forecast[1]!.remainingSeconds).toBeCloseTo(9.1);
    expect(flying.forecast[1]!.ability.damage).toBe(9);
    const reopened=createAdventure({save:game.save()});
    game.advance(1.1);reopened.advance(1.1);
    expect(reopened.save()).toBe(game.save());
    expect(threat(game,"scout").currentActivity).toBe(null);
    for(const [i,e] of threat(game,"scout").forecast.entries())expect(e.remainingSeconds).toBeCloseTo(flying.forecast[i]!.remainingSeconds-1.1);
    const ordinary=approachWarder();ordinary.advance(threat(ordinary,"warder").remainingSeconds+0.35);
    const recovering=threat(ordinary,"warder");
    expect(recovering.currentActivity).toBe(null);
    expect(recovering.forecast[0]?.remainingSeconds).toBeCloseTo(recovering.remainingSeconds+3.35);
  });
  test("in-flight fireballs and announced pair resume once from saves and die with their caster",()=>{
    const game=positioned(-3,8.1);game.advance(4.2);
    expect(threat(game,"scout").fireballs).toHaveLength(1);
    const saved=game.save(), restored=createAdventure({save:saved});expect(restored.save()).toBe(saved);
    game.advance(2);restored.advance(2);expect(restored.save()).toBe(game.save());
    expect(game.snapshot.player.health).toBe(94);
    const dying=JSON.parse(positioned(-3,8.1).save());dying.state.threats[0].health=3;
    const kill=createAdventure({save:JSON.stringify(dying)});kill.selectTarget("scout");kill.advance(4.2);
    tap(kill,"strike");kill.advance(0.25);
    expect(threat(kill,"scout").health).toBe(0);
    expect(threat(kill,"scout").fireballs).toHaveLength(0);
    const health=kill.snapshot.player.health;kill.advance(1);expect(kill.snapshot.player.health).toBe(health);
  });
  test("root prevents a Maul that starts during Disengage from translating",()=>{
    const saved=JSON.parse(wolfFixture(0,12,-2,12).save()),wolf=saved.state.threats.find((t:{id:string})=>t.id==="patrol");
    wolf.remainingSeconds=0.1;wolf.wolf.nextAttackSeconds=0.1;
    const game=createAdventure({save:JSON.stringify(saved)});game.selectTarget("patrol");tap(game,"disengage");
    const at=threat(game,"patrol").position;game.advance(0.5);
    expect(threat(game,"patrol").rootedSeconds).toBeGreaterThan(0);
    expect(threat(game,"patrol").position.x).toBeCloseTo(at.x);
    expect(threat(game,"patrol").position.z).toBeCloseTo(at.z);
  });
});


test("only defending eventually loses to the head's growing volleys",()=>{
  const game=positioned(-3,8.1);
  for(let i=0;i<240 && game.snapshot.phase!=="lost";i++) {tap(game,"brace");game.advance(1);}
  expect(threat(game,"scout").volley).toBeGreaterThanOrEqual(3);
  expect(game.snapshot.phase).toBe("lost");
  expect(game.snapshot.player.health).toBe(0);
});

describe("stamina and Blood Rage",()=>{
  test("three stamina regenerate one per two seconds; action recovery is shared and movement remains free",()=>{
    const game=positioned(-3,8.1);game.advance(0.01);game.selectTarget("scout");
    expect(game.snapshot.player.stamina).toBe(3);
    tap(game,"strike");expect(game.snapshot.player.stamina).toBe(2);
    expect(game.snapshot.player.currentAction).toBe("strike");
    tap(game,"bloodRage");expect(game.snapshot.player.bloodRage).toBe(0);
    game.advance(1);tap(game,"strike");expect(game.snapshot.player.stamina).toBe(1);
    game.advance(0.99);expect(game.snapshot.player.stamina).toBe(1);
    game.advance(0.01);expect(game.snapshot.player.stamina).toBe(2);
    tap(game,"bloodRage");expect(game.snapshot.player.bloodRage).toBe(1);
    expect(game.snapshot.player.stamina).toBe(1);
    expect(game.snapshot.player).toMatchObject({currentAction:"bloodRage",actionDuration:2,actionCooldown:2});
    const x=game.snapshot.player.position.x;
    game.setCameraForward(1,0);game.setAction("forward",true);game.advance(1);game.setAction("forward",false);
    expect(game.snapshot.player.position.x).toBeCloseTo(x+4.5);
    tap(game,"strike");expect(game.snapshot.player.currentAction).toBe("bloodRage");
    game.advance(1);expect(game.snapshot.player.currentAction).toBe(null);
  });
  test("Rage requires actual engagement, caps at three, adds melee damage and saves the shared recovery",()=>{
    const idle=positioned(0,3);tap(idle,"bloodRage");expect(idle.snapshot.player.bloodRage).toBe(0);expect(idle.snapshot.player.stamina).toBe(3);
    const game=positioned(-3,8.1);game.advance(0.01);
    for(let i=0;i<3;i++){tap(game,"bloodRage");game.advance(2);}
    expect(game.snapshot.player.bloodRage).toBe(3);
    const stamina=game.snapshot.player.stamina;tap(game,"bloodRage");expect(game.snapshot.player.stamina).toBe(stamina);
    game.selectTarget("scout");const hp=threat(game,"scout").health,block=threat(game,"scout").block;
    tap(game,"strike");game.advance(0.25);
    expect(threat(game,"scout").health).toBe(hp-(15-block));
    const saved=game.save(),loaded=createAdventure({save:saved});expect(loaded.save()).toBe(saved);
    game.advance(0.4);loaded.advance(0.4);expect(loaded.save()).toBe(game.save());
  });
  test("Rage drains through Block every five seconds and can kill; outside combat it decays one stack per two seconds",()=>{
    const game=positioned(-3,8.1);game.advance(0.01);tap(game,"bloodRage");game.advance(4.1);tap(game,"brace");
    const hp=game.snapshot.player.health;game.advance(0.9);
    expect(game.snapshot.player.health).toBe(hp-1);
    expect(game.snapshot.player.block).toBe(7);
    expect(game.snapshot.log.some(e=>e.text==="Blood Rage hits you for 1 damage.")).toBe(true);
    const lethal=JSON.parse(game.save());Object.assign(lethal.state,{health:1,bloodRage:3,rageDrainSeconds:0.1});
    const dying=createAdventure({save:JSON.stringify(lethal)});dying.advance(0.1);expect(dying.snapshot.phase).toBe("lost");
    const safe=JSON.parse(game.save());Object.assign(safe.state,{phase:"town",position:{x:0,y:0,z:-1},bloodRage:3,rageDrainSeconds:5,rageDecaySeconds:0});
    const resting=createAdventure({save:JSON.stringify(safe)});resting.advance(1.99);expect(resting.snapshot.player.bloodRage).toBe(3);
    resting.advance(0.01);expect(resting.snapshot.player.bloodRage).toBe(2);
    resting.advance(2);expect(resting.snapshot.player.bloodRage).toBe(1);
    resting.advance(2);expect(resting.snapshot.player.bloodRage).toBe(0);
    expect(resting.snapshot.player.rageDrainSeconds).toBe(0);
  });
  test("all six legacy versions preserve rewards and bounded shields while granting three stamina and zero Rage",()=>{
    for(let version=1;version<=6;version++){
      const old=JSON.parse(createAdventure().save());old.version=version;
      Object.assign(old.state,{health:73,supplies:27,potions:2,bankedRelics:1,guardSeconds:version>=4?4:2,block:5});
      const scout=old.state.threats[0],wolf=old.state.threats.find((t:{id:string})=>t.id==="patrol");
      if(version<6){scout.wolf=wolf.wolf;scout.damage=4;wolf.abilityIndex=0;}
      if(version<4)for(const t of old.state.threats)if(t.phase==="patrol")t.phase="dormant";
      const migrated=createAdventure({save:JSON.stringify(old)});
      expect(migrated.snapshot.player).toMatchObject({health:73,stamina:3,bloodRage:0,block:5,guardSeconds:2});
      expect(migrated.snapshot).toMatchObject({supplies:27,potions:2,bankedRelics:1});
      expect(JSON.parse(migrated.save()).version).toBe(7);
      expect(createAdventure({save:migrated.save()}).save()).toBe(migrated.save());
    }
  });
  test("Lorebook includes all monsters, executable head pairs and the hound's two equally likely hop choices",()=>{
    const lore=getMonsterLore();expect(lore.map(e=>e.id)).toEqual(createAdventure().snapshot.threats.map(t=>t.id));
    const head=lore.find(e=>e.id==="scout")!;
    expect(head.sequences.map(e=>e.offsetsSeconds)).toEqual([[5,5],[5,10],[5,8]]);
    expect(head.abilities.map(a=>a.id)).toEqual(["ember-beam","fireball","ember-ward","kindle"]);
    const game=positioned(-3,8.1);game.advance(0.01);
    expect(threat(game,"scout").forecast.map(e=>e.ability.id)).toEqual([...head.sequences[0]!.abilityIds]);
    const hops=lore.find(e=>e.id==="patrol")!.sequences.filter(e=>e.probability!==undefined);
    expect(hops.map(e=>e.probability)).toEqual([0.5,0.5]);
    expect(lore.find(e=>e.id==="warder")!.abilities.some(a=>a.id==="harvest-thorns")).toBe(true);
  });
});
