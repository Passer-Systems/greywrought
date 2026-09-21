import type { Position } from './adventure-types.js';
import { supportHeight } from './movement.js';

export const YARD_GUARDS = [
  { id: 'guard-iona', name: 'Iona', greeting: 'Keep to the lanterns after dark. We keep this road clear.', speed: 1.65, pause: 2.6, offset: 0,
    route: [[-2,-5],[-7,-4],[-12,-4],[-12,-1],[-23,-1],[-23,-24],[-23,-39.2],[-2,-39.2],[-2,-22]] },
  { id: 'guard-bram', name: 'Bram', greeting: 'All quiet in the Yard. Mind the gate on your way out.', speed: 1.45, pause: 3.8, offset: 19,
    route: [[2,-4],[3,-21.8],[23,-22.5],[23,-1],[23,-34],[22,-39.2],[3,-39.2],[3,-18]] },
] as const;
export type YardGuardId = typeof YARD_GUARDS[number]['id'];
export interface GuardPatrol { readonly position: Position; readonly facing: Position; readonly moving: boolean; }
export function guardPatrol(id: YardGuardId, timeMillis: number): GuardPatrol {
  const guard=YARD_GUARDS.find(guard=>guard.id===id)!;
  const legs=guard.route.map((from,index)=>{
    const to=guard.route[(index+1)%guard.route.length]!;
    const dx=to[0]-from[0],dz=to[1]-from[1],distance=Math.hypot(dx,dz);
    return {from,dx,dz,distance,duration:distance/guard.speed+guard.pause};
  });
  const duration=legs.reduce((sum,leg)=>sum+leg.duration,0);
  let time=((timeMillis/1000+guard.offset)%duration+duration)%duration;
  for(const leg of legs) {
    if(time<=leg.duration) {
      const moving=time>=guard.pause, fraction=Math.max(0,(time-guard.pause)/(leg.duration-guard.pause));
      const x=leg.from[0]+leg.dx*fraction,z=leg.from[1]+leg.dz*fraction;
      return {position:{x,y:supportHeight(x,z),z},facing:{x:leg.dx/leg.distance,y:0,z:leg.dz/leg.distance},moving};
    }
    time-=leg.duration;
  }
  throw Error('Guard patrol has no segment.');
}
