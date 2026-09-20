import { terrainHeight } from '../game/cave-layout.js';
import { conformToTerrain } from './terrain-geometry.js';
import { Group, Mesh, InstancedMesh, Matrix4, PlaneGeometry, MeshStandardMaterial, CanvasTexture, RepeatWrapping, SRGBColorSpace, PointLight, Box3, Vector3, Ray, Sprite, SpriteMaterial } from "three";
import type { Position } from "../game/adventure-types.js";
import { TOWN_BUILDINGS } from "../game/town-layout.js";
import { prop } from "./frostwood-assets.js";

export async function buildFrostwood(terrain: Group, thicket: Group, innPosition: { readonly x: number; readonly z: number }, onPlace?: (root: Group, name: string) => boolean): Promise<(coolingRestored: boolean, shiftEnded: boolean, player: Position, camera: Vector3) => void> {
  const jobs: Promise<void>[] = [];
  const coolingMaterials: MeshStandardMaterial[] = [];
  const batches = new Map<string, { parent: Group; meshes: Mesh[] }>();
  const buildings: { root: Group; bounds: Box3 }[] = [];
  const sightline = new Ray(), cameraDirection = new Vector3(), intersection = new Vector3();
  function place(name: string, x: number, z: number, size: number, rotation = 0, parent = terrain, axis: "height" | "width" = "height", y = 0, footprint?: readonly [number, number]) {
    jobs.push(prop(name, size, axis).then(model => {
      model.position.set(x, terrainHeight(x,z) + y, z); model.rotation.y = rotation;
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
      const interactive = onPlace?.(model, name);
      model.updateWorldMatrix(true, true);
      if (footprint) buildings.push({ root: model, bounds: new Box3().setFromObject(model).expandByScalar(.5) });
      if (!interactive && !footprint) model.traverse(object => {
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
  function torch(x: number, z: number, height = 2.4) {
    place("WoodenTorch_Fire",x,z,height);
    const light = new PointLight(0xffa34e,19,9,2);
    light.position.set(x,terrainHeight(x,z)+height-0.2,z); terrain.add(light);
  }
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#54664d"; ctx.fillRect(0,0,128,128);
  for (let i=0;i<1500;i++) { const a=Math.sin(i*127.1)*43758.5453; const b=Math.sin(i*269.5)*19234.324; ctx.fillStyle=i%2?"#627453":"#485d46"; ctx.fillRect((a-Math.floor(a))*128,(b-Math.floor(b))*128,2,2); }
  const map = new CanvasTexture(canvas); map.colorSpace=SRGBColorSpace; map.wrapS=map.wrapT=RepeatWrapping; map.repeat.set(48,64);
  const groundMaterial = new MeshStandardMaterial({ map, roughness: 1 });
  // Four surfaces leave an actual opening in the earth above Hollowdeep.
  for (const [left, right, bottom, top] of [[-124,28,-190,148],[86,146,-190,148],[28,86,-190,-64],[28,86,-30,148]]) {
    const geometry = new PlaneGeometry(right!-left!, top!-bottom!, Math.ceil((right!-left!)/2), Math.ceil((top!-bottom!)/2));
    const uv = geometry.getAttribute('uv');
    for(let i=0;i<uv.count;i++) uv.setXY(i, (left! + uv.getX(i)*(right!-left!) + 74)/168, (bottom! + uv.getY(i)*(top!-bottom!) + 134)/214);
    const ground = new Mesh(geometry, groundMaterial);
    ground.rotation.x=-Math.PI/2; ground.position.set((left!+right!)/2,-0.06,(bottom!+top!)/2);
    ground.userData.walkableGround = true; terrain.add(ground); conformToTerrain(ground, -.06); geometry.computeVertexNormals();
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
  const roadMap=pavingMap.clone(); roadMap.repeat.set(1,14);
  const road=new Mesh(new PlaneGeometry(4.2,112),new MeshStandardMaterial({map:roadMap,color:0xb0b49a,roughness:1})); road.rotation.x=-Math.PI/2; road.position.set(0,0.015,12); terrain.add(road);
  function sign(text: string, x: number, z: number, y = 3.1, tint = '#e9d5a5') {
    const board=document.createElement('canvas'); board.width=768; board.height=112;
    const c=board.getContext('2d')!; c.fillStyle='#322a20'; c.fillRect(0,0,768,112);
    c.strokeStyle='#b49a65'; c.lineWidth=5; c.strokeRect(6,6,756,100);
    c.fillStyle=tint; c.font='bold 32px Georgia'; c.textAlign='center'; c.fillText(text,384,68);
    const texture=new CanvasTexture(board); texture.colorSpace=SRGBColorSpace;
    const label=new Sprite(new SpriteMaterial({map:texture,depthWrite:false}));
    label.position.set(x,terrainHeight(x,z)+y,z); label.scale.set(4.2,.61,1); terrain.add(label);
  }
  for (const building of TOWN_BUILDINGS) {
    place(building.model, building.x, building.z, building.height, building.turn*Math.PI/2, terrain, 'height', 0, [building.width,building.depth]);
    if (building.sign) {
      const faceX=building.x-building.turn*(building.width/2+.2), faceZ=building.z+(building.turn===0 ? building.depth/2+.2 : 0);
      sign(building.sign,faceX,faceZ,3.5,building.sign.includes('APOTHECARY') ? '#bcdfb0' : '#f2d69a');
    }
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
  // Low broken supply pipes can be stepped across; tall plant sits beyond movement boundaries.
  for (const x of [-10,-6,-2]) forestPlace("works/Pipes",x,12.9,3.9,0,terrain,"width",0.03);
  for (let i=0;i<8;i++) forestPlace("works/Pipes",12.65,10+i*4.5,4.4,Math.PI/2,terrain,"width",0.12);
  forestPlace("works/Props_Capsule",7.8,21,3.8,0,thicket);
  forestPlace("works/Details_Pipes_Long",6.5,21,2.8,0,thicket);
  // The west edge of the permanent briar island marks its collision boundary.
  for(let row=0;row<4;row++) for(let col=0;col<7;col++) {
    const x=2.8+col*1.5+Math.sin(col*8+row)*0.2, z=18.45+row*1.65+Math.sin(col*3+row)*0.2;
    if(Math.hypot(x-5,z-20)<1.55) continue;
    forestPlace("nature/Bush_Common",x,z,1.1+(col%3)*0.12,col,thicket);
  }
  // Canopies begin outside the accessible combat corridor, with lower edge planting.
  for(const side of [-1,1]) for(let i=0;i<14;i++) {
    const z=5+i*3.4;
    forestPlace(i%3===0?"nature/CommonTree_2":"nature/Pine_5",side*(24+i%3*2.2),z,5.6+i%4*0.65,i*2.1);
    if(i%2===0) forestPlace("nature/Pine_5",side*(30+i%2),z+1.8,7.5,i);
    forestPlace("nature/Fern_1",side*(7.8+i%3),z,0.55,i);
    if(i%3===0) forestPlace("nature/Rock_Medium_3",side*(9.2+i%2),z+0.8,1.1,i);
  }
  for(const side of [-1,1]) for(let grove=0;grove<5;grove++) {
    const z=8+grove*8.5;
    forestPlace("nature/Pine_5",side*(22+grove%2),z,4.6+grove%2*0.4,grove);
    forestPlace("nature/CommonTree_2",side*(25+grove%2),z+2,4.3,grove*2);
    for(let plant=0;plant<4;plant++) forestPlace("nature/Fern_1",side*(7.8+plant*0.7),z+Math.sin(plant*2)*1.1,0.55+plant*0.09,plant);
  }
  for(let i=0;i<45;i++) {
    const side=i%2?1:-1, z=5+i*0.87;
    forestPlace(i%4===0?"nature/Mushroom_Common":"nature/Grass_Common_Short",side*(4.5+(i%5)*0.85),z,0.22+i%3*0.06,i*2.4);
  }
  for(const [x,z] of [[-8,12],[10,28],[-9,32],[10,42],[-8,44]]) forestPlace("nature/TwistedTree_2",x!,z!,3.6,0.7);
  for(let i=0;i<7;i++) { const angle=i*Math.PI*2/7; forestPlace("nature/Rock_Medium_3",2+Math.sin(angle)*4.3,40+Math.cos(angle)*4.3,1.2+i%2*0.5,i); }
  forestPlace("nature/DeadTree_2",-7,39,3.8,1.3);
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
  path(0, -75, 3.4, 102);
  path(14, -46, 28, 3.4);
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
  const inverse = new Matrix4(), matrix = new Matrix4();
  for (const { parent, meshes } of batches.values()) {
    if (meshes.length < 2) continue;
    const source = meshes[0]!;
    const instances = new InstancedMesh(source.geometry, source.material, meshes.length);
    inverse.copy(parent.matrixWorld).invert();
    for (const [index, mesh] of meshes.entries()) {
      instances.setMatrixAt(index, matrix.multiplyMatrices(inverse, mesh.matrixWorld));
      mesh.removeFromParent();
    }
    // Spatial cells retain useful frustum culling without changing the authored art.
    instances.computeBoundingSphere();
    parent.add(instances);
  }
  return (coolingRestored, shiftEnded, player, camera) => {
    sightline.origin.set(player.x, player.y + 1, player.z);
    cameraDirection.subVectors(camera, sightline.origin);
    const cameraDistance = cameraDirection.length();
    sightline.direction.copy(cameraDirection).normalize();
    for (const building of buildings) {
      const hit = sightline.intersectBox(building.bounds, intersection);
      building.root.visible = !hit || sightline.origin.distanceTo(hit) > cameraDistance;
    }
    for (const material of coolingMaterials) {
      material.emissive.setHex(coolingRestored ? 0x55d9fa : 0x000000);
      material.emissiveIntensity = coolingRestored ? 1.1 : 0;
    }
    coldLight.intensity = coolingRestored ? 3 : 0;
    homeLight.intensity = shiftEnded ? 7 : 0;
  };
}
