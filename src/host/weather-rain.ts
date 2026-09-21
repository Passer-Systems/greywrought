import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, LineSegments, Matrix4, PlaneGeometry, ShaderMaterial } from 'three';
import type { Position } from '../game/adventure-types.js';
import { inCave, terrainHeight } from '../game/cave-layout.js';
import { lakeWaterAt } from '../game/world-elevation.js';

const hash = (i: number) => { const n = Math.sin(i * 127.1 + 91.7) * 43758.5453; return n - Math.floor(n); };
const COUNT = 3000, IMPACTS = 120, SPAN = 42, HEIGHT = 22;

/** World-space drops retain their trajectory while the player and camera move. */
export function createWeatherRain(parent: Group) {
  const positions = new Float32Array(COUNT * 6), fades = new Float32Array(COUNT * 2);
  const floor = new Float32Array(COUNT), water = new Uint8Array(COUNT), cycles = new Uint32Array(COUNT);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3).setUsage(DynamicDrawUsage));
  for (let i = 0; i < COUNT; i++) { fades[i * 2] = .08; fades[i * 2 + 1] = .35 + hash(i + 3) * .65; }
  geometry.setAttribute('fade', new BufferAttribute(fades, 1));
  const uniforms = { opacity: { value: 0 }, tint: { value: new Color(0xc4ced0) } };
  const material = new ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `attribute float fade; varying float alpha; varying float distanceToEye;
      void main(){vec4 view=modelViewMatrix*vec4(position,1.);alpha=fade;distanceToEye=length(view.xyz);gl_Position=projectionMatrix*view;}`,
    fragmentShader: `uniform float opacity;uniform vec3 tint;varying float alpha;varying float distanceToEye;
      void main(){float edge=smoothstep(1.,3.,distanceToEye)*(1.-smoothstep(25.,45.,distanceToEye));gl_FragColor=vec4(tint,alpha*opacity*edge);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const drops = new LineSegments(geometry, material); drops.name = 'weather-rain'; drops.frustumCulled = false; parent.add(drops);
  const impactGeometry = new PlaneGeometry(1, 1); impactGeometry.rotateX(-Math.PI / 2);
  const ages = new Float32Array(IMPACTS).fill(1), waters = new Float32Array(IMPACTS);
  impactGeometry.setAttribute('impactAge', new InstancedBufferAttribute(ages, 1).setUsage(DynamicDrawUsage));
  impactGeometry.setAttribute('impactWater', new InstancedBufferAttribute(waters, 1).setUsage(DynamicDrawUsage));
  const impactMaterial = new ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `attribute float impactAge,impactWater;varying vec2 point;varying float age,isWater;
      void main(){point=uv*2.-1.;age=impactAge;isWater=impactWater;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float opacity;uniform vec3 tint;varying vec2 point;varying float age,isWater;
      void main(){float radius=length(point),ringRadius=.12+age*.74;
      float ring=1.-smoothstep(.025,.085,abs(radius-ringRadius));
      float flecks=.4+.6*pow(abs(sin(atan(point.y,point.x)*3.)),8.);
      float alpha=ring*mix(flecks,1.,isWater)*pow(1.-age,2.)*opacity*.65;
      gl_FragColor=vec4(tint,alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const impacts = new InstancedMesh(impactGeometry, impactMaterial, IMPACTS);
  impacts.name = 'weather-rain-impacts'; impacts.frustumCulled = false; impacts.instanceMatrix.setUsage(DynamicDrawUsage); parent.add(impacts);
  const matrix = new Matrix4(); let nextImpact = 0, initialized = false, floorClock = 0;
  let anchorX = 0, anchorZ = 0;
  function surface(i: number) {
    const k = i * 6, x = positions[k]!, z = positions[k + 2]!;
    const ground = terrainHeight(x, z), lake = lakeWaterAt(x, z);
    water[i] = lake !== null && lake > ground ? 1 : 0;
    floor[i] = Math.max(ground, lake ?? -Infinity);
  }
  function respawn(i: number, player: Position, scatterHeight: boolean) {
    const k = i * 6, seed = i + cycles[i]! * 3011;
    positions[k] = player.x + (hash(seed + 801) - .5) * SPAN;
    positions[k + 2] = player.z + (hash(seed + 901) - .5) * SPAN;
    surface(i);
    positions[k + 1] = Math.max(player.y, floor[i]!) + (scatterHeight ? hash(seed + 1001) * HEIGHT : HEIGHT);
    positions[k + 3] = positions[k]!; positions[k + 4] = positions[k + 1]!; positions[k + 5] = positions[k + 2]!;
    cycles[i]!++;
  }
  return {
    update(time: number, delta: number, player: Position, intensity: number, high: boolean, daylight: number) {
      drops.visible = impacts.visible = intensity > .005;
      if (!drops.visible) { initialized = false; ages.fill(1); return; }
      const count = high ? COUNT : 650, impactCount = high ? IMPACTS : 36;
      geometry.setDrawRange(0, count * 2); impacts.count = impactCount;
      uniforms.opacity.value = intensity * (.21 + .11 * daylight);
      if (!initialized || Math.hypot(player.x - anchorX, player.z - anchorZ) > SPAN) {
        for (let i = 0; i < COUNT; i++) respawn(i, player, true);
        ages.fill(1); initialized = true;
      }
      anchorX = player.x; anchorZ = player.z;
      const dt = Math.min(delta, .1), wind = .95 + Math.sin(time * .37) * .35 + Math.sin(time * .13) * .2;
      floorClock += dt; const refresh = floorClock >= .16; if (refresh) floorClock = 0;
      for (let i = 0; i < impactCount; i++) ages[i] = Math.min(1, ages[i]! + dt / (waters[i] ? .65 : .28));
      let impactBudget = high ? 10 : 3;
      for (let i = 0; i < count; i++) {
        const k = i * 6, seed = hash(i + 701), speed = 12 + seed * 8;
        positions[k] = positions[k + 3]! + wind * dt; positions[k + 2] = positions[k + 5]! + .55 * dt; positions[k + 1] = positions[k + 4]! - speed * dt;
        if (refresh) surface(i);
        if (positions[k + 1]! <= floor[i]!) {
          const x = positions[k]!, z = positions[k + 2]!;
          if (impactBudget > 0 && Math.hypot(x - player.x, z - player.z) < 21 && !inCave({ x, z })) {
            const slot = nextImpact++ % impactCount, size = water[i] ? .8 + seed * .5 : .2 + seed * .18;
            matrix.makeScale(size, 1, size); matrix.setPosition(x, floor[i]! + .045, z); impacts.setMatrixAt(slot, matrix);
            ages[slot] = 0; waters[slot] = water[i]!; impactBudget--;
          }
          respawn(i, player, false);
        } else if (Math.abs(positions[k]! - player.x) > SPAN / 2 || Math.abs(positions[k + 2]! - player.z) > SPAN / 2) respawn(i, player, true);
        const length = .18 + seed * .42;
        // The faint tail follows the actual velocity; the bright head hits the surface.
        positions[k + 3] = positions[k]!; positions[k + 4] = positions[k + 1]!; positions[k + 5] = positions[k + 2]!;
        positions[k]! -= wind / speed * length; positions[k + 1]! += length; positions[k + 2]! -= .55 / speed * length;
        if (inCave({ x: positions[k]!, z: positions[k + 2]! })) positions[k + 1] = positions[k + 4] = floor[i]! - 2;
      }
      geometry.getAttribute('position').needsUpdate = true;
      impactGeometry.getAttribute('impactAge').needsUpdate = true; impactGeometry.getAttribute('impactWater').needsUpdate = true;
      impacts.instanceMatrix.needsUpdate = true;
      drops.userData.activeDrops = count; impacts.userData.activeImpacts = ages.subarray(0, impactCount).filter(age => age < 1).length;
    },
    hide() { drops.visible = impacts.visible = false; initialized = false; },
    dispose() { geometry.dispose(); material.dispose(); impactGeometry.dispose(); impactMaterial.dispose(); drops.removeFromParent(); impacts.removeFromParent(); },
  };
}
