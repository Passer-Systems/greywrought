import { Uint8BufferAttribute, Mesh, MeshPhongMaterial, MeshStandardMaterial, type Material } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
class ExportFileReader {
 result: ArrayBuffer|string|null=null;
 onloadend: ((event:unknown)=>void)|null=null;
 readAsArrayBuffer(blob:Blob){blob.arrayBuffer().then(value=>{this.result=value;this.onloadend?.({target:this});});}
 readAsDataURL(blob:Blob){blob.arrayBuffer().then(value=>{this.result=`data:${blob.type};base64,${Buffer.from(value).toString('base64')}`;this.onloadend?.({target:this});});}
}
Object.assign(globalThis,{FileReader:ExportFileReader});
const source=Bun.spawnSync(['unzip','-p','/home/tom/code/game-assets/quaternius/All in One - Quaternius[Patreon].zip','Characters and Animals/Easy Animated Enemy Pack - Jan 2019/FBX/Rat.fbx']).stdout;
const model=new FBXLoader().parse(new Uint8Array(source).buffer,'');
for(const clip of model.animations){clip.name=clip.name.replace(/^RatArmature\|Rat_/, '');for(const t of clip.tracks)for(let i=0;i<t.values.length;i++)t.values[i]=Math.round(t.values[i]! * 100000)/100000;clip.optimize();}
model.traverse(o=>{if(!(o instanceof Mesh))return; const g=mergeVertices(o.geometry,1e-5),indices:number[]=[],groups=g.groups.map(group=>({...group})).sort((a,b)=>(a.materialIndex??0)-(b.materialIndex??0));g.clearGroups();let last=-1,start=0;for(const group of groups){const m=group.materialIndex??0;if(m!==last&&last>=0){g.addGroup(start,indices.length-start,last);start=indices.length;}last=m;for(let i=group.start;i<group.start+group.count;i++)indices.push(g.index!.getX(i));}if(last>=0)g.addGroup(start,indices.length-start,last);g.setIndex(indices);const joints=g.getAttribute('skinIndex'),weights=g.getAttribute('skinWeight');
 g.setAttribute('skinIndex',new Uint8BufferAttribute(joints.array,4));
 const packed=new Uint8Array(weights.count*4);for(let i=0;i<weights.count;i++){const v=[weights.getX(i),weights.getY(i),weights.getZ(i),weights.getW(i)],total=v.reduce((a,b)=>a+b,0)||1;let sum=0,largest=0;for(let j=0;j<4;j++){if(v[j]!>v[largest]!)largest=j;const w=Math.round(v[j]!/total*255);packed[i*4+j]=w;sum+=w;}packed[i*4+largest]!+=255-sum;}
 g.setAttribute('skinWeight',new Uint8BufferAttribute(packed,4,true));o.geometry=g;const convert=(m:Material)=>m instanceof MeshPhongMaterial?new MeshStandardMaterial({color:m.color,roughness:.9}):m;o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);});
const glb=await new GLTFExporter().parseAsync(model,{binary:true,animations:model.animations});
if(!(glb instanceof ArrayBuffer))throw Error('Expected a binary Rat asset');
await Bun.write('assets/external/quaternius/rodents/Rat.glb',glb);
console.log('Rat GLB bytes',Bun.file('assets/external/quaternius/rodents/Rat.glb').size);
