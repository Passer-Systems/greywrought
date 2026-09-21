import { expect, test } from 'bun:test';
import { createAdventure, createSharedAdventure } from './adventure.js';
import { BELLRUNNER_STOPS, flightMasterId, flightMasterPosition, bellrunnerLanding, bellrunnerDock, flightDuration, flightPosition } from './bellrunner.js';
import { blockedPosition, supportHeight } from './movement.js';
import { LocalMovement } from '../host/local-movement.js';
import { travel } from './yard-test-fixtures.js';

test('every Bellrunner route lifts, crosses the world and lands on walkable town ground', () => {
  for (const from of BELLRUNNER_STOPS) for (const to of BELLRUNNER_STOPS) if (from !== to) {
    const save=JSON.parse(createAdventure().save()); save.state.position=flightMasterPosition(from.id); save.state.coins=71; save.state.supplies=29;
    const game=createAdventure({save:JSON.stringify(save)});
    expect(blockedPosition(from.x,from.z)).toBe(false);
    expect(game.fly(to.id)).toBe(false);
    game.interactNpc(flightMasterId(from.id));
    expect(game.snapshot.flightMasterOpen).toBe(from.id);
    expect(game.fly(to.id)).toBe(true);
    game.advance(4);
    expect(game.snapshot.player.position.y).toBeGreaterThan(bellrunnerDock(from.id).y+35);
    game.setAction('forward',true); game.setAction('jump',true); game.setAction('strike',true); game.setAction('hearthstone',true);
    game.advance(flightDuration(from.id,to.id)/2-4);
    const middle=game.snapshot.player.position;
    expect(Math.hypot(middle.x-from.x,middle.z-from.z)).toBeGreaterThan(40);
    expect(game.snapshot.player.inCombat).toBe(false);
    const restored=createAdventure({save:game.save()});
    expect(restored.snapshot.player.position).toEqual(middle);
    restored.advance(flightDuration(from.id,to.id)/2+.1);
    expect(restored.snapshot.player.flight).toBeNull();
    expect(restored.snapshot.player.position).toEqual(bellrunnerLanding(to.id));
    const landing=bellrunnerLanding(to.id);
    expect(blockedPosition(landing.x,landing.z)).toBe(false);
    expect(restored.snapshot.player.grounded).toBe(true);
    expect(restored.snapshot.player.health).toBe(100);
    expect(restored.snapshot.coins).toBe(71); expect(restored.snapshot.supplies).toBe(29);
    for(let elapsed=4;elapsed<flightDuration(from.id,to.id)-4;elapsed+=.5){const p=flightPosition({from:from.id,to:to.id,elapsed});expect(p.y-supportHeight(p.x,p.z)).toBeGreaterThan(20)}
  }
});

test('boarding rejects distant, same-stop and engaged travellers', () => {
  const game=createAdventure(); expect(game.fly('suture')).toBe(false);
  travel(game,-8,-28); expect(game.fly('yard')).toBe(false);
  const save=JSON.parse(game.save()); save.state.phase='expedition';
  Object.assign(save.state.threats[0],{aggro:true,phase:'preparation'});
  const engaged=createAdventure({save:JSON.stringify(save)});
  expect(engaged.snapshot.player.inCombat).toBe(true);
  expect(engaged.fly('suture')).toBe(false);
});

test('shared spectators see flight and reconnect/save restoration retains the route', () => {
  let world=createSharedAdventure(); let rider=world.join('rider','Rider','warrior');
  world.join('watcher','Watcher','mage'); travel(rider,-4.4,-26.5,world); rider.interactNpc('flight-master-yard');
  expect(rider.fly('brinewick')).toBe(true); world.advance(9);
  expect(world.players().find(p=>p.id==='rider')!.player.flight?.to).toBe('brinewick');
  expect(world.pause('rider')).toBe(false);
  world.leave('rider');
  world=createSharedAdventure({save:world.save()}); rider=world.join('rider','Rider','warrior');
  expect(rider.snapshot.player.flight?.elapsed).toBeCloseTo(9);
  world.advance(40);
  expect(rider.snapshot.player.position).toEqual(bellrunnerLanding('brinewick'));
  expect(rider.snapshot.player.flight).toBeNull();
});

test('local prediction follows the flying rider instead of applying gravity or walking', () => {
  const game=createAdventure(); travel(game,-4.4,-26.5); game.interactNpc('flight-master-yard'); game.fly('suture'); game.advance(6);
  const prediction=new LocalMovement(game.snapshot,game.movementCheckpoint!);
  prediction.setAction('forward',true); prediction.setAction('jump',true); prediction.setCameraForward(1,0); prediction.advance(.2);
  const expected=flightPosition({...game.snapshot.player.flight!,elapsed:6.2});
  expect(prediction.player.position.x).toBeCloseTo(expected.x);
  expect(prediction.player.position.y).toBeCloseTo(expected.y);
  expect(prediction.player.cameraForward.x).toBe(1);
  expect(prediction.takeOutgoing()).toEqual([]);
  game.advance(40); prediction.reconcile(game.snapshot,game.movementCheckpoint!,46); prediction.advance(.1);
  expect(prediction.player.grounded).toBe(true);
  expect(prediction.player.position).toEqual(bellrunnerLanding('suture'));
});


test('flight masters require talking nearby and lose boarding permission when closed or left', () => {
  const save=JSON.parse(createAdventure().save()); save.state.position=flightMasterPosition('yard');
  const game=createAdventure({save:JSON.stringify(save)});
  expect(game.fly('suture')).toBe(false);
  game.interactNpc('flight-master-suture');
  expect(game.snapshot.flightMasterOpen).toBeNull();
  game.setAction('interact',true); game.setAction('interact',false);
  expect(game.snapshot.flightMasterOpen).toBe('yard');
  game.setAction('closeShop',true); game.setAction('closeShop',false);
  expect(game.fly('suture')).toBe(false);
  game.interactNpc('flight-master-yard');
  travel(game,0,-26.5);
  expect(game.snapshot.flightMasterOpen).toBeNull();
  expect(game.fly('suture')).toBe(false);
});
