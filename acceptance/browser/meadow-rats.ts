import { createAdventure } from '../../src/game/adventure.js';
import { terrainHeight } from '../../src/game/cave-layout.js';
import { files } from '../../scripts/public-files.js';
import { check, openBrowser } from './session.js';

const sourceRoot = process.cwd();
const base = createAdventure().snapshot;
const rats = base.threats.filter(threat => threat.id.startsWith('meadow-rat'));
const point = (x:number,z:number) => ({x,y:terrainHeight(x,z),z});
const snapshot = {...base,phase:'expedition',selectedThreat:'meadow-rat',player:{...base.player,position:point(6,9),inCombat:false},
  threats:rats.map(rat=>({...rat,active:true,health:rat.maximumHealth,facing:{x:1,z:0},moving:false,aggro:false}))};
const entry = `${sourceRoot}/build/meadow-rats-client.ts`;
await Bun.write(entry, `
import {Scene,Vector3,Box3,Frustum,Matrix4} from 'three';
import {createAdventureWorld} from '${sourceRoot}/src/host/adventure-world.ts';
import {terrainHeight} from '${sourceRoot}/src/game/cave-layout.ts';
const snapshot=${JSON.stringify(snapshot)};
let scene,camera;
Scene.prototype.onAfterRender=function(r,s,c){if(c.isPerspectiveCamera&&r.getRenderTarget()===null){scene=s;camera=c;}};
const host=document.getElementById('world'),world=createAdventureWorld(host,snapshot);host.append(world.canvas);await world.ready;
window.step=(frames,moving=false)=>{
 snapshot.threats.forEach(t=>t.moving=moving);
 for(let i=0;i<frames;i++)world.render(snapshot,1/60);
 const frustum=new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 return snapshot.threats.map(t=>{
  const rig=scene.children.find(o=>o.userData.threatId===t.id),body=rig.children[0],bounds=new Box3().setFromObject(body,true),meshes=[];
  body.traverse(o=>{if(o.isSkinnedMesh)meshes.push({name:o.name,frustumCulled:o.frustumCulled,inFrustum:frustum.intersectsObject(o)});});
  return {id:t.id,height:bounds.max.y-bounds.min.y,bottom:bounds.min.y-t.position.y,top:bounds.max.y-t.position.y,visible:rig.visible&&body.visible,meshes};
 });
};
window.visit=id=>{const t=snapshot.threats.find(t=>t.id===id);snapshot.player.position={x:t.position.x-2,y:terrainHeight(t.position.x-2,t.position.z-4),z:t.position.z-4};world.setSelectedUnit({kind:'enemy',id});};
window.step(30);window.fixtureReady=true;
`);
const bundle=await Bun.build({entrypoints:[entry],target:'browser',external:['three','three/addons/*']});
check(bundle.success,bundle.logs.map(String).join('\n'));
const assets=new Map(files.map(([source,target])=>[`/${target.slice('dist/'.length)}`,source]));
const server=Bun.serve({hostname:'127.0.0.1',port:4307,fetch(request){
 const path=new URL(request.url).pathname;
 if(path==='/')return new Response('<!doctype html><html><head><style>html,body,#world{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block}</style><script type="importmap">{"imports":{"three":"/vendor/three.module.js","three/addons/":"/vendor/three-addons/"}}</script></head><body><div id="world"></div><script type="module" src="/fixture.js"></script></body></html>',{headers:{'content-type':'text/html'}});
 if(path==='/fixture.js')return new Response(bundle.outputs[0],{headers:{'content-type':'text/javascript'}});
 const source=assets.get(path);return source?new Response(Bun.file(source)):new Response('Missing',{status:404});
}});
Object.assign(Bun.env,{GREYWROUGHT_GAME_URL:'http://127.0.0.1:4307/',GREYWROUGHT_DEBUG_PORT:'9447',GREYWROUGHT_VULKAN:'1'});
let page:Awaited<ReturnType<typeof openBrowser>>|undefined;
type Observation={id:string;height:number;bottom:number;top:number;visible:boolean;meshes:{inFrustum:boolean}[]};
try{
 page=await openBrowser('meadow-rats',{localOnly:true});await page.waitFor('window.fixtureReady===true',60000);
 const idle=await page.evaluate<Observation[]>('window.step(30)');
 await page.shot('starting-meadow-idle');
 await Bun.write(`${page.output}/idle.json`,JSON.stringify(idle,null,2));console.log('Idle rats',JSON.stringify(idle),page.output);
 for(const rat of idle){
  check(rat.visible&&rat.height>.5&&rat.height<.8,`${rat.id} retains its authored visible height`);
  check(Math.abs(rat.bottom)<.08,`${rat.id} rests on the ground`);
 }
 check(idle[0]!.meshes.every(mesh=>mesh.inFrustum),'Starting rat is inside the normal camera frustum');
 const walking=await page.evaluate<Observation[]>('window.step(40,true)');await page.shot('starting-meadow-walking');
 for(const rat of walking)check(rat.height>.45&&rat.height<.85&&Math.abs(rat.bottom)<.12,`${rat.id} remains visible and grounded while walking`);
 for(const rat of rats.slice(1)){
  await page.evaluate(`window.visit(${JSON.stringify(rat.id)});window.step(15)`);await page.shot(rat.id);
 }
 check(page.errors.length===0,'No browser exceptions');
 await Bun.write(`${page.output}/result.json`,JSON.stringify({status:'passed',idle,walking},null,2));
 console.log('PASS meadow rats retain visible authored scale and ground contact',page.output);
}finally{await page?.close();server.stop(true);}
