import { Box3, Color, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Quaternion, Vector3, type Material } from 'three';
import { terrainHeight } from '../game/cave-layout.js';
import { lakeWaterAt, streamAt } from '../game/world-elevation.js';
import { lavaLakeRatio } from '../game/lava-layout.js';
import { EXPANDED_WORLD_BOUNDS, REGION_BUILDINGS, REGION_LANDMARKS, REGION_ROADS, WORLD_SETTLEMENTS, regionAt } from '../game/world-regions.js';
import { TOWN_BOUNDS } from '../game/world-layout.js';
import { prop } from './frostwood-assets.js';

type Kind = 'stone' | 'shale' | 'windfall' | 'pipe' | 'vessel' | 'barrel';
type Tint = 'slate' | 'copper' | 'ivory' | 'wood' | 'iron';
type Scene = 'windfall' | 'salt' | 'wash' | 'repair' | 'cinder' | 'ossuary';
const colors: Record<Tint, number> = { slate: 0x778078, copper: 0x9a7354, ivory: 0xb9b59d, wood: 0x726454, iron: 0x697571 };
const random = (seed: number) => { const n = Math.sin(seed * 127.1 + 47.3) * 43758.5453; return n - Math.floor(n); };
const oldPaths = [
  [[0,-40],[0,-55],[1,-77],[12,-89],[16,-104],[14,-124]],
  [[0,-46],[9,-45],[21,-46],[28,-46]],
  [[0,0],[0,14],[-1.2,23],[-3,31],[-3.7,44],[-1.5,51],[2,60],[2,69]],
] as const;
function nearPath(x: number, z: number, points: readonly (readonly [number, number])[], width: number): boolean {
  return points.slice(1).some((to, i) => {
    const from = points[i]!, dx = to[0]-from[0], dz = to[1]-from[1];
    const t = Math.max(0,Math.min(1,((x-from[0])*dx+(z-from[1])*dz)/(dx*dx+dz*dz)));
    return Math.hypot(x-from[0]-dx*t,z-from[1]-dz*t) < width;
  });
}
function accepts(x: number, z: number, radius: number): boolean {
  const margin = radius + 1;
  if (x < EXPANDED_WORLD_BOUNDS.minX+margin || x > EXPANDED_WORLD_BOUNDS.maxX-margin || z < EXPANDED_WORLD_BOUNDS.minZ+margin || z > EXPANDED_WORLD_BOUNDS.maxZ-margin) return false;
  if (x > TOWN_BOUNDS.minX-margin && x < TOWN_BOUNDS.maxX+margin && z > TOWN_BOUNDS.minZ-margin && z < TOWN_BOUNDS.maxZ+margin) return false;
  if (x > 24-margin && x < 90+margin && z > -67-margin && z < -27+margin) return false;
  if (WORLD_SETTLEMENTS.some(t => x > t.minX-margin && x < t.maxX+margin && z > t.minZ-margin && z < t.maxZ+margin)) return false;
  if (REGION_BUILDINGS.some(b => Math.hypot(x-b.x,z-b.z) < Math.hypot(b.width,b.depth)/2+margin)) return false;
  if (REGION_LANDMARKS.some(l => Math.hypot(x-l.x,z-l.z) < (l.id === 'choir-engine' ? 24 : 13)+margin)) return false;
  if ([[-3,32,13],[16,25,13],[-19,47,14],[6,41,10],[2,64,12],[-54,-44,17],[-68,-48,10],[24,45,8],[-33,65,9]].some(([px,pz,r]) => Math.hypot(x-px!,z-pz!) < r!+radius)) return false;
  if (REGION_ROADS.some(r => nearPath(x,z,r.points,r.width*.75+margin)) || oldPaths.some(p => nearPath(x,z,p,3+margin))) return false;
  // Check the footprint, not just its center, at stream banks and steep ledges.
  for (const [dx,dz] of [[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]]) {
    const px=x+dx!, pz=z+dz!, h=terrainHeight(px,pz), water=lakeWaterAt(px,pz), stream=streamAt(px,pz);
    if (lavaLakeRatio(px,pz) < 1.35) return false;
    if (water !== null && h < water+.3 || stream && h < stream.surface+.35) return false;
    if (Math.hypot(terrainHeight(px+.5,pz)-terrainHeight(px-.5,pz),terrainHeight(px,pz+.5)-terrainHeight(px,pz-.5)) > .45) return false;
  }
  return true;
}

// Distinct deposits: wind-broken branches, abandoned salt jars, washed stone,
// repair castoffs, scorched pipes and pale mineral rubble.
const sites: readonly (readonly [number, number, Scene])[] = [
  [-42,12,'windfall'],[-52,38,'windfall'],[39,25,'wash'],[41,63,'repair'],[-25,82,'windfall'],
  [-39,-17,'salt'],[39,-9,'wash'],[-74,-129,'windfall'],[-21,-145,'wash'],[26,-123,'salt'],[46,-104,'cinder'],
  [-162,104,'windfall'],[-163,141,'salt'],[-146,168,'windfall'],[-113,178,'salt'],[-94,141,'salt'],[-108,92,'wash'],
  [-57,123,'windfall'],[-39,146,'salt'],[-14,146,'wash'],[-10,185,'windfall'],[9,149,'wash'],[9,189,'wash'],[61,156,'wash'],[66,183,'windfall'],
  [122,99,'repair'],[126,148,'cinder'],[162,153,'repair'],[192,134,'repair'],[204,107,'cinder'],[185,88,'wash'],
  [91,190,'ossuary'],[91,229,'ossuary'],[132,232,'ossuary'],[145,212,'ossuary'],[131,186,'wash'],
  [163,-55,'cinder'],[195,-64,'cinder'],[229,-39,'repair'],[229,-7,'cinder'],[210,22,'repair'],[164,18,'cinder'],
  [141,58,'wash'],[184,57,'repair'],[117,24,'cinder'],[88,-104,'wash'],[57,-96,'cinder'],
];

/** Static low scenery, instanced in spatial cells; no collision or frame work. */
export async function buildWorldDebris(parent: Group): Promise<void> {
  const root = new Group(); root.name = 'world-debris'; parent.add(root);
  const definitions: readonly (readonly [Kind,string,boolean])[] = [
    ['stone','nature/Rock_Medium_1',false],['shale','nature/Rock_Medium_3',false],
    ['windfall','nature/DeadTree_2',true],['pipe','works/Details_Pipes_Long',true],
    ['vessel','works/Props_Vessel',true],['barrel','Barrel',true],
  ];
  const templates = new Map(await Promise.all(definitions.map(async ([kind,name,fallen]) => {
    const model = await prop(name,1,'width');
    if (fallen) model.rotation.z = Math.PI/2;
    model.updateWorldMatrix(true,true);
    const bounds = new Box3().setFromObject(model), size = bounds.getSize(new Vector3());
    const wrapper = new Group(); wrapper.add(model);
    model.position.sub(bounds.getCenter(new Vector3()));
    model.position.y += size.y/2;
    wrapper.scale.setScalar(1/Math.max(size.x,size.z));
    return [kind,wrapper] as const;
  })));
  const materials = new Map<string,Material>();
  function surface(source: Material, tint: Tint): Material {
    if (!(source instanceof MeshStandardMaterial)) return source;
    const key = `${source.uuid}:${tint}`;
    let cached = materials.get(key);
    if (!cached) {
      const material = source.clone();
      material.color.lerp(new Color(colors[tint]), .65);
      material.roughness = 1; material.emissive.setHex(0); material.emissiveIntensity = 0;
      cached=material; materials.set(key,cached);
    }
    return cached;
  }
  const batches = new Map<string,{source: Mesh; material: Material | Material[]; matrices: Matrix4[]}>();
  const positions: {x:number;z:number;radius:number}[] = [];
  const byRegion: Record<string,number> = {}, byKind: Record<string,number> = {};
  let highest = 0, widest = 0, corridorObjects = 0;
  function place(kind: Kind, tint: Tint, x: number, z: number, width: number, turn: number, corridor = false): boolean {
    const radius = width*.73;
    if (!accepts(x,z,radius) || positions.some(p => Math.hypot(x-p.x,z-p.z) < (radius+p.radius)*.72)) return false;
    const model = templates.get(kind)!.clone(true), holder = new Group(); holder.add(model);
    model.scale.multiplyScalar(width);
    model.updateWorldMatrix(true,true);
    const rawBounds = new Box3().setFromObject(model), rawHeight = rawBounds.max.y-rawBounds.min.y;
    // Broad logs and pipe offcuts remain ankle-to-knee cover, not false barriers.
    if (rawHeight > .72) model.scale.y *= .72/rawHeight;
    model.rotation.y = turn;
    const normal = new Vector3(terrainHeight(x-.5,z)-terrainHeight(x+.5,z),1,terrainHeight(x,z-.5)-terrainHeight(x,z+.5)).normalize();
    holder.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),normal));
    holder.position.set(x,terrainHeight(x,z)-.045,z);
    holder.updateWorldMatrix(true,true);
    const bounds = new Box3().setFromObject(holder);
    highest=Math.max(highest,bounds.max.y-bounds.min.y); widest=Math.max(widest,width);
    positions.push({x,z,radius});
    const region=regionAt(x,z).id; byRegion[region]=(byRegion[region]??0)+1; byKind[kind]=(byKind[kind]??0)+1;
    if (corridor) corridorObjects++;
    holder.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const material = Array.isArray(object.material) ? object.material.map(m=>surface(m,tint)) : surface(object.material,tint);
      const list = Array.isArray(material) ? material : [material];
      const key = [Math.floor(x/32),Math.floor(z/32),object.geometry.uuid,...list.map(m=>m.uuid)].join(':');
      let batch=batches.get(key);
      if (!batch) { batch={source:object,material,matrices:[]}; batches.set(key,batch); }
      batch.matrices.push(object.matrixWorld.clone());
    });
    return true;
  }
  function deposit(cx: number, cz: number, scene: Scene, seed: number, corridor = false) {
    const turn = random(seed)*Math.PI*2, cos=Math.cos(turn), sin=Math.sin(turn);
    const add = (kind: Kind,tint: Tint,along: number,across: number,width: number,yaw: number) =>
      place(kind,tint,cx+along*cos-across*sin,cz+along*sin+across*cos,width,turn+yaw,corridor);
    if (scene === 'windfall') {
      add('windfall','wood',0,0,2.5+random(seed+1),.2);
      add('shale','slate',-1.9,.9,1.05,-.8);
      if (random(seed+3)>.4) add('windfall','wood',2.4,-1.2,1.45,1.1);
    } else if (scene === 'salt') {
      add('barrel','wood',-.7,.2,.85,.3); add('vessel','copper',.7,.8,.68,-1.4);
      add('shale','ivory',1.1,-1.15,1.1,.8);
    } else if (scene === 'repair') {
      add('pipe','iron',0,0,1.8,.4); add('vessel','copper',1.65,.65,.8,-.6);
      if (random(seed+7)>.35) add('barrel','wood',-1.6,1.3,.7,.9);
    } else if (scene === 'cinder') {
      add('pipe','copper',-.7,0,2.15,-.2); add('shale','slate',1.4,-.55,1.2,.6);
    } else if (scene === 'ossuary') {
      add('stone','ivory',-.9,0,1.6,.3); add('shale','ivory',1.3,-.4,.9,-.9);
      if (random(seed+9)>.5) add('vessel','iron',.2,1.4,.65,.8);
    } else {
      add('shale','slate',-.6,0,1.7,.3); add('stone','ivory',1.3,.5,.8,-.4);
    }
    // An unequal tail of rubble follows each deposit; most of its ground stays open.
    const count=3+Math.floor(random(seed+13)*5);
    for(let i=0;i<count;i++) {
      const along=1.9+random(seed+i*17+20)*5.8, across=(random(seed+i*23+21)-.5)*(1.2+i*.4);
      add(i%3===0?'stone':'shale',scene==='ossuary'?'ivory':scene==='cinder'?'copper':'slate',along,across,.28+random(seed+i*31+22)*.56,random(seed+i*11+23)*6.28);
    }
  }
  for (const [i,[x,z,scene]] of sites.entries()) deposit(x,z,scene,5401+i*137);
  for (const [roadIndex,road] of REGION_ROADS.entries()) {
    for (let segment=1;segment<road.points.length;segment++) {
      const [ax,az]=road.points[segment-1]!, [bx,bz]=road.points[segment]!;
      const length=Math.hypot(bx-ax,bz-az), ux=(bx-ax)/length, uz=(bz-az)/length;
      // Broken, alternating shoulder deposits leave deliberate long sightlines.
      for(let d=9;d<length-4;) {
        const seed=11003+roadIndex*1709+segment*113+Math.floor(d)*7;
        const side=random(seed)>.5?1:-1, offset=road.width*.75+5+random(seed+1)*7;
        const x=ax+ux*d-uz*offset*side, z=az+uz*d+ux*offset*side;
        const region=regionAt(x,z).id;
        const scene: Scene = region==='brinewood'?'salt':region==='glassmire'?'wash':region==='suture-reach'?'repair':region==='choirworks'?'cinder':region==='ossuary'?'ossuary':'windfall';
        deposit(x,z,scene,seed,true);
        d+=19+random(seed+2)*22;
      }
    }
  }
  let drawCalls=0;
  for (const batch of batches.values()) {
    const mesh = new InstancedMesh(batch.source.geometry,batch.material,batch.matrices.length);
    mesh.name='world-debris-cell'; mesh.receiveShadow=true; mesh.castShadow=false;
    for(const [i,matrix] of batch.matrices.entries()) mesh.setMatrixAt(i,matrix);
    mesh.instanceMatrix.needsUpdate=true; mesh.computeBoundingSphere(); mesh.updateMatrix(); mesh.matrixAutoUpdate=false;
    root.add(mesh); drawCalls+=Array.isArray(batch.material)?batch.material.length:1;
  }
  root.userData.debris={objects:positions.length,byRegion,byKind,corridorObjects,batches:batches.size,drawCalls,maxHeight:highest,maxWidth:widest};
}
