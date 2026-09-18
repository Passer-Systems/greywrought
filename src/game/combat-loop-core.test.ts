import { expect, test } from "bun:test";
import { createAdventure, createSharedAdventure } from "./adventure.js";
import { earnedChapter, tap } from "./yard-test-fixtures.js";

function seed() {
  const save = JSON.parse(createAdventure({archetype:"mage"}).save());
  Object.assign(save.state, {phase:"expedition", position:{x:-3,y:0,z:8}, chapter:earnedChapter(2)});
  for (const t of save.state.threats) {
    t.rng=9844;
    if (t.active && t.id!=="scout") Object.assign(t,{health:0,phase:"cleared",lootClaimed:true});
  }
  return save;
}
function fight() { const game=createAdventure({save:JSON.stringify(seed())}); game.advance(.01); return game; }

test("intentions precede a full 30-second planning window; Ready repeats with fresh slots",()=>{
  const game=fight(), intent=game.snapshot.threats[0]!.windowAction;
  expect(intent).not.toBeNull(); expect([0,1,2]).toContain(intent!.offsetSeconds);
  expect(game.snapshot.combat.remainingSeconds).toBe(30);
  game.advance(29.99); expect(game.snapshot.combat.phase).toBe("preparation");
  expect(game.snapshot.player.health).toBe(100); expect(game.snapshot.threats[0]!.windowAction).toEqual(intent);
  game.advance(.01); expect(game.snapshot.combat.phase).toBe("active");
  game.advance(3.05); expect(game.snapshot.combat.phase).toBe("preparation");
  const cycle=game.snapshot.combat.cycle;
  tap(game,"strike"); expect(game.readyCombat()).toBe(true);
  game.advance(3.05); expect(game.snapshot.combat.cycle).toBe(cycle+1);
  expect(game.snapshot.combat.queued).toEqual([]);
});

test("late aggro waits through this execution and chooses only next cycle",()=>{
  const data=seed(); const bee=data.state.threats.find((t:{id:string})=>t.id==='nest');
  Object.assign(bee,{health:72,phase:"patrol",lootClaimed:false,position:{x:0,y:0,z:9},targetPosition:{x:0,y:0,z:9}});
  const game=createAdventure({save:JSON.stringify(data)}); game.advance(.01);
  game.selectTarget("nest"); tap(game,"strike");
  expect(game.snapshot.threats[1]!.joinsNextWindow).toBe(true);
  expect(game.snapshot.threats[1]!.windowAction).toBeNull();
  game.readyCombat(); game.advance(2.9);
  expect(game.snapshot.threats[1]!.actionSequence).toBe(0);
  game.advance(.2);
  expect(game.snapshot.threats[1]!.joinsNextWindow).toBe(false);
  expect(game.snapshot.threats[1]!.windowAction).not.toBeNull();
});

test("active sequence rejects all queue mutations and movement, but performs planned retreat",()=>{
  const game=fight(); tap(game,"disengage"); tap(game,"strike");
  const first=game.snapshot.combat.queued[0]!; game.moveQueuedAction(first.id,1);
  expect(game.snapshot.combat.queued.map(e=>e.offsetSeconds)).toEqual([1,0]);
  game.setAction("forward",true); game.readyCombat();
  const plan=game.snapshot.combat.queued;
  game.removeQueuedAction(first.id); game.clearQueuedActions(); game.moveQueuedAction(first.id,2);
  expect(game.replaceQueuedAction(first.id,"brace")).toBe(false); tap(game,"drinkPotion");
  expect(game.snapshot.combat.queued).toEqual(plan);
  const start=game.snapshot.player.position; game.advance(.5);
  expect(game.snapshot.player.position).toEqual(start);
  game.advance(.55); expect(game.snapshot.player.maneuver).toBe("disengage");
  game.advance(.8); expect(game.snapshot.player.position.z).toBeLessThan(start.z);
  game.advance(1.2); expect(game.snapshot.combat.phase).toBe("preparation");
  const end=game.snapshot.player.position; game.setCameraForward(0,1); game.setAction("forward",true); game.advance(.1);
  expect(game.snapshot.player.position).not.toEqual(end);
});

test("final-slot volleys finish before a new planning window opens",()=>{
  const data=seed(), t=data.state.threats[0];
  data.state.combat={phase:"active",elapsedSeconds:1.99,cycle:2,queued:[],nextId:1,ready:false};
  Object.assign(t,{aggro:true,phase:"preparation",joinCycle:2,windowCycle:2,specialOffset:2,castDuration:2,remainingSeconds:.01,damage:36});
  Object.assign(t.head,{opened:true,ability:"fireball",volley:2,castVolley:2});
  const game=createAdventure({save:JSON.stringify(data)});
  game.advance(1.02); expect(game.snapshot.combat.phase).toBe("active");
  expect(game.snapshot.threats[0]!.fireballs.length).toBeGreaterThan(0);
  game.advance(.2); expect(game.snapshot.combat.phase).toBe("preparation");
  expect(game.snapshot.player.health).toBe(64);
  const health=game.snapshot.player.health; game.advance(5); expect(game.snapshot.player.health).toBe(health);
});

test("shared Ready excludes town players; pausing and saving preserve spent and pending moves",()=>{
  const seedWorld=createSharedAdventure(); seedWorld.join("fighter","Fighter","mage"); seedWorld.join("town","Town","warrior");
  const data=JSON.parse(seedWorld.save()), solo=seed().state;
  Object.assign(data.characters[0].state,{phase:solo.phase,position:solo.position,chapter:solo.chapter}); data.world.threats=solo.threats;
  const world=createSharedAdventure({save:JSON.stringify(data)});
  const fighter=world.join("fighter","Fighter","mage"), town=world.join("town","Town","warrior");
  world.advance(.01); tap(fighter,"strike"); tap(fighter,"strike"); fighter.readyCombat();
  expect(fighter.snapshot.combat.phase).toBe("active"); town.setAction("right",true);
  world.advance(.1); expect(town.snapshot.player.position.x).toBeLessThan(0);
  const before=fighter.snapshot; expect(before.combat.queued[0]!.status).toBe("executed");
  world.pause("fighter"); world.advance(5); expect(fighter.snapshot.combat).toEqual(before.combat);
  const restored=createSharedAdventure({save:world.save()}); const player=restored.join("fighter","Fighter","mage");
  expect(player.snapshot.combat).toEqual(before.combat); expect(restored.resume("fighter")).toBe(true);
  player.clearQueuedActions(); expect(player.snapshot.combat.queued).toHaveLength(2);
  restored.advance(1); expect(player.snapshot.threats[0]!.health).toBe(before.threats[0]!.health-11);
  expect(player.snapshot.combat.queued.every(e=>e.status==="executed")).toBe(true);
});

test("network movement is consumed without motion and new proximity aggro waits during execution",()=>{
  const game=fight(); game.readyCombat(); game.advance(.1);
  const data=JSON.parse(game.save()), warder=data.state.threats.find((t:{id:string})=>t.id==='patrol');
  Object.assign(warder,{health:72,phase:"patrol",lootClaimed:false,position:{x:-3,y:0,z:10},targetPosition:{x:-3,y:0,z:10}});
  const resumed=createAdventure({save:JSON.stringify(data)}); resumed.enableNetworkMovement!();
  const start=resumed.snapshot.player.position;
  resumed.enqueueMovement!([{sequence:1,seconds:.1,input:{forward:1,strafe:0,cameraX:0,cameraZ:1,jump:true}}]);
  resumed.advance(.1);
  expect(resumed.movementCheckpoint!.sequence).toBe(1);
  expect(resumed.snapshot.player.position).toEqual(start);
  expect(resumed.snapshot.threats[3]!.joinsNextWindow).toBe(true);
  expect(resumed.snapshot.threats[3]!.windowAction).toBeNull();
  expect(resumed.snapshot.threats[3]!.actionSequence).toBe(0);
  resumed.advance(3);
  expect(resumed.snapshot.player.position).toEqual(start);
  expect(resumed.snapshot.threats[3]!.windowAction).not.toBeNull();
});
