import { buildTownPerimeter } from './town-perimeter.js';
import { terrainHeight } from '../game/cave-layout.js';
import { lakeWaterAt, streamAt } from '../game/world-elevation.js';
import { TOWN_BOUNDS } from '../game/world-layout.js';
import { buildWorldWater } from './world-water.js';
import { worldHorizonGeometry } from './world-horizon.js';
import { buildExpansionTerrain } from './expansion-terrain.js';
import { buildRegionalFoliage } from './regional-foliage.js';
import { buildWorldDebris } from './world-debris.js';
import { buildSecondDarkAge, weatherExistingTown } from './second-dark-age.js';
import { REGION_BUILDINGS, WORLD_REGIONS, regionAt } from '../game/world-regions.js';
import { buildLakeShore } from './lake-shore.js';
import { buildRobotRuins } from './robot-ruins.js';
import { buildRuinedSettlements } from './ruined-settlements.js';
import { conformToTerrain } from './terrain-geometry.js';
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, InstancedMesh, Matrix4, PlaneGeometry, MeshStandardMaterial, CanvasTexture, RepeatWrapping, SRGBColorSpace, PointLight, Box3, Vector3, Ray, Color } from "three";
import type { Position } from "../game/adventure-types.js";
import { TOWN_BUILDINGS } from "../game/town-layout.js";
import { prop } from "./frostwood-assets.js";
import { createRuinedGroundMaterial } from "./ground-material.js";
import { treePaletteMaterial, type TreePalette } from './tree-palette.js';
import { groundTree } from './tree-grounding.js';

export async function buildFrostwood(terrain: Group, thicket: Group, innPosition: { readonly x: number; readonly z: number }, onSign?: (root: Group, id: string, name: string) => void): Promise<(coolingRestored: boolean, shiftEnded: boolean, player: Position, camera: Vector3, aimHeight?: number, wallTimeMillis?: number) => void> {
  const jobs: Promise<void>[] = [];
  const coolingMaterials: MeshStandardMaterial[] = [];
  const batches = new Map<string, { parent: Group; meshes: Mesh[] }>();
  const occluders: { root: Group; bounds: Box3 }[] = [];
  const sightline = new Ray(), cameraDirection = new Vector3(), intersection = new Vector3();
  let resolvedCameraDistance = Number.POSITIVE_INFINITY;
  function place(name: string, x: number, z: number, size: number, rotation = 0, parent = terrain, axis: "height" | "width" = "height", y = 0, footprint?: readonly [number, number], tilt = 0, lean = 0, palette?: TreePalette) {
    jobs.push(prop(name, size, axis).then(model => {
      model.position.set(x, terrainHeight(x,z) + y, z); model.rotation.set(tilt, rotation, lean);
      if (footprint) {
        model.userData.townBuilding = true;
        const bounds = new Box3().setFromObject(model).getSize(new Vector3());
        const sideways = Math.abs(Math.sin(rotation)) > 0.5;
        model.scale.x *= footprint[sideways ? 1 : 0] / bounds[sideways ? "z" : "x"];
        model.scale.z *= footprint[sideways ? 0 : 1] / bounds[sideways ? "x" : "z"];
      }
      if (palette) model.traverse(object => {
        if (!(object instanceof Mesh)) return;
        object.material = Array.isArray(object.material)
          ? object.material.map(material => treePaletteMaterial(material, palette))
          : treePaletteMaterial(object.material, palette);
      });
      parent.add(model);
      if (name === 'nature/Grass_Common_Short') model.traverse(object => {
        if (object instanceof Mesh) object.castShadow = false;
      });
      const tree = name.includes('Tree_') || name.startsWith('nature/Pine_');
      if (tree && Math.abs(tilt) < Math.PI / 4) groundTree(model, x, z, (px, pz) => terrainHeight(px, pz) - .06 + y);
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
      if (footprint || tree) {
        const bounds = new Box3().setFromObject(model).expandByScalar(.5);
        occluders.push({ root: model, bounds });
      }
      if (!footprint) model.traverse(object => {
        if (!(object instanceof Mesh)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        // Keep transparent sorting and independently changing surfaces intact.
        if (materials.some(material => material.transparent || coolingMaterials.includes(material))) return;
        // Low cover shares wider cells to amortize dense drifts; tall scenery
        // keeps its finer culling boundary.
        const cellSize = name === 'nature/Grass_Common_Short' || name === 'nature/Fern_1' ? 24 : 12;
        const key = [parent.id, cellSize, Math.floor(x / cellSize), Math.floor(z / cellSize), object.geometry.uuid, ...materials.map(material => material.uuid)].join(":");
        let batch = batches.get(key);
        if (!batch) { batch = { parent, meshes: [] }; batches.set(key, batch); }
        batch.meshes.push(object);
      });
      // Scenery never moves; actors and effects retain their animated transforms.
      model.traverse(object => { object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = false; });
    }));
  }
  function tree(name: string, x: number, z: number, height: number, rotation: number, palette: TreePalette, lean = 0) {
    place(name, x, z, height, rotation, terrain, 'height', 0, undefined, 0, lean, palette);
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
  const groundMaterial = createRuinedGroundMaterial();
  // Broad vertex colour still follows slopes, while the material supplies the
  // small-scale grass, soil and litter detail.
  const grassTint = new Color('#b0b69a'), soilTint = new Color('#8e7962'), rockTint = new Color('#a0a39b'), summitTint = new Color('#9a958b');
  const regionTints = new Map(WORLD_REGIONS.map(region => [region.id, new Color(region.color)]));
  function tintGround(ground: Mesh) {
    const geometry = ground.geometry; ground.updateMatrixWorld();
    const world = new Vector3(), normal = new Vector3();
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    const colors = new Float32Array(positions.count * 3), color = new Color();
    for (let index = 0; index < positions.count; index++) {
      world.fromBufferAttribute(positions, index).applyMatrix4(ground.matrixWorld);
      normal.fromBufferAttribute(normals, index).transformDirection(ground.matrixWorld);
      const elevation = world.y, slope = Math.min(1, Math.max(0, 1 - normal.y));
      const variation = .84 + .16 * Math.sin(world.x * .11 + Math.sin(world.z * .14) * 2);
      const rock = Math.max(0, Math.min(1, (slope - .28) * 2.7));
      const soil = Math.max(0, Math.min(1, (slope - .08) * 1.8)) * (1 - rock);
      const summit = Math.max(0, Math.min(1, (elevation - 15) / 18));
      color.copy(grassTint).lerp(soilTint, soil).lerp(rockTint, rock).lerp(summitTint, summit).multiplyScalar(variation);
      const outside = Math.hypot(Math.max(-70-world.x,0,world.x-90),Math.max(-130-world.z,0,world.z-76));
      if (outside > 0) color.lerp(regionTints.get(regionAt(world.x,world.z).id)!, Math.min(1,outside/28)*.4);
      color.toArray(colors, index * 3);
    }
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  }
  // Four surfaces leave an actual opening in the earth above Hollowdeep. The
  // southern panel is split around the lake and stream so the rendered ground
  // follows their carved floor at sub-metre resolution instead of bridging
  // the channel with the old two-metre triangles.
  const makeGroundSurface = (left: number, right: number, bottom: number, top: number, sample: number) => {
    const geometry = new PlaneGeometry(right-left, top-bottom, Math.ceil((right-left)/sample), Math.ceil((top-bottom)/sample));
    const uv = geometry.getAttribute('uv');
    for(let i=0;i<uv.count;i++) uv.setXY(i, (left + uv.getX(i)*(right-left) + 74)/168, (bottom + uv.getY(i)*(top-bottom) + 134)/214);
    const ground = new Mesh(geometry, groundMaterial);
    ground.rotation.x=-Math.PI/2; ground.position.set((left+right)/2,-0.06,(bottom+top)/2);
    ground.userData.walkableGround = true; terrain.add(ground); conformToTerrain(ground, -.06);
    if (sample < 2) {
      const position = geometry.getAttribute('position');
      for (let i=0;i<position.count;i++) {
        const x=position.getX(i)+(left+right)/2,z=-position.getY(i)+(bottom+top)/2;
        let height: number | undefined;
        if (Math.abs(x+72)<.001 || Math.abs(x-18)<.001) {
          const a=-190+Math.floor((z+190)/2)*2,t=(z-a)/2;
          height=terrainHeight(x,a)*(1-t)+terrainHeight(x,a+2)*t;
        } else if (Math.abs(z+132)<.001 || Math.abs(z+56)<.001) {
          const a=-72+Math.floor((x+72)/2)*2,t=(x-a)/2;
          height=terrainHeight(a,z)*(1-t)+terrainHeight(a+2,z)*t;
        }
        if(height!==undefined)position.setZ(i,height);
      }
    }
    geometry.computeVertexNormals(); tintGround(ground);
  };
  const makeStreamSurface = (left: number, right: number, bottom: number, top: number) => {
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    const fine = .125, columns = Math.round((right - left) / fine), rows = Math.round((top - bottom) / fine);
    const vertices = new Map<string, number>();
    const coarseEdge = (x: number, z: number) => {
      const coarse = Math.abs(x-left)<.001 ? 2 : .75;
      if (Math.abs(x - left) < .001 || Math.abs(x - right) < .001) {
        const z0 = bottom + Math.floor((z - bottom) / coarse) * coarse, z1 = Math.min(top, z0 + coarse), t = (z - z0) / Math.max(.001, z1 - z0);
        return terrainHeight(x, z0) * (1 - t) + terrainHeight(x, z1) * t;
      }
      const step=(right-left)/Math.ceil((right-left)/.75);
      const x0 = left + Math.floor((x - left) / step) * step, x1 = Math.min(right, x0 + step), t = (x - x0) / Math.max(.001, x1 - x0);
      return terrainHeight(x0, z) * (1 - t) + terrainHeight(x1, z) * t;
    };
    const vertex = (ix: number, iz: number) => {
      const x = left + ix * fine, z = bottom + iz * fine, key = `${ix}:${iz}`;
      const existing = vertices.get(key); if (existing !== undefined) return existing;
      const boundary = ix === 0 || ix === columns || iz === 0 || iz === rows;
      const y = (boundary ? coarseEdge(x, z) : terrainHeight(x, z)) - .06;
      const index = positions.length / 3; vertices.set(key, index); positions.push(x, y, z); uvs.push((x + 74) / 168, (z + 134) / 214); return index;
    };
    for (let ix = 0; ix < columns; ix++) for (let iz = 0; iz < rows; iz++) {
      const a = vertex(ix, iz), b = vertex(ix + 1, iz), c = vertex(ix, iz + 1), d = vertex(ix + 1, iz + 1);
      indices.push(a, c, b, b, c, d);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
    const ground = new Mesh(geometry, groundMaterial); ground.userData.walkableGround = true; terrain.add(ground);
    geometry.computeVertexNormals(); tintGround(ground);
  };
  const lakeRefined = [-72, 18, -132, -56] as const;
  const streamRefined = [-72, -20, -100, -58] as const;
  for (const [left, right, bottom, top, sample] of [
    [-124, -72, -190, 148, 2], [-72, 18, -190, -132, 2], [-72, 18, -56, 148, 2], [18, 28, -190, 148, 2],
    [lakeRefined[0], streamRefined[1], lakeRefined[2], streamRefined[2], .75],
    [streamRefined[1], lakeRefined[1], lakeRefined[2], streamRefined[2], .75],
    [lakeRefined[0], streamRefined[1], streamRefined[3], lakeRefined[3], .75],
    [streamRefined[1], lakeRefined[1], streamRefined[3], lakeRefined[3], .75],
    [streamRefined[1], lakeRefined[1], streamRefined[2], streamRefined[3], .75],
  ] as const) { makeGroundSurface(left, right, bottom, top, sample); await new Promise<void>(resolve=>setTimeout(resolve,0)); }
  makeStreamSurface(streamRefined[0], streamRefined[1], streamRefined[2], streamRefined[3]);
  await new Promise<void>(resolve=>setTimeout(resolve,0));
  for (const [left, right, bottom, top] of [[86,146,-190,148],[28,86,-190,-64],[28,86,-30,148]] as const) { makeGroundSurface(left, right, bottom, top, 2); await new Promise<void>(resolve=>setTimeout(resolve,0)); }
  await buildExpansionTerrain(terrain, groundMaterial, tintGround);
  const horizon = new Mesh(worldHorizonGeometry(), groundMaterial);
  horizon.name = 'world-horizon'; terrain.add(horizon); tintGround(horizon);
  const paving = document.createElement("canvas"); paving.width=paving.height=1024;
  const pavingCtx=paving.getContext("2d")!;
  let pavingSeed=1729;
  const pavingRandom=()=>((pavingSeed=(pavingSeed*1664525+1013904223)>>>0)/4294967296);
  pavingCtx.fillStyle="#383b30"; pavingCtx.fillRect(0,0,1024,1024);
  for(let row=0;row<49;row++) for(let col=-1;col<47;col++) {
    const x=col*23+(row%2)*11.5, y=row*21;
    if(pavingRandom()<.13)continue;
    const shade=67+Math.floor(pavingRandom()*26),corner=2+pavingRandom()*4;
    pavingCtx.fillStyle=`rgb(${shade+4} ${shade+3} ${shade-4})`;
    pavingCtx.beginPath();pavingCtx.moveTo(x+corner,y+2);pavingCtx.lineTo(x+19,y+1+pavingRandom()*3);
    pavingCtx.lineTo(x+21,y+16);pavingCtx.lineTo(x+16,y+19);pavingCtx.lineTo(x+2,y+18);pavingCtx.lineTo(x+1,y+6);pavingCtx.closePath();pavingCtx.fill();
    pavingCtx.strokeStyle='#a5a18b24';pavingCtx.lineWidth=.8;pavingCtx.stroke();
    if(pavingRandom()<.25){pavingCtx.strokeStyle='#292c27b0';pavingCtx.beginPath();pavingCtx.moveTo(x+5,y+1);pavingCtx.lineTo(x+10,y+8);pavingCtx.lineTo(x+7,y+13);pavingCtx.lineTo(x+12,y+19);pavingCtx.stroke();}
  }
  for(let i=0;i<120;i++){
    const x=pavingRandom()*1024,y=pavingRandom()*1024,r=12+pavingRandom()*74;
    const grime=pavingCtx.createRadialGradient(x,y,0,x,y,r);
    grime.addColorStop(0,i%3===0?'#303c28a0':'#282c2785');grime.addColorStop(1,'#30362900');
    pavingCtx.fillStyle=grime;pavingCtx.fillRect(x-r,y-r,r*2,r*2);
  }
  for(let i=0;i<42000;i++){
    pavingCtx.fillStyle=i%3===0?'#afb0a015':'#171e1b25';
    pavingCtx.fillRect(pavingRandom()*1024,pavingRandom()*1024,1+pavingRandom()*2,1);
  }
  const pavingMap=new CanvasTexture(paving); pavingMap.colorSpace=SRGBColorSpace; pavingMap.wrapS=pavingMap.wrapT=RepeatWrapping;pavingMap.anisotropy=4;
  const square=new Mesh(new PlaneGeometry(44,38,22,19),new MeshStandardMaterial({map:pavingMap,roughness:1})); square.name='Worn yard paving';square.rotation.x=-Math.PI/2; square.position.set(0,-0.01,-19); terrain.add(square); conformToTerrain(square, -.01); square.geometry.computeVertexNormals();
  const roadMap=pavingMap.clone(); roadMap.repeat.set(4.2/44,52/38);
  const road=new Mesh(new PlaneGeometry(4.2,52,2,52),new MeshStandardMaterial({map:roadMap,color:0xaaa99b,roughness:1})); road.rotation.x=-Math.PI/2; road.position.set(0,0.015,-18); terrain.add(road); conformToTerrain(road, .015); road.geometry.computeVertexNormals();
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
  torch(-4.4,.15,2.7); torch(4.4,.15,2.7);
  // Residents have reused the works' vessels and pipework around their well.
  place("works/Props_Vessel",4.7,-7.45,0.65,0,terrain,"height",0.72);
  place("works/Props_Vessel",5.25,-7.45,0.55,0.3,terrain,"height",0.72);
  place("works/Pipes",-4.7,-11.75,2.1,0,terrain,"width",0.02);
  const coldLight = new PointLight(0x70ddff,0,3,2); coldLight.position.set(4.8,terrainHeight(4.8,-7.5)+1.3,-7.5); terrain.add(coldLight);
  const homeLight = new PointLight(0xffbb65,0,5,2); homeLight.position.set(innPosition.x+0.5,terrainHeight(innPosition.x+0.5,innPosition.z)+1.8,innPosition.z); terrain.add(homeLight);
  buildTownPerimeter((x,z,length,rotation) => place('Fence',x,z,length,rotation,terrain,'width'));
  for (const z of [0,-40]) for (const x of [-4.4,4.4]) place('works/Column_1',x,z,2.5);
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
  const trailFootprints: (readonly (readonly [number, number, number])[])[] = [];
  function trail(points: readonly (readonly [number,number,number])[], aged = false) {
    trailFootprints.push(points);
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
    const count = [2, 6, 3, 7, 2, 5, 2, 6, 3, 5][seed]!;
    for(let member=0;member<count;member++) {
      const angle=member*2.4+seed, radius=member===0?0:1.8+noise(seed*12+member)*4.4;
      const px=x+Math.cos(angle)*radius,pz=z+Math.sin(angle)*radius;
      if(!clearOfPatrols(px,pz,7))continue;
      const age = noise(seed * 31 + member * 7);
      const name = age < .23 ? 'nature/DeadTree_2' : (seed+member)%3===0 ? 'nature/Pine_5' : (seed+member)%3===1 ? 'nature/TwistedTree_2' : 'nature/CommonTree_2';
      const height = age < .28 ? 1.6 + age * 9 : age > .8 ? 12 + (age-.8) * 30 : 4 + (age-.28) * 10;
      const palette = (['moss', 'ochre', 'copper', 'ash', 'blue'] as const)[(seed + member * 2) % 5]!;
      tree(name,px,pz,height,angle,palette,(noise(seed+member+911)-.5)*.13);
      for(let plant=0;plant<3;plant++) {
        const a=angle+plant*2.1;
        place(plant===0?'nature/Bush_Common':'nature/Fern_1',px+Math.cos(a)*1.5,pz+Math.sin(a)*1.5,plant===0?.85:.55,a);
      }
    }
  }
  // A few tall canopy landmarks sit beyond combat clearings and frame the
  // horizon without making the playable lanes feel walled in.
  for (const [name, x, z, size, rotation, palette] of [
    ['nature/CommonTree_2', -43, 26, 27, .5, 'copper'],
    ['nature/Pine_5', -39, 75, 30, 2.1, 'blue'],
    ['nature/TwistedTree_2', 39, 51, 23, -1.2, 'ochre'],
  ] as const) {
    if (clearOfPatrols(x, z, 12)) tree(name, x, z, size, rotation, palette);
  }
  // Young saplings soften the transition from the open meadow to the mature
  // forest while leaving the center of the field clear.
  for (const [x, z, rotation] of [[-52, 21, .3], [-44, 58, 1.9], [42, 44, -.6], [15, 79, 2.7], [4, 72, .9]] as const) {
    tree('nature/CommonTree_2', x, z, 1.6 + noise(x * 3 + z) * 1.6, rotation, 'moss');
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
  trail([[0,-28,3.4],[0,-55,3.2],[1,-77,2.8],[12,-89,2.6],[16,-104,2.3],[14,-124,2.4]],true);
  trail([[0,-46,3.4],[9,-45,3],[21,-46,3.2],[28,-46,3.4]],true);
  for(let i=0;i<95;i++){
    const x=-23+noise(i+9221)*43,z=-118+noise(i+8132)*39;
    const shore=Math.hypot((x+4)/17,(z+98)/14);
    if(shore<.95||shore>1.35||x>10||Math.abs(x)<2&&z> -86)continue;
    place(i%3?'nature/Grass_Common_Short':'nature/Fern_1',x,z,.22+noise(i+522)*.4,noise(i+612)*6.28);
  }
  const updateWater = buildWorldWater(terrain);
  jobs.push(buildLakeShore(terrain));
  jobs.push(buildRobotRuins(terrain), buildRuinedSettlements(terrain), buildWorldDebris(terrain));
  for(const [cx,cz,seed] of [[-10,-64,29],[13,-76,87],[-34,-102,14],[8,-116,99],[-31,-55,54],[18,-109,42]]) {
    for(let i=0;i<15;i++) {
      const a=noise(seed!+i*13)*Math.PI*2,r=Math.sqrt(noise(seed!+i*29))*6;
      const x=cx!+Math.cos(a)*r,z=cz!+Math.sin(a)*r;
      place(i%4===0?'nature/Rock_Medium_1':'nature/Grass_Common_Short',x,z,.10+noise(seed!+i*9)*.22,a);
    }
  }
  // Dense, uneven copses alternate with long empty stretches around the field;
  // the lakeshore, eastern cave approach, and central footpath stay open.
  for (const [cx, cz, count, seed, palette] of [
    [-66, -39, 3, 380, 'ochre'], [-62, -76, 8, 420, 'copper'],
    [-69, -116, 5, 460, 'ash'], [34, -67, 6, 920, 'blue'],
    [33, -116, 3, 950, 'ochre'], [-41, -133, 7, 990, 'moss'],
    [-9, -135, 3, 1020, 'copper'],
  ] as const) {
    for (let i = 0; i < count; i++) {
      const angle = noise(seed + i * 13) * Math.PI * 2;
      const radius = i === 0 ? 0 : 1.8 + noise(seed + i * 29) * 5;
      const x = cx + Math.cos(angle) * radius, z = cz + Math.sin(angle) * radius;
      const age = noise(seed + i * 7);
      const name = i % 5 === 1 ? 'nature/DeadTree_2' : i % 3 === 0 ? 'nature/Pine_5' : i % 3 === 1 ? 'nature/TwistedTree_2' : 'nature/CommonTree_2';
      const height = i % 4 === 0 ? 11 + age * 7 : i % 4 === 1 ? 4 + age * 8 : 1.8 + age * 4;
      tree(name, x, z, height, angle, i % 4 === 2 ? 'ochre' : palette, (age-.5)*.16);
    }
  }
  for (const [name, x, z, height, rotation, palette] of [
    ['nature/CommonTree_2', -57, -70, 26, .7, 'copper'],
    ['nature/Pine_5', 37, -82, 30, 2.1, 'blue'],
    ['nature/TwistedTree_2', -37, -135, 23, -.6, 'ochre'],
    ['nature/DeadTree_2', -64, -112, 19, 1.8, 'ash'],
  ] as const) tree(name, x, z, height, rotation, palette);
  for (const [x, z] of [[-58,-38],[-60,-89],[19,-108],[20,-31]]) {
    place("nature/Grass_Common_Short", x!, z!, 0.35);
    place("nature/Fern_1", x! + 0.7, z! + 0.5, 0.55);
  }
  // Low authored cover gathers in wind-broken drifts around the town skirts,
  // roots and forest margins. Trail geometry owns the exclusion widths too.
  function acceptsCover(x: number, z: number): boolean {
    if (x > TOWN_BOUNDS.minX - 1 && x < TOWN_BOUNDS.maxX + 1 &&
        z > TOWN_BOUNDS.minZ - 1 && z < TOWN_BOUNDS.maxZ + 1) return false;
    if (x > 27 && x < 87 && z > -65 && z < -29) return false;
    if (!clearOfPatrols(x, z, 6)) return false;
    const height = terrainHeight(x, z), water = lakeWaterAt(x, z), stream = streamAt(x, z);
    if (water !== null && height < water + .15 || stream && height < stream.surface + .15) return false;
    const slope = Math.hypot(terrainHeight(x + .5, z) - terrainHeight(x - .5, z),
      terrainHeight(x, z + .5) - terrainHeight(x, z - .5));
    if (slope > .8) return false;
    return trailFootprints.every(points => points.slice(1).every((to, index) => {
      const from = points[index]!, dx = to[0] - from[0], dz = to[1] - from[1];
      const t = Math.max(0, Math.min(1, ((x - from[0]) * dx + (z - from[1]) * dz) / (dx * dx + dz * dz)));
      const width = from[2] + (to[2] - from[2]) * t;
      return Math.hypot(x - from[0] - dx * t, z - from[1] - dz * t) > width / 2 + .8;
    }));
  }
  for (const [patch, [cx, cz, reach]] of [
    [-29,-7,5], [-36,-16,7], [-27,-30,4], [-43,-34,7], [-51,-17,6], [-40,2,8],
    [-29,10,6], [-48,14,7], [-60,1,5], [-59,-39,6], [-39,-50,5], [-16,-48,4],
    [28,-12,5], [38,-5,7], [48,9,7], [31,14,5], [15,7,4], [12,-51,4],
    [-17,17,5], [-24,26,6], [-36,34,6], [-39,49,7], [-27,62,5], [-15,71,5],
    [25,33,5], [33,43,7], [27,56,6], [20,70,5], [40,66,6], [-48,66,7],
    [-64,-57,6], [-70,-105,5], [-46,-132,6], [-21,-137,5], [21,-80,5],
    [26,-103,6], [20,-125,5], [43,-82,7], [45,-113,6], [-8,-54,4],
  ].entries()) {
    const seed = 3101 + patch * 137, turn = noise(seed) * Math.PI * 2;
    const count = 42 + Math.floor(noise(seed + 1) * 32);
    for (let item = 0; item < count; item++) {
      // Three unequal lobes, with thin tails and gaps between dense root mats.
      const lobe = item % 3, radius = Math.sqrt(noise(seed + item * 17 + 3));
      const angle = noise(seed + item * 23 + 4) * Math.PI * 2;
      const along = (lobe - 1) * reach! * .6 + Math.cos(angle) * radius * reach! * .46;
      const across = Math.sin(angle) * radius * reach! * (.19 + lobe * .055) + Math.sin(lobe * 3 + seed) * 1.1;
      const x = cx! + along * Math.cos(turn) - across * Math.sin(turn);
      const z = cz! + along * Math.sin(turn) + across * Math.cos(turn);
      if (!acceptsCover(x, z)) continue;
      const variation = noise(seed + item * 31 + 8);
      const fern = item % 17 === 0, stone = item % 23 === 0 && !fern;
      place(fern ? 'nature/Fern_1' : stone ? 'nature/Rock_Medium_1' : 'nature/Grass_Common_Short',
        x, z, fern ? .42 + variation * .27 : stone ? .2 + variation * .36 : .3 + variation * .34,
        angle + turn, terrain, stone ? 'width' : 'height', -.035);
    }
  }
  torch(-4.4,-40,2.4); torch(4.4,-40,2.4);
  await Promise.all(jobs);
  const [regions, trees] = await Promise.all([buildSecondDarkAge(terrain), buildRegionalFoliage(terrain), weatherExistingTown(terrain)]);
  for (const sign of regions.signs) onSign?.(sign.root, sign.id, sign.name);
  for (const bounds of trees) occluders.push({ root: terrain, bounds });
  for (const building of REGION_BUILDINGS) {
    const y = terrainHeight(building.x, building.z);
    occluders.push({ root: terrain, bounds: new Box3(
      new Vector3(building.x-building.width/2, y, building.z-building.depth/2),
      new Vector3(building.x+building.width/2, y+building.height, building.z+building.depth/2)) });
  }
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
      let container = mesh.parent;
      mesh.removeFromParent();
      // Instancing replaces the source meshes; their empty transform hierarchy
      // must leave the scene too, or every render still traverses it.
      while (container && container !== parent && container.children.length === 0 && (container instanceof Group || container.type === 'Object3D')) {
        const ancestor = container.parent;
        container.removeFromParent();
        container = ancestor;
      }
    }
    // Spatial cells retain useful frustum culling without changing the authored art.
    instances.computeBoundingSphere();
    parent.add(instances);
  }
  return (coolingRestored, shiftEnded, player, camera, aimHeight = 1.1, wallTimeMillis = Date.now()) => {
    updateWater(wallTimeMillis);
    regions.update(wallTimeMillis);
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
