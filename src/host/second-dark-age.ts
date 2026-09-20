import { Box3, BoxGeometry, BufferGeometry, Color, CylinderGeometry, DoubleSide, Float32BufferAttribute, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, TorusGeometry, Vector3, type Material, type Object3D } from 'three';
import { terrainHeight } from '../game/cave-layout.js';
import { REGION_BUILDINGS, REGION_LANDMARKS, REGION_ROADS, WORLD_SETTLEMENTS } from '../game/world-regions.js';
import { prop } from './frostwood-assets.js';

export interface RegionalSign { root: Group; id: string; name: string }
const iron = new MeshStandardMaterial({ color: '#535851', roughness: .96, metalness: .3 });
const rust = new MeshStandardMaterial({ color: '#70503d', roughness: 1, metalness: .14 });
const timber = new MeshStandardMaterial({ color: '#554b3a', roughness: 1 });
const ivory = new MeshStandardMaterial({ color: '#b5b09a', roughness: .94 });
const bruise = new MeshStandardMaterial({ color: '#65546b', emissive: '#503854', emissiveIntensity: .2, roughness: .9 });
const box = new BoxGeometry(1, 1, 1), pipe = new CylinderGeometry(1, 1, 1, 8);
const ring = new TorusGeometry(1, .075, 5, 20);
const weatherMaterials = new Map<Material, Material>();
const groundMaterials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
const mineralMaterials = new Map<Material, Material>();

function mineral(root: Object3D) {
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const surface = (source: Material) => {
      if (!(source instanceof MeshStandardMaterial)) return source;
      let material = mineralMaterials.get(source);
      if (!material) {
        const stone=source.clone(); stone.color.set('#a4b2a0'); stone.roughness=.38; stone.metalness=.18;
        stone.emissive.set('#27443d');stone.emissiveIntensity=.08;
        material=stone;mineralMaterials.set(source,material);
      }
      return material;
    };
    object.material=Array.isArray(object.material)?object.material.map(surface):surface(object.material);
  });
}

function age(root: Object3D) {
  root.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const weather = (original: Material) => {
      let result = weatherMaterials.get(original);
      if (!result && original instanceof MeshStandardMaterial) {
        const material = original.clone();
        material.color.lerp(new Color('#514e43'), .42); material.roughness = 1;
        material.emissiveIntensity *= .18; result = material; weatherMaterials.set(original, result);
      }
      return result ?? original;
    };
    object.material = Array.isArray(object.material) ? object.material.map(weather) : weather(object.material);
  });
}
function detail(parent: Group, geometry: BufferGeometry, material: MeshStandardMaterial, x: number, y: number, z: number, sx: number, sy: number, sz: number, rz = 0) {
  const mesh = new Mesh(geometry, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.rotation.z = rz;
  mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function beam(parent: Group, a: Vector3, b: Vector3, width: number, material = timber) {
  const mesh = detail(parent, box, material, (a.x+b.x)/2, (a.y+b.y)/2, (a.z+b.z)/2, width, a.distanceTo(b), width);
  mesh.quaternion.setFromUnitVectors(new Vector3(0,1,0), b.clone().sub(a).normalize()); return mesh;
}
/** Feathered color/alpha strips use the very same sampled heights as the ground. */
function road(parent: Group, points: readonly (readonly [number, number])[], width: number, tint = '#756b50') {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const color = new Color(tint), lanes = [-.72,-.47,0,.47,.72];
  for (let segment=1; segment<points.length; segment++) {
    const [ax,az]=points[segment-1]!, [bx,bz]=points[segment]!;
    const length=Math.hypot(bx-ax,bz-az), steps=Math.ceil(length/1.1);
    for(let step=0;step<=steps;step++) {
      const t=step/steps, x=ax+(bx-ax)*t, z=az+(bz-az)*t;
      const base=positions.length/3;
      for(let lane=0;lane<lanes.length;lane++) {
        const offset=lanes[lane]!*width*(.9+.1*Math.sin(x*.7+z*.21)+.08*Math.sin(z*.83-x*.3)), px=x-(bz-az)/length*offset, pz=z+(bx-ax)/length*offset;
        positions.push(px,terrainHeight(px,pz)+.028,pz);
        const grain=.86+.12*Math.sin(px*3.7+pz*5.9);
        colors.push(color.r*grain,color.g*grain,color.b*grain,lane===0||lane===4?0:(lane===2?.32:.16)*(.55+.45*Math.sin(px*1.2+pz*.9)**2));
      }
      if(step>0) for(let lane=0;lane<4;lane++) {
        const a=base+lane,b=a+1,c=a-5,d=b-5; indices.push(a,b,c,b,d,c);
      }
    }
  }
  const geometry=new BufferGeometry(); geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new Float32BufferAttribute(colors,4)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh=new Mesh(geometry,new MeshStandardMaterial({vertexColors:true,transparent:true,depthWrite:false,roughness:1,side:DoubleSide,polygonOffset:true,polygonOffsetFactor:-1}));
  mesh.name='Worn road'; mesh.receiveShadow=true; parent.add(mesh);
}
function patch(parent: Group, x: number, z: number, rx: number, rz: number, material: MeshStandardMaterial, lift = .04) {
  const positions:number[]=[], colors:number[]=[], indices:number[]=[];
  const segments=32, rings=5;
  for(let ring=0;ring<=rings;ring++) for(let i=0;i<=segments;i++) {
    const angle=i/segments*Math.PI*2, wobble=1+.18*Math.sin(angle*3+x)+.1*Math.cos(angle*7+z);
    const radius=ring/rings,px=x+Math.cos(angle)*rx*wobble*radius,pz=z+Math.sin(angle)*rz*wobble*radius;
    positions.push(px,terrainHeight(px,pz)+lift,pz);
    const grain=.76+.24*Math.sin(px*1.9+pz*.7)**2;
    colors.push(grain,grain,grain,ring===rings?0:ring===rings-1?.35:.62+.25*Math.sin(px*.8-pz)**2);
    if(ring>0 && i>0) {
      const a=ring*(segments+1)+i,b=a-1,c=a-segments-1,d=c-1;
      indices.push(a,b,c,b,d,c);
    }
  }
  const geometry=new BufferGeometry(); geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new Float32BufferAttribute(colors,4));geometry.setIndex(indices); geometry.computeVertexNormals();
  let surface=groundMaterials.get(material);
  if(!surface) {surface=material.clone();surface.vertexColors=true;groundMaterials.set(material,surface);}
  const mesh=new Mesh(geometry,surface); mesh.receiveShadow=true; parent.add(mesh);
}
/** Instance only scenery; sign roots remain intact for hover raycasts. */
function batch(root: Group) {
  root.updateWorldMatrix(true,true);
  const bins=new Map<string,Mesh[]>();
  root.traverse(object=>{
    if(!(object instanceof Mesh)||object.userData.keepIndividual) return;
    for(let p: Object3D|null=object.parent;p&&p!==root;p=p.parent) if(p.userData.sign || p.userData.animated) return;
    const materials=Array.isArray(object.material)?object.material:[object.material];
    const center=object.getWorldPosition(new Vector3());
    const key=`${Math.floor(center.x/32)}:${Math.floor(center.z/32)}:${object.geometry.uuid}:${materials.map(m=>m.uuid).join(',')}`;
    const list=bins.get(key)??[];list.push(object);bins.set(key,list);
  });
  const inverse=root.matrixWorld.clone().invert(), matrix=new Matrix4();
  for(const meshes of bins.values()) {
    if(meshes.length<2) continue;
    const first=meshes[0]!, instances=new InstancedMesh(first.geometry,first.material,meshes.length);
    instances.receiveShadow=true; instances.castShadow=first.castShadow;
    meshes.forEach((mesh,index)=>{instances.setMatrixAt(index,matrix.multiplyMatrices(inverse,mesh.matrixWorld));mesh.removeFromParent();});
    instances.computeBoundingSphere();root.add(instances);
  }
}

export async function buildSecondDarkAge(parent: Group): Promise<{ signs: RegionalSign[]; update(time: number): void }> {
  const root=new Group();root.name='The second dark age';parent.add(root);
  const signs:RegionalSign[]=[], jobs:Promise<void>[]=[];
  const animated: { root: Group; speed: number }[]=[];
  function place(name:string,x:number,z:number,height:number,yaw=0,lift=0,owner=root) {
    const job=prop(name,height).then(model=>{age(model);model.position.set(x,terrainHeight(x,z)+lift,z);model.rotation.y=yaw;owner.add(model);return model;});
    jobs.push(job.then(()=>{}));return job;
  }
  function sign(id:string,name:string,x:number,z:number,yaw=0) {
    jobs.push(place('Sign_LeftRight',x,z,1.6,yaw).then(model=>{model.userData.sign=true;signs.push({root:model,id,name});}));
  }
  for(const route of REGION_ROADS) road(root,route.points,route.width);
  for(const town of WORLD_SETTLEMENTS) {
    road(root,[[town.x,town.minZ+3],[town.x,town.maxZ-3]],3.8);
    sign(`sign-${town.id}`,town.name,town.x-3,town.z-4);
  }
  for(const building of REGION_BUILDINGS) {
    const model=await prop(building.model,building.height); age(model);
    model.rotation.y=-building.turn*Math.PI/2; model.updateWorldMatrix(true,true);
    const bounds=new Box3().setFromObject(model),size=bounds.getSize(new Vector3());
    // Scale the rotated wrapper in world axes so the visible roof fits its obstacle.
    const footprint=new Group();footprint.add(model);footprint.scale.set(building.width/size.x,1,building.depth/size.z);
    footprint.position.set(building.x,terrainHeight(building.x,building.z),building.z);footprint.name=building.sign;root.add(footprint);
    const y=terrainHeight(building.x,building.z), inward=building.town==='suture'?(building.x<157?1:-1):(building.x< -125?1:-1);
    sign(`sign-${building.town}-${building.x}-${building.z}`,building.sign,building.x+inward*(building.width/2+.7),building.z+1.4,Math.PI/2);
    const attachments=new Group();attachments.position.set(building.x,y,building.z);root.add(attachments);
    // Apparatus and repair beds remain inside the building's blocked footprint.
    const edge=-inward*(building.width/2-.8);
    detail(attachments,pipe,rust,edge,building.height*.45,0,.16,building.height*.9,.16,.035);
    detail(attachments,ring,iron,edge,building.height*.68,0,.65,.65,.65);
    beam(attachments,new Vector3(edge-.3,.15,-1.6),new Vector3(edge+.2,building.height*.66,1.4),.18);
    for(let p=0;p<3;p++) {
      const plank=detail(attachments,box,p===1?iron:timber,(-.8+p*.8),building.height*.77,-.3,.6,.12,1.7,-.09+p*.08);plank.rotation.x=.42;
    }
    await place(building.town==='suture'?'works/Props_Capsule':'works/Props_Vessel',building.x+edge,building.z-.7,building.height*.43,.22,0);
    await place('Barrel',building.x+edge,building.z+1.4,.85,.3);
    await place('nature/Fern_1',building.x+edge-.3,building.z+1.8,.7);
    // Storage hugs the solid roof footprint; the inward door and its road stay clear.
    for(let corner=0;corner<2;corner++) {
      const side=corner===0?-1:1;
      const cx=building.x+inward*(building.width/2-.65),cz=building.z+side*(building.depth/2-.6);
      await place(corner===0?'Crate':'Barrel',cx,cz,.95+.15*corner,side*.17);
      await place('Crate',cx-inward*.7,cz-side*.12,.62,-.21,corner===0?.74:0);
      await place(building.town==='suture'?'works/Props_Vessel':'Barrel',cx-inward*1.35,cz,.8,.3);
    }
    const repair=await place('Bench_1',building.x+edge,building.z,1.05,Math.PI/2);
    repair.scale.z*=.7;
    road(root,[[building.x+inward*(building.width/2+.2),building.z],[building.town==='suture'?157:-125,building.z]],1.7);
  }
  // Cooling fins emerge from a salvaged reactor like a collapsed organ nave.
  await place('works/Props_Base',202,-24,2.5);
  await place('works/Props_Capsule',202,-24,7.5,0);
  for(let i=0;i<7;i++) {
    const x=199+i, z=-24+Math.sin(i*1.4)*1.8,y=terrainHeight(x,z);
    detail(root,box,i%2?iron:rust,x,y+3.1,z,.23,5.2+(i%3),2.4,.05*Math.sin(i));
    detail(root,ring,iron,x,y+4.5,z,.7,.7,.7);
  }
  // Each dead tower has an authored core, torn external hoops and fungal shelves.
  for(const [x,z,height] of [[106,213,11],[117,217,14]] as const) {
    const tower=await place('works/Props_Capsule',x,z,height);
    const towerSize=new Box3().setFromObject(tower).getSize(new Vector3());
    tower.scale.x=4.1/towerSize.x;tower.scale.z=4.1/towerSize.z;
    const y=terrainHeight(x,z);
    for(let level=0;level<7;level++) {
      const hoop=detail(root,ring,iron,x,y+1+level*1.8,z,2.15,2.15,2.15,.035*level);hoop.rotation.x=Math.PI/2;
      for(let side=0;side<3;side++) {
        const angle=side*2.1+level*.8;
        const shelf=detail(root,pipe,level%4===0?bruise:ivory,x+Math.cos(angle)*1.65,y+1.1+level*1.5,z+Math.sin(angle)*1.65,1.15,.16,.8);
        shelf.rotation.z=.13*Math.sin(angle);shelf.rotation.y=angle;
      }
    }
  }
  // The wheel is a broken machine reliquary, suspended on its original work stand.
  await place('works/Props_Base',-82,155,2);
  const wheel=new Group();wheel.userData.animated=true;wheel.position.set(-82,terrainHeight(-82,155)+3.5,155);root.add(wheel);
  detail(wheel,ring,rust,0,0,0,3.1,3.1,3.1);
  detail(wheel,ring,iron,0,0,0,2.6,2.6,2.6);
  for(let i=0;i<11;i++) {
    const angle=i/12*Math.PI*2;
    beam(wheel,new Vector3(.5*Math.cos(angle),.5*Math.sin(angle),0),new Vector3(3*Math.cos(angle),3*Math.sin(angle),0),.12,iron);
    const ribbon=detail(wheel,box,i%3?timber:bruise,Math.cos(angle)*2.9,Math.sin(angle)*2.9-.35,.1,.17,.8,.04,.15*Math.sin(i));ribbon.rotation.x=.12;
  }
  animated.push({root:wheel,speed:.013});
  // Water-dark mineral skins lie exactly on the ground, never above walkable air.
  const wet=new MeshStandardMaterial({color:'#699388',roughness:.19,metalness:.2,transparent:true,opacity:.55,depthWrite:false,side:DoubleSide});
  const salts=new MeshStandardMaterial({color:'#a7a28a',roughness:.83,transparent:true,opacity:.38,depthWrite:false,side:DoubleSide});
  const pools=[[23,168,4.8,2.5],[29,175,3.8,2.1],[20,177,3.2,1.8],[29,169,2,1.6]] as const;
  for(const [x,z,rx,rz] of pools) {
    patch(root,x,z,rx*1.18,rz*1.22,salts,.03);
    patch(root,x,z,rx,rz,wet);
  }
  // Authored mineral plates remain ankle-high on this walkable wet ground.
  for(let i=0;i<26;i++) {
    const pool=pools[i%3]!,angle=i*2.39996,radius=.76+.18*Math.sin(i*7.3);
    const x=pool[0]+Math.cos(angle)*pool[2]*radius,z=pool[1]+Math.sin(angle)*pool[3]*radius;
    const stone=await place(i%3?'nature/Rock_Medium_3':'nature/Rock_Medium_1',x,z,.16+(i%4)*.035,angle,-.04);
    stone.scale.x*=2.1;stone.scale.z*=1.6;mineral(stone);
  }
  const core=await place('works/Props_Vessel',29,171,3.5,.28);
  const coreSize=new Box3().setFromObject(core).getSize(new Vector3());
  core.scale.x*=1.15/coreSize.x;core.scale.z*=1.15/coreSize.z;
  for(const [dx,dz,height] of [[-.55,.28,2.4],[.48,-.25,1.9]] as const) {
    const fragment=await place('works/Props_Vessel',29+dx,171+dz,height,dx*2);
    const size=new Box3().setFromObject(fragment).getSize(new Vector3());
    fragment.scale.x*=.5/size.x;fragment.scale.z*=.5/size.z;
  }
  for(let i=0;i<7;i++) {
    const angle=i*2.39996,x=29+Math.cos(angle)*.75,z=171+Math.sin(angle)*.75;
    const crust=await place('nature/Rock_Medium_1',x,z,.55+(i%3)*.16,angle,-.14);
    crust.scale.x*=.6;crust.scale.z*=.65;mineral(crust);
  }
  for(let i=0;i<5;i++) {
    const hoop=detail(root,ring,i%2?ivory:iron,29,terrainHeight(29,171)+.6+i*.49,171,.79-i*.08,.79-i*.08,.79-i*.08,.17+i*.09);
    hoop.rotation.x=Math.PI/2;
  }
  for(const landmark of REGION_LANDMARKS)sign(`sign-${landmark.id}`,landmark.name,landmark.x-4.5,landmark.z-3);
  await Promise.all(jobs);batch(root);
  return {signs,update(time){for(const item of animated)item.root.rotation.z=(time*.001*item.speed)%(Math.PI*2);}};
}

/** Call after tagged houses load, before the owner's static batching pass. */
export async function weatherExistingTown(terrain: Group): Promise<void> {
  const houses:Object3D[]=[];terrain.traverse(object=>{if(object.userData.townBuilding===true)houses.push(object);});
  const decay=new Group();decay.name='Nine-Bell Yard repairs';terrain.add(decay);
  const mud=new MeshStandardMaterial({color:'#404735',transparent:true,opacity:.3,depthWrite:false,roughness:1,side:DoubleSide});
  for(const [index,house] of houses.entries()) {
    age(house);house.updateWorldMatrix(true,true);
    house.traverse(object=>{
      if(!(object instanceof Mesh)) return;
      const geometry=object.geometry.clone(),positions=geometry.getAttribute('position');
      geometry.computeBoundingBox();const local=geometry.boundingBox!,height=Math.max(.01,local.max.y-local.min.y);
      const colors=new Float32Array(positions.count*3);
      for(let i=0;i<positions.count;i++) {
        const fraction=(positions.getY(i)-local.min.y)/height;
        const streak=Math.max(0,Math.sin(positions.getX(i)*19+positions.getZ(i)*7));
        const damp=Math.max(0,1-fraction*3),shade=1-damp*.25-streak*.12;
        colors.set([shade*(1-damp*.08),shade,shade*(1-damp*.12)],i*3);
      }
      geometry.setAttribute('color',new Float32BufferAttribute(colors,3));object.geometry=geometry;
      const stained=(original:Material)=>{const material=original.clone();if(material instanceof MeshStandardMaterial)material.vertexColors=true;return material;};
      object.material=Array.isArray(object.material)?object.material.map(stained):stained(object.material);
    });
    const bounds=new Box3().setFromObject(house),center=bounds.getCenter(new Vector3()),size=bounds.getSize(new Vector3());
    // Roof patches and braces occupy existing solid buildings, never shop approaches.
    for(let p=0;p<3;p++) {
      const plank=detail(decay,box,p===1?rust:timber,center.x+(p-1)*.42,bounds.max.y-size.y*.23,center.z,.36,.1,Math.min(1.8,size.z*.5),.05*(p-1));plank.rotation.x=.45;
    }
    beam(decay,new Vector3(bounds.min.x+.2,bounds.min.y+.1,bounds.min.z+.2),new Vector3(bounds.min.x+.35,bounds.min.y+size.y*.55,bounds.min.z+size.z*.4),.15);
    patch(decay,center.x,bounds.max.z-.3,size.x*.47,.75,mud);
    const clutter=await prop(index%2?'works/Props_Vessel':'Barrel',.7);age(clutter);
    clutter.position.set(bounds.min.x+.55,terrainHeight(bounds.min.x+.55,center.z),center.z);clutter.rotation.z=.13;decay.add(clutter);
  }
  batch(decay);
}
