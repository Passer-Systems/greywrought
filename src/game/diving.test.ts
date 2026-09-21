import { expect, test } from 'bun:test';
import { createAdventure } from './adventure.js';
import { terrainHeight } from './cave-layout.js';
import { LocalMovement } from '../host/local-movement.js';
import { moveLocomotion, moveManeuverPosition, movementHeight, movementHeightSampler, supportHeight, isSubmerged, type MovementInput, type MovementState } from './movement.js';
import { reachableCombatCells, snapCombatPosition } from './combat-grid.js';
import { bellrunnerDock, flightPosition } from './bellrunner.js';
import { combatSurfaceHeight } from '../host/terrain-geometry.js';
import { lakeWaterAt } from './world-elevation.js';

const neutral: MovementInput={forward:0,strafe:0,cameraX:0,cameraZ:1,jump:false};
const center={x:-27,z:-95};
test('batched movement surfaces agree with individual samples from shore to deep water',()=>{
  for(const reference of [{...center,y:-2.5},{...center,y:supportHeight(center.x,center.z)},{x:0,y:1.6,z:-8}]){
    const sample=movementHeightSampler(reference);
    for(let x=-65;x<5;x+=5)for(let z=-130;z<-60;z+=5)expect(sample(x,z)).toBe(movementHeight(x,z,reference));
  }
});
function swimmer() {
  const saved=JSON.parse(createAdventure({now:()=>1000}).save());
  Object.assign(saved.state,{phase:'expedition',position:{...center,y:supportHeight(center.x,center.z)}});
  for(const threat of saved.state.threats) if(threat.active) Object.assign(threat,{health:0,phase:'cleared',aggro:false,lootClaimed:true,respawnAt:121000});
  return createAdventure({save:JSON.stringify(saved),now:()=>1000});
}

test('Ctrl dives, neutral input holds depth, Space rises and the bed bounds feet',()=>{
  const game=swimmer();game.setAction('dive',true);game.advance(1);game.setAction('dive',false);
  const deep=game.snapshot.player.position.y;
  expect(deep).toBeCloseTo(supportHeight(center.x,center.z)-2.2);
  expect(isSubmerged(game.snapshot.player.position)).toBe(true);
  game.advance(2);expect(game.snapshot.player.position.y).toBeCloseTo(deep);
  game.setAction('dive',true);game.advance(2);game.setAction('dive',false);
  expect(game.snapshot.player.position.y).toBeCloseTo(terrainHeight(center.x,center.z));
  game.setAction('jump',true);game.advance(3);game.setAction('jump',false);
  expect(game.snapshot.player.position.y).toBeCloseTo(supportHeight(center.x,center.z));
  expect(game.snapshot.player.health).toBe(100);
});

test('Space breaches from the water surface and settles without repeated bouncing',()=>{
  const surface = supportHeight(center.x, center.z);
  const state: MovementState = { position: { ...center, y: surface }, verticalSpeed: 0, breathSeconds: 60 };
  moveLocomotion(state, { ...neutral, jump: true, rise: true }, .2);
  expect(state.position.y).toBeGreaterThan(surface);
  expect(state.position.y).toBeGreaterThan(lakeWaterAt(center.x, center.z)! - .8);
  moveLocomotion(state, { ...neutral, jump: false, rise: true }, 1);
  expect(state.position.y).toBeCloseTo(surface);
  expect(state.verticalSpeed).toBe(0);
});

test('saved depth and breath survive reload; exhaustion returns the swimmer to air',()=>{
  const game=swimmer();game.setAction('dive',true);game.advance(2);game.setAction('dive',false);game.advance(6);
  const restored=createAdventure({save:game.save(),now:()=>1000});
  expect(restored.snapshot.player.position).toEqual(game.snapshot.player.position);
  expect(restored.snapshot.player.breathSeconds).toBeCloseTo(game.snapshot.player.breathSeconds);
  expect(restored.snapshot.player.breathSeconds).toBeLessThan(54);
  restored.advance(60);
  expect(restored.snapshot.player.position.y).toBeCloseTo(supportHeight(center.x,center.z));
  expect(restored.snapshot.player.breathSeconds).toBeGreaterThan(0);
  expect(restored.snapshot.player.health).toBe(100);
});

test('local prediction and authoritative input agree throughout dive, hold and rise',()=>{
  const server=swimmer();server.enableNetworkMovement!();const local=new LocalMovement(server.snapshot,server.movementCheckpoint!);
  for(const action of ['dive',null,'jump'] as const){
    if(action)local.setAction(action,true);
    for(let i=0;i<90;i++){
      local.advance(1/60);server.enqueueMovement!(local.takeOutgoing());server.advance(1/60);
      local.reconcile(server.snapshot,server.movementCheckpoint!,action==='dive'?i:action===null?100+i:200+i);
      expect(local.player.position.y).toBeCloseTo(server.snapshot.player.position.y,6);
      expect(local.player.breathSeconds).toBeCloseTo(server.snapshot.player.breathSeconds,6);
    }
    if(action)local.setAction(action,false);
  }
  expect(local.player.position.y).toBeCloseTo(supportHeight(center.x,center.z));
});

test('the same combat grid and maneuver retain submerged depth',()=>{
  const origin={...center,y:-2.5};
  const snapped=snapCombatPosition(origin);expect(snapped.y).toBeCloseTo(origin.y);
  const target=reachableCombatCells(snapped,2).find(p=>p.x===snapped.x+2.5&&p.z===snapped.z)!;
  expect(target.y).toBeCloseTo(origin.y);
  expect(combatSurfaceHeight(target.x,target.z,origin)).toBeCloseTo(target.y);
  const state: MovementState={position:{...snapped},verticalSpeed:0,breathSeconds:60};
  moveManeuverPosition(state,{kind:'bait',start:snapped,destination:target,remainingSeconds:1,duration:1},1);
  expect(state.position).toEqual(target);
});

test('dive input leaves land walking and jumping unchanged; flight takes precedence',()=>{
  const ordinary: MovementState={position:{x:0,y:supportHeight(0,-8),z:-8},verticalSpeed:0};
  const diving: MovementState=structuredClone(ordinary);
  moveLocomotion(ordinary,{...neutral,forward:1,jump:true},.4);
  moveLocomotion(diving,{...neutral,forward:1,jump:true,dive:true,rise:true},.4);
  expect(diving.position).toEqual(ordinary.position);expect(diving.verticalSpeed).toBe(ordinary.verticalSpeed);
  const save=JSON.parse(createAdventure().save());save.state.position=bellrunnerDock('yard');
  const flight=createAdventure({save:JSON.stringify(save)});expect(flight.fly('suture')).toBe(true);
  flight.setAction('dive',true);flight.setAction('jump',true);flight.advance(5);
  expect(flight.snapshot.player.position).toEqual(flightPosition({from:'yard',to:'suture',elapsed:flight.snapshot.player.flight!.elapsed}));
  expect(flight.snapshot.player.breathSeconds).toBe(60);
});
