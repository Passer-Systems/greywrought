import { Box3, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, type Material } from 'three';
import { terrainHeight } from '../game/cave-layout.js';
import { lakeWaterAt, streamAt } from '../game/world-elevation.js';
import { lavaLakeRatio } from '../game/lava-layout.js';
import { EXPANDED_WORLD_BOUNDS, REGION_BUILDINGS, REGION_LANDMARKS, REGION_ROADS, WORLD_SETTLEMENTS, regionAt } from '../game/world-regions.js';
import { TOWN_BOUNDS } from '../game/world-layout.js';
import { prop } from './frostwood-assets.js';
import { groundTree } from './tree-grounding.js';

type Palette = 'copper' | 'wine' | 'reed' | 'ash' | 'blue' | 'rust' | 'ivory' | 'violet' | 'pine';
const colors: Record<Palette, number> = {
  copper: 0x9f7148, wine: 0x70454b, reed: 0xb0a477, ash: 0x929c8c,
  blue: 0x627f84, rust: 0x925343, ivory: 0xc0bba4, violet: 0x85738e, pine: 0x46594d,
};
const materials = new Map<string, Material>();
function foliageMaterial(source: Material, palette: Palette): Material {
  if (!(source instanceof MeshStandardMaterial) || source.name.startsWith('Bark_')) return source;
  const key = `${source.uuid}:${palette}`;
  const cached = materials.get(key);
  if (cached) return cached;
  const material = source.clone(), compile = source.onBeforeCompile, program = source.customProgramCacheKey();
  material.name = `${source.name}_${palette}`;
  material.color.setHex(colors[palette]);
  material.roughness = 1;
  // Preserve authored cutouts and texture detail without multiplying new hues
  // by the old green leaf or red mushroom texture.
  material.onBeforeCompile = (shader, renderer) => {
    compile.call(source, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      #ifdef USE_MAP
        diffuseColor.rgb = diffuse * clamp(dot(sampledDiffuseColor.rgb, vec3(.2126, .7152, .0722)) * 1.65, .22, 1.0);
      #endif
    `);
  };
  material.customProgramCacheKey = () => `${program}:regional-foliage-v1`;
  if (palette === 'violet') { material.emissive.setHex(0x3c234e); material.emissiveIntensity = .12; }
  materials.set(key, material);
  return material;
}

const random = (seed: number): number => { const n = Math.sin(seed * 127.1 + 19.7) * 43758.5453; return n - Math.floor(n); };
const oldTrails: readonly (readonly (readonly [number, number])[])[] = [
  [[0,-40],[0,-55],[1,-77],[12,-89],[16,-104],[14,-124]],
  [[0,-46],[9,-45],[21,-46],[28,-46]],
  [[0,0],[0,14],[-1.2,23],[-3,31],[-3.7,44],[-1.5,51],[2,60],[2,69]],
  [[-2,24],[5,23],[10,24],[16,25]], [[-4,42],[-10,43],[-17,46]],
];
const clearings = [[-3,32,12],[16,25,12],[-19,47,13],[6,41,9],[2,64,10]] as const;
function nearLine(x: number, z: number, points: readonly (readonly [number, number])[], margin: number): boolean {
  return points.slice(1).some((to, index) => {
    const from = points[index]!, dx = to[0] - from[0], dz = to[1] - from[1];
    const t = Math.max(0, Math.min(1, ((x-from[0])*dx + (z-from[1])*dz) / (dx*dx+dz*dz)));
    return Math.hypot(x-from[0]-dx*t, z-from[1]-dz*t) < margin;
  });
}
function accepts(x: number, z: number, tree: boolean): boolean {
  const margin = tree ? 3 : 1;
  if (lavaLakeRatio(x,z) < (tree ? 1.65 : 1.35)) return false;
  if (x < EXPANDED_WORLD_BOUNDS.minX+3 || x > EXPANDED_WORLD_BOUNDS.maxX-3 || z < EXPANDED_WORLD_BOUNDS.minZ+3 || z > EXPANDED_WORLD_BOUNDS.maxZ-3) return false;
  if (x > TOWN_BOUNDS.minX-margin && x < TOWN_BOUNDS.maxX+margin && z > TOWN_BOUNDS.minZ-margin && z < TOWN_BOUNDS.maxZ+margin) return false;
  if (x > 25 && x < 90 && z > -67 && z < -27) return false;
  if (clearings.some(([px,pz,r]) => Math.hypot(x-px,z-pz) < r*(tree ? 1 : .55)+margin)) return false;
  if (REGION_BUILDINGS.some(b => Math.abs(x-b.x) < Math.max(b.width,b.depth)/2+margin+1 && Math.abs(z-b.z) < Math.max(b.width,b.depth)/2+margin+1)) return false;
  if (WORLD_SETTLEMENTS.some(t => Math.hypot(x-t.x,z-t.z) < 10+margin)) return false;
  if (REGION_LANDMARKS.some(l => Math.hypot(x-l.x,z-l.z) < (l.id === 'glass-heart' ? (tree ? 12 : 3) : l.id === 'choir-engine' ? 18 : 10)+margin)) return false;
  if (REGION_ROADS.some(r => nearLine(x,z,r.points,r.width/2+margin))) return false;
  if (oldTrails.some(points => nearLine(x,z,points,tree ? 3+margin : 2.8))) return false;
  const height = terrainHeight(x,z), water = lakeWaterAt(x,z), stream = streamAt(x,z);
  if (water !== null && height < water+.25 || stream && height < stream.surface+.25) return false;
  return Math.hypot(terrainHeight(x+.5,z)-terrainHeight(x-.5,z), terrainHeight(x,z+.5)-terrainHeight(x,z-.5)) < (tree ? 1.1 : .7);
}

type Plant = readonly [name: string, palette: Palette, height: number, width: number];
const communities = {
  copper: [['Bush_Common','wine',.95,1.15], ['Fern_1','copper',.62,1.25], ['Flower_4_Group','reed',.55,.7]],
  marsh: [['Grass_Common_Short','reed',1.85,.6], ['Fern_1','blue',.95,1.4], ['Bush_Common','ash',1.15,1.25]],
  rust: [['Fern_1','rust',.58,1.25], ['Grass_Common_Short','reed',.68,.85], ['Flower_3_Group','wine',.52,.75]],
  spores: [['Mushroom_Common','ivory',.7,1.3], ['Mushroom_Common','violet',.32,1.55], ['Fern_1','ash',.48,1.25]],
  shade: [['Fern_1','blue',.65,1.5], ['Mushroom_Common','ivory',.38,1.1], ['Bush_Common','wine',.72,1.3]],
  dry: [['Grass_Common_Short','reed',.65,.65], ['Fern_1','rust',.52,1.2], ['Flower_4_Group','ash',.48,.85]],
} as const satisfies Record<string, readonly Plant[]>;
type Community = keyof typeof communities;
function communityAt(x: number, z: number, seed: number): Community {
  switch (regionAt(x,z).id) {
    case 'brinewood': return random(seed) < .8 ? 'copper' : 'shade';
    case 'glassmire': return 'marsh';
    case 'suture-reach': return 'rust';
    case 'ossuary': return 'spores';
    case 'choirworks': return random(seed) < .65 ? 'dry' : 'shade';
    default: return z < -70 ? 'dry' : random(seed) < .65 ? 'shade' : 'copper';
  }
}
type Patch = readonly [x: number, z: number, reach: number, community: Community, count: number];
const patches: readonly Patch[] = [
  [-35,-12,5,'copper',28],[-43,-27,6,'shade',28],[-34,-43,5,'dry',24],[-42,5,6,'shade',30],
  [34,-8,5,'copper',28],[42,10,6,'dry',26],[32,-27,4,'shade',22],[-19,12,4,'spores',22],
  [-43,29,6,'copper',28],[-42,47,6,'shade',30],[-29,68,5,'spores',26],[35,38,5,'shade',24],[34,60,6,'copper',28],
  [-27,-98,5,'marsh',34],[-16,-117,4,'marsh',26],[9,-116,4,'marsh',24],[-41,-76,5,'dry',24],[26,-96,5,'copper',26],
  [-158,116,7,'copper',36],[-152,143,6,'copper',32],[-124,160,7,'copper',36],[-96,141,6,'copper',32],
  [-111,94,7,'dry',30],[-91,116,7,'copper',34],[-74,136,8,'copper',34],[-102,173,7,'shade',28],
  [13,144,7,'marsh',40],[49,153,6,'marsh',38],[16,176,6,'marsh',38],[34,188,7,'marsh',38],
  [61,179,7,'shade',30],[65,146,6,'marsh',34],[-5,189,7,'marsh',34],
  [127,104,6,'rust',24],[185,111,7,'rust',28],[155,149,7,'rust',26],[134,145,5,'rust',22],[185,138,7,'dry',24],
  [18,167,7,'marsh',64],[24,181,8,'marsh',72],[39,154,6,'marsh',58],[45,177,5,'marsh',52],
  [-150,100,10,'copper',52],[-165,132,9,'copper',52],[-137,169,10,'shade',48],[-102,181,10,'copper',52],
  [5,157,10,'marsh',64],[62,163,10,'marsh',64],[72,194,9,'shade',44],[104,176,8,'spores',46],
  [93,221,6,'spores',38],[129,221,6,'spores',40],[99,191,6,'spores',36],[134,199,6,'spores',38],
  [113,236,5,'spores',30],[151,211,7,'shade',28],[176,-53,7,'rust',24],[221,-12,7,'dry',26],[179,11,6,'shade',24],
];

/** Static authored plants; all terrain sampling and material creation happens here. */
export async function buildRegionalFoliage(parent: Group): Promise<readonly Box3[]> {
  const root = new Group(); root.name = 'regional-foliage'; parent.add(root);
  const occluders: Box3[] = [];
  const batches = new Map<string, { source: Mesh; material: Material | Material[]; matrices: Matrix4[]; tree: boolean }>();
  const names = new Set<string>(Object.values(communities).flatMap(c => c.map(p => p[0])));
  for (const name of ['CommonTree_2','TwistedTree_2','Pine_5','DeadTree_2']) names.add(name);
  const templates = new Map(await Promise.all([...names].map(async name => [name, await prop(`nature/${name}`, 1)] as const)));
  let plants = 0, trees = 0;
  const plantsByRegion: Record<string,number> = {};
  const treePositions: { x: number; z: number }[] = [];
  const treeAssets: Record<string,number> = {};
  function place(name: string, palette: Palette, x: number, z: number, height: number, width: number, turn: number, tree = false) {
    if (!accepts(x,z,tree)) return false;
    if (tree && treePositions.some(p => Math.hypot(x-p.x,z-p.z)<2.8)) return false;
    if (!tree && clearings.some(([px,pz,r]) => Math.hypot(x-px,z-pz) < r+1)) height = Math.min(height,.38);
    const model = templates.get(name)!.clone(true);
    model.position.set(x,terrainHeight(x,z)-.06,z);
    model.scale.set(height*width,height,height*width*(.85+random(x+z)*.3));
    model.rotation.y = turn;
    if (tree) {
      model.rotation.z = (random(x*7+z)-.5)*.09;
      groundTree(model,x,z,(px,pz) => terrainHeight(px,pz)-.08);
      trees++; treePositions.push({x,z}); treeAssets[name]=(treeAssets[name]??0)+1;
    } else {
      // Sink the uphill edge of broad plants into the slope rather than float
      // their downhill roots; their authored silhouettes remain upright.
      const radius = Math.min(.7,height*width*.35);
      model.position.y = Math.min(terrainHeight(x-radius,z),terrainHeight(x+radius,z),terrainHeight(x,z-radius),terrainHeight(x,z+radius))-.07;
      plants++;
      const region = regionAt(x,z).id;
      plantsByRegion[region] = (plantsByRegion[region]??0)+1;
    }
    model.updateWorldMatrix(true,true);
    if (tree) occluders.push(new Box3().setFromObject(model).expandByScalar(.35));
    model.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const material = Array.isArray(object.material) ? object.material.map(m => foliageMaterial(m,palette)) : foliageMaterial(object.material,palette);
      const list = Array.isArray(material) ? material : [material];
      const key = [Math.floor(x/24),Math.floor(z/24),object.geometry.uuid,...list.map(m=>m.uuid)].join(':');
      let batch = batches.get(key);
      if (!batch) { batch = {source:object,material,matrices:[],tree}; batches.set(key,batch); }
      batch.matrices.push(object.matrixWorld.clone());
    });
    return true;
  }
  // Each cell owns a small budget, so distant regions cannot be starved by an
  // earlier patch consuming a global cap. Bent, offset clumps leave open soil
  // between communities; their species stay coherent within each spatial batch.
  const spacing = 18;
  let fieldPlants = 0;
  for (let cz=EXPANDED_WORLD_BOUNDS.minZ+spacing/2;cz<EXPANDED_WORLD_BOUNDS.maxZ;cz+=spacing) {
    for (let cx=EXPANDED_WORLD_BOUNDS.minX+spacing/2;cx<EXPANDED_WORLD_BOUNDS.maxX;cx+=spacing) {
      const seed = cx*41+cz*137+92017, turn = random(seed)*Math.PI*2;
      const x = cx+(random(seed+1)-.5)*spacing*.65, z = cz+(random(seed+2)-.5)*spacing*.65;
      const communityName = communityAt(x,z,seed+3), community = communities[communityName];
      const count = 18+Math.floor(random(seed+4)*13), reach = 7+random(seed+5)*4;
      // Ferns and grass carry broad ground coverage; costlier bushes, flowers
      // and fungi are accents rather than repeated across an entire clump.
      const primary = communityName === 'copper' ? 1 : communityName === 'shade' ? 0 : communityName === 'spores' ? 2 : random(seed+6) < .6 ? 0 : 1;
      const accent = primary === 0 ? 1 : 0;
      for (let i=0;i<count;i++) {
        const angle = random(seed+i*17+10)*Math.PI*2, radius = Math.sqrt(random(seed+i*31+11));
        const along = Math.cos(angle)*radius*reach;
        const across = Math.sin(angle)*radius*reach*.42+Math.sin(along*.6)*1.2;
        const px = x+along*Math.cos(turn)-across*Math.sin(turn), pz = z+along*Math.sin(turn)+across*Math.cos(turn);
        const plant = community[i===count-1 ? 2 : i%8===0 ? accent : primary];
        const size = .65+random(seed+i*47+12)*.65;
        if (place(plant[0],plant[1],px,pz,plant[2]*size,plant[3],angle)) fieldPlants++;
      }
    }
  }
  for (const [index,[cx,cz,reach,community,count]] of patches.entries()) {
    const seed = 6207+index*211, turn = random(seed)*Math.PI*2, plants = communities[community];
    for (let i=0;i<count;i++) {
      const lobe = i%3, angle = random(seed+i*17+1)*Math.PI*2, radius = Math.sqrt(random(seed+i*31+2));
      const along = (lobe-1)*reach*.53+Math.cos(angle)*radius*reach*.46;
      const across = Math.sin(angle)*radius*reach*(.22+lobe*.04)+(random(seed+lobe+7)-.5)*2;
      const x = cx+along*Math.cos(turn)-across*Math.sin(turn), z = cz+along*Math.sin(turn)+across*Math.cos(turn);
      const plant = plants[i%9 < 5 ? 0 : i%9 < 8 ? 1 : 2];
      const size = .58+random(seed+i*47+5)*.94;
      place(plant[0],plant[1],x,z,plant[2]*size,plant[3],angle);
    }
  }
  // Interlocking lobes form broken forest edges, with open road-facing gaps.
  const stands = [
    [-158,101,18,15,'copper'],[-165,135,19,14,'wine'],[-150,164,20,15,'copper'],
    [-123,178,20,15,'wine'],[-91,182,18,14,'copper'],[-89,133,17,14,'copper'],[-106,94,16,12,'wine'],
    [-63,139,17,12,'copper'],[-35,155,16,12,'ash'],[-8,190,21,15,'ash'],
    [4,148,16,13,'ash'],[15,196,19,14,'blue'],[59,193,20,16,'blue'],[70,161,18,15,'ash'],
    [116,157,20,14,'pine'],[195,144,23,15,'pine'],[207,102,18,11,'rust'],
    [143,233,18,14,'ash'],[89,228,18,13,'pine'],[153,205,18,12,'wine'],
    [172,-63,22,13,'pine'],[231,-9,18,13,'pine'],[202,33,21,14,'ash'],
  ] as const;
  for (const [index,[cx,cz,reach,count,palette]] of stands.entries()) {
    const seed = index*73+8181, turn=random(seed+7)*Math.PI*2;
    let placed=0;
    for (let attempt=0;attempt<count*10 && placed<count;attempt++) {
      const angle=random(seed+attempt*13)*Math.PI*2, radius=Math.sqrt(random(seed+attempt*19));
      const lobe=attempt%3;
      const along=(lobe-1)*reach*.47+Math.cos(angle)*radius*reach*.56;
      const across=Math.sin(angle)*radius*reach*(lobe===1?.48:.29);
      const x=cx+along*Math.cos(turn)-across*Math.sin(turn),z=cz+along*Math.sin(turn)+across*Math.cos(turn);
      const mature=placed%6===0, sapling=placed%5===3, dead=placed%8===6;
      const height=dead ? 12+random(seed+attempt*41)*7 : mature ? 16+random(seed+attempt*43)*7 : sapling ? 4+random(seed+attempt*43)*3 : 8+random(seed+attempt*43)*6;
      const name=dead ? 'DeadTree_2' : palette==='pine' ? 'Pine_5' : placed%3===0 ? 'TwistedTree_2' : 'CommonTree_2';
      if(place(name,palette,x,z,height,.75+random(seed+attempt*11)*.5,angle,true)) {
        placed++;
        // Broad understory clumps join the trunks to the existing plant beds.
        const community=palette==='ash'||palette==='blue' ? communities.marsh : palette==='pine' ? communities.shade : communities.copper;
        for(let p=0;p<3;p++) {
          const plant=community[p]!,az=angle+p*2.3,offset=1.6+random(seed+attempt+p)*2.2;
          place(plant[0],plant[1],x+Math.cos(az)*offset,z+Math.sin(az)*offset,plant[2]*(.9+random(seed+p+attempt)*.6),plant[3],az);
        }
      }
    }
  }
  let drawCalls = 0;
  for (const batch of batches.values()) {
    const instances = new InstancedMesh(batch.source.geometry,batch.material,batch.matrices.length);
    instances.name = 'regional-foliage-cell';
    for (const [index,matrix] of batch.matrices.entries()) instances.setMatrixAt(index,matrix);
    instances.instanceMatrix.needsUpdate = true;
    instances.castShadow = batch.tree;
    instances.receiveShadow = true;
    instances.computeBoundingSphere();
    instances.updateMatrix(); instances.matrixAutoUpdate = false;
    root.add(instances);
    drawCalls += Array.isArray(batch.material) ? batch.material.length : 1;
  }
  root.userData.foliage = {plants,fieldPlants,plantsByRegion,trees,treeAssets,batches:batches.size,drawCalls};
  return occluders;
}
