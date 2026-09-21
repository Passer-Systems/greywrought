/** bun scripts/art/author-warden.ts [--export-only]
 * Authors the Relic Warden game model and editable Blender source.
 */
import * as T from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mkdir } from "node:fs/promises";
import { authorWarden } from "./warden-surfaces.js";
import type { Point } from "./warden-surfaces.js";
import { blenderAuthoring } from "./warden-blender.js";

if(typeof globalThis.ProgressEvent==='undefined') Object.defineProperty(globalThis,'ProgressEvent',{value:class extends Event{constructor(t:string,p:object={}){super(t);Object.assign(this,p);}}});
if(typeof globalThis.FileReader==='undefined') Object.defineProperty(globalThis,'FileReader',{value:class{
  result:ArrayBuffer|string|null=null;onloadend:(()=>void)|null=null;
  readAsArrayBuffer(blob:Blob){void blob.arrayBuffer().then(b=>{this.result=b;this.onloadend?.();});}
  readAsDataURL(blob:Blob){void blob.arrayBuffer().then(b=>{this.result=`data:${blob.type};base64,${Buffer.from(b).toString('base64')}`;this.onloadend?.();});}
}});
const build='build/warden',output='assets/external/relic-warden';
await mkdir(build,{recursive:true});await mkdir(output,{recursive:true});
const sourcePath=process.env.WARDEN_RIG_SOURCE;
if(!sourcePath) throw new Error('Set WARDEN_RIG_SOURCE to your local Quaternius Mike.gltf file. The source pack is not included in this repository.');
const source=await new GLTFLoader().parseAsync(await Bun.file(sourcePath).text(),'');
source.scene.updateMatrixWorld(true);
const bones=new Map<string,T.Bone>(), meshes:T.Mesh[]=[];
source.scene.traverse(o=>{if(o instanceof T.Bone) bones.set(o.name,o);if(o instanceof T.Mesh) meshes.push(o);});
for(const m of meshes)m.removeFromParent();
const bind=new Map([...bones].map(([name,b])=>[name,b.matrixWorld.clone()]));
const positions=new Map([...bones].map(([name,b])=>[name,b.getWorldPosition(new T.Vector3()).toArray() as Point]));
const materials:Record<string,{color:Point;metalness:number;roughness:number}>={
  iron:{color:[.12,.15,.16],metalness:.68,roughness:.71},
  edge:{color:[.30,.32,.31],metalness:.86,roughness:.38},
  repair:{color:[.24,.20,.15],metalness:.67,roughness:.67},
  brass:{color:[.33,.24,.115],metalness:.72,roughness:.48},
  recess:{color:[.025,.033,.034],metalness:.3,roughness:.79},
  leather:{color:[.07,.037,.023],metalness:0,roughness:.87},
  cloth:{color:[.055,.115,.105],metalness:0,roughness:.96},
  enamel:{color:[.10,.21,.19],metalness:.2,roughness:.63},
  ceramic:{color:[.53,.49,.37],metalness:.07,roughness:.58},
  light:{color:[.12,.34,.38],metalness:.15,roughness:.3},
  floor:{color:[.13,.145,.16],metalness:0,roughness:.9},
};
const panels=authorWarden(positions);
const mixer=new T.AnimationMixer(source.scene);
const poses=[];
for(const clip of source.animations){
  clip.optimize();mixer.stopAllAction();mixer.clipAction(clip).reset().play();
  const frames=[]; const frameCount=Math.ceil(clip.duration*24);
  for(let i=0;i<=frameCount;i++){
    mixer.setTime(Math.min(i/24,Math.max(0,clip.duration-.00001)));source.scene.updateMatrixWorld(true);
    frames.push({frame:i+1,bones:[...bones].map(([name,b])=>({name,matrix:b.matrixWorld.toArray()}))});
  }
  poses.push({name:clip.name,duration:clip.duration,frames});
}
mixer.stopAllAction();source.scene.updateMatrixWorld(true);
if(!process.argv.includes('--export-only')){
  await Bun.write(`${build}/surfaces.json`,JSON.stringify({panels,materials,bones:[...bones].map(([name,b])=>({name,parent:b.parent instanceof T.Bone?b.parent.name:null,matrix:bind.get(name)!.toArray()})),poses}));
  await Bun.write(`${build}/author.py`,blenderAuthoring);
  await Bun.write(`${build}/blender.log`,'');await Bun.write(`${build}/blender-errors.log`,'');
  const blender=Bun.spawn(['blender','--background','--factory-startup','--python-exit-code','1','--python',`${build}/author.py`],{stdout:Bun.file(`${build}/blender.log`),stderr:Bun.file(`${build}/blender-errors.log`)});
  console.log(`Blender authoring ${panels.length} control surfaces. Log: ${build}/blender.log`);
  if(await blender.exited!==0) throw new Error(`Blender authoring failed; see ${build}/blender-errors.log`);
}
interface Resolved {name:string;bone:string;material:string;positions:Point[];colors:Point[];triangles:number[][]}
const resolved=await Bun.file(`${build}/evaluated.json`).json() as Resolved[];
const skeleton=new T.Skeleton([...bones.values()],[...bones.keys()].map(name=>bind.get(name)!.clone().invert()));
const palette=new Map(Object.entries(materials).map(([name,m])=>[name,new T.MeshStandardMaterial({name,color:0xffffff,vertexColors:true,metalness:m.metalness,roughness:m.roughness,side:T.DoubleSide,...(name==='light'?{emissive:new T.Color(.07,.27,.32),emissiveIntensity:1.4}:{})})]));
function attach(parts:Resolved[]){
let triangles=0;
for(const part of parts){
  const b=bones.get(part.bone);if(!b)throw new Error(`Unknown joint ${part.bone}`);
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(part.positions.flat(),3));g.setIndex(part.triangles.flat());g.computeVertexNormals();
  g.setAttribute('color',new T.Uint8BufferAttribute(part.colors.flat().map(c=>Math.round(Math.min(1,Math.max(0,c))*255)),3,true));
  let mesh:T.Mesh;
  if(part.name.startsWith('Skirt /')){
    const torso=skeleton.bones.findIndex(b=>b.name==='Torso'),leg=skeleton.bones.findIndex(b=>b.name===('UpperLeg'+(part.name.includes('left')?'L':'R')));
    const indices:number[]=[],weights:number[]=[];
    for(const p of part.positions){const w=Math.min(1,Math.max(0,(2.45-p[1])/.90))**2*.68;indices.push(torso,leg,0,0);weights.push(1-w,w,0,0);}
    g.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
    const skin=new T.SkinnedMesh(g,palette.get(part.material));skin.bind(skeleton,new T.Matrix4());source.scene.add(skin);mesh=skin;
  }else{
    g.applyMatrix4(bind.get(part.bone)!.clone().invert());mesh=new T.Mesh(g,palette.get(part.material));b.add(mesh);
  }
  mesh.name=part.name;mesh.userData={authoredSurface:true,attachment:part.bone};triangles+=part.triangles.length;
}
return triangles;
}
const triangles=attach(resolved);
const box=new T.Box3().setFromObject(source.scene,true),scale=2.65/(box.max.y-box.min.y);
const root=new T.Group();root.name='Relic Warden';root.add(source.scene);root.scale.setScalar(scale);root.position.y=-box.min.y*scale;
root.userData={sourcePack:'Quaternius Animated Mech Pack — March 2021',sourceCharacter:'Mike',sourceLicense:'CC0-1.0',canonStatus:'New visual design, not a pre-existing named lore character',authoring:'Individually drawn quad control surfaces, resolved with Blender subdivision and solidify. All visible geometry newly authored. Original joint hierarchy and exact animation tracks retained.',assetStatus:'In-game Relic Warden',authoredParts:panels.length};
root.updateMatrixWorld(true);
const exporter=new GLTFExporter();
const full=await exporter.parseAsync(root,{binary:true,animations:source.animations});
if(!(full instanceof ArrayBuffer))throw new Error('Expected GLB');
await Bun.write(`${build}/relic-warden-detailed.glb`,full);
const runtimeNames=new Set(['Idle','Run','SwordSlash','HitRecieve_1','Death']);
const detailMeshes:T.Mesh[]=[];source.scene.traverse(o=>{if(o instanceof T.Mesh)detailMeshes.push(o);});
for(const m of detailMeshes)m.removeFromParent();
const runtimeResolved=await Bun.file(`${build}/evaluated-runtime.json`).json() as Resolved[];
const runtimeTriangles=attach(runtimeResolved);root.updateMatrixWorld(true);
const runtime=await exporter.parseAsync(root,{binary:true,animations:source.animations.filter(a=>runtimeNames.has(a.name))});
if(!(runtime instanceof ArrayBuffer))throw new Error('Expected GLB');
await Bun.write(`${output}/relic-warden-runtime.glb`,runtime);
await Bun.write(`${output}/manifest.json`,JSON.stringify({...root.userData,triangles,runtimeTriangles,controlSurfaces:panels.length,bones:bones.size,fullBytes:full.byteLength,runtimeBytes:runtime.byteLength,animations:source.animations.map(a=>({name:a.name,duration:a.duration})),runtimeAnimations:[...runtimeNames],blenderVersion:'4.3.2',blenderSource:'relic-warden.blend'},null,2)+'\n');
console.log(`Warden: ${triangles} detailed triangles; ${runtimeTriangles} game triangles; ${panels.length} surfaces; ${source.animations.length} original clips; full ${(full.byteLength/1048576).toFixed(2)} MiB; game ${(runtime.byteLength/1048576).toFixed(2)} MiB.`);
