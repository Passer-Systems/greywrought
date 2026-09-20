import { BufferGeometry, Float32BufferAttribute, Group, Mesh, Scene, ShaderMaterial } from 'three';
import { LAKE_WATER_LEVEL, lakeDepthAt } from '../game/world-elevation.js';
import { worldDay } from '../game/world-time.js';

type Swimmer = { id: string; position: { x: number; y: number; z: number }; active: boolean };
type Stamp = { x: number; z: number; dx: number; dz: number; age: number; size: number };
const LIMIT = 96, LIFE = 2;
const vert = `attribute float alpha; varying float vAlpha; void main(){vAlpha=alpha;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const frag = `uniform float daylight; varying float vAlpha; void main(){gl_FragColor=vec4(.55+.17*daylight,.78+.15*daylight,.73+.13*daylight,vAlpha*(.22+.2*daylight));
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
export function createSwimmingWake(parent: Group | Scene) {
  const positions = new Float32Array(LIMIT * 12 * 3), alphas = new Float32Array(LIMIT * 12);
  const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.setAttribute('alpha', new Float32BufferAttribute(alphas, 1));
  const material = new ShaderMaterial({ transparent: true, depthWrite: false, depthTest: true, side: 2, uniforms: { daylight: { value: 1 } }, vertexShader: vert, fragmentShader: frag });
  const mesh = new Mesh(geometry, material); mesh.name = 'swimming-wake'; mesh.renderOrder = 3; mesh.frustumCulled = false; parent.add(mesh);
  const previous = new Map<string, { x: number; z: number; carry: number }>(); const stamps: Stamp[] = [];
  function update(deltaSeconds: number, swimmers: readonly Swimmer[], wallTimeMillis: number) {
    const live = new Set<string>();
    for (const swimmer of swimmers) {
      live.add(swimmer.id); const old = previous.get(swimmer.id); if (!old) { previous.set(swimmer.id, { x: swimmer.position.x, z: swimmer.position.z, carry: 0 }); continue; }
      const dx = swimmer.position.x - old.x, dz = swimmer.position.z - old.z, distance = Math.hypot(dx, dz);
      if (!swimmer.active || distance >= 2) old.carry=0;
      else if (distance > .00001 && lakeDepthAt(swimmer.position.x, swimmer.position.z) > .08) { old.carry += distance; const spacing = .52; while (old.carry >= spacing) { old.carry -= spacing; if (stamps.length >= LIMIT) stamps.shift(); stamps.push({ x: swimmer.position.x-dx/distance*old.carry, z: swimmer.position.z-dz/distance*old.carry, dx: dx / distance, dz: dz / distance, age: 0, size: .45 }); } }
      old.x = swimmer.position.x; old.z = swimmer.position.z;
    }
    for (let i = stamps.length - 1; i >= 0; i--) { stamps[i]!.age += deltaSeconds; stamps[i]!.size += deltaSeconds * .65; if (stamps[i]!.age > LIFE) stamps.splice(i, 1); }
    const p = geometry.getAttribute('position') as Float32BufferAttribute, a = geometry.getAttribute('alpha') as Float32BufferAttribute; let cursor = 0;
    for (const stamp of stamps.slice(-LIMIT)) {
      const sideX = -stamp.dz, sideZ = stamp.dx, backX = -stamp.dx, backZ = -stamp.dz, fade = 1 - stamp.age / LIFE;
      const wave = Math.sin((wallTimeMillis * .001) + stamp.x * 1.7 + stamp.z) * .012;
      const put = (x:number,z:number,alpha:number) => { const shore = Math.min(1, lakeDepthAt(x,z) / .12); p.setXYZ(cursor, x, LAKE_WATER_LEVEL + .012 + wave, z); a.setX(cursor, alpha * shore); cursor++; };
      const arm = (sx:number,sz:number) => { const len = stamp.size * (1 + stamp.age * .25), width = .035 + stamp.age * .02; put(stamp.x + sx * width, stamp.z + sz * width, fade); put(stamp.x + sx * len, stamp.z + sz * len, fade * .15); put(stamp.x + sx * len + backX * width, stamp.z + sz * len + backZ * width, fade * .15); put(stamp.x + sx * width, stamp.z + sz * width, fade); put(stamp.x + sx * len + backX * width, stamp.z + sz * len + backZ * width, fade * .15); put(stamp.x + backX * width, stamp.z + backZ * width, fade); };
      arm(sideX + backX * .35, sideZ + backZ * .35); arm(-sideX + backX * .35, -sideZ + backZ * .35);
    }
    p.needsUpdate = true; a.needsUpdate = true; geometry.setDrawRange(0, cursor); mesh.visible = cursor > 0; mesh.userData.activeStampCount = stamps.length; material.uniforms.daylight!.value = worldDay(wallTimeMillis).daylight; for (const id of previous.keys()) if (!live.has(id)) previous.delete(id);
  }
  return { update, clear() { stamps.length = 0; previous.clear(); mesh.userData.activeStampCount = 0; geometry.setDrawRange(0, 0); }, dispose() { parent.remove(mesh); geometry.dispose(); material.dispose(); } };
}
