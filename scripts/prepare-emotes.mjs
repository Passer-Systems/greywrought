import { AnimationMixer, Euler, Matrix4, Quaternion, SkinnedMesh, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { retargetClip } from 'three/addons/utils/SkeletonUtils.js';
globalThis.ProgressEvent ??= class ProgressEvent extends Event { constructor(type, options) { super(type); Object.assign(this, options); } };
const base = 'assets/external/quaternius/class-characters/';
const original = await Bun.file('assets/external/quaternius/rig-socket-prototype/wayfarer/Knight_Golden_Female.gltf').json();
const bytes = Bun.spawnSync(['unzip', '-p', '/home/tom/code/game-assets/quaternius/All in One - Quaternius[Patreon].zip', 'Animation/Universal Animation Library 1\\[Standard\\]/Unreal-Godot/UAL1_Standard.glb']).stdout;
const loader = new GLTFLoader();
const target = await loader.parseAsync(JSON.stringify(original), '');
const source = await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
const rigOf = model => { let rig; model.traverse(o => { if (o instanceof SkinnedMesh) rig ??= o; }); return rig; };
const rig = rigOf(target.scene), donor = rigOf(source.scene);
const semantic = bone => bone.userData.name ?? bone.name;
const mapping = { Body:'pelvis', Abdomen:'spine_01', Torso:'spine_03', Neck:'neck_01', Head:'Head', 'Shoulder.L':'clavicle_l', 'Shoulder.R':'clavicle_r', 'UpperArm.L':'upperarm_l', 'UpperArm.R':'upperarm_r', 'LowerArm.L':'lowerarm_l', 'LowerArm.R':'lowerarm_r', 'Fist.L':'hand_l', 'Fist.R':'hand_r', 'UpperLeg.L':'thigh_l', 'UpperLeg.R':'thigh_r', 'LowerLeg.L':'calf_l', 'LowerLeg.R':'calf_r', 'Foot.L':'foot_l', 'Foot.R':'foot_r' };
rig.skeleton.pose(); donor.skeleton.pose(); target.scene.updateMatrixWorld(true); source.scene.updateMatrixWorld(true);
const hip = donor.skeleton.bones.find(b => semantic(b)==='pelvis');
const body = rig.skeleton.bones.find(b => semantic(b)==='Body');
const scale = body.getWorldPosition(new Vector3()).y / hip.getWorldPosition(new Vector3()).y;
const localOffsets = Object.fromEntries(rig.skeleton.bones.flatMap(b => {
  const sourceBone = donor.skeleton.bones.find(s => semantic(s) === mapping[semantic(b)]);
  if (!sourceBone) return [];
  return [[b.name, new Matrix4().makeRotationFromQuaternion(sourceBone.getWorldQuaternion(new Quaternion()).invert().multiply(b.getWorldQuaternion(new Quaternion())))]];
}));
const dance = retargetClip(rig, donor, source.animations.find(a=>a.name==='Dance_Loop'), { hip:hip.name, scale, fps:24, localOffsets, names:Object.fromEntries(rig.skeleton.bones.map(b => [b.name,mapping[semantic(b)]])) });
original.animations = original.animations.filter(a=>['SitDown','Victory'].includes(a.name));
original.animations.find(a=>a.name==='Victory').name='Cheer';
const buffers = original.buffers.map(b => Buffer.from(b.uri.split(',')[1], 'base64'));
function accessor(values, size) {
  const data = new Float32Array(values), index = original.accessors.length;
  const view = original.bufferViews.length;
  original.bufferViews.push({buffer:buffers.length,byteOffset:0,byteLength:data.byteLength});
  buffers.push(Buffer.from(data.buffer));
  original.accessors.push({bufferView:view,componentType:5126,count:data.length/size,type:size===1?'SCALAR':size===3?'VEC3':'VEC4',...(size===1?{min:[Math.min(...values)],max:[Math.max(...values)]}:{})});
  return index;
}
function addAnimation(name, tracks) {
  const channels=[], samplers=[];
  for(const track of tracks) {
    const bone = rig.skeleton.bones.find(b=>b.name===track.bone);
    const node=original.nodes.findIndex(n=>n.name===semantic(bone));
    channels.push({sampler:samplers.length,target:{node,path:track.path}});
    samplers.push({input:accessor(track.times,1),output:accessor(track.values,track.path==='rotation'?4:3),interpolation:'LINEAR'});
  }
  original.animations.push({name,channels,samplers});
}
addAnimation('Dance', dance.tracks.map(t=>({bone:t.name.match(/\[([^\]]+)\]/)[1],path:t.name.endsWith('position')?'translation':'rotation',times:Array.from(t.times),values:Array.from(t.values)})));
for (const clipName of ['Swim_Fwd_Loop', 'Swim_Idle_Loop']) {
  const swim = retargetClip(rig, donor, source.animations.find(a=>a.name===clipName), { hip: hip.name, scale, fps:24, localOffsets, names:Object.fromEntries(rig.skeleton.bones.map(b => [b.name,mapping[semantic(b)]])) });
  addAnimation(clipName, swim.tracks.map(t=>({bone:t.name.match(/\[([^\]]+)\]/)[1],path:t.name.endsWith('position')?'translation':'rotation',times:Array.from(t.times),values:Array.from(t.values)})));
}
// Author social gestures on the donor's actual idle pose, then retarget to each class.
rig.skeleton.pose();
const mixer = new AnimationMixer(target.scene); mixer.clipAction(target.animations.find(a=>a.name==='Idle')).play(); mixer.update(0);
const idle = new Map(rig.skeleton.bones.map(b=>[semantic(b),b.quaternion.clone()]));
const times=[0,.25,.55,.85,1.15,1.45,1.75,2.1];
function gesture(name, offsets) {
  const tracks=rig.skeleton.bones.map(b=>({bone:b.name,path:'rotation',times,values:times.flatMap((_,i)=>idle.get(semantic(b)).clone().multiply(new Quaternion().setFromEuler(new Euler(...(offsets[semantic(b)]?.[i]??[0,0,0])))).toArray())}));
  const pos=body.position.toArray(); tracks.push({bone:body.name,path:'translation',times,values:times.flatMap(()=>pos)});
  addAnimation(name,tracks);
}
gesture('Wave', {
 'UpperArm.R':[[0,0,0],[0,0,-1.7],[0,0,-1.7],[0,0,-1.7],[0,0,-1.7],[0,0,-1.7],[0,0,-1.7],[0,0,0]],
 'LowerArm.R':[[0,0,0],[0,0,-.7],[0,0,-.15],[0,0,-.9],[0,0,-.15],[0,0,-.9],[0,0,-.4],[0,0,0]],
});
gesture('Train', {
 'UpperArm.R':[[0,0,0],[-.6,0,0],[.3,0,0],[-.6,0,0],[.3,0,0],[-.6,0,0],[.3,0,0],[0,0,0]],
 'UpperArm.L':[[0,0,0],[.3,0,0],[-.6,0,0],[.3,0,0],[-.6,0,0],[.3,0,0],[-.6,0,0],[0,0,0]],
 'LowerArm.R':[[0,0,0],[-1.1,0,0],[-1.1,0,0],[-1.1,0,0],[-1.1,0,0],[-1.1,0,0],[-1.1,0,0],[0,0,0]],
 'LowerArm.L':[[0,0,0],[-1.1,0,0],[-1.1,0,0],[-1.1,0,0],[-1.1,0,0],[-1.1,0,0],[-1.1,0,0],[0,0,0]],
});
const used = new Set();
for(const mesh of original.meshes) for(const p of mesh.primitives) { for(const a of Object.values(p.attributes)) used.add(a); if(p.indices!==undefined) used.add(p.indices); for(const t of p.targets??[]) for(const a of Object.values(t)) used.add(a); }
for(const skin of original.skins) if(skin.inverseBindMatrices!==undefined) used.add(skin.inverseBindMatrices);
for(const anim of original.animations) for(const s of anim.samplers) {used.add(s.input);used.add(s.output);}
const indices=[...used].sort((a,b)=>a-b), remap=new Map(indices.map((a,i)=>[a,i]));
const views=[...new Set(indices.map(i=>original.accessors[i].bufferView))].sort((a,b)=>a-b), viewMap=new Map(views.map((a,i)=>[a,i]));
let length=0; const chunks=[];
const newViews=views.map(i=>{const v=original.bufferViews[i];const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;} const offset=length;const chunk=buffers[v.buffer].subarray(v.byteOffset??0,(v.byteOffset??0)+v.byteLength);chunks.push(chunk);length+=chunk.length;return {...v,buffer:0,byteOffset:offset};});
original.accessors=indices.map(i=>({...original.accessors[i],bufferView:viewMap.get(original.accessors[i].bufferView)}));
original.bufferViews=newViews;
for(const mesh of original.meshes) for(const p of mesh.primitives) { for(const k in p.attributes) p.attributes[k]=remap.get(p.attributes[k]); if(p.indices!==undefined) p.indices=remap.get(p.indices); for(const t of p.targets??[]) for(const k in t)t[k]=remap.get(t[k]); }
for(const s of original.skins) s.inverseBindMatrices=remap.get(s.inverseBindMatrices);
for(const a of original.animations) for(const s of a.samplers) {s.input=remap.get(s.input);s.output=remap.get(s.output);}
original.buffers=[{byteLength:length}];
const json=Buffer.from(JSON.stringify(original));const jsonPad=Buffer.alloc((4-json.length%4)%4,32);const bin=Buffer.concat([...chunks,Buffer.alloc((4-length%4)%4)]);
const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(20+json.length+jsonPad.length+8+bin.length,8);header.writeUInt32LE(json.length+jsonPad.length,12);header.writeUInt32LE(0x4e4f534a,16);
const bh=Buffer.alloc(8);bh.writeUInt32LE(bin.length,0);bh.writeUInt32LE(0x004e4942,4);
await Bun.write(base+'Social.glb',Buffer.concat([header,json,jsonPad,bh,bin]));
console.log('Social.glb',header.readUInt32LE(8),'bytes',original.animations.map(a=>a.name));
