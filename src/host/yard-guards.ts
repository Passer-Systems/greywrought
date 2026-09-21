import { Group, Vector3, type Scene } from 'three';
import { actor, type ForestActor } from './frostwood-assets.js';
import { YARD_GUARDS, guardPatrol } from '../game/yard-guards.js';

export function createGuardClock() {
  let rendered: number | undefined, sample: number | undefined, target=0;
  return (serverMillis: number, delta: number) => {
    const step=Math.max(0,delta)*1000;
    if(rendered===undefined || Math.abs(serverMillis-rendered)>2000) rendered=target=serverMillis;
    else {
      target += step;
      if(sample!==serverMillis) target=serverMillis;
      rendered += step;
      rendered += Math.max(-step*.1,Math.min(step*.1,target-rendered));
    }
    sample=serverMillis;
    return rendered;
  };
}

export function createYardGuards(scene: Scene) {
  let disposed=false;
  const clock=createGuardClock();
  const guards=YARD_GUARDS.map(guard=>{
    const root=new Group(); root.name=guard.id; scene.add(root);
    return {guard,root,anchor:new Vector3(),actor:null as ForestActor|null};
  });
  const ready=Promise.all(guards.map(async entry=>{
    const mounted=await actor('Warrior',2.15);
    if(disposed) {mounted.dispose();return;}
    entry.actor=mounted; entry.root.add(mounted.root); mounted.play('Idle');
  }));
  return {
    guards,ready,
    update(timeMillis: number, delta: number) {
      const renderTime=clock(timeMillis,delta);
      for(const entry of guards) {
        const patrol=guardPatrol(entry.guard.id,renderTime),p=patrol.position;
        entry.root.position.set(p.x,p.y,p.z);
        entry.root.rotation.y=Math.atan2(patrol.facing.x,patrol.facing.z);
        entry.anchor.copy(entry.root.position).add(new Vector3(0,2.45,0));
        const action=entry.actor?.play(patrol.moving?'Walk':'Idle',true,undefined,.25);
        if(action) action.setEffectiveTimeScale(patrol.moving ? patrol.pace*entry.guard.speed/1.65 : 1);
        entry.actor?.mixer.update(delta);
        entry.root.userData.animation=entry.actor?.action?.getClip().name;
        entry.root.userData.animationTime=entry.actor?.action?.time;
      }
    },
    dispose(){disposed=true;for(const entry of guards){entry.actor?.dispose();entry.root.removeFromParent();}},
  };
}
