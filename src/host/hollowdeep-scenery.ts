import { Box3, CanvasTexture, Group, Mesh, MeshStandardMaterial, PointLight, RepeatWrapping, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, type Object3D } from 'three';
import { CAVE_BARRIERS, inCave, terrainHeight } from '../game/cave-layout.js';
import type { Position } from '../game/adventure-types.js';
import { prop } from './frostwood-assets.js';
import { caveFloorGeometry } from './terrain-geometry.js';

export async function buildHollowdeep(terrain: Group): Promise<(position: Position, camera: Vector3) => void> {
  const walls = new Group(), roof = new Group(); terrain.add(walls, roof);
  const wallRocks: { root: Object3D; height: number; scale: number }[] = [];
  const jobs: Promise<void>[] = [];
  function place(name: string, x: number, z: number, size: number, parent = terrain, lift = 0, rotation = 0) {
    jobs.push(prop(name, size).then(model => {
      model.position.set(x,terrainHeight(x,z)+lift,z); model.rotation.y=rotation; parent.add(model);
    }));
  }
  const stone = document.createElement('canvas'); stone.width=stone.height=128;
  const stoneContext=stone.getContext('2d')!;
  stoneContext.fillStyle='#766f61'; stoneContext.fillRect(0,0,128,128);
  for(let index=0;index<450;index++) {
    const x=(Math.sin(index*127.1)*43758.5453)%128, z=(Math.sin(index*269.5)*19234.324)%128;
    stoneContext.fillStyle=index%3 ? '#827b6b' : '#5f5b53';
    stoneContext.fillRect(Math.abs(x),Math.abs(z),2+index%4,1+index%3);
  }
  const stoneMap=new CanvasTexture(stone); stoneMap.colorSpace=SRGBColorSpace;
  stoneMap.wrapS=stoneMap.wrapT=RepeatWrapping; stoneMap.repeat.set(2,2);
  const floor = new Mesh(caveFloorGeometry(), new MeshStandardMaterial({ map:stoneMap, roughness: 1 }));
  floor.userData.walkableGround = true; terrain.add(floor);
  // Rock reaches from the excavated floor to the hillside above; the passage is below grade.
  for (const [left,right,bottom,top] of CAVE_BARRIERS) {
    const cols=Math.ceil((right-left)/4), rows=Math.ceil((top-bottom)/4);
    for(let col=0;col<cols;col++) for(let row=0;row<rows;row++) {
      jobs.push(prop('nature/Rock_Medium_3',1).then(model => {
        const x=left+(col+.5)*(right-left)/cols, z=bottom+(row+.5)*(top-bottom)/rows;
        const ground=terrainHeight(x,z), height=3.8-ground+(col+row)%3*.55;
        const size=new Box3().setFromObject(model).getSize(new Vector3());
        model.scale.set((right-left)/cols/size.x*1.12, height/size.y, (top-bottom)/rows/size.z*1.12);
        model.position.set(x,ground-.15,z); walls.add(model);
        wallRocks.push({root:model,height,scale:model.scale.y});
      }));
    }
  }
  // Authored boulders bridge the mouth and form a continuous low hillside above the chambers.
  for (let x=32;x<=80;x+=8) for (const z of [-54,-44,-35]) {
    jobs.push(prop('nature/Rock_Medium_3',1).then(model => {
      const size=new Box3().setFromObject(model).getSize(new Vector3());
      model.scale.set(11/size.x, (3.8+(x%3)*.35)/size.y, 12/size.z);
      model.position.set(x,1.7,z); roof.add(model);
    }));
  }
  // The entrance lintel joins the roof cutaway so it cannot cover the descent camera.
  jobs.push(prop('nature/Rock_Medium_3',1).then(model => {
    const size=new Box3().setFromObject(model).getSize(new Vector3());
    model.scale.set(3.4/size.x,2/size.y,10.4/size.z); model.position.set(29,3,-46); roof.add(model);
  }));
  for(const x of [32,55]) {
    place('works/Column_1',x,-50.2,4.2); place('works/Column_1',x,-41.8,4.2);
    place('works/Pipes',x,-46,8.2,roof,4,Math.PI/2);
  }
  for(const [x,z] of [[27,-41],[36,-49],[47,-37],[59,-49],[73,-36]]) {
    place('WoodenTorch_Fire',x!,z!,2.3);
    const light=new PointLight(0xffbb79,24,13,2);
    light.position.set(x!,terrainHeight(x!,z!)+2.1,z!); terrain.add(light);
  }
  for(const [x,z] of [[41,-53],[65,-57],[78,-39]]) {
    place('Crystal2',x!,z!,1.5);
    const light=new PointLight(0x6aaecd,12,11,2);
    light.position.set(x!,terrainHeight(x!,z!)+1.3,z!); terrain.add(light);
  }
  place('Cart',79,-56,1.7); place('Crate',77,-56,1); place('Barrel',80,-54,1.2);
  function sign(text: string, x:number, z:number, color:string) {
    const canvas=document.createElement('canvas'); canvas.width=768; canvas.height=96;
    const ctx=canvas.getContext('2d')!; ctx.fillStyle='#171f25ee';ctx.fillRect(0,0,768,96);
    ctx.fillStyle=color;ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText(text,384,61);
    const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;
    const label=new Sprite(new SpriteMaterial({map,depthWrite:false}));
    label.position.set(x,terrainHeight(x,z)+3.3,z);label.scale.set(5.2,.65,1);terrain.add(label);
  }
  sign('HOLLOWDEEP CAVE · DANGER',26,-41,'#ffca87');
  sign('← EXIT TO THE MEADOW',36,-50,'#b9e8d0');
  await Promise.all(jobs);
  return (position, camera) => {
    const inside=inCave(position); roof.visible=!inside;
    const dx=camera.x-position.x,dz=camera.z-position.z, length=Math.hypot(dx,dz)||1;
    for (const rock of wallRocks) {
      const rx=rock.root.position.x-position.x,rz=rock.root.position.z-position.z;
      const nearCamera=inside && rx*dx+rz*dz>0 && Math.abs(rx*dz-rz*dx)/length<11 && Math.hypot(rx,rz)<22;
      rock.root.scale.y=rock.scale*(nearCamera ? Math.min(1,1.2/rock.height) : 1);
    }
  };
}
