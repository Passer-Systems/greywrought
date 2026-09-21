import type { Position } from './adventure-types.js';
import { supportHeight } from './movement.js';

export const YARD_GUARDS = [
  { id: 'guard-iona', name: 'Iona', greeting: 'Keep to the lanterns after dark. We keep this road clear.', speed: 1.65, pause: 2.6, offset: 0,
    route: [[-2,-5],[-7,-4],[-12,-4],[-12,-1],[-23,-1],[-23,-24],[-23,-39.2],[-2,-39.2],[-2,-22]] },
  { id: 'guard-bram', name: 'Bram', greeting: 'All quiet in the Yard. Mind the gate on your way out.', speed: 1.45, pause: 3.8, offset: 19,
    route: [[2,-4],[3,-21.8],[23,-22.5],[23,-1],[23,-34],[22,-39.2],[3,-39.2],[3,-18]] },
] as const;
export type YardGuardId = typeof YARD_GUARDS[number]['id'];
export interface GuardPatrol { readonly position: Position; readonly facing: Position; readonly moving: boolean; readonly pace: number; }
export function guardPatrol(id: YardGuardId, timeMillis: number): GuardPatrol {
  const guard=YARD_GUARDS.find(guard=>guard.id===id)!;
  const legs=guard.route.map((from,index)=>{
    const to=guard.route[(index+1)%guard.route.length]!;
    const dx=to[0]-from[0],dz=to[1]-from[1],distance=Math.hypot(dx,dz);
    return {from,dx,dz,distance,duration:distance/guard.speed+.5+guard.pause};
  });
  const duration=legs.reduce((sum,leg)=>sum+leg.duration,0);
  let time=((timeMillis/1000+guard.offset)%duration+duration)%duration;
  for(const [index,leg] of legs.entries()) {
    if(time<=leg.duration) {
      const travel=leg.duration-guard.pause, t=Math.max(0,time-guard.pause), ramp=.5;
      const pace=Math.min(1,t/ramp,(travel-t)/ramp);
      const covered=t<ramp ? t*t/(2*ramp) : t>travel-ramp ? travel-ramp-(travel-t)**2/(2*ramp) : t-ramp/2;
      const fraction=covered/(travel-ramp), moving=t>0;
      const previous=legs[(index+legs.length-1)%legs.length]!;
      const incoming=Math.atan2(previous.dx,previous.dz),outgoing=Math.atan2(leg.dx,leg.dz);
      const turn=Math.min(1,time/1.2),blend=turn*turn*(3-2*turn);
      const heading=incoming+Math.atan2(Math.sin(outgoing-incoming),Math.cos(outgoing-incoming))*blend;
      const x=leg.from[0]+leg.dx*fraction,z=leg.from[1]+leg.dz*fraction;
      return {position:{x,y:supportHeight(x,z),z},facing:{x:Math.sin(heading),y:0,z:Math.cos(heading)},moving,pace};
    }
    time-=leg.duration;
  }
  throw Error('Guard patrol has no segment.');
}
