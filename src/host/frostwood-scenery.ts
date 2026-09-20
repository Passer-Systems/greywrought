import { terrainHeight } from '../game/cave-layout.js';
import { LAKE_CENTER, LAKE_RADIUS, LAKE_WATER_LEVEL } from '../game/world-elevation.js';
import { conformToTerrain } from './terrain-geometry.js';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, InstancedMesh, Matrix4, PlaneGeometry, CircleGeometry, RingGeometry, MeshStandardMaterial, MeshBasicMaterial, CanvasTexture, RepeatWrapping, SRGBColorSpace, PointLight, Box3, Vector3, Ray, Color } from "three";
import type { Position } from "../game/adventure-types.js";
import { TOWN_BUILDINGS } from "../game/town-layout.js";
import { prop } from "./frostwood-assets.js";

export async function buildFrostwood(terrain: Group, thicket: Group, innPosition: { readonly x: number; readonly z: number }): Promise<(coolingRestored: boolean, shiftEnded: boolean, player: Position, camera: Vector3, aimHeight?: number) => void> {
  const jobs: Promise<void>[] = [];
  const coolingMaterials: MeshStandardMaterial[] = [];
  const batches = new Map<string, { parent: Group; meshes: Mesh[] }>();
  const occluders: { root: Group; bounds: Box3 }[] = [];
  const sightline = new Ray(), cameraDirection = new Vector3(), intersection = new Vector3();
  let resolvedCameraDistance = Number.POSITIVE_INFINITY;
  function place(name: string, x: number, z: number, size: number, rotation = 0, parent = terrain, axis: "height" | "width" = "height", y = 0, footprint?: readonly [number, number], tilt = 0, lean = 0) {
    jobs.push(prop(name, size, axis).then(model => {
      model.position.set(x, terrainHeight(x,z) + y, z); model.rotation.set(tilt, rotation, lean);
      if (footprint) {
        const bounds = new Box3().setFromObject(model).getSize(new Vector3());
        const sideways = Math.abs(Math.sin(rotation)) > 0.5;
        model.scale.x *= footprint[sideways ? 1 : 0] / bounds[sideways ? "z" : "x"];
        model.scale.z *= footprint[sideways ? 0 : 1] / bounds[sideways ? "x" : "z"];
      }
      parent.add(model);
      if (name === "works/Props_Vessel" && z < 0) model.traverse(object => {
        if (!(object instanceof Mesh)) return;
        const coolable = (material: MeshStandardMaterial) => {
          const local = (material as MeshStandardMaterial).clone();
          if (local.name === "Accent") coolingMaterials.push(local);
          return local;
        };
        object.material = Array.isArray(object.material) ? object.material.map(coolable) : coolable(object.material);
      });
      model.updateWorldMatrix(true, true);
      const tree = name.includes('Tree_') || name.startsWith('nature/Pine_');
      if (footprint || tree) {
        const bounds = new Box3().setFromObject(model).expandByScalar(.5);
        occluders.push({ root: model, bounds });
      }
      if (!footprint) model.traverse(object => {
        if (!(object instanceof Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        // Keep transparent sorting and independently changing surfaces intact.
        if (materials.some(material => material.transparent || coolingMaterials.includes(material))) return;
        const key = [parent.id, Math.floor(x / 12), Math.floor(z / 12), object.geometry.uuid, ...materials.map(material => material.uuid)].join(":");
        let batch = batches.get(key);
        if (!batch) { batch = { parent, meshes: [] }; batches.set(key, batch); }
        batch.meshes.push(object);
      });
      // Scenery never moves; actors and effects retain their animated transforms.
      model.traverse(object => { object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = false; });
    }));
  }
  // Damaged trees use the authored Quaternius dead-tree silhouette. A horizontal
  // placement reads as a fallen trunk while retaining the low-poly bark detail.
  function fallenTree(x: number, z: number, length: number, rotation: number, y = .12) {
    place('nature/DeadTree_2', x, z, length, rotation, terrain, 'height', y, undefined, Math.PI / 2, 0.04 * Math.sin(x * 1.7 + z));
  }
  function torch(x: number, z: number, height = 2.4) {
    place("WoodenTorch_Fire",x,z,height);
    const light = new PointLight(0xffa34e,19,9,2);
    light.userData.nightIntensity = 19;
    light.position.set(x,terrainHeight(x,z)+height-0.2,z); terrain.add(light);
  }
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#5d754d"; ctx.fillRect(0,0,256,256);
  // Layered, irregular patches break up the repeated green tile at a glance.
  // Their low contrast keeps authored props and combat telegraphs legible.
  for (let i=0;i<260;i++) {
    const a=Math.sin(i*127.1)*43758.5453, b=Math.sin(i*269.5)*19234.324;
    const x=(a-Math.floor(a))*256, y=(b-Math.floor(b))*256;
    const radius=3+(i%17)*1.8;
    ctx.fillStyle=i%5===0?'#756649':i%3===0?'#486343':i%2?'#688157':'#80905a';
    ctx.globalAlpha=.22+(i%4)*.08; ctx.beginPath(); ctx.ellipse(x,y,radius*(1.4+(i%3)*.3),radius,Math.sin(i)*1.7,0,Math.PI*2); ctx.fill();
  }
  ctx.globalAlpha=1;
  for (let i=0;i<2600;i++) { const a=Math.sin(i*127.1)*43758.5453; const b=Math.sin(i*269.5)*19234.324; ctx.fillStyle=i%3?"#6f8255":i%2?"#4b6545":"#907b59"; ctx.fillRect((a-Math.floor(a))*256,(b-Math.floor(b))*256,1+(i%3),1+(i%2)); }
  const map = new CanvasTexture(canvas); map.colorSpace=SRGBColorSpace; map.wrapS=map.wrapT=RepeatWrapping; map.repeat.set(30,40);
  // Vertex tint keeps broad hills readable: low grass stays green, exposed
  // steeper slopes shift toward warm soil and occasional grey rock.
  const grassTint = new Color('#647d51'), soilTint = new Color('#857257'), rockTint = new Color('#77766a'), summitTint = new Color('#9b9270');
  function tintGround(geometry: BufferGeometry) {
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    const colors = new Float32Array(positions.count * 3), color = new Color();
    for (let index = 0; index < positions.count; index++) {
      const elevation = positions.getY(index), slope = Math.min(1, Math.max(0, 1 - normals.getY(index)));
      const variation = .92 + .08 * Math.sin(positions.getX(index) * 1.7 + positions.getZ(index) * .83);
      const rock = Math.max(0, Math.min(1, (slope - .28) * 2.7));
      const soil = Math.max(0, Math.min(1, (slope - .08) * 1.8)) * (1 - rock);
      const summit = Math.max(0, Math.min(1, (elevation - 15) / 18));
      color.copy(grassTint).lerp(soilTint, soil).lerp(rockTint, rock).lerp(summitTint, summit).multiplyScalar(variation);
      color.toArray(colors, index * 3);
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  }
  const groundMaterial = new MeshStandardMaterial({ map, roughness: 1, vertexColors: true });
  // Four surfaces leave an actual opening in the earth above Hollowdeep.
  for (const [left, right, bottom, top] of [[-124,28,-190,148],[86,146,-190,148],[28,86,-190,-64],[28,86,-30,148]]) {
    const geometry = new PlaneGeometry(right!-left!, top!-bottom!, Math.ceil((right!-left!)/2), Math.ceil((top!-bottom!)/2));
    const uv = geometry.getAttribute('uv');
    for(let i=0;i<uv.count;i++) uv.setXY(i, (left! + uv.getX(i)*(right!-left!) + 74)/168, (bottom! + uv.getY(i)*(top!-bottom!) + 134)/214);
    const ground = new Mesh(geometry, groundMaterial);
    ground.rotation.x=-Math.PI/2; ground.position.set((left!+right!)/2,-0.06,(bottom!+top!)/2);
    ground.userData.walkableGround = true; terrain.add(ground); conformToTerrain(ground, -.06); geometry.computeVertexNormals(); tintGround(geometry);
  }
  const paving = document.createElement("canvas"); paving.width=paving.height=256;
  const pavingCtx=paving.getContext("2d")!; pavingCtx.fillStyle="#8c8871"; pavingCtx.fillRect(0,0,256,256);
  for(let row=0;row<10;row++) for(let col=-1;col<10;col++) {
    const x=col*30+(row%2)*15, y=row*27;
    pavingCtx.fillStyle=["#aaa38c","#a29e88","#969780","#b4ad94"][(row*3+col+12)%4]!;
    pavingCtx.beginPath(); pavingCtx.roundRect(x+2,y+2,26,23,4); pavingCtx.fill();
  }
  const pavingMap=new CanvasTexture(paving); pavingMap.colorSpace=SRGBColorSpace; pavingMap.wrapS=pavingMap.wrapT=RepeatWrapping; pavingMap.repeat.set(5,4);
  const square=new Mesh(new PlaneGeometry(44,38),new MeshStandardMaterial({map:pavingMap,roughness:1})); square.rotation.x=-Math.PI/2; square.position.set(0,-0.01,-19); terrain.add(square);
  const roadMap=pavingMap.clone(); roadMap.repeat.set(1,7);
  const road=new Mesh(new PlaneGeometry(4.2,52),new MeshStandardMaterial({map:roadMap,color:0xb0b49a,roughness:1})); road.rotation.x=-Math.PI/2; road.position.set(0,0.015,-18); terrain.add(road);
  for (const building of TOWN_BUILDINGS) {
    place(building.model, building.x, building.z, building.height, building.turn*Math.PI/2, terrain, 'height', 0, [building.width,building.depth]);
  }
  // Market fronts open onto a cross street, with room for the three merchants.
  for (const [x,z,rotation] of [[-15.2,-26.2,-Math.PI/2],[15.2,-26.2,Math.PI/2],[-10,-33,0]]) {
    place('MarketStand_1',x!,z!,2.2,rotation!);
    place('Barrel',x!+(x!<0?-.9:.9),z!+.8,.8);
  }
  place('Sword',-14.9,-26.4,1.1,0,terrain,'height',.8);
  place('Crate',15.5,-30.9,.9); place('Crate',16.3,-30.9,.65);
  place('Cart',-18,-34,1.5,Math.PI/2);
  for(const x of [-12,12]) { torch(x,-24.5); torch(x,-34.5); }
  place('Bench_1',-5,-14.4,.75,0); place('Bench_1',-5,-7,.75,Math.PI);
  place('Bell_Tower',-9.5,-1.7,6.7);
  place('MarketStand_1',5.8,-7.1,2.8,Math.PI/2);
  place('Well',-4.7,-11,1.8);
  place('Cart',6.7,-2.1,1.6,-.4);
  place('Barrel',6,-9,.85); place('Crate',6.4,-8.8,.7);
  place('Bench_1',6,-15.8,.75,0); place('Barrel',6.1,-14.6,.85);
  torch(-10.4,-12.4); torch(-5.6,-5.2); torch(4.5,-8.5); torch(innPosition.x+.5,innPosition.z-1.4);
  torch(-3.6,.15,2.7); torch(3.6,.15,2.7);
  // Residents have reused the works' vessels and pipework around their well.
  place("works/Props_Vessel",4.7,-7.45,0.65,0,terrain,"height",0.72);
  place("works/Props_Vessel",5.25,-7.45,0.55,0.3,terrain,"height",0.72);
  place("works/Pipes",-4.7,-11.75,2.1,0,terrain,"width",0.02);
  const coldLight = new PointLight(0x70ddff,0,3,2); coldLight.position.set(4.8,1.3,-7.5); terrain.add(coldLight);
  const homeLight = new PointLight(0xffbb65,0,5,2); homeLight.position.set(innPosition.x+0.5,1.8,innPosition.z); terrain.add(homeLight);
  // The gate's low rock and hedge banks match the game's blocked x>3 strip.
  for(const side of [-1,1]) {
    for(let i=0;i<9;i++) {
      place("nature/Rock_Medium_3",side*(4.3+i*1.9),1.75,2.1+i%2*0.3,i,terrain,"width");
      place("nature/Bush_Common",side*(4.3+i*1.9),2.9,1.45,i);
      place("Fence",side*(4.5+i*1.8),-0.3,1.1,0);
    }
  }
  place("works/Column_1",-3.65,1.7,2.8);
  place("works/Column_1",3.65,1.7,2.8);
  const forestPlace: typeof place = (name, x, z, ...rest) => place(name, x, z + 20, ...rest);
  // The broken road becomes earth before the Watchman's clearing, then winds west of the briars.
  const noise = (seed: number) => { const value=Math.sin(seed*127.1+19.7)*43758.5453; return value-Math.floor(value); };
  const trailCanvas=document.createElement('canvas'); trailCanvas.width=128; trailCanvas.height=1024;
  const trailContext=trailCanvas.getContext('2d')!;
  trailContext.fillStyle='#76684c'; trailContext.fillRect(0,0,128,1024);
  for(let i=0;i<6000;i++) {
    trailContext.fillStyle=i%3===0 ? '#8b7d60' : '#655f48';
    trailContext.fillRect(noise(i)*128,noise(i+8000)*1024,1+noise(i+99)*3,1+noise(i+909)*4);
  }
  const earthTrailCanvas=document.createElement('canvas');earthTrailCanvas.width=128;earthTrailCanvas.height=1024;
  const earthTrailContext=earthTrailCanvas.getContext('2d')!;earthTrailContext.drawImage(trailCanvas,0,0);
  for(let row=0;row<68;row++) for(let col=0;col<6;col++) {
    const seed=row*6+col;
    if(noise(seed+87)>Math.max(.06,.95-row/28)) continue;
    const x=col*20+(row%2)*8+noise(seed+77)*4, y=row*15+2;
    trailContext.fillStyle=['#a9a68b','#989a81','#b3ad92'][seed%3]!;
    trailContext.beginPath(); trailContext.roundRect(x,y,13+noise(seed)*5,9+noise(seed+44)*3,3); trailContext.fill();
  }
  trailContext.globalCompositeOperation='destination-in';
  const fade=trailContext.createLinearGradient(0,0,128,0);
  fade.addColorStop(0,'#ffffff00');fade.addColorStop(.14,'#ffffffff');fade.addColorStop(.86,'#ffffffff');fade.addColorStop(1,'#ffffff00');
  trailContext.fillStyle=fade;trailContext.fillRect(0,0,128,1024);
  earthTrailContext.globalCompositeOperation='destination-in';earthTrailContext.fillStyle=fade;earthTrailContext.fillRect(0,0,128,1024);
  const trailMap=new CanvasTexture(trailCanvas);trailMap.colorSpace=SRGBColorSpace;
  const trailMaterial=new MeshStandardMaterial({map:trailMap,roughness:1,transparent:true,depthWrite:false});
  const earthTrailMap=new CanvasTexture(earthTrailCanvas);earthTrailMap.colorSpace=SRGBColorSpace;
  const earthTrailMaterial=new MeshStandardMaterial({map:earthTrailMap,roughness:1,transparent:true,depthWrite:false});
  function trail(points: readonly (readonly [number,number,number])[], aged = false) {
    const positions:number[]=[],uv:number[]=[],indices:number[]=[];
    let distance=0;
    for(let segment=0;segment<points.length-1;segment++) {
      const from=points[segment]!,to=points[segment+1]!, length=Math.hypot(to[0]-from[0],to[1]-from[1]);
      const steps=Math.ceil(length);
      for(let step=0;step<steps+(segment===points.length-2?1:0);step++) {
        const t=step/steps,x=from[0]+(to[0]-from[0])*t,z=from[1]+(to[1]-from[1])*t;
        const width=from[2]+(to[2]-from[2])*t,along=distance+t*length;
        for(const side of [-1,1]) {
          const ragged=width/2*(1+.1*Math.sin(along*1.9+side*2)+.06*Math.sin(along*4.1));
          const px=x+side*(to[1]-from[1])/length*ragged,pz=z-side*(to[0]-from[0])/length*ragged;
          positions.push(px,terrainHeight(px,pz)+.02,pz); uv.push(side<0?0:1,1-along/(aged?25:70));
        }
      }
      distance+=length;
    }
    for(let row=0;row<positions.length/6-1;row++) {const a=row*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}
    const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    terrain.add(new Mesh(geometry,aged?earthTrailMaterial:trailMaterial));
  }
  trail([[0,6,4.8],[0,14,4.8],[-1.2,23,5],[-3,31,6],[-3.6,37,5],[-3.7,44,4.5],[-1.5,51,4.2],[2,60,5.5],[2,66,5]]);
  trail([[-2,24,3.2],[5,23,3.3],[10,24,3.6],[16,25,4.8]],true);
  trail([[-4,42,2.8],[-10,43,3],[-17,46,4.5]],true);
  const clearingCanvas=document.createElement('canvas');clearingCanvas.width=clearingCanvas.height=256;
  const clearingContext=clearingCanvas.getContext('2d')!;
  clearingContext.fillStyle='#eae7d7';clearingContext.fillRect(0,0,256,256);
  for(let i=0;i<9000;i++) {
    clearingContext.fillStyle=i%3===0?'#d0cbb4':'#f4efd9';
    clearingContext.fillRect(noise(i+311)*256,noise(i+977)*256,1,1);
  }
  const edge=clearingContext.createRadialGradient(128,128,45,128,128,125);
  edge.addColorStop(0,'#ffffffc8');edge.addColorStop(.65,'#ffffff90');edge.addColorStop(1,'#ffffff00');
  clearingContext.globalCompositeOperation='destination-in';
  clearingContext.fillStyle=edge;clearingContext.fillRect(0,0,256,256);
  const clearingMap=new CanvasTexture(clearingCanvas);clearingMap.colorSpace=SRGBColorSpace;
  const earth=new MeshStandardMaterial({map:clearingMap,color:0x796d4f,roughness:1,transparent:true,depthWrite:false});
  const meadow=new MeshStandardMaterial({map:clearingMap,color:0x87995a,roughness:1,transparent:true,depthWrite:false});
  const mulch=new MeshStandardMaterial({map:clearingMap,color:0x434d36,roughness:1,transparent:true,depthWrite:false});
  function clearing(x:number,z:number,width:number,depth:number,material:MeshStandardMaterial) {
    const mesh=new Mesh(new PlaneGeometry(width,depth,Math.ceil(width/2),Math.ceil(depth/2)),material);
    mesh.rotation.x=-Math.PI/2;mesh.position.set(x,0,z);terrain.add(mesh);conformToTerrain(mesh,.005);mesh.geometry.computeVertexNormals();
  }
  clearing(-3,31,21,22,earth);clearing(16,25,28,25,meadow);clearing(-19,47,25,25,earth);
  clearing(-3,49,16,19,earth);clearing(4,61,19,18,earth);
  // Keep patrol spaces and the walk to the engine open. Trees frame the clearings in uneven groups.
  const encounterPatrols: readonly (readonly [number,number])[]=[[-5,30],[-1,34],[-3,30],[14,25],[16,27],[18,25],[16,22],[-17,46],[-20,43],[-22,48],[-18,51]];
  function clearOfPatrols(x:number,z:number,margin=6) {return encounterPatrols.every(([px,pz])=>Math.hypot(x-px,z-pz)>margin);}
  const groves: readonly (readonly [number,number,number])[]=[[-13,14,0],[-14,23,1],[-32,38,2],[-34,54,3],[-21,63,4],[-12,73,5],[14,10,6],[29,34,7],[25,49,8],[24,65,9]];
  for(const [x,z,seed] of groves) {
    clearing(x,z,14,14,mulch);
    for(let tree=0;tree<4;tree++) {
      const angle=tree*2.4+seed, radius=tree===0?0:2.5+noise(seed*12+tree)*3;
      const px=x+Math.cos(angle)*radius,pz=z+Math.sin(angle)*radius;
      if(!clearOfPatrols(px,pz,7))continue;
      const name=(seed+tree)%4===0?'nature/Pine_5':(seed+tree)%4===1?'nature/TwistedTree_2':'nature/CommonTree_2';
      const age = noise(seed * 31 + tree * 7);
      // Most trees stay readable around the player, with occasional saplings
      // and canopy anchors giving the woods a much wider natural age range.
      const height = age < .18 ? 2.7 + age * 2 : age > .86 ? 11.5 + age * 5.5 : 5.2 + age * 5.2;
      place(name,px,pz,height,angle);
      for(let plant=0;plant<3;plant++) {
        const a=angle+plant*2.1;
        place(plant===0?'nature/Bush_Common':'nature/Fern_1',px+Math.cos(a)*1.5,pz+Math.sin(a)*1.5,plant===0?.85:.55,a);
      }
    }
  }
  // A few tall canopy landmarks sit beyond combat clearings and frame the
  // horizon without making the playable lanes feel walled in.
  for (const [x, z, size, rotation] of [[-42, 27, 15.5, .5], [-39, 72, 18, 2.1], [36, 28, 14.5, -1.2], [35, 77, 19, .8]] as const) {
    if (clearOfPatrols(x, z, 8)) place('nature/Pine_5', x, z, size, rotation);
  }
  // Young saplings soften the transition from the open meadow to the mature
  // forest while leaving the center of the field clear.
  for (const [x, z, rotation] of [[-52, 21, .3], [-44, 58, 1.9], [42, 44, -.6], [15, 79, 2.7], [4, 72, .9]] as const) {
    place('nature/CommonTree_2', x, z, 2.8 + noise(x * 3 + z) * 1.5, rotation);
  }
  // Low islands of flowers leave the bee's full patrol and fighting room visible.
  for(const [x,z] of [[9,17],[14,15],[22,18],[25,25],[23,32],[16,34],[8,31]]) {
    for(let flower=0;flower<12;flower++) {
      const angle=flower*2.4,radius=.35+Math.sqrt(flower)*.62;
      const px=x!+Math.cos(angle)*radius,pz=z!+Math.sin(angle)*radius;
      place(flower%3===0?'nature/Flower_4_Group':'nature/Flower_3_Group',px,pz,.45+noise(flower+x!)*.25,angle);
      if(flower%3===0)place('nature/Grass_Common_Short',px+.45,pz-.3,.22,angle);
    }
    place('nature/Fern_1',x!-.7,z!+.7,.6,x!);
  }
  // Rock shelves and gnarled silhouettes identify the western grove; boulders stay beyond its patrol apron.
  for(const [x,z,size] of [[-30,39,3.2],[-29,48,3.6],[-27,57,3.1],[-15,59,2.8],[-9,49,2.7],[-12,38,2.4]]) {
    place('nature/Rock_Medium_3',x!,z!,size!,x!,terrain,'width');
    place('nature/Rock_Medium_3',x!+1.6,z!+.8,size!*.45,z!,terrain,'width');
    for(let plant=0;plant<5;plant++) {
      const angle=plant*1.8;
      place(plant%2?'nature/Fern_1':'nature/Mushroom_Common',x!+Math.cos(angle)*2,z!+Math.sin(angle)*2,plant%2?.65:.24,angle);
    }
  }
  // Small outcrop accents use the authored rock mesh at restrained scales;
  // scale and rotation variation keeps the shelves from reading as repeats.
  for (const [x, z, size, rotation] of [
    [-36, 31, 1.15, .4], [-34, 35, .75, 1.2], [-32, 61, 1.35, 2.4],
    [-18, 67, .8, -.8], [28, 34, 1.05, 1.7], [31, 54, .7, -.2], [25, 72, 1.25, 2.1],
  ] as const) place('nature/Rock_Medium_3', x, z, size, rotation, terrain, 'width');
  for (const [x, z, size, rotation] of [
    [-38, 47, 1.3, .7], [-33, 67, .85, 2.2], [-17, 73, 1.15, -.3], [30, 42, .95, 1.4], [27, 65, 1.4, -.9],
  ] as const) place('nature/Rock_Medium_1', x, z, size, rotation, terrain, 'width');
  // Old survey machines have become landmarks in the reclaimed woods. They are
  // set beside clearings and deliberately lean at different angles.
  for (const [x, z, size, rotation, tilt] of [
    [-35, 46, 2.25, .35, -.14], [-20, 71, 1.9, 2.4, .09], [31, 59, 2.05, -1.1, -.1],
  ] as const) place('reclaimed/Robot', x, z, size, rotation, terrain, 'height', 0, undefined, tilt, .06 * Math.sin(x));
  // Scrap piles reuse the existing authored industrial props and stay outside
  // encounter pads, reading as ruins being reclaimed by the surrounding growth.
  for (const [x, z, rotation] of [[-37, 44, .2], [-18, 69, 1.8], [29, 57, -.7]] as const) {
    place('works/Props_Capsule', x, z, 1.5, rotation);
    place('works/Details_Pipes_Long', x + .9, z + .4, .9, rotation + .7);
    place('works/Props_Vessel', x - .7, z + .6, .5, rotation - .4);
  }
  place('nature/TwistedTree_2',-30,54,6.4,1.1);
  place('nature/DeadTree_2',-14,59,4.8,2.4);
  // Windfall and snapped trunks break up the otherwise uniform northern woods.
  // Their clearings sit outside patrol aprons, so the new silhouettes never hide
  // a combatant or block the approach routes.
  for (const [x, z, size, rotation] of [
    [-25, 30, 4.8, .35], [-27, 51, 5.4, 2.1], [26, 41, 4.6, 1.3], [21, 59, 5.2, -.6],
  ] as const) fallenTree(x, z, size, rotation);
  for (const [x, z, size, rotation] of [
    [-24, 28, 4.2, .2], [-29, 43, 5.1, 1.8], [27, 46, 4.7, -.4], [19, 68, 5.3, 2.6],
  ] as const) {
    place('nature/DeadTree_2', x, z, size, rotation);
    // A short companion stump gives the broken trunk a readable base.
    place('nature/DeadTree_2', x + Math.cos(rotation) * .9, z + Math.sin(rotation) * .9, 1.35, rotation + .5);
  }
  // Small plant drifts soften the road without becoming rows or hiding attack warnings.
  for(const [x,z] of [[-6,12],[6,16],[-8,22],[7,34],[-8,37],[-7,52],[8,55],[-5,63]]) {
    for(let plant=0;plant<7;plant++) {
      const angle=plant*2.4, radius=Math.sqrt(plant)*.6;
      const px=x!+Math.cos(angle)*radius,pz=z!+Math.sin(angle)*radius;
      if(!clearOfPatrols(px,pz,5)) continue;
      place(plant%3===0?'nature/Fern_1':'nature/Grass_Common_Short',px,pz,plant%3===0?.45:.2,angle);
    }
  }
  // Woodland floor cover is clustered around edges rather than painted across
  // roads and combat pads.
  for (const [x, z, seed] of [[-19,18,2],[-23,25,4],[-35,42,7],[-25,67,9],[20,37,12],[29,45,15],[24,63,18]] as const) {
    for (let plant = 0; plant < 9; plant++) {
      const angle = plant * 2.399 + seed;
      const radius = .45 + Math.sqrt(plant) * .52;
      const px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius;
      if (!clearOfPatrols(px, pz, 6)) continue;
      place(plant % 4 === 0 ? 'nature/Fern_1' : 'nature/Grass_Common_Short', px, pz,
        plant % 4 === 0 ? .48 + noise(seed + plant) * .15 : .17 + noise(seed * 3 + plant) * .1, angle);
    }
  }
  // More visible meadow grass in the southern field; the lake at (-4,-98) is
  // well south of this band, and the edge keeps its approach lanes open.
  for (const [x, z, seed] of [[-48,-57,21],[-31,-68,24],[22,-61,27],[38,-78,31],[-54,-83,36],[30,-91,40]] as const) {
    for (let tuft = 0; tuft < 11; tuft++) {
      const angle = seed * .37 + tuft * 2.17, radius = .5 + Math.sqrt(tuft) * .72;
      const px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius;
      if (Math.hypot(px + 4, pz + 98) < 16 || Math.abs(px) < 4 && pz > -96 && pz < -50) continue;
      place(tuft % 5 === 0 ? 'nature/Fern_1' : 'nature/Grass_Common_Short', px, pz,
        tuft % 5 === 0 ? .55 : .22 + noise(seed + tuft) * .12, angle);
    }
  }
  // This briar island is the existing solid boundary; useful old machinery sits within it.
  forestPlace('works/Props_Capsule',7.8,21,3.8,0,thicket);
  forestPlace('works/Details_Pipes_Long',6.5,21,2.8,0,thicket);
  place('nature/CommonTree_2',10,41,7.2,2,thicket);
  for(let row=0;row<4;row++) for(let col=0;col<7;col++) {
    const x=2.8+col*1.5+Math.sin(col*8+row)*.2,z=18.45+row*1.65+Math.sin(col*3+row)*.2;
    forestPlace('nature/Bush_Common',x,z,1.1+(col%3)*.12,col,thicket);
  }
  for(const [x,z] of [[-9,64],[10,62],[13,71],[-9,72]])place('nature/TwistedTree_2',x!,z!,4.6,x!);
  const apron = new Mesh(new PlaneGeometry(12,11),new MeshStandardMaterial({color:0x797565,roughness:1}));
  apron.rotation.x=-Math.PI/2; apron.position.set(2,0.025,61); terrain.add(apron);
  forestPlace("works/Props_Base",2,40,4.8,0,terrain,"width",-0.18);
  forestPlace("works/Props_Capsule",2,47.5,6.1,0);
  forestPlace("works/Column_1",-2.5,47.3,5.4);
  forestPlace("works/Column_1",6.5,47.3,5.4);
  forestPlace("works/Pipes",2,47.3,9,0,terrain,"width",3.9);
  forestPlace("works/Details_Pipes_Long",-2.45,47.05,3.7);
  forestPlace("works/Details_Pipes_Long",6.45,47.05,3.7);
  // A broad grassy meadow stays open between the village and the eastern trail.
  function path(x: number, z: number, width: number, length: number, rotation = 0) {
    const mesh = new Mesh(new PlaneGeometry(width, length, Math.ceil(width), Math.ceil(length)), new MeshStandardMaterial({ color: 0x827952, roughness: 1 }));
    mesh.rotation.set(-Math.PI / 2, 0, rotation); mesh.position.set(x, 0.008, z); terrain.add(mesh); conformToTerrain(mesh, .008); mesh.geometry.computeVertexNormals();
  }
  // The southern trail bends east around the lake instead of drawing a road
  // straight through the water, with an irregular worn edge at each leg.
  path(0, -58, 3.4, 66);
  path(8, -94, 3.4, 18, .18);
  path(13, -113, 3.4, 24, -.08);
  for (const [x, z, scale, rotation] of [[-3.1,-42,.24,.2],[3.2,-52,.3,1.1],[-3.4,-67,.22,2.4],[3.1,-78,.28,-.4],[4.7,-87,.24,1.7],[11,-105,.3,.6],[14.8,-119,.25,2.1]] as const) {
    place('nature/Grass_Common_Short', x, z, scale, rotation);
  }
  path(14, -46, 28, 3.4);
  const lakeWater = new Mesh(new CircleGeometry(1, 64), new MeshStandardMaterial({ color: 0x2c9bb0, emissive: 0x073a46, emissiveIntensity: 0.35, transparent: true, opacity: 0.78, roughness: 0.18, metalness: 0.05, depthWrite: false }));
  const lakeVertices = lakeWater.geometry.getAttribute('position');
  for (let index = 1; index < lakeVertices.count; index++) {
    const angle = Math.atan2(-lakeVertices.getY(index), lakeVertices.getX(index));
    lakeVertices.setXY(index, lakeVertices.getX(index) * (1 + 0.11 * Math.sin(angle * 3 + 0.7) - 0.06 * Math.cos(angle * 2 - 0.4)), lakeVertices.getY(index) * (1 + 0.11 * Math.sin(angle * 3 + 0.7) - 0.06 * Math.cos(angle * 2 - 0.4)));
  }
  lakeVertices.needsUpdate = true;
  lakeWater.rotation.x = -Math.PI / 2;
  lakeWater.position.set(LAKE_CENTER.x, LAKE_WATER_LEVEL, LAKE_CENTER.z);
  lakeWater.scale.set(LAKE_RADIUS.x, LAKE_RADIUS.z, 1);
  lakeWater.renderOrder = 1;
  lakeWater.userData.lakeWater = true;
  terrain.add(lakeWater);
  const lakeShore = new Mesh(new RingGeometry(0.96, 1.02, 64), new MeshBasicMaterial({ color: 0x9fc276, transparent: true, opacity: 0.58, side: 2, depthWrite: false }));
  const shoreVertices = lakeShore.geometry.getAttribute('position');
  for (let index = 0; index < shoreVertices.count; index++) {
    const angle = Math.atan2(-shoreVertices.getY(index), shoreVertices.getX(index));
    const factor = 1 + 0.11 * Math.sin(angle * 3 + 0.7) - 0.06 * Math.cos(angle * 2 - 0.4);
    shoreVertices.setXY(index, shoreVertices.getX(index) * factor, shoreVertices.getY(index) * factor);
  }
  shoreVertices.needsUpdate = true;
  lakeShore.rotation.x = -Math.PI / 2;
  lakeShore.position.set(LAKE_CENTER.x, LAKE_WATER_LEVEL + 0.012, LAKE_CENTER.z);
  lakeShore.scale.set(LAKE_RADIUS.x, LAKE_RADIUS.z, 1);
  lakeShore.renderOrder = 2;
  terrain.add(lakeShore);
  for (const side of [-1, 1]) for (let i = 0; i < 12; i++) {
    const x = side < 0 ? -66 : 25, z = -29 - i * 8;
    if (side > 0 && z > -53 && z < -39) continue;
    place(i % 3 ? "nature/Pine_5" : "nature/CommonTree_2", x, z, 4.8 + i % 3, i);
    if (i % 2 === 0) place("nature/Rock_Medium_3", x + (side < 0 ? 2 : -2), z + 1, 1.1, i);
  }
  for (let i = 0; i < 12; i++) place("nature/CommonTree_2", -64 + i * 8, -128, 5.5, i);
  for (const [x, z] of [[-58,-38],[-60,-89],[19,-108],[20,-31]]) {
    place("nature/Grass_Common_Short", x!, z!, 0.35);
    place("nature/Fern_1", x! + 0.7, z! + 0.5, 0.55);
  }
  place('Fence',-4,-39,1.1); place('Fence',4,-39,1.1);
  torch(-3.5,-39,2.4); torch(3.5,-39,2.4);
  await Promise.all(jobs);
  terrain.traverse(object => { if (object instanceof Mesh) object.receiveShadow = true; });
  const inverse = new Matrix4(), matrix = new Matrix4();
  for (const { parent, meshes } of batches.values()) {
    if (meshes.length < 2) continue;
    const source = meshes[0]!;
    const instances = new InstancedMesh(source.geometry, source.material, meshes.length);
    instances.castShadow = source.castShadow;
    instances.receiveShadow = source.receiveShadow;
    inverse.copy(parent.matrixWorld).invert();
    for (const [index, mesh] of meshes.entries()) {
      instances.setMatrixAt(index, matrix.multiplyMatrices(inverse, mesh.matrixWorld));
      mesh.removeFromParent();
    }
    // Spatial cells retain useful frustum culling without changing the authored art.
    instances.computeBoundingSphere();
    parent.add(instances);
  }
  return (coolingRestored, shiftEnded, player, camera, aimHeight = 1.1) => {
    lakeWater.material.opacity = 0.74 + Math.sin(performance.now() * 0.0012) * 0.035;
    sightline.origin.set(player.x, player.y + aimHeight, player.z);
    cameraDirection.subVectors(camera, sightline.origin);
    const cameraDistance = cameraDirection.length();
    sightline.direction.copy(cameraDirection).normalize();
    let nearest = cameraDistance;
    for (const occluder of occluders) {
      const hit = sightline.intersectBox(occluder.bounds, intersection);
      if (hit) {
        const hitDistance = sightline.origin.distanceTo(hit);
        nearest = Math.min(nearest, hitDistance - Math.min(.6, hitDistance * .2));
      }
    }
    resolvedCameraDistance = Number.isFinite(resolvedCameraDistance)
      ? Math.min(nearest, resolvedCameraDistance + (nearest - resolvedCameraDistance) * .18)
      : nearest;
    if (resolvedCameraDistance < cameraDistance) camera.copy(sightline.origin).addScaledVector(sightline.direction, resolvedCameraDistance);
    for (const material of coolingMaterials) {
      material.emissive.setHex(coolingRestored ? 0x55d9fa : 0x000000);
      material.emissiveIntensity = coolingRestored ? 1.1 : 0;
    }
    coldLight.intensity = coolingRestored ? 3 : 0;
    homeLight.intensity = shiftEnded ? 7 : 0;
  };
}
