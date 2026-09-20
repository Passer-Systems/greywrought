import { BackSide, Color, DirectionalLight, Fog, HemisphereLight, Mesh, PCFShadowMap, PointLight, ShaderMaterial, SphereGeometry, Vector3, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { inCave } from '../game/cave-layout.js';
import type { Position } from '../game/adventure-types.js';
import { worldDay } from '../game/world-time.js';
import { createLampGlow } from './lamp-glow.js';

/** One celestial shadow map follows the player; local lamps never allocate shadow maps. */
export function createWorldLighting(scene: Scene, renderer: WebGLRenderer) {
  const fill = new HemisphereLight(0xc4d7df, 0x59684e, 1.65);
  const key = new DirectionalLight(0xffefd4, 2.4);
  key.name = 'sun-moon'; key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 170 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = -.00015;
  key.shadow.normalBias = .04;
  key.shadow.radius = 2;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  scene.add(fill, key, key.target);

  const colors = {
    day: new Color(0x4f9bd2), night: new Color(0x101b34), dawn: new Color(0xb67d79),
    horizonDay: new Color(0x8fc4e6), horizonNight: new Color(0x27354c), horizonDawn: new Color(0xd39b71),
    fillDay: new Color(0xc4d7df), fillNight: new Color(0x7895c4),
    groundDay: new Color(0x59684e), groundNight: new Color(0x35414a),
    sun: new Color(0xffefd4), lowSun: new Color(0xffb779), moon: new Color(0xa7bff0),
  };
  const material = new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: new Color() }, horizon: { value: new Color() },
      sunDirection: { value: new Vector3() }, daylight: { value: 1 },
      cloudTime: { value: 0 },
    },
    vertexShader: `varying vec3 skyDirection;
      void main() {
        skyDirection = position;
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = clip.xyww;
      }`,
    fragmentShader: `uniform vec3 zenith, horizon, sunDirection;
      uniform float daylight, cloudTime;
      varying vec3 skyDirection;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(hash(i), hash(i+vec2(1.0,0.0)), f.x), mix(hash(i+vec2(0.0,1.0)), hash(i+vec2(1.0,1.0)), f.x), f.y);
      }
      float cloud(vec2 p) {
        float n = noise(p) * .58 + noise(p * 2.1 + 9.0) * .28 + noise(p * 4.4 - 3.0) * .14;
        return smoothstep(.52, .70, n);
      }
      void main() {
        vec3 direction = normalize(skyDirection);
        vec3 color = mix(horizon, zenith, smoothstep(-0.1, 0.8, direction.y));
        float cloudBand = smoothstep(0.06, 0.22, direction.y);
        vec2 cloudUv = direction.xz / max(0.18, direction.y + 0.2) * 1.7 + vec2(cloudTime * 0.003, cloudTime * 0.0012);
        float clouds = cloud(cloudUv);
        float cloudLight = mix(0.10, 0.90, daylight) * clouds * cloudBand;
        color = mix(color, vec3(0.92, 0.94, 0.93), cloudLight);
        float sun = dot(direction, sunDirection);
        float moon = dot(direction, -sunDirection);
        color += vec3(1.0, 0.65, 0.28) * pow(max(0.0, sun), 48.0) * 0.35;
        color = mix(color, vec3(1.0, 0.93, 0.7), smoothstep(0.9993, 0.99955, sun));
        color = mix(color, vec3(0.82, 0.88, 1.0), smoothstep(0.9993, 0.99955, moon) * (1.0 - daylight));
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new Mesh(new SphereGeometry(1, 24, 12), material);
  sky.onBeforeRender = (_renderer, _scene, camera) => { sky.position.copy(camera.position); sky.updateMatrixWorld(); };
  sky.name = 'sky'; sky.frustumCulled = false; sky.renderOrder = -1;
  scene.add(sky);
  const lamps: PointLight[] = [];
  const lampGlow = createLampGlow(scene);
  const direction = new Vector3();
  const fog = scene.fog instanceof Fog ? scene.fog : new Fog(0x8fc4e6, 115, 320);
  fog.color.copy(colors.horizonDay); fog.near = 115; fog.far = 320;
  scene.fog = fog;
  return {
    collectLamps() {
      lamps.length = 0;
      scene.traverse(object => {
        if (object instanceof PointLight && typeof object.userData.nightIntensity === 'number') lamps.push(object);
      });
      lampGlow.sync(lamps);
    },
    update(wallTimeMillis: number, position: Position, camera: PerspectiveCamera) {
      const day = worldDay(wallTimeMillis);
      const cave = inCave(position) ? Math.min(1, Math.max(0, (position.x - 28) / 10)) : 0;
      const sunUp = day.sunDirection.y >= 0;
      direction.copy(sunUp ? day.sunDirection : day.moonDirection);
      const elevation = Math.min(1, direction.y / .2);
      const strength = elevation * elevation * (3 - 2 * elevation);
      fill.color.copy(colors.fillNight).lerp(colors.fillDay, day.daylight * (1 - cave));
      fill.groundColor.copy(colors.groundNight).lerp(colors.groundDay, day.daylight * (1 - cave));
      fill.intensity = (.95 + .7 * day.daylight) * (1 - cave) + .95 * cave;
      key.color.copy(sunUp ? colors.lowSun : colors.moon);
      if (sunUp) key.color.lerp(colors.sun, 1 - day.twilight);
      key.intensity = strength * (sunUp ? 2.4 : .9) * (1 - cave * .9);
      key.target.position.set(position.x, position.y, position.z);
      key.position.copy(key.target.position).addScaledVector(direction, 100);
      material.uniforms.zenith!.value.copy(colors.night).lerp(colors.day, day.daylight).lerp(colors.dawn, day.twilight * .45);
      material.uniforms.horizon!.value.copy(colors.horizonNight).lerp(colors.horizonDay, day.daylight).lerp(colors.horizonDawn, day.twilight * .7);
      material.uniforms.sunDirection!.value.copy(day.sunDirection);
      material.uniforms.daylight!.value = day.daylight;
      material.uniforms.cloudTime!.value = (wallTimeMillis % 86_400_000) * 0.001;
      fog.color.copy(material.uniforms.horizon!.value);
      sky.position.copy(camera.position);
      sky.visible = cave < 1;
      for (const lamp of lamps) lamp.intensity = lamp.userData.nightIntensity * (1 - day.daylight * .65);
      lampGlow.update(wallTimeMillis * 0.001, day.daylight);
      const data = renderer.domElement.dataset;
      data.worldPhase = day.phase; data.worldHour = day.hour.toFixed(3);
      data.shadowOwner = sunUp ? 'sun' : 'moon';
    },
    dispose() {
      key.shadow.dispose();
      sky.removeFromParent(); sky.geometry.dispose(); material.dispose();
      lampGlow.dispose();
      fill.removeFromParent(); key.removeFromParent(); key.target.removeFromParent();
    },
  };
}
