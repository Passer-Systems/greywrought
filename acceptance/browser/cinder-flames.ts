import { createAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { files } from '../../scripts/public-files.js';
import { check, openBrowser } from './session.js';

const sourceRoot = Bun.env.GREYWROUGHT_CINDER_FRONTEND_ROOT ?? process.cwd();
const base = createAdventure().snapshot;
const scout = base.threats.find(threat => threat.id === 'scout')!;
const point = (x:number,z:number) => ({x,y:terrainHeight(x,z),z});
const snapshot = {...base, phase:'expedition', player:{...base.player,position:point(0,25),inCombat:false},
  threats:[{...scout,active:true,health:scout.maximumHealth,position:point(0,30),facing:{x:0,z:-1},moving:false,aggro:false}]};
const entry = `${sourceRoot}/build/cinder-flames-client.ts`;
await Bun.write(entry, `
import {Scene,Vector3,Matrix4,Box3} from 'three';
import {createAdventureWorld} from '${sourceRoot}/src/host/adventure-world.ts';
import {terrainHeight} from '${sourceRoot}/src/game/cave-layout.ts';
const snapshot=${JSON.stringify(snapshot)};
let scene,camera,renderer;
Scene.prototype.onAfterRender=function(r,s,c){if(c.isPerspectiveCamera&&r.getRenderTarget()===null){scene=s;camera=c;renderer=r;}};
const host=document.getElementById('world');
const world=createAdventureWorld(host,snapshot);host.append(world.canvas);await world.ready;
window.step=(frames,moving,speed=2)=>{
 snapshot.threats[0].moving=moving;
 for(let i=0;i<frames;i++){
  if(moving){snapshot.threats[0].position.x+=speed/60;snapshot.threats[0].position.y=terrainHeight(snapshot.threats[0].position.x,30);}
  world.render(snapshot,1/60);
 }
 const trail=scene.getObjectByName('cinder-ember-trail'),matrix=new Matrix4(),points=[];
 for(let i=0;i<trail.count;i+=2){trail.getMatrixAt(i,matrix);const p=new Vector3().setFromMatrixPosition(matrix);points.push({x:p.x,y:p.y,z:p.z,aboveGround:p.y-terrainHeight(p.x,p.z)});}
 window.observation={flameFrame:scene.getObjectByName('cinder-left-eye').material.map.offset.x,count:trail.count,points,eyes:['cinder-left-eye','cinder-right-eye'].map(name=>scene.getObjectByName(name).getWorldPosition(new Vector3()).toArray())};
};
window.closeup=()=>{
 const rig=scene.children.find(o=>o.userData.threatId==='scout');
 const close=camera.clone(),center=rig.position.clone().add(new Vector3(0,2.2,0));
 close.position.copy(center).add(new Vector3(0,.2,4.6).applyQuaternion(rig.quaternion));close.lookAt(center);close.updateMatrixWorld();
 renderer.render(scene,close);
};
window.defeat=()=>{Object.assign(snapshot.threats[0],{health:0,phase:'cleared',corpseVisible:true,moving:false});};
window.corpse=()=>{
 const rig=scene.children.find(o=>o.userData.threatId==='scout'),body=rig.children[0];
 const bounds=new Box3().setFromObject(body.children[0],true);
 return {lift:body.position.y,bottom:bounds.min.y-groundHeight(),eyes:scene.getObjectByName('cinder-socket-flames').visible};
};
const groundHeight=()=>terrainHeight(snapshot.threats[0].position.x,snapshot.threats[0].position.z);
window.step(60,false);window.fixtureReady=true;
`);
const bundle=await Bun.build({entrypoints:[entry],target:'browser',external:['three','three/addons/*']});
check(bundle.success,bundle.logs.map(String).join('\n'));
const assets=new Map(files.map(([source,target])=>[`/${target.slice('dist/'.length)}`,source]));
const server=Bun.serve({hostname:'127.0.0.1',port:4299,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/')return new Response('<!doctype html><html><head><style>html,body,#world{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/three-addons/"}}</script></head><body><div id="world"></div><script type="module" src="/fixture.js"></script></body></html>',{headers:{'content-type':'text/html'}});
 if(path==='/fixture.js')return new Response(bundle.outputs[0],{headers:{'content-type':'text/javascript'}});
 const source=assets.get(path);return source?new Response(Bun.file(source)):new Response('Missing',{status:404});
}});
Object.assign(Bun.env,{GREYWROUGHT_GAME_URL:'http://127.0.0.1:4299/',GREYWROUGHT_DEBUG_PORT:'9439',GREYWROUGHT_VULKAN:'1'});
let page:Awaited<ReturnType<typeof openBrowser>>|undefined;
try{
 page=await openBrowser('cinder-flames',{localOnly:true});await page.waitFor('window.fixtureReady===true',60000);
 type Observation={flameFrame:number;count:number;points:{x:number;y:number;z:number;aboveGround:number}[];eyes:number[][]};
 const idle=await page.evaluate<Observation>('window.observation');check(idle.count===0,'Idle emits no walking wake');
 await page.shot('normal-idle');await page.evaluate('window.closeup()');await page.shot('closeup-idle');
 await page.evaluate('window.step(36,true)');const moving=await page.evaluate<Observation>('window.observation');
 check(moving.count>0&&moving.count<=40,'Walking emits a bounded instanced wake');
 check(moving.points.every(p=>Math.abs(p.aboveGround-.035)<.0001),'Flames sit on terrain');
 await page.shot('normal-walking');await page.evaluate('window.closeup()');await page.shot('closeup-walking');
 await page.evaluate('window.step(18,true)');const later=await page.evaluate<Observation>('window.observation');
 check(later.flameFrame!==moving.flameFrame,'Flame tongues advance through animated shapes');
 check(later.points.some(p=>p.x>Math.max(...moving.points.map(p=>p.x))),'Walking wake follows later ground positions');
 check(later.eyes.every((p,i)=>p[0]!>moving.eyes[i]![0]!+.3),'Both flame sockets follow the moving skull');
 await page.shot('normal-walking-later');await page.evaluate('window.step(45,false)');
 check((await page.evaluate<Observation>('window.observation')).count===0,'Walking wake expires promptly after stopping');
 await page.evaluate('window.step(30,true,.3)');
 check((await page.evaluate<Observation>('window.observation')).count>0,'Slow walking retains its wake');
 await page.evaluate('window.defeat();window.step(6,false)');
 const falling=await page.evaluate<{lift:number;bottom:number;eyes:boolean}>('window.corpse()');
 check(falling.lift>0&&falling.lift<1.25,'Defeated Watchman begins falling during its death animation');
 check(!falling.eyes,'Defeat extinguishes the socket flames');
 await page.evaluate('window.step(60,false)');
 const corpse=await page.evaluate<typeof falling>('window.corpse()');
 console.log('Watchman corpse',corpse);
 check(corpse.lift===0&&Math.abs(corpse.bottom)<.12,'The skull settles on the ground after death');
 await page.shot('normal-corpse');
 check((await page.evaluate<Observation>('window.observation')).count===0,'Death clears the walking wake');
 check(page.errors.length===0,'No browser exceptions');
 await Bun.write(`${page.output}/result.json`,JSON.stringify({status:'passed',idle,moving,later},null,2));
 console.log('PASS Cinder socket fire, moving ground wake and expiration',page.output);
}finally{await page?.close();server.stop(true);}
