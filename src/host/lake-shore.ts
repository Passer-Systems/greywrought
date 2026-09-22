import { Box3, BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, DoubleSide, Vector3 } from 'three';
import { terrainHeight } from '../game/cave-layout.js';
import { WATERFALL_POINTS } from '../game/world-elevation.js';
import { prop } from './frostwood-assets.js';
import { buildWaterfall } from './waterfall.js';

const sand = new MeshStandardMaterial({ roughness: 1, vertexColors: true, transparent: true, depthWrite: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });

function groundPatch(parent: Group, x: number, z: number, width: number, depth: number, submerged = false) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [], color = new Color(submerged ? 0x70786a : 0x655d4b);
  const segments=32,rings=9;
  for(let ring=0;ring<=rings;ring++)for(let segment=0;segment<segments;segment++) {
    const a=segment/segments*Math.PI*2,r=ring/rings*(1+.12*Math.sin(a*3+x)+.06*Math.cos(a*5+z));
    const px=x+Math.cos(a)*r*width*.5,pz=z+Math.sin(a)*r*depth*.5;
    positions.push(px,terrainHeight(px,pz)+.025,pz);
    const grain=.82+.18*Math.sin(px*8.3+pz*7.1)**2;
    // Let the existing world texture show through the edge and break the
    // shoreline into worn, irregular fragments instead of a pale decal.
    const edgeNoise=.72+.28*Math.sin(a*7+x*1.7+z*.9);
    const alpha=ring===rings?0:ring===rings-1?.3*edgeNoise:ring===rings-2?.62*edgeNoise:.68;
    colors.push(color.r*grain,color.g*grain,color.b*grain,alpha);
    if(ring<rings){const i=ring*segments+segment,j=ring*segments+(segment+1)%segments;indices.push(i,j,i+segments,j,j+segments,i+segments);}
  }
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));geometry.setAttribute('color',new Float32BufferAttribute(colors,4)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const patch=new Mesh(geometry,sand);patch.receiveShadow=true;parent.add(patch);
}

export async function buildLakeShore(parent: Group): Promise<void> {
  // Broken west and north banks frame the larger basin while leaving the
  // southern approach open for swimming.  These patches are deliberately
  // irregular and let the depth-colored water show around their edges.
  groundPatch(parent, -63.2, -91.4, 7.6, 5.8);
  groundPatch(parent, -30.5, -127.0, 8.2, 3.5);
  groundPatch(parent, 10.4, -105.8, 5.4, 3.0, true);
  groundPatch(parent, -30.5, -61.8, 5.2, 2.7, true);
  const placements: Promise<void>[] = [];
  const place = (name: string, x: number, z: number, size: number, rotation = 0, tilt = 0, yOverride?: number) => {
    placements.push(prop(name, size).then(model => {
      model.position.set(x, yOverride ?? terrainHeight(x, z), z);
      model.rotation.set(tilt, rotation, 0);
      if (name.startsWith('nature/Rock_')) {
        model.updateWorldMatrix(true,true);
        const bounds=new Box3().setFromObject(model), size=bounds.getSize(new Vector3());
        let shift=Infinity;
        // Sink the lower rim into the slope; centre-only placement leaves
        // the downhill side hanging above the hill.
        model.traverse(object=>{
          if(!(object instanceof Mesh))return;
          const vertices=object.geometry.getAttribute('position'),point=new Vector3();
          for(let i=0;i<vertices.count;i++) {
            point.fromBufferAttribute(vertices,i).applyMatrix4(object.matrixWorld);
            if(point.y>bounds.min.y+size.y*.2)continue;
            shift=Math.min(shift,terrainHeight(point.x,point.z)-.06-point.y);
          }
        });
        if(Number.isFinite(shift))model.position.y+=shift-size.y*.08;
      }
      parent.add(model);
    }));
  };
  for (const [x, z, size, rotation] of [[-62.5,-89.2,1.15,.4],[-63.8,-88.4,.78,1.1],[-61.4,-90.3,.6,-.7],[-55.8,-104.2,1.7,1.5],[-40.8,-119.3,2.1,-.8],[-18.8,-126.2,1.9,2.2]] as const) place('nature/Rock_Medium_3', x, z, size, rotation);
  for (const [x,z,size,rotation] of [[-47.5,-101,.7,.7],[-1.8,-112.7,.5,2.1],[-17.2,-123.4,.48,1.2]] as const) place('nature/Rock_Medium_1',x,z,size,rotation);
  for (const [x, z, size, rotation] of [[-61,-97.4,5.4,.35],[-28.2,-61.4,4.4,2.2],[8.5,-116.5,4.6,-.7]] as const) place('nature/DeadTree_2', x, z, size, rotation, Math.PI / 2);
  for (const [x, z, size, rotation] of [[-60.8,-93.8,1.7,.2],[-39.8,-121.7,1.0,1.1],[-12.2,-128.2,1.2,-.4],[11.8,-106.2,.8,2.2]] as const) {
    place('nature/Rock_Medium_3', x, z, size, rotation);
    place('nature/Grass_Common_Short', x + .7, z + .3, .35, rotation + .6);
  }
  // A few machine remnants sit above the west bank among the stones, with bare
  // space between clusters so the shoreline reads as traversable ground.
  place('works/Props_Capsule', -58.5, -99.4, 2.0, .5, -.08);
  place('works/Details_Pipes_Long', -57.5, -100.1, 1.3, 1.1, .12);
  // Existing authored boulders frame the cascade without blocking the bank.
  // The final stones are keyed from the actual stream endpoint, so they stay
  // attached to the plunge pool if the channel is tuned later.
  // A broken spring seam at the head gives the creek a believable source. The
  // stones sit off the centre line, leaving the shallow runnel visible between
  // them instead of forming a decorative, symmetric gate.
  groundPatch(parent, -69.6, -86.8, 4.6, 2.5, true);
  for (const [x, z, size, rotation, tilt] of [
    [-70.5, -87.6, 1.25, .35, .12], [-70.2, -85.7, .48, 2.2, -.08],
    [-68.5, -87.9, .58, -.7, .1], [-67.8, -86.1, .34, 1.4, -.04],
  ] as const) place('nature/Rock_Medium_1', x, z, size, rotation, tilt);
  for (const [x, z, size, rotation, tilt] of [
    [-69.2, -80.5, .72, .4, .14], [-62.0, -78.2, .46, 2.1, -.08],
    [-59.0, -73.8, .35, -.6, .11], [-55.0, -73.7, .62, 1.7, -.1],
    [-54.7, -77.7, .38, -.3, .06], [-52.8, -75.5, .58, 2.4, .08],
  ] as const) place('nature/Rock_Medium_3', x, z, size, rotation, tilt);
  // Unequal capstones break up the straight bluff edge at the actual drop.
  // Keep the larger one downhill so the lip remains readable from the lake.
  place('nature/Rock_Medium_3', -54.9, -76.9, .86, .7, .1);
  place('nature/Rock_Medium_1', -53.1, -76.2, .42, 2.5, -.06);
  const plunge = WATERFALL_POINTS.at(-1)!;
  for (const [dx, dz, size, rotation] of [
    [-1.45, -.35, .72, .2], [.95, .25, .58, 1.8], [.15, 1.05, .42, 2.7],
  ] as const) {
    // Small stones sit on the carved bed and remain partially visible through
    // the shallow water around the impact.
    place('nature/Rock_Medium_1', plunge.x + dx, plunge.z + dz, size, rotation);
  }
  // Low boulder clusters make the submerged basin readable without obstructing swimming.
  for (const [x,z,size,rotation] of [[-33,-100,.8,.4],[-34.2,-100.4,.42,1.2],[-21,-103,1.1,2],[-20.1,-104,.5,.7],[-31,-89,.7,1.4],[-40,-108,.9,.3],[-15,-94,.8,2.4]] as const) place('nature/Rock_Medium_1',x,z,size,rotation);
  buildWaterfall(parent);
  await Promise.all(placements);
}
