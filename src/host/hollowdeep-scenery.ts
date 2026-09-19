import { Box3, CanvasTexture, Group, Mesh, MeshStandardMaterial, PlaneGeometry, PointLight, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from 'three';
import { CAVE_BARRIERS, inCave } from '../game/cave-layout.js';
import type { Position } from '../game/adventure-types.js';
import { prop } from './frostwood-assets.js';

export async function buildHollowdeep(terrain: Group): Promise<(position: Position) => void> {
  const walls = new Group(), roof = new Group(); terrain.add(walls, roof);
  const jobs: Promise<void>[] = [];
  function place(name: string, x: number, z: number, size: number, parent = terrain, y = 0, rotation = 0) {
    jobs.push(prop(name, size).then(model => { model.position.set(x,y,z); model.rotation.y=rotation; parent.add(model); }));
  }
  const floor = new Mesh(new PlaneGeometry(58,34), new MeshStandardMaterial({ color: 0x514c47, roughness: 1 }));
  floor.rotation.x=-Math.PI/2; floor.position.set(57,0.025,-47); terrain.add(floor);
  // The same solid regions define the rock banks and movement boundary.
  for (const [left,right,bottom,top] of CAVE_BARRIERS) {
    const cols=Math.ceil((right-left)/3), rows=Math.ceil((top-bottom)/3);
    for(let col=0;col<cols;col++) for(let row=0;row<rows;row++) {
      jobs.push(prop('nature/Rock_Medium_3',1).then(model => {
        const size=new Box3().setFromObject(model).getSize(new Vector3());
        model.scale.set((right-left)/cols/size.x*1.08, (4.6+(col+row)%3*.4)/size.y, (top-bottom)/rows/size.z*1.08);
        model.position.set(left+(col+.5)*(right-left)/cols,0,bottom+(row+.5)*(top-bottom)/rows); walls.add(model);
      }));
    }
  }
  for(const x of [29,34,53,58]) {
    place('works/Column_1',x,-50.5,4.5); place('works/Column_1',x,-41.5,4.5);
    place('works/Pipes',x,-46,8.7,roof,4.3,Math.PI/2);
  }
  for(const [x,z] of [[27,-41],[34,-49],[49,-37],[59,-49],[78,-36]]) {
    place('WoodenTorch_Fire',x!,z!,2.3);
    const light = new PointLight(0xffb169,12,10,2); light.position.set(x!,2.2,z!); terrain.add(light);
  }
  place('Cart',79,-56,1.7); place('Crate',77,-56,1); place('Barrel',80,-54,1.2);
  function sign(text: string, x:number, z:number, color:string) {
    const canvas=document.createElement('canvas'); canvas.width=768; canvas.height=96;
    const ctx=canvas.getContext('2d')!; ctx.fillStyle='#171f25ee';ctx.fillRect(0,0,768,96);
    ctx.fillStyle=color;ctx.font='bold 36px sans-serif';ctx.textAlign='center';ctx.fillText(text,384,61);
    const map=new CanvasTexture(canvas);map.colorSpace=SRGBColorSpace;
    const label=new Sprite(new SpriteMaterial({map,depthWrite:false}));label.position.set(x,3.3,z);label.scale.set(5.2,.65,1);terrain.add(label);
  }
  sign('HOLLOWDEEP CAVE · DANGER',27,-41,'#ffca87');
  sign('← EXIT TO THE MEADOW',33,-50,'#b9e8d0');
  await Promise.all(jobs);
  return position => { const inside=inCave(position); walls.scale.y=inside?.32:1; roof.visible=!inside; };
}
