import {expect,test} from 'bun:test';
import {createGuardClock} from './yard-guards.js';
test('guard clock advances between 20 Hz snapshots without network-cadence jumps',()=>{
  const clock=createGuardClock();let previous=clock(0,0);
  for(let frame=1;frame<600;frame++){
    const now=frame*1000/60,rendered=clock(Math.floor(now/50)*50,1/60);
    expect(rendered-previous).toBeGreaterThanOrEqual(15-1e-6);
    expect(rendered-previous).toBeLessThanOrEqual(18.34);
    expect(Math.abs(rendered-now)).toBeLessThan(55);
    previous=rendered;
  }
});
