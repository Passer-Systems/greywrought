import { CanvasTexture, DoubleSide, DynamicDrawUsage, Group, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry, SkinnedMesh, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from 'three';
import { terrainHeight } from '../game/cave-layout.js';
import type { ForestActor } from './frostwood-assets.js';

/** Socket centers belong to the authored Skull mesh; skin them with the face. */
export function createCinderFlames(actor: ForestActor, scene: Object3D) {
  let skull: SkinnedMesh | undefined;
  actor.model.traverse(object => { if (object instanceof SkinnedMesh) skull ??= object; });
  if (!skull) throw new Error('Cinder Watchman is missing its authored skull skin');
  const mesh = skull;
  const texture = createCinderTexture();
  const eyes = new Group(); eyes.name = 'cinder-socket-flames'; actor.root.add(eyes);
  const position = mesh.geometry.getAttribute('position');
  const anchor = new Vector3();
  const sockets = [-1, 1].map(side => {
    const center = new Vector3(side * .4186567, .854756, .372381);
    let vertex = 0, nearest = Infinity;
    for (let index = 0; index < position.count; index++) {
      const gap = anchor.fromBufferAttribute(position, index).distanceToSquared(center);
      if (gap < nearest) { nearest = gap; vertex = index; }
    }
    // Normal alpha preserves red-orange instead of adding a white dot to sunlit bone.
    const material = new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
    const flame = new Sprite(material); flame.name = side < 0 ? 'cinder-left-eye' : 'cinder-right-eye';
    flame.center.set(.5, .26); eyes.add(flame);
    return { vertex, center, flame, side };
  });
  const capacity = 20, lifetime = .65;
  const trailMaterial = new MeshBasicMaterial({ map: texture, transparent: true, alphaTest: .03, depthWrite: false, side: DoubleSide, toneMapped: false });
  const geometry = new PlaneGeometry(1, 1); geometry.translate(0, .5, 0);
  const trail = new InstancedMesh(geometry, trailMaterial, capacity * 2);
  trail.name = 'cinder-ember-trail'; trail.frustumCulled = false; trail.count = 0;
  trail.instanceMatrix.setUsage(DynamicDrawUsage); scene.add(trail);
  const samples = Array.from({ length: capacity }, () => ({ position: new Vector3(), age: lifetime, seed: 0 }));
  const transform = new Object3D(), previous = new Vector3();
  let next = 0, sequence = 0, sampled = false, sampleTime = 0;
  return {
    update(elapsed: number, delta: number, alive: boolean, moving: boolean) {
      eyes.visible = trail.visible = alive;
      if (!alive) { for (const sample of samples) sample.age = lifetime; sampled = false; trail.count = 0; return; }
      texture.offset.x = Math.floor(elapsed * 24) % 16 / 16;
      actor.root.updateWorldMatrix(true, true); mesh.skeleton.update();
      for (const { vertex, center, flame, side } of sockets) {
        anchor.copy(center); mesh.applyBoneTransform(vertex, anchor);
        mesh.localToWorld(anchor); eyes.worldToLocal(anchor); flame.position.copy(anchor);
        flame.scale.set(.272 + .02 * Math.sin(elapsed * 13 + side), .392 + .052 * Math.sin(elapsed * 17 + side), 1);
        flame.material.rotation = .1 * Math.sin(elapsed * 9 + side);
      }
      for (const sample of samples) sample.age += delta;
      actor.root.getWorldPosition(anchor);
      sampleTime += delta;
      const distance = sampled ? Math.hypot(anchor.x - previous.x, anchor.z - previous.z) : 0;
      if (moving && sampled && distance > .00001 && distance < 2 && sampleTime >= .035) {
        const sample = samples[next]!; next = (next + 1) % capacity;
        sample.seed = sequence++; sample.age = 0;
        sample.position.copy(anchor);
        sample.position.x += .12 * Math.sin(sample.seed * 2.4);
        sample.position.z += .12 * Math.cos(sample.seed * 2.4);
        sample.position.y = terrainHeight(sample.position.x, sample.position.z) + .035;
        sampleTime = 0;
      }
      previous.copy(anchor); sampled = true;
      let count = 0;
      for (const sample of samples) {
        if (sample.age >= lifetime) continue;
        const remaining = 1 - sample.age / lifetime;
        transform.position.copy(sample.position);
        transform.scale.set(.26 * remaining, (.38 + .08 * Math.sin(elapsed * 19 + sample.seed)) * remaining, 1);
        for (let side = 0; side < 2; side++) {
          transform.rotation.y = sample.seed * 2.4 + side * Math.PI / 2;
          transform.updateMatrix(); trail.setMatrixAt(count++, transform.matrix);
        }
      }
      trail.count = count; trail.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      eyes.removeFromParent(); trail.removeFromParent(); geometry.dispose(); trailMaterial.dispose();
      for (const socket of sockets) socket.flame.material.dispose();
      texture.dispose();
    },
  };
}

function createCinderTexture() {
  const width = 64, height = 96, frames = 16;
  const canvas = document.createElement('canvas'); canvas.width = width * frames; canvas.height = height;
  const context = canvas.getContext('2d')!;
  const pixels = context.createImageData(canvas.width, height);
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const hash = (x: number, y: number) => {
    const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x), iy = Math.floor(y), fx = smooth(x - ix), fy = smooth(y - iy);
    const lower = hash(ix, iy) * (1 - fx) + hash(ix + 1, iy) * fx;
    const upper = hash(ix, iy + 1) * (1 - fx) + hash(ix + 1, iy + 1) * fx;
    return lower * (1 - fy) + upper * fy;
  };
  for (let frame = 0; frame < frames; frame++) {
    const phase = frame / frames * Math.PI * 2;
    for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
      const x = (px + .5) / width * 2 - 1, rise = 1 - (py + .5) / height;
      // A looping upward noise field tears the plume, while the source remains seated.
      const drift = Math.sin(phase - rise * 7);
      const coarse = noise(x * 5 + Math.cos(phase) * .8, rise * 8 - Math.sin(phase) * 1.5);
      const fine = noise(x * 13 + Math.sin(phase) * 1.2, rise * 19 + Math.cos(phase) * 2);
      const center = .15 * drift * rise + (coarse - .5) * .22 * rise;
      const spread = .46 * Math.pow(Math.max(.02, 1 - rise), .7);
      const body = Math.exp(-Math.pow((x - center) / spread, 2) * 1.5);
      const turbulence = .56 * coarse + .44 * fine;
      const density = body - rise * (.21 + .56 * turbulence);
      const foot = smooth(rise / .12), tip = smooth((1 - rise) / .15);
      const alpha = smooth((density + .03) / .6) * foot * tip;
      const heat = clamp(body * .7 + (1 - rise) * .33 - turbulence * .15);
      const core = smooth((heat - .7) / .3);
      const index = (py * canvas.width + frame * width + px) * 4;
      pixels.data[index] = 215 + 40 * heat;
      pixels.data[index + 1] = 27 + 88 * heat + 80 * core;
      pixels.data[index + 2] = 2 + 7 * heat + 39 * core;
      pixels.data[index + 3] = alpha * 235;
    }
  }
  context.putImageData(pixels, 0, 0);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; texture.repeat.x = 1 / frames; return texture;
}

export function createFlameTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const glow = context.createRadialGradient(16,43,0,16,38,23);
  glow.addColorStop(0,'#fff4bb'); glow.addColorStop(.25,'#ffd36a'); glow.addColorStop(.55,'#ff7023c0'); glow.addColorStop(1,'#ff310000');
  context.fillStyle=glow; context.beginPath();context.moveTo(16,2);context.bezierCurveTo(12,25,0,35,7,51);context.bezierCurveTo(12,66,31,55,26,42);context.bezierCurveTo(24,29,17,18,16,2);context.fill();
  return new CanvasTexture(canvas);
}
