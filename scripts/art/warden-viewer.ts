import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const main=document.querySelector('main')!;
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});main.append(renderer.domElement);
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x363d41);renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
const scene=new T.Scene();scene.add(new T.HemisphereLight(0xeaf0f4,0x635445,2.3));
const key=new T.DirectionalLight(0xffedda,3.8);key.position.set(-3,6,5);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-4,right:4,top:5,bottom:-3});key.shadow.bias=-.00015;scene.add(key);
const fill=new T.DirectionalLight(0xcadcea,2);fill.position.set(5,2,2);scene.add(fill);
const rim=new T.DirectionalLight(0xffefdc,2.8);rim.position.set(2,5,-4);scene.add(rim);
const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:0x3c4447,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.018;floor.receiveShadow=true;scene.add(floor);
const camera=new T.PerspectiveCamera(32,1,.01,100);camera.position.set(3.7,2.6,6.1);
const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,1.35,0);orbit.enableDamping=true;
const loader=new GLTFLoader(),loaded=await loader.loadAsync(new URLSearchParams(location.search).has('runtime')?'/warden-runtime.glb':'/warden.glb'),old=await loader.loadAsync('/earlier.glb');
const entries=[loaded,old].map(g=>{
  const saved=new Map<T.Mesh,T.Material|T.Material[]>();
  g.scene.traverse(o=>{if(o instanceof T.Mesh){o.castShadow=true;o.receiveShadow=true;saved.set(o,o.material);}});
  scene.add(g.scene);return {root:g.scene,mixer:new T.AnimationMixer(g.scene),clips:g.animations,saved};
});
entries[1]!.root.visible=false;
let paused=false,clay=false,wire=false,equipment=true,showOld=false;
const clayMaterial=new T.MeshStandardMaterial({color:0xb6b0a2,roughness:.8,side:T.DoubleSide});
const equipmentNames=/^(Sword|Shield)/;
function materials(){for(const e of entries)for(const [mesh,original]of e.saved){mesh.material=clay?clayMaterial:original;for(const m of Array.isArray(mesh.material)?mesh.material:[mesh.material])if(m instanceof T.MeshStandardMaterial)m.wireframe=wire;mesh.visible=equipment||!equipmentNames.test(mesh.name);}}
function view(name:string){orbit.target.set(0,1.35,0);camera.position.set(...(name==='front'?[0,1.55,7]:name==='side'?[7,1.55,0]:name==='back'?[0,1.55,-7]:[3.7,2.6,6.1]) as [number,number,number]);orbit.update();}
function play(name:string){for(const e of entries){e.mixer.stopAllAction();const clip=e.clips.find(c=>c.name===name);if(clip){const a=e.mixer.clipAction(clip).reset().play();a.setLoop(name==='Death'?T.LoopOnce:T.LoopRepeat,Infinity);a.clampWhenFinished=true;}}}
function pose(name:string,time:number){paused=true;play(name);for(const e of entries)e.mixer.setTime(time);scene.updateMatrixWorld(true);}
const select=document.querySelector('select')!;select.replaceChildren(...loaded.animations.map(a=>new Option(a.name,a.name)));select.value='Idle';select.onchange=()=>{paused=false;play(select.value);};
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>view(b.dataset.view!));
for(const id of ['clay','equipment','wire','old'])document.querySelector<HTMLButtonElement>('#'+id)!.onclick=()=>{
  const state=id==='clay'?(clay=!clay):id==='equipment'?(equipment=!equipment):id==='wire'?(wire=!wire):(showOld=!showOld);
  document.getElementById(id)!.setAttribute('aria-pressed',String(state));entries[0]!.root.visible=!showOld;entries[1]!.root.visible=showOld;materials();
};
document.querySelector<HTMLButtonElement>('#pause')!.onclick=e=>{paused=!paused;(e.target as HTMLButtonElement).textContent=paused?'Resume':'Pause';};
document.querySelector('#status')!.textContent='Drag to orbit · Scroll to inspect · Clay views expose the actual surfaces · Original Mike motion library';
const clock=new T.Clock();
function frame(){const w=main.clientWidth,h=main.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();const dt=Math.min(clock.getDelta(),.05);if(!paused)for(const e of entries)e.mixer.update(dt);orbit.update();renderer.render(scene,camera);requestAnimationFrame(frame);}
Object.assign(window,{wardenStudy:{entries,view,pose,camera,orbit,renderer,scene}});
play('Idle');view('three-quarter');document.body.dataset.study='ready';frame();
