import { BufferGeometry, Float32BufferAttribute, Group, Mesh, Scene, ShaderMaterial } from 'three';
import { LAKE_WATER_LEVEL, lakeDepthAt, overworldHeight } from '../game/world-elevation.js';
import { worldDay } from '../game/world-time.js';
import { MEADOW_WATER, WATER_WAVES } from './world-water.js';

type Swimmer = { id: string; position: { x: number; y: number; z: number }; active: boolean };
type Stamp = { x: number; z: number; dx: number; dz: number; age: number; strength: number };
const LIMIT = 96, LIFE = 2.6, SEGMENTS = 8, VERTS = SEGMENTS * 12;
const vert = `
attribute float alpha, edge, waterDepth;
uniform float time, waveHeight, shoreHeight;
uniform vec2 wind;
varying float vAlpha, vEdge;
${WATER_WAVES}
void main(){
 vAlpha=alpha;vEdge=edge;
 vec3 p=position;
 p.y+=surfaceLift(p.xz,waterDepth,time)+shoreLift(p.xz,waterDepth,time);
 gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}`;
const frag = `
uniform float daylight;
varying float vAlpha, vEdge;
void main(){
 float feather=1.-smoothstep(.08,1.,abs(vEdge));
 gl_FragColor=vec4(.51+.15*daylight,.66+.18*daylight,.65+.17*daylight,vAlpha*feather*(.13+.17*daylight));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export function createSwimmingWake(parent: Group | Scene) {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(LIMIT * VERTS * 3), 3));
  for (const name of ['alpha', 'edge', 'waterDepth']) geometry.setAttribute(name, new Float32BufferAttribute(new Float32Array(LIMIT * VERTS), 1));
  const material = new ShaderMaterial({ transparent: true, depthWrite: false, depthTest: true, side: 2,
    uniforms: { daylight: { value: 1 }, time: { value: 0 }, waveHeight: { value: .03 }, shoreHeight: { value: MEADOW_WATER.movement.shoreHeight }, wind: { value: MEADOW_WATER.movement.wind } },
    vertexShader: vert, fragmentShader: frag });
  const mesh = new Mesh(geometry, material); mesh.name = 'swimming-wake'; mesh.renderOrder = 3; mesh.frustumCulled = false; parent.add(mesh);
  const previous = new Map<string, { x: number; z: number; carry: number }>();
  const stamps: Stamp[] = [];
  function update(deltaSeconds: number, swimmers: readonly Swimmer[], wallTimeMillis: number) {
    for (let i = stamps.length - 1; i >= 0; i--) { stamps[i]!.age += deltaSeconds; if (stamps[i]!.age >= LIFE) stamps.splice(i, 1); }
    const live = new Set<string>();
    for (const swimmer of swimmers) {
      live.add(swimmer.id);
      const old = previous.get(swimmer.id);
      if (!old) { previous.set(swimmer.id, { x: swimmer.position.x, z: swimmer.position.z, carry: 0 }); continue; }
      const dx = swimmer.position.x - old.x, dz = swimmer.position.z - old.z, distance = Math.hypot(dx, dz);
      if (!swimmer.active || distance >= 2) old.carry = 0;
      else if (distance > .00001 && lakeDepthAt(swimmer.position.x, swimmer.position.z) > .08) {
        old.carry += distance;
        const spacing = .7;
        while (old.carry >= spacing) {
          old.carry -= spacing;
          if (stamps.length >= LIMIT) stamps.shift();
          stamps.push({ x: swimmer.position.x - dx / distance * (old.carry + .18), z: swimmer.position.z - dz / distance * (old.carry + .18),
            dx: dx / distance, dz: dz / distance, age: 0, strength: Math.min(1, distance / Math.max(.001, deltaSeconds) / 2.1) });
        }
      }
      old.x = swimmer.position.x; old.z = swimmer.position.z;
    }
    const p = geometry.getAttribute('position'), a = geometry.getAttribute('alpha'), e = geometry.getAttribute('edge'), d = geometry.getAttribute('waterDepth');
    let cursor = 0;
    for (const stamp of stamps) {
      const sideX = -stamp.dz, sideZ = stamp.dx;
      const life = stamp.age / LIFE, fade = Math.min(1, stamp.age / .14) * (1 - life) ** 1.5 * stamp.strength;
      const radius = .32 + stamp.age * .66, width = .07 + life * .12;
      const put = (t: number, sign: number, edge: number) => {
        // Crests spread from their emission points, preserving bends in the
        // swimmer's path instead of snapping the entire trail on a turn.
        const angle = .2 + t * 1.55, r = radius + edge * width;
        const across = Math.sin(angle) * r * sign, behind = (.32 + 1 - Math.cos(angle)) * r;
        const x = stamp.x + sideX * across - stamp.dx * behind, z = stamp.z + sideZ * across - stamp.dz * behind;
        const basinDepth = lakeDepthAt(x, z);
        const depth = basinDepth >= .9 ? basinDepth : Math.max(0, Math.min(basinDepth, LAKE_WATER_LEVEL - overworldHeight(x, z)));
        const taper = Math.sin(t * Math.PI) ** .6;
        p.setXYZ(cursor, x, LAKE_WATER_LEVEL + .009, z);
        a.setX(cursor, fade * taper * Math.min(1, depth / .18)); e.setX(cursor, edge); d.setX(cursor, depth); cursor++;
      };
      for (const sign of [-1, 1]) for (let segment = 0; segment < SEGMENTS; segment++) {
        const t0 = segment / SEGMENTS, t1 = (segment + 1) / SEGMENTS;
        put(t0, sign, -1); put(t0, sign, 1); put(t1, sign, -1);
        put(t0, sign, 1); put(t1, sign, 1); put(t1, sign, -1);
      }
    }
    for (const attribute of [p, a, e, d]) attribute.needsUpdate = true;
    geometry.setDrawRange(0, cursor); mesh.visible = cursor > 0; mesh.userData.activeStampCount = stamps.length;
    material.uniforms.daylight!.value = worldDay(wallTimeMillis).daylight;
    material.uniforms.time!.value = (wallTimeMillis % 3_600_000) * .001 * MEADOW_WATER.movement.speed;
    material.uniforms.waveHeight!.value = MEADOW_WATER.movement.waveHeight * (.8 + .2 * Math.sin(wallTimeMillis * .00004));
    for (const id of previous.keys()) if (!live.has(id)) previous.delete(id);
  }
  return { update, clear() { stamps.length = 0; previous.clear(); mesh.visible = false; mesh.userData.activeStampCount = 0; geometry.setDrawRange(0, 0); },
    dispose() { parent.remove(mesh); geometry.dispose(); material.dispose(); } };
}
