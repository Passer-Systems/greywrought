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
  // Pin these regression fixtures to opening-beat attacks; varied beats are covered separately.
  for (const enemy of saved.state.threats) enemy.rng = 9844;
  return createAdventure({save:JSON.stringify(saved)});
}
function approachWarder(): AdventureGame { const game=positioned(0,25.9);game.advance(0.01);return game; }
function finish(game: AdventureGame, id: string): void {
  game.selectTarget(id);
  for(let i=0;i<40 && threat(game,id).health>0;i++){
    const c=game.snapshot.combat;
    if(c.phase==="preparation") { game.advance(c.remainingSeconds); continue; }
    if(c.phase==="active" && (game.snapshot.player.stamina<1 || c.queued.length>=5 || c.elapsedSeconds>3)) {game.advance(c.remainingSeconds);continue;}
    tap(game,"strike");game.advance(c.phase==="idle"?1.02:2);
    expect(game.snapshot.phase).toBe("expedition");
  }
  expect(threat(game,id).health).toBe(0);
}
function headFight(): AdventureGame { const game=positioned(-3,8.1);game.advance(0.01);return game; }
function wolfGame(x=-3,z=8.1): AdventureGame {
  const saved=JSON.parse(positioned(x,z).save());
  Object.assign(saved.state.threats[0],{health:0,phase:"cleared",aggro:false,lootClaimed:true});
  const wolf=saved.state.threats.find((t:{id:string})=>t.id==="patrol");wolf.position={x:-3,y:0,z:10};wolf.targetPosition={...wolf.position};
  return createAdventure({save:JSON.stringify(saved)});
}
function pending(game:AdventureGame){return game.snapshot.combat.queued.filter(e=>e.status==="pending");}
function latestId(game:AdventureGame):number{return game.snapshot.combat.queued.at(-1)!.id;}

describe("Frostwood world and persistent rewards",()=>{
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

  test("six cores call the guardian; queued strikes defeat it; searching claims a relic; return banks it and remaining cores", () => {
    const prepared=JSON.parse(positioned(2,43).save());
    prepared.state.cargo=12; prepared.state.resourceRemaining=0;
    const game=createAdventure({save:JSON.stringify(prepared)});
    tap(game, "ritual");
    expect(game.snapshot.ritualCalled).toBe(true);
    expect(game.snapshot.cargo).toBe(6);
    expect(game.snapshot.combat).toMatchObject({phase:"active",elapsedSeconds:0,cycle:1});
    expect(threat(game,"ritual-guardian").forecast[0]?.remainingSeconds).toBeCloseTo(0.35);
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
    const v2 = game.save().replace('"version":8', '"version":2').replaceAll('"phase":"patrol"','"phase":"dormant"')
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

  test("the neutral nest ignores proximity, retaliates against queued attacks, and its defeat opens the thicket",()=>{
    const game=positioned(4.2,17.65);game.advance(10);
    expect(threat(game,"nest")).toMatchObject({disposition:"neutral",aggro:false,health:24,actionSequence:0});
    expect(game.snapshot.player.health).toBe(100);
    walk(game,1.9,17);walk(game,1.9,20);
    game.setCameraForward(1,0);game.setAction("forward",true);game.advance(1);game.setAction("forward",false);
    expect(game.snapshot.player.position.x).toBeLessThanOrEqual(2);
    game.selectTarget("nest");tap(game,"strike");game.advance(1.02);
    expect(threat(game,"nest").aggro).toBe(true);
    expect(threat(game,"nest").health).toBe(15);
    expect(threat(game,"nest").actionSequence).toBe(1);
    finish(game,"nest");
    expect(threat(game,"nest").phase).toBe("cleared");
    expect(game.snapshot.supplies).toBe(15);
    walk(game,5,20);
    expect(game.snapshot.player.position.x).toBeCloseTo(5,6);
    expect(game.snapshot.player.position.z).toBeCloseTo(20,6);
    expect(game.snapshot.player.position.y).toBe(0);
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
    reloaded.advance(3);
    expect(threat(reloaded, "warder").phase).toBe("dormant");
    expect(threat(reloaded, "warder").position).toEqual(returning.homePosition);
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
    const v2 = game.save().replace('"version":8', '"version":2').replaceAll('"phase":"patrol"','"phase":"dormant"')
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

describe("queued beats, reservations and editing",()=>{
  test("prequeued Block resolves before the opening Beam and reserves without spending",()=>{
    const game=positioned(-3,8.1);tap(game,"brace");
    expect(game.snapshot.combat).toMatchObject({phase:"idle",reservedStamina:2,availableStamina:3});
    expect(game.snapshot.player).toMatchObject({stamina:5,block:0});
    game.advance(0.01);
    expect(game.snapshot.combat).toMatchObject({phase:"active",cycle:1,elapsedSeconds:0,reservedStamina:0});
    expect(game.snapshot.player).toMatchObject({stamina:3,health:100,block:9});
    expect(game.snapshot.combat.queued[0]?.status).toBe("executed");
  });
  test("QE defaults to Lunge0 Block1, and QE3 retimes Block relative to Lunge",()=>{
    const game=positioned(-3,8.1);tap(game,"strike");tap(game,"brace");
    expect(game.snapshot.combat.queued.map(e=>[e.action,e.offsetSeconds])).toEqual([["strike",0],["brace",1]]);
    game.setQueuedDelay(latestId(game),3);
    expect(game.snapshot.combat.queued[1]?.offsetSeconds).toBe(3);
    game.advance(0.01);game.advance(0.25);
    expect(threat(game,"scout").health).toBe(63);
    expect(game.snapshot.player.stamina).toBe(4);
    game.advance(2.74);expect(game.snapshot.player.block).toBe(0);
    const hp=game.snapshot.player.health;game.advance(0.01);
    expect(game.snapshot.player.health).toBe(hp);expect(game.snapshot.player.block).toBe(10);
    expect(game.snapshot.player.stamina).toBe(2);
  });
  test("numbers keep editing a pending move after the previous move executed",()=>{
    const game=positioned(-3,8.1);tap(game,"strike");tap(game,"brace");const id=latestId(game);
    game.advance(0.01);game.advance(0.4);game.setQueuedDelay(id,3);
    expect(pending(game)[0]?.offsetSeconds).toBe(3);
    game.advance(1.6);game.setQueuedDelay(id,1);
    expect(pending(game)[0]?.offsetSeconds).toBe(3);expect(game.snapshot.report).toContain("passed");
    game.advance(1);game.setQueuedDelay(id,4);
    expect(game.snapshot.combat.queued.find(e=>e.id===id)?.offsetSeconds).toBe(3);
    expect(game.snapshot.report).toContain("already resolved");
  });
  test("active input rounds upward to the next unused legal integer beat",()=>{
    const game=headFight();game.advance(0.2);tap(game,"brace");
    expect(pending(game)[0]?.offsetSeconds).toBe(1);expect(game.snapshot.player.block).toBe(0);
    game.advance(0.79);expect(game.snapshot.player.block).toBe(0);
    game.advance(0.01);expect(game.snapshot.player.block).toBe(10);
    game.advance(2.5);tap(game,"jab");expect(pending(game)[0]?.offsetSeconds).toBe(4);
    game.advance(0.5);expect(game.snapshot.combat.queued.at(-1)?.status).toBe("executed");
    game.advance(0.1);tap(game,"guard");expect(pending(game)).toHaveLength(0);expect(game.snapshot.report).toContain("cannot fit");
  });
  test("Rage needs two beats of recovery and cannot be overlapped or moved beyond beat4",()=>{
    const game=positioned(-3,8.1);tap(game,"bloodRage");tap(game,"strike");tap(game,"jab");tap(game,"guard");
    expect(game.snapshot.combat.queued.map(e=>e.offsetSeconds)).toEqual([0,2,3,4]);
    game.setQueuedDelay(game.snapshot.combat.queued[1]!.id,1);
    expect(game.snapshot.combat.queued[1]?.offsetSeconds).toBe(2);
    tap(game,"jab");expect(game.snapshot.combat.queued).toHaveLength(4);
    game.advance(0.01);expect(game.snapshot.player).toMatchObject({bloodRage:1,currentAction:"bloodRage",actionDuration:2});
    game.advance(1.99);expect(game.snapshot.combat.queued[1]?.status).toBe("pending");
    game.advance(0.01);expect(game.snapshot.combat.queued[1]?.status).toBe("executed");
  });
  test("a legal swap preserves reservations; used beats and Rage conflicts reject without changing the plan",()=>{
    const game=positioned(-3,8.1);tap(game,"strike");tap(game,"brace");tap(game,"jab");
    const [q,e,j]=game.snapshot.combat.queued;game.moveQueuedAction(q!.id,2);
    expect(game.snapshot.combat.queued.map(a=>a.id)).toEqual([j!.id,e!.id,q!.id]);
    expect(game.snapshot.combat.reservedStamina).toBe(3);
    game.advance(0.01);const before=game.snapshot.combat.queued;game.moveQueuedAction(e!.id,0);
    expect(game.snapshot.combat.queued).toEqual(before);expect(game.snapshot.report).toContain("already been used");
    const rage=positioned(-3,8.1);tap(rage,"bloodRage");tap(rage,"jab");tap(rage,"guard");
    const plan=rage.snapshot.combat.queued;rage.moveQueuedAction(plan[0]!.id,2);expect(rage.snapshot.combat.queued).toEqual(plan);
    rage.moveQueuedAction(plan[2]!.id,4);expect(rage.snapshot.combat.queued.at(-1)?.offsetSeconds).toBe(4);
  });
  test("out-of-range plans fail on their scheduled beat, release reservations, and never silently retime",()=>{
    const game=positioned(-3,8.1);game.selectTarget("warder");tap(game,"strike");
    expect(pending(game)).toHaveLength(1);expect(game.snapshot.player.stamina).toBe(5);
    game.advance(0.01);
    expect(game.snapshot.combat.queued[0]).toMatchObject({status:"failed",offsetSeconds:0});
    expect(game.snapshot.combat.queued[0]?.reason).toContain("out of reach");
    expect(game.snapshot.player.stamina).toBe(5);expect(game.snapshot.combat.reservedStamina).toBe(0);
    game.advance(1);expect(game.snapshot.player.attackSequence).toBe(0);
  });
  test("cancelling or changing target releases reservations without spending energy",()=>{
    const game=positioned(-3,8.1);tap(game,"brace");tap(game,"strike");
    game.removeQueuedAction(game.snapshot.combat.queued[0]!.id);
    expect(game.snapshot.combat.reservedStamina).toBe(1);expect(game.snapshot.player.stamina).toBe(5);
    game.selectTarget("warder");expect(pending(game)).toHaveLength(0);
    tap(game,"guard");game.clearQueuedActions();expect(game.snapshot.combat.queued).toHaveLength(0);
  });
  test("target death cancels its pending moves; new enemies do not cancel the current plan",()=>{
    const data=JSON.parse(positioned(-3,8.1).save());data.state.threats[0].health=3;
    const game=createAdventure({save:JSON.stringify(data)});tap(game,"strike");tap(game,"brace");game.advance(0.01);game.advance(0.25);
    expect(threat(game,"scout").health).toBe(0);expect(pending(game)).toHaveLength(0);
    expect(game.snapshot.combat.phase).toBe("idle");expect(game.snapshot.player.stamina).toBe(5);
  });
  test("movement remains immediate during preparation and recovery",()=>{
    const game=headFight();tap(game,"bloodRage");const from=game.snapshot.player.position;
    game.setCameraForward(1,0);game.setAction("forward",true);game.advance(0.4);game.setAction("forward",false);
    expect(game.snapshot.player.position.x).toBeCloseTo(from.x+1.8);expect(game.snapshot.player.actionCooldown).toBeGreaterThan(1);
    game.advance(4.6);expect(game.snapshot.combat.phase).toBe("preparation");tap(game,"guard");
    const before=game.snapshot.player.position;game.setAction("backward",true);game.advance(0.2);game.setAction("backward",false);
    expect(game.snapshot.player.position.x).toBeCloseTo(before.x-0.9);expect(pending(game)).toHaveLength(1);expect(game.snapshot.player.block).toBe(0);
  });
});

describe("five energy, fillers and healing",()=>{
  test("five one-cost moves reserve the five-energy pool and no sixth move is accepted",()=>{
    const game=positioned(-3,8.1);for(let i=0;i<5;i++)tap(game,"strike");
    expect(game.snapshot.combat.queued.map(e=>e.offsetSeconds)).toEqual([0,1,2,3,4]);
    expect(game.snapshot.combat).toMatchObject({reservedStamina:5,availableStamina:0});
    tap(game,"guard");expect(game.snapshot.combat.queued).toHaveLength(5);
    game.advance(0.01);game.advance(4.3);expect(game.snapshot.player.stamina).toBe(0);
    expect(game.snapshot.combat.queued.every(e=>e.status==="executed")).toBe(true);
    game.advance(0.7);expect(game.snapshot.combat.phase).toBe("preparation");expect(game.snapshot.player.stamina).toBe(5);
    expect(game.snapshot.combat.queued).toHaveLength(0);
  });
  test("energy does not regenerate within an active window and replenishes once at preparation",()=>{
    const game=positioned(-3,8.1);tap(game,"brace");game.advance(0.01);game.advance(4.99);
    expect(game.snapshot.player.stamina).toBe(3);expect(game.snapshot.player.staminaRecoverySeconds).toBeCloseTo(0.01);
    game.advance(0.01);expect(game.snapshot.player.stamina).toBe(5);tap(game,"brace");tap(game,"brace");tap(game,"strike");
    expect(game.snapshot.combat.reservedStamina).toBe(5);game.advance(5);
    expect(game.snapshot.player.stamina).toBe(3);expect(game.snapshot.combat.reservedStamina).toBe(3);
  });
  test("zero-cost Jab and Guard are manual, occupy beats, and Guard stays raised during the next attack",()=>{
    const game=positioned(-3,8.1);tap(game,"brace");tap(game,"jab");tap(game,"guard");tap(game,"jab");tap(game,"guard");
    expect(game.snapshot.combat.reservedStamina).toBe(2);tap(game,"jab");expect(game.snapshot.combat.queued).toHaveLength(5);
    game.advance(0.01);const block=game.snapshot.player.block;game.advance(1);
    expect(game.snapshot.player.block).toBe(block);expect(game.snapshot.player.stamina).toBe(3);
    expect(threat(game,"scout").block).toBe(0);
    game.advance(1);expect(game.snapshot.player.block).toBe(2);
    game.advance(3);expect(game.snapshot.combat.queued).toHaveLength(0);game.advance(5);
    expect(game.snapshot.combat.queued).toHaveLength(0);expect(game.snapshot.player.attackSequence).toBe(2);
  });
  test("queued potion reserves one inventory item, consumes only on execution, and shares recovery",()=>{
    const data=JSON.parse(positioned(-3,8.1).save());data.state.health=50;data.state.potions=1;
    const game=createAdventure({save:JSON.stringify(data)});tap(game,"drinkPotion");tap(game,"drinkPotion");
    expect(pending(game)).toHaveLength(1);expect(game.snapshot.potions).toBe(1);expect(game.snapshot.player.health).toBe(50);
    game.advance(0.01);expect(game.snapshot.potions).toBe(0);expect(game.snapshot.player.health).toBe(79);
    expect(game.snapshot.player).toMatchObject({stamina:4,currentAction:"drinkPotion",actionDuration:1});
    const town=JSON.parse(createAdventure().save());town.state.health=50;town.state.potions=1;
    const resting=createAdventure({save:JSON.stringify(town)});tap(resting,"drinkPotion");expect(resting.snapshot.player.health).toBe(80);expect(resting.snapshot.potions).toBe(0);expect(resting.snapshot.combat.queued).toHaveLength(0);
  });
  test("full health conserves queued potion and failed execution releases its energy",()=>{
    const data=JSON.parse(positioned(-3,8.1).save());data.state.potions=1;
    const game=createAdventure({save:JSON.stringify(data)});tap(game,"drinkPotion");game.advance(0.01);
    expect(game.snapshot.potions).toBe(1);expect(game.snapshot.player.stamina).toBe(5);
    expect(game.snapshot.combat.queued[0]?.status).toBe("failed");
  });
});

describe("one encounter clock and truthful enemy timing",()=>{
  test("all active damage pauses for preparation and the next opening resolves queued defense first",()=>{
    const game=headFight();expect(game.snapshot.player.health).toBe(99);game.advance(3);expect(game.snapshot.player.health).toBe(99);
    game.advance(2);expect(game.snapshot.combat.phase).toBe("preparation");const hp=game.snapshot.player.health;
    tap(game,"brace");game.advance(4.1);expect(threat(game,"scout").fireballs).toHaveLength(1);expect(game.snapshot.player.health).toBe(hp);
    expect(threat(game,"scout").currentActivity?.remainingSeconds).toBeCloseTo(0.9);
    game.advance(0.89);expect(game.snapshot.player.health).toBe(hp);game.advance(0.01);
    expect(game.snapshot.combat).toMatchObject({phase:"active",cycle:2,elapsedSeconds:0});
    expect(game.snapshot.player.health).toBe(hp);expect(game.snapshot.player.block).toBe(7);
  });
  test("additional hostile approaches immediately, retains the current plan and joins the next opening",()=>{
    const game=headFight();game.advance(1);tap(game,"brace");const plan=game.snapshot.combat.queued;
    const data=JSON.parse(game.save());const patrol=data.state.threats.find((t:{id:string})=>t.id==="patrol");
    patrol.position={x:-3,y:0,z:12};
    const joined=createAdventure({save:JSON.stringify(data)});joined.advance(0.01);
    expect(threat(joined,"patrol").aggro).toBe(true);expect(threat(joined,"patrol").joinsNextWindow).toBe(true);
    expect(joined.snapshot.combat.cycle).toBe(1);expect(joined.snapshot.combat.elapsedSeconds).toBeCloseTo(1.01);
    expect(joined.snapshot.combat.queued.map(e=>e.id)).toEqual(plan.map(e=>e.id));
    expect(threat(joined,"patrol").actionSequence).toBe(0);
    expect(threat(joined,"patrol").forecast[0]?.remainingSeconds).toBeCloseTo(9.64);
    joined.advance(3.99);expect(joined.snapshot.combat.phase).toBe("preparation");
    const hp=joined.snapshot.player.health;joined.advance(4.99);expect(joined.snapshot.player.health).toBe(hp);
    joined.advance(0.01);expect(threat(joined,"patrol").joinsNextWindow).toBe(false);
    joined.advance(0.65);expect(threat(joined,"patrol").actionSequence).toBe(1);
  });
  test("the head ward is its only action, expires at two seconds and leaves later beats open",()=>{
    const game=headFight();game.advance(15);tap(game,"strike");game.setQueuedDelay(latestId(game),3);game.advance(5);
    expect(threat(game,"scout").block).toBe(6);const hp=game.snapshot.player.health;game.advance(1.99);expect(threat(game,"scout").block).toBe(6);
    game.advance(0.01);expect(threat(game,"scout").block).toBe(0);game.advance(1.25);expect(threat(game,"scout").health).toBe(63);
    expect(game.snapshot.player.health).toBe(hp);
  });
  test("the head uses only Beam, then one Fireball, Ward or Kindle per shared window",()=>{
    const game=headFight();expect(threat(game,"scout").actionSequence).toBe(1);game.advance(5);
    expect(threat(game,"scout").forecast.map(e=>e.ability.id)).toEqual(["fireball","ember-ward"]);
    expect(threat(game,"scout").forecast[0]?.remainingSeconds).toBeCloseTo(5);expect(threat(game,"scout").forecast[1]?.remainingSeconds).toBeCloseTo(15);
    game.advance(5);expect(threat(game,"scout").actionSequence).toBe(2);const hp=game.snapshot.player.health;
    game.advance(5);expect(game.snapshot.player.health).toBe(hp);expect(threat(game,"scout").forecast.map(e=>e.ability.id)).toEqual(["ember-ward","kindle"]);
    game.advance(10);expect(threat(game,"scout").forecast.map(e=>e.ability.id)).toEqual(["kindle","fireball"]);
    expect(threat(game,"scout").forecast[1]?.ability.damage).toBe(6);
    game.advance(5);expect(threat(game,"scout").volley).toBe(2);expect(threat(game,"scout").actionSequence).toBe(4);
    expect(game.snapshot.player.health).toBe(hp);
  });
  test("large volleys keep every projectile inside active time and never deal preparation damage",()=>{
    const game=headFight();game.advance(5);const data=JSON.parse(game.save());
    const head=data.state.threats[0];head.head.volley=30;head.head.events[0].volley=30;head.head.events[0].spacing=4.99/29;
    const volley=createAdventure({save:JSON.stringify(data)}),hp=volley.snapshot.player.health;volley.advance(4.1);
    expect(threat(volley,"scout").fireballs).toHaveLength(1);expect(volley.snapshot.player.health).toBe(hp);
    volley.advance(5.89);expect(volley.snapshot.player.health).toBe(hp-90);expect(threat(volley,"scout").fireballs).toHaveLength(0);
    volley.advance(0.01);const safe=volley.snapshot.player.health;volley.advance(4.9);expect(volley.snapshot.player.health).toBe(safe);
  });
  test("cover and range prevent head impacts, and killing its caster extinguishes projectiles",()=>{
    const game=headFight();game.advance(9.2);expect(threat(game,"scout").fireballs).toHaveLength(1);
    const data=JSON.parse(game.save());data.state.threats[0].health=3;
    const kill=createAdventure({save:JSON.stringify(data)});tap(kill,"jab");kill.advance(0.8);
    expect(threat(kill,"scout").health).toBe(0);expect(threat(kill,"scout").fireballs).toHaveLength(0);
    const hp=kill.snapshot.player.health;kill.advance(5);expect(kill.snapshot.player.health).toBe(hp);
  });
  test("ordinary committed areas can be dodged and Block absorbs the same beat's hit",()=>{
    const game=positioned(-3,26);game.advance(0.01);const defended=createAdventure({save:game.save()});
    tap(defended,"brace");const hp=game.snapshot.player.health;
    game.setCameraForward(0,-1);game.setAction("forward",true);game.advance(0.35);game.setAction("forward",false);defended.advance(0.35);
    expect(game.snapshot.player.health).toBe(hp);expect(threat(game,"warder").lastActionHit).toBe(false);
    expect(defended.snapshot.player.health).toBe(hp);expect(defended.snapshot.player.block).toBe(10-threat(defended,"warder").damage);
  });
});

describe("physical attacks within the shared plan",()=>{
  test("Lunge moves smoothly, deals damage on arrival, preserves held movement and fails behind cover",()=>{
    const game=wolfGame(-3,4.5);game.selectTarget("patrol");tap(game,"strike");game.advance(0.01);
    expect(game.snapshot.player.maneuver).toBe("lunge");expect(threat(game,"patrol").health).toBe(54);
    game.setCameraForward(1,0);game.setAction("forward",true);game.advance(0.125);
    expect(game.snapshot.player.position.z).toBeGreaterThan(4.5);expect(game.snapshot.player.position.z).toBeLessThan(8.5);
    expect(threat(game,"patrol").health).toBe(54);game.advance(0.125);expect(threat(game,"patrol").health).toBe(45);
    const landed=game.snapshot.player.position;game.advance(0.1);game.setAction("forward",false);expect(game.snapshot.player.position.x).toBeCloseTo(landed.x+0.45);
    const data=JSON.parse(positioned(1.9,20).save());data.state.threats[0].position={x:5,y:0,z:20};
    const blocked=createAdventure({save:JSON.stringify(data)});tap(blocked,"strike");blocked.advance(0.01);expect(blocked.snapshot.player.attackSequence).toBe(0);
    expect(blocked.snapshot.player.stamina).toBe(5);
  });
  test("Disengage roots until landing, keeps its arc and saved progress, then releases the hound",()=>{
    const game=wolfGame();game.selectTarget("patrol");tap(game,"disengage");game.advance(0.01);
    const origin=threat(game,"patrol").position;expect(threat(game,"patrol").health).toBe(48);expect(threat(game,"patrol").rootedSeconds).toBe(0.8);
    game.advance(0.4);expect(game.snapshot.player.position.y).toBeCloseTo(1.2);expect(threat(game,"patrol").position).toEqual(origin);
    const saved=game.save(),loaded=createAdventure({save:saved});expect(loaded.save()).toBe(saved);
    game.advance(0.4);loaded.advance(0.4);expect(loaded.save()).toBe(game.save());expect(game.snapshot.player.grounded).toBe(true);
    expect(threat(game,"patrol").rootedSeconds).toBe(0);game.advance(0.5);expect(threat(game,"patrol").position).not.toEqual(origin);
  });
  test("the hound's only attack is Maul; it holds its committed landing and cannot damage during preparation",()=>{
    const game=wolfGame();game.advance(0.01);expect(game.snapshot.player.health).toBe(100);
    game.advance(4);const launched=threat(game,"patrol");expect(launched.movementMode).toBe("lunge");expect(launched.actionSequence).toBe(0);
    game.setCameraForward(0,-1);game.setAction("forward",true);game.advance(0.3);
    expect(threat(game,"patrol").targetPosition).toEqual(launched.targetPosition);expect(threat(game,"patrol").facing).toEqual(launched.facing);
    game.advance(0.35);game.setAction("forward",false);expect(threat(game,"patrol").actionSequence).toBe(1);
    game.advance(0.35);expect(game.snapshot.combat.phase).toBe("preparation");const hp=game.snapshot.player.health;
    game.advance(5);expect(game.snapshot.player.health).toBe(hp);expect(threat(game,"patrol").movementMode).toBe("lunge");
    game.advance(0.65);expect(threat(game,"patrol").actionSequence).toBe(2);
  });
  test("a queued Disengage on the Maul launch beat roots its landing and avoids the hit",()=>{
    const game=wolfGame();game.advance(0.01);game.advance(9.99);game.selectTarget("patrol");
    // Move the next engagement to contact; the same shared active opening remains authoritative.
    const saved=JSON.parse(game.save());const wolf=saved.state.threats.find((t:{id:string})=>t.id==="patrol");
    saved.state.position={x:wolf.position.x-1.5,y:0,z:wolf.position.z};
    const dodge=createAdventure({save:JSON.stringify(saved)});tap(dodge,"disengage");dodge.advance(0.01);
    expect(dodge.snapshot.combat.queued[0]?.status).toBe("executed");
    const at=threat(dodge,"patrol").position,hp=dodge.snapshot.player.health;dodge.advance(0.65);
    expect(threat(dodge,"patrol").position.x).toBeCloseTo(at.x);expect(threat(dodge,"patrol").position.z).toBeCloseTo(at.z);
    expect(threat(dodge,"patrol").lastActionHit).toBe(false);expect(dodge.snapshot.player.health).toBe(hp);
  });
  test("diagonal hop randomness and saved airborne motion remain deterministic",()=>{
    const game=wolfGame(-3,22);const data=JSON.parse(game.save());const wolf=data.state.threats.find((t:{id:string})=>t.id==="patrol");
    wolf.position={x:-3,y:0,z:16.5};wolf.wolf.rng=0;
    const hopping=createAdventure({save:JSON.stringify(data)});hopping.advance(0.01);hopping.advance(5);
    const fixture=JSON.parse(hopping.save());fixture.state.position={x:-3,y:0,z:22};const hound=fixture.state.threats.find((t:{id:string})=>t.id==="patrol");
    hound.position={x:-3,y:0,z:12};hound.wolf.motion=null;hound.wolf.rng=0;
    const first=createAdventure({save:JSON.stringify(fixture)});first.advance(0.25);expect(threat(first,"patrol").movementMode).toBe("hop");expect(threat(first,"patrol").position.y).toBeCloseTo(0.6);
    const saved=first.save(),reopened=createAdventure({save:saved});first.advance(0.25);reopened.advance(0.25);expect(reopened.save()).toBe(first.save());
    const landing=threat(first,"patrol").position;expect(landing.x+3).toBeCloseTo(landing.z-12);
    first.advance(0.01);expect(JSON.parse(first.save()).state.threats.find((t:{id:string})=>t.id==="patrol").wolf.rng).toBe(1196435762);
  });
  test("maneuvers respect gate walls, and a queued attack while airborne fails without spending",()=>{
    const game=wolfGame(4,5),data=JSON.parse(game.save());data.state.threats.find((t:{id:string})=>t.id==="patrol").position={x:4,y:0,z:7};
    const leap=createAdventure({save:JSON.stringify(data)});leap.selectTarget("patrol");tap(leap,"disengage");leap.advance(0.01);leap.advance(0.8);
    expect(leap.snapshot.player.position.z).toBeGreaterThan(4);expect(leap.snapshot.player.grounded).toBe(true);
    const jumping=headFight();tap(jumping,"jump");jumping.advance(0.1);tap(jumping,"strike");jumping.moveQueuedAction(latestId(jumping),0);
    expect(pending(jumping)[0]?.offsetSeconds).toBe(1);expect(jumping.snapshot.player.stamina).toBe(5);
  });
});

describe("saved plans, attrition and services",()=>{
  test("v8 preserves queued reservations, active recovery, projectiles and the encounter clock exactly",()=>{
    const game=positioned(-3,8.1);tap(game,"strike");tap(game,"brace");game.setQueuedDelay(latestId(game),3);
    const initial=game.save();expect(createAdventure({save:initial}).save()).toBe(initial);
    game.advance(0.01);game.advance(0.125);const saved=game.save(),restored=createAdventure({save:saved});expect(restored.save()).toBe(saved);
    game.advance(0.5);restored.advance(0.5);expect(restored.save()).toBe(game.save());
    game.advance(8.6);const airborne=game.save(),loaded=createAdventure({save:airborne});expect(threat(loaded,"scout").fireballs).toHaveLength(1);
    game.advance(1);loaded.advance(1);expect(loaded.save()).toBe(game.save());
  });
  test("all seven legacy versions preserve health, inventory, loot and shields; active encounters resume in preparation",()=>{
    for(let version=1;version<=7;version++){
      const old=JSON.parse(createAdventure().save());old.version=version;
      Object.assign(old.state,{health:73,supplies:27,potions:2,bankedRelics:1,guardSeconds:version>=4&&version<7?4:2,block:5,stamina:3,bloodRage:version===7?2:0,rageDrainSeconds:version===7?4:0});
      const scout=old.state.threats[0],wolf=old.state.threats.find((t:{id:string})=>t.id==="patrol");
      if(version<6){scout.wolf=wolf.wolf;scout.damage=4;wolf.abilityIndex=0;}
      if(version<4)for(const t of old.state.threats)if(t.phase==="patrol")t.phase="dormant";
      const migrated=createAdventure({save:JSON.stringify(old)});
      expect(migrated.snapshot.player).toMatchObject({health:73,stamina:5,bloodRage:version===7?2:0,block:5,guardSeconds:2});
      expect(migrated.snapshot).toMatchObject({supplies:27,potions:2,bankedRelics:1});expect(JSON.parse(migrated.save()).version).toBe(8);
      expect(createAdventure({save:migrated.save()}).save()).toBe(migrated.save());
    }
    const old=JSON.parse(headFight().save());old.version=7;const migrated=createAdventure({save:JSON.stringify(old)}),hp=migrated.snapshot.player.health;
    expect(migrated.snapshot.combat.phase).toBe("preparation");migrated.advance(4.9);expect(migrated.snapshot.player.health).toBe(hp);
  });
  test("invalid saved reservations, overlapping beats, duplicate identities and impossible targets are rejected",()=>{
    const game=positioned(-3,8.1);tap(game,"strike");tap(game,"brace");const saved=JSON.parse(game.save());
    for(const mutate of [
      (s:typeof saved)=>{s.state.stamina=0;},
      (s:typeof saved)=>{s.state.combat.queued[1].offsetSeconds=0;},
      (s:typeof saved)=>{s.state.combat.queued[1].id=1;},
      (s:typeof saved)=>{s.state.combat.queued[0].targetId="missing";},
      (s:typeof saved)=>{s.state.combat.queued[0].cost=0;},
    ]){const bad=structuredClone(saved);mutate(bad);expect(()=>createAdventure({save:JSON.stringify(bad)})).toThrow();}
    for(const bad of ["broken","{}",game.save().replace('"version":8','"version":99')])expect(()=>createAdventure({save:bad})).toThrow();
  });
  test("Rage caps at three, strengthens Jab, drains through Block and can kill",()=>{
    const game=positioned(-3,8.1);tap(game,"bloodRage");tap(game,"bloodRage");tap(game,"bloodRage");game.advance(0.01);game.advance(4);
    expect(game.snapshot.player.bloodRage).toBe(3);expect(game.snapshot.player.stamina).toBe(2);const hp=game.snapshot.player.health;
    game.advance(1);expect(game.snapshot.player.health).toBe(hp-3);tap(game,"brace");tap(game,"jab");game.advance(5);
    expect(game.snapshot.player.health).toBe(hp-6);expect(game.snapshot.player.block).toBe(7);game.advance(1);expect(threat(game,"scout").health).toBe(63);
    const saved=JSON.parse(game.save());saved.state.health=1;saved.state.rageDrainSeconds=0.1;
    const dying=createAdventure({save:JSON.stringify(saved)});dying.advance(0.1);expect(dying.snapshot.phase).toBe("lost");expect(dying.snapshot.player.health).toBe(0);
  });
  test("Rage cannot execute before a fight and decays every two seconds after leaving",()=>{
    const game=positioned(0,3);tap(game,"bloodRage");game.advance(1);expect(game.snapshot.player.bloodRage).toBe(0);
    const data=JSON.parse(createAdventure().save());Object.assign(data.state,{bloodRage:3,rageDrainSeconds:5});
    const safe=createAdventure({save:JSON.stringify(data)});safe.advance(1.99);expect(safe.snapshot.player.bloodRage).toBe(3);
    safe.advance(0.01);expect(safe.snapshot.player.bloodRage).toBe(2);safe.advance(4);expect(safe.snapshot.player.bloodRage).toBe(0);expect(safe.snapshot.player.rageDrainSeconds).toBe(0);
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
  test("Lorebook lists every monster and exactly one scheduled ability per window",()=>{
    const lore=getMonsterLore();expect(lore.map(e=>e.id)).toEqual(createAdventure().snapshot.threats.map(t=>t.id));
    const head=lore.find(e=>e.id==="scout")!;expect(head.sequences.map(e=>e.abilityIds)).toEqual([["fireball"],["ember-ward"],["kindle"]]);
    expect(head.sequences.every(e=>e.offsetsSeconds.length===0 && e.description.includes("20% each"))).toBe(true);expect(head.abilities.map(a=>a.id)).toEqual(["ember-beam","fireball","ember-ward","kindle"]);
    const wolf=lore.find(e=>e.id==="patrol")!;expect(wolf.abilities.some(a=>a.id==="bite")).toBe(false);expect(wolf.sequences.filter(e=>e.probability!==undefined).map(e=>e.probability)).toEqual([0.5,0.5]);
  });
});

// Each seed's next draw deliberately chooses a different beat.
const beatCases = [{ seed: 2000, beat: 0 }, { seed: 0, beat: 1 }, { seed: 500, beat: 2 }, { seed: 1000, beat: 3 }, { seed: 1500, beat: 4 }];
function withTimingSeed(game: AdventureGame, id: string, seed: number): AdventureGame {
  const data = JSON.parse(game.save());
  data.state.threats.find((t: {id: string}) => t.id === id).rng = seed;
  return createAdventure({ save: JSON.stringify(data) });
}

describe("announced random enemy beats", () => {
  test("every beat is reachable, announced for full preparation, fixed while counting down, and retained on reload", () => {
    for (const { seed, beat } of beatCases) {
      const game = withTimingSeed(headFight(), "scout", seed);
      game.advance(game.snapshot.combat.remainingSeconds);
      const move = threat(game, "scout").windowAction!;
      expect(move.offsetSeconds).toBe(beat);
      expect(threat(game, "scout").forecast[0]!.remainingSeconds).toBeCloseTo(5 + beat);
      const saved = game.save(), restored = createAdventure({ save: saved });
      expect(restored.save()).toBe(saved);
      game.advance(1); restored.advance(1);
      expect(restored.save()).toBe(game.save());
      expect(threat(game, "scout").windowAction).toEqual(move);
      expect(threat(game, "scout").forecast[0]!.remainingSeconds).toBeCloseTo(4 + beat);
      expect(game.snapshot.player.health).toBe(99);
      game.advance(4 + beat - .001);
      expect(threat(game, "scout").windowAction!.status).toBe("active");
      expect(threat(game, "scout").fireballs).toHaveLength(1);
      expect(game.snapshot.player.health).toBe(99);
      game.advance(.001);
      expect(threat(game, "scout").actionSequence).toBe(2);
      expect(threat(game, "scout").windowAction!.status).toBe("resolved");
      expect(game.snapshot.player.health).toBe(96);
    }
  });
  test("both future head forecasts resolve at their promised times without consuming random draws", () => {
    const game = withTimingSeed(headFight(), "scout", 1500);
    const announced = threat(game, "scout").forecast;
    expect(announced.map(f => f.ability.id)).toEqual(["fireball", "ember-ward"]);
    const saved = game.save();
    for (let i = 0; i < 5; i++) expect(threat(game, "scout").forecast).toEqual(announced);
    expect(game.save()).toBe(saved);
    game.advance(announced[0]!.remainingSeconds);
    expect(threat(game, "scout").actionSequence).toBe(2);
    expect(game.snapshot.player.health).toBe(96);
    game.advance(announced[1]!.remainingSeconds - announced[0]!.remainingSeconds - .001);
    expect(threat(game, "scout").block).toBe(0);
    game.advance(.001);
    expect(threat(game, "scout").block).toBe(6);
    expect(threat(game, "scout").actionSequence).toBe(3);
  });
  test("a fifth-beat 30-fireball volley finishes before preparation", () => {
    const game = withTimingSeed(headFight(), "scout", 1500), data = JSON.parse(game.save());
    data.state.threats[0].head.volley = 30;
    const volley = createAdventure({ save: JSON.stringify(data) });
    volley.advance(volley.snapshot.combat.remainingSeconds);
    expect(threat(volley, "scout").windowAction!.offsetSeconds).toBe(4);
    volley.advance(5);
    expect(volley.snapshot.player.health).toBe(99);
    volley.advance(3.999); expect(volley.snapshot.player.health).toBe(99);
    volley.advance(.991);
    expect(volley.snapshot.player.health).toBe(9);
    expect(threat(volley, "scout").fireballs).toHaveLength(0);
    volley.advance(.01);
    expect(volley.snapshot.combat.phase).toBe("preparation");
    volley.advance(4.9); expect(volley.snapshot.player.health).toBe(9);
  });
  test("Maul keeps its complete leap on both the first and fifth beats", () => {
    for (const { seed, beat } of [beatCases[0]!, beatCases[4]!]) {
      const game = withTimingSeed(wolfGame(), "patrol", seed);
      game.advance(.01); game.advance(game.snapshot.combat.remainingSeconds);
      expect(threat(game, "patrol").actionSequence).toBe(1);
      expect(threat(game, "patrol").windowAction!.offsetSeconds).toBeCloseTo(beat + .65);
      game.advance(5 + beat);
      expect(threat(game, "patrol").movementMode).toBe("lunge");
      expect(threat(game, "patrol").actionSequence).toBe(1);
      game.advance(.325);
      expect(threat(game, "patrol").movementMode).toBe("lunge");
      expect(threat(game, "patrol").motionProgress).toBeCloseTo(.5, 2);
      expect(threat(game, "patrol").actionSequence).toBe(1);
      game.advance(.325); expect(threat(game, "patrol").actionSequence).toBe(2);
    }
  });
  test("two engaged enemies independently announce early and late attacks on the shared clock", () => {
    const data = JSON.parse(createAdventure().save());
    data.state.phase = "expedition"; data.state.position = { x: 0, y: 0, z: 21 };
    data.state.combat.phase = "preparation"; data.state.combat.cycle = 1;
    const head = data.state.threats[0], nest = data.state.threats[1];
    Object.assign(head, { aggro: true, phase: "preparation", position: { x: -2, y: 0, z: 18 }, rng: 2000 });
    head.head.opened = true;
    Object.assign(nest, { aggro: true, phase: "preparation", rng: 1500 });
    const game = createAdventure({ save: JSON.stringify(data) });
    expect(threat(game, "scout").windowAction!.offsetSeconds).toBe(0);
    expect(threat(game, "nest").windowAction!.offsetSeconds).toBe(4.35);
    game.advance(2);
    expect(threat(game, "scout").forecast[0]!.remainingSeconds).toBeCloseTo(3);
    expect(threat(game, "nest").forecast[0]!.remainingSeconds).toBeCloseTo(7.35);
    const loaded = createAdventure({ save: game.save() });
    expect(threat(loaded, "scout").windowAction).toEqual(threat(game, "scout").windowAction);
    expect(threat(loaded, "nest").windowAction).toEqual(threat(game, "nest").windowAction);
  });
});
