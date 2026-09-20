import { BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, DoubleSide } from 'three';
import { terrainHeight } from '../game/cave-layout.js';
import { prop } from './frostwood-assets.js';

const sand = new MeshStandardMaterial({ roughness: 1, vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });

function groundPatch(parent: Group, x: number, z: number, width: number, depth: number, submerged = false) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [], color = new Color(submerged ? 0x9e9471 : 0xb09a6b);
  const segments=24,rings=5;
  for(let ring=0;ring<=rings;ring++)for(let segment=0;segment<segments;segment++) {
    const a=segment/segments*Math.PI*2,r=ring/rings*(1+.12*Math.sin(a*3+x)+.06*Math.cos(a*5+z));
    const px=x+Math.cos(a)*r*width*.5,pz=z+Math.sin(a)*r*depth*.5;
    positions.push(px,terrainHeight(px,pz)+.025,pz);
    const grain=.87+.13*Math.sin(px*8.3+pz*7.1)**2;
    colors.push(color.r*grain,color.g*grain,color.b*grain,ring===rings?0:.9);
    if(ring<rings){const i=ring*segments+segment,j=ring*segments+(segment+1)%segments;indices.push(i,j,i+segments,j,j+segments,i+segments);}
  }
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));geometry.setAttribute('color',new Float32BufferAttribute(colors,4)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const patch=new Mesh(geometry,sand);patch.receiveShadow=true;parent.add(patch);
}

export async function buildLakeShore(parent: Group): Promise<void> {
  // West-bank bluff and loose rubble; the east and southern banks remain open
  // for walking and swimming approaches.
  groundPatch(parent, -16.2, -98.4, 5.2, 4.4);
  groundPatch(parent, -11.8, -108.5, 4.3, 2.5);
  groundPatch(parent, 8.7, -91.8, 3.8, 2.2, true);
  groundPatch(parent, -14.1, -91.4, 3.2, 2.1, true);
  const placements: Promise<void>[] = [];
  const place = (name: string, x: number, z: number, size: number, rotation = 0, tilt = 0) => {
    placements.push(prop(name, size).then(model => {
      model.position.set(x, terrainHeight(x, z), z);
      model.rotation.set(tilt, rotation, 0); parent.add(model);
    }));
  };
  for (const [x, z, size, rotation] of [[-17.5,-96.8,2.4,.4],[-18.7,-101.2,1.8,1.5],[-15.8,-105.4,1.2,-.8],[-10.8,-111.4,1.1,2.2]] as const) place('nature/Rock_Medium_3', x, z, size, rotation);
  for (const [x,z,size,rotation] of [[-10.5,-101,.48,.7],[2.8,-101.7,.36,2.1],[-8.2,-105.4,.28,1.2]] as const) place('nature/Rock_Medium_1',x,z,size,rotation);
  for (const [x, z, size, rotation] of [[-9.5,-91.4,4.5,.35],[-1.2,-88.7,3.6,2.2],[7.4,-103.5,3.8,-.7]] as const) place('nature/DeadTree_2', x, z, size, rotation, Math.PI / 2);
  for (const [x, z, size, rotation] of [[-19.6,-94.8,1.2,.2],[-14.8,-108.7,.7,1.1],[-8.2,-113.8,.9,-.4],[10.8,-93.2,.65,2.2]] as const) {
    place('nature/Rock_Medium_3', x, z, size, rotation);
    place('nature/Grass_Common_Short', x + .7, z + .3, .35, rotation + .6);
  }
  // A few machine remnants sit above the west bank among the stones, with bare
  // space between clusters so the shoreline reads as traversable ground.
  place('works/Props_Capsule', -18.2, -99.4, 1.4, .5, -.08);
  place('works/Details_Pipes_Long', -17.2, -100.1, .9, 1.1, .12);
  await Promise.all(placements);
}
