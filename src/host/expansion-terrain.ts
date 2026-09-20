import { Float32BufferAttribute, Group, Mesh, PlaneGeometry, type Material } from 'three';
import { EXPANDED_WORLD_BOUNDS } from '../game/world-regions.js';
import { terrainHeight } from '../game/cave-layout.js';

export const RENDERED_WORLD_BOUNDS = {
  left: Math.floor((EXPANDED_WORLD_BOUNDS.minX - 64) / 2) * 2,
  right: Math.ceil((EXPANDED_WORLD_BOUNDS.maxX + 64) / 2) * 2,
  bottom: Math.floor((EXPANDED_WORLD_BOUNDS.minZ - 64) / 2) * 2,
  top: Math.ceil((EXPANDED_WORLD_BOUNDS.maxZ + 64) / 2) * 2,
};

/** Two-metre terrain cells outside Frostwood, partitioned for ordinary frustum culling. */
export async function buildExpansionTerrain(parent: Group, material: Material, tint: (mesh: Mesh) => void): Promise<void> {
  const { left, right, bottom, top } = RENDERED_WORLD_BOUNDS;
  const regions = [[left,-124,bottom,top],[146,right,bottom,top],[-124,146,bottom,-190],[-124,146,148,top]] as const;
  let sliceStarted = performance.now();
  for (const [x0,x1,z0,z1] of regions) for (let x=x0;x<x1;x+=32) for (let z=z0;z<z1;z+=32) {
    const endX=Math.min(x1,x+32),endZ=Math.min(z1,z+32);
    const geometry=new PlaneGeometry(endX-x,endZ-z,(endX-x)/2,(endZ-z)/2);
    geometry.rotateX(-Math.PI/2);
    const positions=geometry.getAttribute('position');
    const uvs=new Float32Array(positions.count*2);
    for(let i=0;i<positions.count;i++) {
      const px=positions.getX(i)+(x+endX)/2,pz=positions.getZ(i)+(z+endZ)/2;
      positions.setXYZ(i,px,terrainHeight(px,pz)-.06,pz);
      uvs[i*2]=(px+74)/168;uvs[i*2+1]=(pz+134)/214;
    }
    geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2));
    geometry.computeVertexNormals();geometry.computeBoundingSphere();
    const mesh=new Mesh(geometry,material);mesh.name='expansion-ground';mesh.userData.walkableGround=true;
    parent.add(mesh);tint(mesh);
    if (performance.now()-sliceStarted>12) { await new Promise<void>(resolve=>setTimeout(resolve,0)); sliceStarted=performance.now(); }
  }
}
