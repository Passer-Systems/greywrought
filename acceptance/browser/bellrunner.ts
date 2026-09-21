import { bellrunnerLanding, flightMasterPosition } from '../../src/game/bellrunner.js';
import { supportHeight } from '../../src/game/movement.js';
import { check, openBrowser } from './session.js';

const page = await openBrowser('bellrunner');
const held = new Set<string>();
async function hold(keys: string[]) {
  for (const key of held) if (!keys.includes(key)) { await page.key(key,false); held.delete(key); }
  for (const key of keys) if (!held.has(key)) { await page.key(key,true); held.add(key); }
}
async function walk(x: number,z: number) {
  const deadline=performance.now()+40000; let lastLog=0;
  while (performance.now()<deadline) {
    const state=await page.read(), dx=x-Number(state.gamePlayerX), dz=z-Number(state.gamePlayerZ);
    if(performance.now()-lastLog>2000) { console.log("walk",x,z,state.gamePlayerX,state.gamePlayerZ); lastLog=performance.now(); }
    if (Math.hypot(dx,dz)<1) { await hold([]); return; }
    const codes=[...(Math.abs(dx)>.2 ? [dx>0?'KeyA':'KeyD'] : []),...(Math.abs(dz)>.2 ? [dz>0?'KeyW':'KeyS'] : [])];
    await page.evaluate(`new Promise(resolve=>{const canvas=document.getElementById('world-canvas');canvas.focus();const codes=${JSON.stringify(codes)};for(const code of codes)canvas.dispatchEvent(new KeyboardEvent('keydown',{code,key:code.slice(3).toLowerCase(),bubbles:true}));setTimeout(()=>{for(const code of codes)canvas.dispatchEvent(new KeyboardEvent('keyup',{code,key:code.slice(3).toLowerCase(),bubbles:true}));resolve();},100);})`);
    await Bun.sleep(150);
  }
  await hold([]); await page.shot("walk-failure"); throw Error(`Could not walk to ${x},${z}: ${JSON.stringify(await page.read())}`);
}
try {
  await page.enter();
  await page.evaluate(`(async()=>{const{Scene,Box3}=await import('three'); window.flightBoxes=[]; Scene.prototype.onAfterRender=function(renderer,scene,camera){
    if(renderer.domElement.id!=='world-canvas')return; window.flightScene=scene; window.flightCamera=camera;
    const fleet=scene.children.find(root=>root.children.some(child=>child.position.x===-8&&child.position.z===-28));
    if(!fleet)return;
    window.flightBoxes=fleet.children.filter(root=>root.isGroup&&root.children.length===3).map(root=>({x:root.position.x,z:root.position.z,visible:root.children[2].visible,box:new Box3().setFromObject(root.children[2])}));
  };})()`);
  await page.waitFor('window.flightBoxes.length===3');
  let clearance=Infinity;
  for (let sample=0;sample<24;sample++) {
    const boxes=await page.evaluate<{x:number;z:number;box:{min:{x:number;y:number;z:number};max:{x:number;y:number;z:number}}}[]>('window.flightBoxes');
    for(const {box} of boxes) for(let ix=0;ix<=16;ix++) for(let iz=0;iz<=16;iz++) {
      const x=box.min.x+(box.max.x-box.min.x)*ix/16,z=box.min.z+(box.max.z-box.min.z)*iz/16;
      clearance=Math.min(clearance,box.min.y-supportHeight(x,z));
    }
    await Bun.sleep(240);
  }
  check(clearance>.15,`Every parked hull clears its footprint through bobbing: ${clearance}`);
  await walk(0,-26.5); await walk(-4.4,-26.5);
  for (const [index,id] of (['yard','suture','brinewick'] as const).entries()) {
    const master=flightMasterPosition(id);
    await walk(master.x,master.z);
    await page.waitFor(`!document.querySelector('[data-overhead-name="npc:flight-master-${id}"]').hidden`);
    await page.shot(`${id}-parked`);
    await page.click(`[data-overhead-name="npc:flight-master-${id}"]`);
    await page.waitFor('!document.getElementById("bellrunner-panel").hidden');
    check(await page.evaluate<boolean>(`document.querySelector('#bellrunner-panel h2').textContent.includes('Flight master')`),'Routes open through the flight master');
    await page.shot(`${id}-flight-master`);
    const destination=(['suture','brinewick','yard'] as const)[index]!;
    await page.click(`[data-destination="${destination}"]`);
    await page.waitFor(`JSON.parse(document.body.dataset.gameFlight)?.to==='${destination}'`);
    await Bun.sleep(1300); await page.shot(`${id}-takeoff`);
    await page.waitFor('JSON.parse(document.body.dataset.gameFlight)?.elapsed>5');
    await page.shot(`${id}-cruise`);
    await page.waitFor('document.body.dataset.gameFlight==="null"',45000);
    const stop=bellrunnerLanding(destination);
    const state=await page.read();
    check(Math.hypot(Number(state.gamePlayerX)-stop.x,Number(state.gamePlayerZ)-stop.z)<.1,'Passenger steps onto clear ground beside the destination flight master');
    await page.shot(`${destination}-landed`);
  }
  check(page.errors.length===0,'Flights produce no browser exception');
  await Bun.write(`${page.output}/result.json`,JSON.stringify({status:'passed',minimumParkedClearance:clearance,checks:['three visible flight masters','three routes boarded through NPC conversation','takeoff, cruise and landing','all three parked hulls clear ground through idle bob']},null,2));
  console.log(`Bellrunner browser passed: ${page.output}; minimum hull clearance ${clearance}`);
} finally { await hold([]); await page.close(); }
