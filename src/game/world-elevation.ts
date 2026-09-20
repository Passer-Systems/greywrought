const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
import { townHeight } from './town-elevation.js';
import { REGION_ROADS, WORLD_SETTLEMENTS } from './world-regions.js';
/** The southern meadow lake: a shallow, walkable rim around a deeper swimming basin. */
// The southern basin is intentionally broad enough to read as a real lake from
// the normal camera.  Its eastern edge stops short of the x=16 footpath while
// the irregular boundary leaves coves and a rocky north-west inlet.
export const LAKE_CENTER = { x: -27, z: -95 } as const;
export const LAKE_RADIUS = { x: 42, z: 39 } as const;
export const LAKE_WATER_LEVEL = 0.08;
export function lakeBoundary(angle: number): number {
  const base = 1 + 0.11 * Math.sin(angle * 3 + 0.7) - 0.06 * Math.cos(angle * 2 - 0.4);
  // Preserve the east footpath and northern waterfall bluff while opening
  // the western and southern coves into the larger basin.
  return base - .08 * Math.max(0, Math.cos(angle)) - .12 * Math.max(0, Math.sin(angle)) ** 4;
}
function deepPocket(x: number, z: number, cx: number, cz: number, rx: number, rz: number, depth: number): number {
  const d = Math.hypot((x - cx) / rx, (z - cz) / rz);
  return depth * (1 - smooth(d));
}
export function lakeDepthAt(x: number, z: number): number {
  const dx = (x - LAKE_CENTER.x) / LAKE_RADIUS.x, dz = (z - LAKE_CENTER.z) / LAKE_RADIUS.z;
  // The two positive outline terms bound every possible shoreline radius.
  const maximumBoundary = 1 + .11 + .06;
  if (Math.abs(dx) > maximumBoundary || Math.abs(dz) > maximumBoundary) return 0;
  const radial = Math.hypot(dx, dz);
  const boundary = lakeBoundary(Math.atan2(dz, dx));
  if (radial >= boundary) return 0;
  // The basin is deep enough to cut below the surrounding meadow, so the
  // player actually swims at the center instead of standing on a buried hill.
  const base = 4.6 * (1 - smooth(radial / boundary));
  // Irregular inner sandbars taper the shallow rim without cutting the central
  // swimming lane. This is shared by water rendering, stream overlap, and movement.
  const angle = Math.atan2(z - LAKE_CENTER.z, x - LAKE_CENTER.x);
  const bar = Math.max(0, Math.sin(angle * 3 + .9) * .5 + .5) * smooth((radial / boundary - .42) / .45) * .34;
  const pockets = deepPocket(x,z,-46,-113,7,5,.9)
    + deepPocket(x,z,-10,-120,8,5,.75)
    + deepPocket(x,z,-4,-82,7,4,.65);
  return (base * (1 - bar) + pockets) * (radial < boundary ? 1 : 0);
}
export function lakeWaterAt(x: number, z: number): number | null {
  const depth = lakeDepthAt(x, z);
  return depth > 0 ? LAKE_WATER_LEVEL : null;
}
export function isSwimmingPosition(x: number, z: number): boolean { return lakeWaterAt(x, z) !== null && LAKE_WATER_LEVEL - overworldHeight(x, z) >= 0.8; }
export const lakeSurface = { center: LAKE_CENTER, radius: LAKE_RADIUS, waterLevel: LAKE_WATER_LEVEL } as const;
function hill(x: number, z: number, cx: number, cz: number, radius: number, height: number): number {
  const t = Math.max(0, 1 - Math.hypot(x-cx,z-cz) / radius);
  return height * t * t * (3 - 2 * t);
}

// Compact domes and precomputed orientations keep the shared movement floor cheap.
const mountainForms = [
  [-76,-84,45,25,-.55,.9], [-84,-8,42,30,.35,1.05],
  [-57,92,44,32,-.8,.8], [31,113,44,38,.2,1.15],
  [99,47,48,34,1.1,.95], [112,-87,40,31,-.35,1.1],
  [64,-156,45,28,.7,.8], [-12,-165,42,34,-1.1,1.05],
].map(([x,z,radius,height,angle,stretch]) => ({
  x:x!, z:z!, radius:radius!, height:height!, cos:Math.cos(angle!), sin:Math.sin(angle!), stretch:stretch!,
}));
function dome(x: number, z: number, cx: number, cz: number, rx: number, rz: number, height: number): number {
  const dx = (x-cx)/rx, dz = (z-cz)/rz;
  const cap = Math.max(0, 1-dx*dx-dz*dz);
  return height*cap*cap;
}
function foldedMountain(x: number, z: number, form: typeof mountainForms[number]): number {
  const dx = x-form.x, dz = z-form.z, r = form.radius;
  if (Math.abs(dx)>r*1.3 || Math.abs(dz)>r*1.3) return 0;
  const u = (dx*form.cos+dz*form.sin)/r;
  const v = (-dx*form.sin+dz*form.cos)/(r*form.stretch);
  const crown = dome(u,v,-.08,-.04,.48,.54,.88);
  const east = dome(u,v,.39,.15,.39,.43,.69);
  const west = dome(u,v,-.38,.32,.38,.46,.57);
  const spur = dome(u,v,.06,-.48,.34,.4,.52);
  const shoulders = dome(u,v,.54,-.23,.27,.33,.24)
    + dome(u,v,-.45,-.3,.31,.26,.3)
    + dome(u,v,-.12,.61,.26,.3,.23)
    + dome(u,v,.31,.48,.23,.27,.18);
  // A rounded union retains shoulders between overlapping masses, without
  // either hard walking seams or the single tall peak of additive hills.
  return form.height*(Math.sqrt(crown*crown+east*east+west*west+spur*spur) + shoulders)
    + hill(x,z,form.x,form.z,r,.24*form.height);
}

function originalDryHeight(x: number, z: number): number {
  // Keep the yard, north road and cave mouth on their authored foundations.
  const townClear = smooth((Math.hypot(x / 1.3, z + 16) - 34) / 16);
  const roadClear = z > -46 && z < 76 ? smooth((Math.abs(x) - 8) / 12) : 1;
  const caveClear = smooth(Math.max(28-x,x-86,-64-z,z+30,0)/12);
  const field = hill(x,z,-27,-79,27,4.8) + hill(x,z,29,-100,30,6.2) + hill(x,z,-42,-114,24,4)
    // A low, broken escarpment meets the lake on the north-west shore.  This
    // supplies the waterfall's lip and keeps the shoreline from becoming a
    // perfectly flat ellipse while retaining a walkable southern approach.
    + hill(x,z,-35,-68,22,4.8)
    + hill(x,z,-28,-87,13,5.2)
    + hill(x,z,33,25,24,5.5) + hill(x,z,-35,48,26,6)
    + dome(x,z,42,31,15,18,2.4) + dome(x,z,24,18,13,16,1.5)
    + dome(x,z,-44,55,17,20,2.7) + dome(x,z,-29,38,14,17,1.8)
    + dome(x,z,40,-109,18,21,2.6) + dome(x,z,20,-90,16,19,1.7);
  let mountains = 0;
  for (const form of mountainForms) mountains += foldedMountain(x,z,form);
  const land = (field + mountains) * townClear * roadClear * caveClear;
  // Lower the meadow floor beneath the lake so the shoreline has a real slope.
  return townHeight(x, z) + land;
}

const regionalRoadSegments = REGION_ROADS.flatMap(road => road.points.slice(1).map((b, index) => ({ a: road.points[index]!, b, width: road.width })));
// Each outcrop has its own silhouette: unequal crowns, low saddles and smaller
// overlapping toes. Compact support keeps distant mountains off the movement path.
const regionalMountains = [
  { x:-156, z:83, mounds:[
    [-9,-3,19,23,13], [13,7,17,19,9], [-1,20,15,13,6],
    [-19,14,12,16,5], [7,-20,16,12,7], [24,-5,10,14,4],
  ] },
  { x:-78, z:190, mounds:[
    [-15,1,22,20,12], [12,-9,18,24,15], [21,19,20,16,8],
    [-7,26,15,16,6], [-28,-17,14,12,5], [29,-20,12,15,7],
  ] },
  { x:205, z:80, mounds:[
    [-8,-12,25,22,23], [20,4,19,26,17], [-18,19,21,18,13],
    [9,29,17,14,9], [-28,-8,13,18,8], [14,-29,16,13,11],
  ] },
  { x:232, z:-104, mounds:[
    [7,-10,22,27,27], [-19,7,24,18,20], [12,25,17,21,16],
    [-24,-21,18,16,12], [29,1,14,19,10], [-10,30,18,13,8],
  ] },
  { x:83, z:184, mounds:[
    [-11,-6,19,16,10], [12,7,15,21,13], [-17,16,13,14,7],
    [8,-18,16,12,6], [25,-5,11,15,5],
  ] },
  { x:160, z:224, mounds:[
    [-13,-7,20,23,17], [13,8,21,17,12], [6,-26,15,14,9],
    [-19,19,15,14,8], [27,-13,12,17,7], [4,27,12,13,5],
  ] },
].map(form => ({
  x:form.x, z:form.z,
  boundX:Math.max(...form.mounds.map(([x,,rx]) => Math.abs(x!)+rx!)),
  boundZ:Math.max(...form.mounds.map(([,z,,rz]) => Math.abs(z!)+rz!)),
  mounds:form.mounds.map(([x,z,rx,rz,height]) => ({ x:x!, z:z!, rx:rx!, rz:rz!, height:height! })),
}));

function regionalMountainHeight(x: number, z: number): number {
  let height = 0;
  for (const form of regionalMountains) {
    const dx=x-form.x, dz=z-form.z;
    if (Math.abs(dx)>form.boundX || Math.abs(dz)>form.boundZ) continue;
    let squared = 0;
    for (const mound of form.mounds) {
      const cap = dome(dx,dz,mound.x,mound.z,mound.rx,mound.rz,mound.height);
      squared += cap*cap;
    }
    height += Math.sqrt(squared);
  }
  return height;
}

function regionalHeight(x: number, z: number): number {
  const rises = regionalMountainHeight(x,z);
  let roadDistance = Infinity;
  if (rises !== 0) for (const { a, b, width } of regionalRoadSegments) {
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz)));
    roadDistance = Math.min(roadDistance, Math.hypot(x-a[0]-t*dx, z-a[1]-t*dz)-width);
  }
  let height = .8 + .35*Math.sin(x/43)*Math.cos(z/39) + rises*smooth(roadDistance/13);
  for (const town of WORLD_SETTLEMENTS) {
    const outside = Math.hypot(Math.max(town.minX-x, 0, x-town.maxX), Math.max(town.minZ-z, 0, z-town.maxZ));
    const pad = town.id === 'suture' ? 2.4 : 1.8;
    height += (pad-height)*(1-smooth(outside/14));
  }
  return height;
}
export function dryOverworldHeight(x: number, z: number): number {
  // Existing saves retain their exact floor; new land joins beyond the former edge.
  const outside = Math.hypot(Math.max(-70-x, 0, x-90), Math.max(-130-z, 0, z-76));
  if (outside === 0) return originalDryHeight(x,z);
  const blend = smooth(outside/28);
  if (blend === 1) return regionalHeight(x,z);
  return originalDryHeight(x,z)*(1-blend) + regionalHeight(x,z)*blend;
}

function basinHeight(x: number, z: number): number {
 const land = dryOverworldHeight(x, z), depth = lakeDepthAt(x, z);
 const basin = smooth(depth / .9);
 return land * (1 - basin) + (LAKE_WATER_LEVEL - depth) * basin;
}

// The stream winds down the western mountain before cascading into the north cove.
const streamAnchors=[[-68,-90],[-60,-83],[-54,-76],[-48,-71],[-44,-66],[-39,-65],[-36,-69],[-34,-74],[-30,-84],[-27,-94]] as const;
export const STREAM_POINTS: readonly {x:number;z:number;y:number;width:number}[] = (()=>{
 const points:{x:number;z:number;y:number;width:number}[]=[];let previous=Infinity;
 for(let i=0;i<streamAnchors.length-1;i++)for(let step=0;step<8;step++){
  const a=streamAnchors[Math.max(0,i-1)]!,b=streamAnchors[i]!,c=streamAnchors[i+1]!,d=streamAnchors[Math.min(streamAnchors.length-1,i+2)]!,t=step/8;
  const coord=(k:0|1)=>.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t);
  const x=coord(0),z=coord(1);
  const y=Math.max(LAKE_WATER_LEVEL,Math.min(previous,basinHeight(x,z)-.18)); previous=y;
  points.push({x,z,y,width:1.15+.18*Math.sin(i+step*.4)});
 }
 return points;
})();
export function streamAt(x:number,z:number):{surface:number;bed:number;distance:number;width:number}|null{
 if(x< -72||x> -22||z< -98||z> -60)return null;
 let nearest:{surface:number;bed:number;distance:number;width:number}|null=null;
 for(let i=1;i<STREAM_POINTS.length;i++){
  const a=STREAM_POINTS[i-1]!,b=STREAM_POINTS[i]!,dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz))),distance=Math.hypot(x-a.x-t*dx,z-a.z-t*dz),width=a.width+(b.width-a.width)*t;
  if(distance>width*1.4||nearest&&distance>=nearest.distance)continue;
  const surface=a.y+(b.y-a.y)*t,profile=Math.max(0,1-(distance/width)**2);
  nearest={surface,bed:surface-(.42+.14*profile)*profile,distance,width};
 }
 return nearest;
}
export function overworldHeight(x:number,z:number):number{
 const land=basinHeight(x,z),stream=streamAt(x,z);
 if(!stream)return land;
 const blend=1-smooth((stream.distance/stream.width-1)/.4);
 return land+(Math.min(land,stream.bed)-land)*blend;
}
