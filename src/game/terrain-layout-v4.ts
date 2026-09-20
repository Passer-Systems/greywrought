// Historical floor: version 4 saves measure height relative to this exact surface.
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
function townHeight(x: number, z: number): number {
  const dx = Math.max(-26 - x, 0, x - 26);
  const dz = Math.max(-40 - z, 0, z);
  const t = Math.min(1, Math.hypot(dx, dz) / 6);
  return 1.6 * (1 - t * t * (3 - 2 * t));
}
/** The southern meadow lake: a shallow, walkable rim around a deeper swimming basin. */
// The southern basin is intentionally broad enough to read as a real lake from
// the normal camera.  Its eastern edge stops short of the x=16 footpath while
// the irregular boundary leaves coves and a rocky north-west inlet.
export const LAKE_CENTER = { x: -27, z: -95 } as const;
export const LAKE_RADIUS = { x: 40, z: 35 } as const;
export const LAKE_WATER_LEVEL = 0.08;
export function lakeBoundary(angle: number): number {
  return 1 + 0.11 * Math.sin(angle * 3 + 0.7) - 0.06 * Math.cos(angle * 2 - 0.4);
}
export function lakeDepthAt(x: number, z: number): number {
  const radial = Math.hypot((x - LAKE_CENTER.x) / LAKE_RADIUS.x, (z - LAKE_CENTER.z) / LAKE_RADIUS.z);
  const boundary = lakeBoundary(Math.atan2((z-LAKE_CENTER.z)/LAKE_RADIUS.z,(x-LAKE_CENTER.x)/LAKE_RADIUS.x));
  if (radial >= boundary) return 0;
  // The basin is deep enough to cut below the surrounding meadow, so the
  // player actually swims at the center instead of standing on a buried hill.
  const base = 4.6 * (1 - smooth(radial / boundary));
  // Irregular inner sandbars taper the shallow rim without cutting the central
  // swimming lane. This is shared by water rendering, stream overlap, and movement.
  const angle = Math.atan2(z - LAKE_CENTER.z, x - LAKE_CENTER.x);
  const bar = Math.max(0, Math.sin(angle * 3 + .9) * .5 + .5) * smooth((radial / boundary - .42) / .45) * .34;
  return base * (1 - bar);
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

export function dryOverworldHeight(x: number, z: number): number {
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
    + hill(x,z,33,25,24,5.5) + hill(x,z,-35,48,26,6);
  const mountains = hill(x,z,-76,-84,45,25) + hill(x,z,-84,-8,42,30) + hill(x,z,-57,92,44,32)
    + hill(x,z,31,113,44,38) + hill(x,z,99,47,48,34) + hill(x,z,112,-87,40,31)
    + hill(x,z,64,-156,45,28) + hill(x,z,-12,-165,42,34);
  const land = (field + mountains) * townClear * roadClear * caveClear;
  // Lower the meadow floor beneath the lake so the shoreline has a real slope.
  return townHeight(x, z) + land;
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
