import {expect,test} from 'bun:test';
import {YARD_GUARDS,guardPatrol} from './yard-guards.js';
import {blockedPosition,supportHeight} from './movement.js';
import {inTown} from './world-layout.js';

test('both asymmetric guard circuits stay on safe, clear ground with walking and pauses',()=>{
  for(const guard of YARD_GUARDS){
    let walking=false,idle=false;
    for(let time=0;time<180000;time+=250){
      const state=guardPatrol(guard.id,time),p=state.position;
      walking ||=state.moving;idle ||=!state.moving;
      expect(inTown(p)).toBe(true);expect(p.y).toBe(supportHeight(p.x,p.z));
      for(const [dx,dz] of [[0,0],[.4,0],[-.4,0],[0,.4],[0,-.4]])expect(blockedPosition(p.x+dx!,p.z+dz!)).toBe(false);
      expect(Math.hypot(state.facing.x,state.facing.z)).toBeCloseTo(1);
      const next=guardPatrol(guard.id,time+50).position;
      expect(Math.hypot(next.x-p.x,next.z-p.z)).toBeLessThanOrEqual(guard.speed*.05+.001);
    }
    expect(walking&&idle).toBe(true);
  }
  expect(guardPatrol('guard-iona',10000).position).not.toEqual(guardPatrol('guard-bram',10000).position);
});

test('each guard can be selected and greeted only at its current patrol position',async()=>{
  const {createAdventure}=await import('./adventure.js');
  const now=1145900;
  for(const guard of YARD_GUARDS){
    const save=JSON.parse(createAdventure().save());save.state.position=guardPatrol(guard.id,now).position;
    const game=createAdventure({save:JSON.stringify(save),now:()=>now});
    game.interactNpc(guard.id);
    expect(game.snapshot.selectedGuard).toBe(guard.id);
    expect(game.snapshot.report).toContain(guard.greeting);
    expect(game.snapshot.places.find(place=>place.id===guard.id)?.position).toEqual(guardPatrol(guard.id,now).position);
    const distant=createAdventure({now:()=>now});distant.interactNpc(guard.id);
    if(Math.hypot(distant.snapshot.player.position.x-guardPatrol(guard.id,now).position.x,distant.snapshot.player.position.z-guardPatrol(guard.id,now).position.z)>2.5)expect(distant.snapshot.selectedGuard).toBeNull();
  }
});

test('guard routes clear the authored bell tower and courtyard cart',async()=>{
  const {OBJLoader}=await import('three/addons/loaders/OBJLoader.js');
  const {Box3,Vector3,Matrix4}=await import('three');
  for(const [model,x,z,height,turn]of [['Bell_Tower',-9.5,-1.7,6.7,0],['Cart',6.7,-2.1,1.6,-.4]] as const){
    const object=new OBJLoader().parse(await Bun.file(`assets/external/quaternius/frostwood/village/${model}.obj`).text());
    const size=new Box3().setFromObject(object).getSize(new Vector3());size.multiplyScalar(height/size.y);
    const box=new Box3(new Vector3(-size.x/2,0,-size.z/2),new Vector3(size.x/2,height,size.z/2)).applyMatrix4(new Matrix4().makeRotationY(turn)).translate(new Vector3(x,1.6,z)).expandByScalar(.4);
    for(const guard of YARD_GUARDS)for(let time=0;time<180000;time+=250){const p=guardPatrol(guard.id,time).position;expect(box.containsPoint(new Vector3(p.x,p.y,p.z))).toBe(false);}
  }
});

test('patrol velocity and heading change continuously through stops and corners',()=>{
  for(const guard of YARD_GUARDS){
    let previous=guardPatrol(guard.id,0);
    for(let time=10;time<180000;time+=10){
      const next=guardPatrol(guard.id,time);
      const turn=Math.acos(Math.max(-1,Math.min(1,previous.facing.x*next.facing.x+previous.facing.z*next.facing.z)));
      expect(turn).toBeLessThan(.041);
      expect(Math.abs(next.pace-previous.pace)).toBeLessThan(.021);
      previous=next;
    }
  }
});
