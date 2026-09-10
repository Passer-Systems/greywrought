import { earnedChapter, fightForeman } from "./yard-test-fixtures.js";
import { describe, expect, test } from "bun:test";
import { createAdventure, getMonsterLore } from "./adventure.js";
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
  // Keep encounter choices repeatable while exercising the real movement path.
  for (const enemy of saved.state.threats) enemy.rng = 9844;
  return createAdventure({save:JSON.stringify(saved)});
}
function approachWarder(): AdventureGame {
 const saved=JSON.parse(positioned(0,25.9).save());
 for(const t of saved.state.threats)if(t.id==='patrol')Object.assign(t,{health:0,phase:'cleared',lootClaimed:true});
 const game=createAdventure({save:JSON.stringify(saved)});game.advance(0.01);return game;
}
function finish(game: AdventureGame, id: string): void {
  game.selectTarget(id);
  if (!game.snapshot.combat.autoAttack) tap(game, "strike");
  for (let seconds = 0; seconds < 90 && threat(game, id).health > 0 && game.snapshot.player.health > 0; seconds += .05) {
    const target = threat(game, id), player = game.snapshot.player;
    const dx = target.position.x - player.position.x, dz = target.position.z - player.position.z;
    game.setCameraForward(dx, dz); game.setAction("forward", Math.hypot(dx, dz) > 1.7);
    if (target.cast && target.cast.ability.damage > 0 && target.cast.remainingSeconds < .3 && game.snapshot.combat.globalCooldown === 0) tap(game, "brace");
    game.advance(.05);
  }
  game.setAction("forward", false);
  expect(threat(game, id).health).toBe(0);
}
function legacyV2(game:AdventureGame):string {
  const saved=JSON.parse(game.save());saved.version=2;delete saved.state.carriedSalvage;
  for(const t of saved.state.threats){delete t.lootClaimed;if(t.phase==='patrol'){t.phase='dormant';t.remainingSeconds=0;}}
  return JSON.stringify(saved);
}

describe("Frostwood world and persistent rewards",()=>{
  test("clearing the warder removes harvest damage; inn rest restores health", () => {
    const game = approachWarder();
    game.advance(3.5);
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

  test("six crystals wake Foreman Nine; a prepared fight wins; manual loot and return bank the roll and excess crystals", () => {
    const prepared=JSON.parse(positioned(2,38.5).save());
    prepared.state.cargo=12; prepared.state.resourceRemaining=0; prepared.state.potions=2;
    prepared.state.chapter=earnedChapter(2);prepared.state.chapter.equipment={chest:"insulated-coat",mainhand:"yard-weapon"};
    for (const enemy of prepared.state.threats) if (enemy.id !== "ritual-guardian") Object.assign(enemy, { health:0, phase:"cleared", lootClaimed:true });
    const game=createAdventure({save:JSON.stringify(prepared)});
    tap(game, "ritual");
    expect(game.snapshot.ritualCalled).toBe(true);
    expect(game.snapshot.cargo).toBe(6);
    expect(threat(game,"ritual-guardian").cast!.remainingSeconds).toBeGreaterThanOrEqual(3);
    walk(game, 2, 38.4);
    expect(fightForeman(game,true).bossHealth).toBe(0);
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
    const v2 = legacyV2(game);
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

  test("the neutral bee wanders, retaliates when attacked, and leaves the briars intact",()=>{
    const fixture=JSON.parse(positioned(1,17).save());
    Object.assign(fixture.state.threats.find((t:{id:string})=>t.id==="patrol"),{health:0,phase:"cleared",lootClaimed:true});
    const game=createAdventure({save:JSON.stringify(fixture)});game.advance(1);
    expect(threat(game,"nest")).toMatchObject({disposition:"neutral",aggro:false,health:72,actionSequence:0});
    expect(threat(game,"nest").position).not.toEqual(threat(game,"nest").homePosition);
    expect(game.snapshot.player.health).toBe(100);
    game.selectTarget("nest");tap(game,"strike");
    for(let i=0;i<200&&!threat(game,"nest").aggro;i++){const target=threat(game,"nest").position,p=game.snapshot.player.position;game.setCameraForward(target.x-p.x,target.z-p.z);game.setAction("forward",true);game.advance(.02);}
    game.setAction("forward",false);
    expect(threat(game,"nest").aggro).toBe(true);
    expect(threat(game,"nest").health).toBe(63);
    finish(game,"nest");
    expect(threat(game,"nest").phase).toBe("cleared");
    expect(game.snapshot.supplies).toBe(15);
    walk(game,1.9,20);
    game.setCameraForward(1,0);game.setAction("forward",true);game.advance(1);game.setAction("forward",false);
    expect(game.snapshot.player.position.x).toBeLessThanOrEqual(2);
  });

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
    for(let i=0;i<300&&threat(reloaded,"warder").phase==="returning";i++)reloaded.advance(.05);
    expect(threat(reloaded, "warder").phase).toBe("patrol");
    expect(Math.hypot(threat(reloaded,"warder").position.x-returning.homePosition.x,threat(reloaded,"warder").position.z-returning.homePosition.z)).toBeLessThan(.1);
    walk(reloaded, 0, 5); walk(reloaded, 0, -1);
    const returnedHealth=reloaded.snapshot.player.health;
    reloaded.advance(10);
    expect(reloaded.snapshot.player.health).toBe(returnedHealth);
    expect(reloaded.snapshot.threats.every(t => !t.aggro)).toBe(true);
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
    walk(game, loot.position.x, loot.position.z); tap(game, "interact"); tap(game, "closeLoot");
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
    const v2 = legacyV2(game);
    const migrated = createAdventure({ save: v2 });
    expect(migrated.snapshot.player.health).toBe(game.snapshot.player.health);
    expect(migrated.snapshot.player.position).toEqual(game.snapshot.player.position);
    expect(migrated.snapshot.loot.find(item => item.sourceId === "warder")?.position).toEqual(corpse);
    expect(migrated.snapshot.loot.find(item => item.sourceId === "warder")?.available).toBe(true);
    const broken = game.save().replace('"lootClaimed":false', '"lootClaimed":null');
    expect(() => createAdventure({ save: broken })).toThrow();
  });
});

describe("services and saved journeys",()=>{
  test("returning to town keeps the unsummoned guardian dormant and the journey reopenable",()=>{
    const game=createAdventure();walk(game,0,3);walk(game,0,-1);
    expect(threat(game,"ritual-guardian")).toMatchObject({active:false,phase:"dormant"});
    const saved=game.save();expect(JSON.parse(createAdventure({save:saved}).save())).toEqual(JSON.parse(saved));
    const affected=JSON.parse(saved);affected.state.threats.find((t:{id:string})=>t.id==="ritual-guardian").phase="patrol";
    expect(JSON.parse(createAdventure({save:JSON.stringify(affected)}).save())).toEqual(JSON.parse(saved));
  });
  test("Mara conserves full-health potions and Rowan restores lost health",()=>{
    const game=createAdventure();tap(game,"buyPotion");expect(game.snapshot.potions).toBe(0);walk(game,3.4,-7.5);tap(game,"interact");tap(game,"buyPotion");
    expect(game.snapshot.potions).toBe(1);expect(game.snapshot.supplies).toBe(12);tap(game,"drinkPotion");expect(game.snapshot.potions).toBe(1);
    const saved=JSON.parse(game.save());saved.state.health=50;const hurt=createAdventure({save:JSON.stringify(saved)});tap(hurt,"drinkPotion");expect(hurt.snapshot.player.health).toBe(80);
    walk(hurt,5,-11);tap(hurt,"interact");expect(hurt.snapshot.innOpen).toBe(true);tap(hurt,"rest");expect(hurt.snapshot.player.health).toBe(100);
  });
  test("Mara barter quotes without mutation and settles each accepted trade once",()=>{
    const game=createAdventure(); walk(game,3.4,-7.5); tap(game,"interact"); tap(game,"openTrade");
    expect(game.snapshot.trade?.canAccept).toBe(true); expect(game.snapshot.supplies).toBe(15); expect(game.snapshot.potions).toBe(0);
    tap(game,"closeTrade"); expect(game.snapshot.trade).toBe(null); expect(game.snapshot.shopOpen).toBe(true); expect(game.snapshot.supplies).toBe(15);
    tap(game,"interact"); tap(game,"openTrade"); game.setTradeOffer("supplies",6); expect(game.snapshot.trade?.receivedQuantity).toBe(2); expect(game.snapshot.supplies).toBe(15);
    tap(game,"acceptTrade"); expect(game.snapshot.supplies).toBe(9); expect(game.snapshot.potions).toBe(2); tap(game,"acceptTrade"); expect(game.snapshot.supplies).toBe(9); expect(game.snapshot.potions).toBe(2);
    tap(game,"interact"); tap(game,"openTrade"); game.setTradeOffer("potions",1); tap(game,"acceptTrade"); expect(game.snapshot.supplies).toBe(11); expect(game.snapshot.potions).toBe(1);
    walk(game,0,-8); expect(game.snapshot.trade).toBe(null);
    const poorData=JSON.parse(createAdventure().save()); poorData.state.supplies=0; const poor=createAdventure({save:JSON.stringify(poorData)}); walk(poor,3.4,-7.5); tap(poor,"interact"); tap(poor,"openTrade"); expect(poor.snapshot.trade?.canAccept).toBe(false); expect(poor.snapshot.trade?.reason).toContain("enough supplies");
  });
  test("Lorebook lists each creature and its available abilities",()=>{
    const lore=getMonsterLore();
    expect(lore.map(e=>e.id)).toEqual(createAdventure().snapshot.threats.map(t=>t.id));
    expect(lore.find(e=>e.id==="patrol")!.abilities.map(a=>a.id)).toEqual(["maul"]);
    expect(lore.find(e=>e.id==="scout")!.abilities.map(a=>a.id)).toContain("fireball");
  });
});
