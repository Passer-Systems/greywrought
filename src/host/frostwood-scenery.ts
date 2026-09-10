import { Group, Mesh, PlaneGeometry, MeshStandardMaterial, CanvasTexture, RepeatWrapping, SRGBColorSpace, PointLight } from "three";
import { prop } from "./frostwood-assets.js";

export async function buildFrostwood(terrain: Group, thicket: Group, innPosition: { readonly x: number; readonly z: number }, onPlace?: (root: Group, name: string) => void): Promise<(coolingRestored: boolean, shiftEnded: boolean) => void> {
  const jobs: Promise<void>[] = [];
  const coolingMaterials: MeshStandardMaterial[] = [];
  function place(name: string, x: number, z: number, size: number, rotation = 0, parent = terrain, axis: "height" | "width" = "height", y = 0) {
    jobs.push(prop(name, size, axis).then(model => {
      model.position.set(x, y, z); model.rotation.y = rotation; parent.add(model);
      if (name === "works/Props_Vessel" && z < 0) model.traverse(object => {
        if (!(object instanceof Mesh)) return;
        const coolable = (material: MeshStandardMaterial) => {
          const local = (material as MeshStandardMaterial).clone();
          if (local.name === "Accent") coolingMaterials.push(local);
          return local;
        };
        object.material = Array.isArray(object.material) ? object.material.map(coolable) : coolable(object.material);
      });
      onPlace?.(model, name);
      model.updateWorldMatrix(true, true);
      // Scenery never moves; actors and effects retain their animated transforms.
      model.traverse(object => { object.matrixAutoUpdate = false; object.matrixWorldAutoUpdate = false; });
    }));
  }
  function torch(x: number, z: number, height = 2.4) {
    place("WoodenTorch_Fire",x,z,height);
    const light = new PointLight(0xffa34e,19,9,2);
    light.position.set(x,height-0.2,z); terrain.add(light);
  }
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#54664d"; ctx.fillRect(0,0,128,128);
  for (let i=0;i<1500;i++) { const a=Math.sin(i*127.1)*43758.5453; const b=Math.sin(i*269.5)*19234.324; ctx.fillStyle=i%2?"#627453":"#485d46"; ctx.fillRect((a-Math.floor(a))*128,(b-Math.floor(b))*128,2,2); }
  const map = new CanvasTexture(canvas); map.colorSpace=SRGBColorSpace; map.wrapS=map.wrapT=RepeatWrapping; map.repeat.set(22,30);
  const ground = new Mesh(new PlaneGeometry(76,100),new MeshStandardMaterial({ map, roughness:1 })); ground.rotation.x=-Math.PI/2; ground.position.set(0,-0.06,18); terrain.add(ground);
  const paving = document.createElement("canvas"); paving.width=paving.height=256;
  const pavingCtx=paving.getContext("2d")!; pavingCtx.fillStyle="#8c8871"; pavingCtx.fillRect(0,0,256,256);
  for(let row=0;row<10;row++) for(let col=-1;col<10;col++) {
    const x=col*30+(row%2)*15, y=row*27;
    pavingCtx.fillStyle=["#aaa38c","#a29e88","#969780","#b4ad94"][(row*3+col+12)%4]!;
    pavingCtx.beginPath(); pavingCtx.roundRect(x+2,y+2,26,23,4); pavingCtx.fill();
  }
  const pavingMap=new CanvasTexture(paving); pavingMap.colorSpace=SRGBColorSpace; pavingMap.wrapS=pavingMap.wrapT=RepeatWrapping; pavingMap.repeat.set(5,4);
  const square=new Mesh(new PlaneGeometry(20,15),new MeshStandardMaterial({map:pavingMap,roughness:1})); square.rotation.x=-Math.PI/2; square.position.set(0,-0.01,-8); terrain.add(square);
  const roadMap=pavingMap.clone(); roadMap.repeat.set(1,14);
  const road=new Mesh(new PlaneGeometry(4.2,58),new MeshStandardMaterial({map:roadMap,color:0xb0b49a,roughness:1})); road.rotation.x=-Math.PI/2; road.position.set(0,0.015,22); terrain.add(road);
  // Houses frame the square; their doors and stalls face the walkable center.
  place("House_1",-8,-7,5.2,-Math.PI/2);
  place("Inn",innPosition.x+3,innPosition.z,4.6,Math.PI/2);
  place("Bench_1",innPosition.x-0.2,innPosition.z-2,0.7,Math.PI/2);
  place("Barrel",innPosition.x-0.2,innPosition.z-1.1,0.8);
  place("House_3",-7.8,-15,4.7,-Math.PI/2);
  place("Bell_Tower",-9.5,-1.7,6.7);
  place("House_3",10,-4,4.6,Math.PI/2);
  place("MarketStand_1",5.8,-7.1,2.8,Math.PI/2);
  place("Well",-4.7,-11,1.8);
  place("Cart",6.7,-3.3,1.6,-0.4);
  place("Barrel",5.3,-9.3,0.9); place("Crate",5.9,-9,0.8);
  place("Bench_1",-4.9,-4.7,0.75,Math.PI/2);
  torch(-5.6,-5.2); torch(4.5,-8.5); torch(innPosition.x+0.5,innPosition.z-1.4);
  torch(-3.6,0.15,2.7); torch(3.6,0.15,2.7);
  // Residents have reused the works' vessels and pipework around their well.
  place("works/Props_Vessel",4.7,-7.45,0.65,0,terrain,"height",0.72);
  place("works/Props_Vessel",5.25,-7.45,0.55,0.3,terrain,"height",0.72);
  place("works/Pipes",-4.7,-11.75,2.1,0,terrain,"width",0.02);
  const coldLight = new PointLight(0x70ddff,0,3,2); coldLight.position.set(4.8,1.3,-7.5); terrain.add(coldLight);
  const homeLight = new PointLight(0xffbb65,0,5,2); homeLight.position.set(innPosition.x+0.5,1.8,innPosition.z); terrain.add(homeLight);
  // The gate's low rock and hedge banks match the game's blocked x>3 strip.
  for(const side of [-1,1]) {
    for(let i=0;i<5;i++) {
      place("nature/Rock_Medium_3",side*(4.3+i*1.9),1.75,2.1+i%2*0.3,i,terrain,"width");
      place("nature/Bush_Common",side*(4.3+i*1.9),2.9,1.45,i);
      place("Fence",side*(4.5+i*1.8),-0.3,1.1,0);
    }
  }
  place("works/Column_1",-3.65,1.7,2.8);
  place("works/Column_1",3.65,1.7,2.8);
  // Low broken supply pipes can be stepped across; tall plant sits beyond movement boundaries.
  for (const x of [-10,-6,-2]) place("works/Pipes",x,12.9,3.9,0,terrain,"width",0.03);
  for (let i=0;i<8;i++) place("works/Pipes",12.65,10+i*4.5,4.4,Math.PI/2,terrain,"width",0.12);
  place("works/Props_Capsule",7.8,21,3.8,0,thicket);
  place("works/Details_Pipes_Long",6.5,21,2.8,0,thicket);
  // The west edge of the permanent briar island marks its collision boundary.
  for(let row=0;row<4;row++) for(let col=0;col<7;col++) {
    const x=2.8+col*1.5+Math.sin(col*8+row)*0.2, z=18.45+row*1.65+Math.sin(col*3+row)*0.2;
    if(Math.hypot(x-5,z-20)<1.55) continue;
    place("nature/Bush_Common",x,z,1.1+(col%3)*0.12,col,thicket);
  }
  // Canopies begin outside the accessible combat corridor, with lower edge planting.
  for(const side of [-1,1]) for(let i=0;i<14;i++) {
    const z=5+i*3.4;
    place(i%3===0?"nature/CommonTree_2":"nature/Pine_5",side*(13.8+i%3*2.2),z,5.6+i%4*0.65,i*2.1);
    if(i%2===0) place("nature/Pine_5",side*(19+i%2),z+1.8,7.5,i);
    place("nature/Fern_1",side*(7.8+i%3),z,0.55,i);
    if(i%3===0) place("nature/Rock_Medium_3",side*(9.2+i%2),z+0.8,1.1,i);
  }
  for(const side of [-1,1]) for(let grove=0;grove<5;grove++) {
    const z=8+grove*8.5;
    place("nature/Pine_5",side*(9.2+grove%2),z,4.6+grove%2*0.4,grove);
    place("nature/CommonTree_2",side*(11.4+grove%2),z+2,4.3,grove*2);
    for(let plant=0;plant<4;plant++) place("nature/Fern_1",side*(7.8+plant*0.7),z+Math.sin(plant*2)*1.1,0.55+plant*0.09,plant);
  }
  for(let i=0;i<45;i++) {
    const side=i%2?1:-1, z=5+i*0.87;
    place(i%4===0?"nature/Mushroom_Common":"nature/Grass_Common_Short",side*(4.5+(i%5)*0.85),z,0.22+i%3*0.06,i*2.4);
  }
  for(const [x,z] of [[-8,12],[10,28],[-9,32],[10,42],[-8,44]]) place("nature/TwistedTree_2",x!,z!,3.6,0.7);
  for(let i=0;i<7;i++) { const angle=i*Math.PI*2/7; place("nature/Rock_Medium_3",2+Math.sin(angle)*4.3,40+Math.cos(angle)*4.3,1.2+i%2*0.5,i); }
  place("nature/DeadTree_2",-7,39,3.8,1.3);
  const apron = new Mesh(new PlaneGeometry(12,11),new MeshStandardMaterial({color:0x797565,roughness:1}));
  apron.rotation.x=-Math.PI/2; apron.position.set(2,0.025,41); terrain.add(apron);
  place("works/Props_Base",2,40,4.8,0,terrain,"width",-0.18);
  place("works/Props_Capsule",2,47.5,6.1,0);
  place("works/Column_1",-2.5,47.3,5.4);
  place("works/Column_1",6.5,47.3,5.4);
  place("works/Pipes",2,47.3,9,0,terrain,"width",3.9);
  place("works/Details_Pipes_Long",-2.45,47.05,3.7);
  place("works/Details_Pipes_Long",6.45,47.05,3.7);
  await Promise.all(jobs);
  return (coolingRestored, shiftEnded) => {
    for (const material of coolingMaterials) {
      material.emissive.setHex(coolingRestored ? 0x55d9fa : 0x000000);
      material.emissiveIntensity = coolingRestored ? 1.1 : 0;
    }
    coldLight.intensity = coolingRestored ? 3 : 0;
    homeLight.intensity = shiftEnded ? 7 : 0;
  };
}
