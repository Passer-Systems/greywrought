import { BackSide, Color, DirectionalLight, Fog, HemisphereLight, Mesh, PCFShadowMap, PointLight, ShaderMaterial, SphereGeometry, Vector3, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { lakeWaterAt } from '../game/world-elevation.js';
import { inCave } from '../game/cave-layout.js';
import type { Position } from '../game/adventure-types.js';
import { worldDay, worldRain } from '../game/world-time.js';
import { createLampGlow } from './lamp-glow.js';
import { updateTorchFlames } from './torch-flame.js';

/** One celestial shadow map follows the player; local lamps never allocate shadow maps. */
export function createWorldLighting(scene: Scene, renderer: WebGLRenderer) {
  const fill = new HemisphereLight(0xa6c4d2, 0x46584b, 1.15);
  const key = new DirectionalLight(0xffe1b0, 3);
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
    day: new Color(0x6194b0), night: new Color(0x101b34), dawn: new Color(0x9d8581),
    horizonDay: new Color(0xa1bfc5), horizonNight: new Color(0x27354c), horizonDawn: new Color(0xd6ac7b),
    fillDay: new Color(0xa6c4d2), fillNight: new Color(0x94adcc),
    groundDay: new Color(0x46584b), groundNight: new Color(0x35414a),
    sun: new Color(0xffe1b0), lowSun: new Color(0xffb364), moon: new Color(0xa7bff0),
    rainSky: new Color(0x626f77), rainHorizon: new Color(0x8d9b9d), rainFill: new Color(0xb9c8cd),
  };
  const material = new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: new Color() }, horizon: { value: new Color() },
      sunDirection: { value: new Vector3() }, daylight: { value: 1 },
      cloudTime: { value: 0 }, rain: { value: 0 },
    },
    vertexShader: `varying vec3 skyDirection;
      void main() {
        skyDirection = position;
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = clip.xyww;
      }`,
    fragmentShader: `uniform vec3 zenith, horizon, sunDirection;
      uniform float daylight, cloudTime, rain;
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
        vec3 color = mix(horizon, zenith, smoothstep(0.06, 0.8, direction.y));
        float cloudBand = smoothstep(0.06, 0.22, direction.y);
        vec2 cloudUv = direction.xz / max(0.18, direction.y + 0.2) * 1.7 + vec2(cloudTime * 0.003, cloudTime * 0.0012);
        float clouds = mix(cloud(cloudUv), .45 + .2 * noise(cloudUv * .7), rain);
        float cloudLight = mix(0.10, 0.90, daylight) * clouds * cloudBand * (1. - rain * .7);
        color = mix(color, vec3(0.92, 0.94, 0.93), cloudLight);
        float sun = dot(direction, sunDirection);
        float moon = dot(direction, -sunDirection);
        color += vec3(1.0, 0.65, 0.28) * pow(max(0.0, sun), 64.0) * 0.18 * (1. - rain);
        color = mix(color, vec3(5.0, 3.8, 2.2), smoothstep(0.9993, 0.99955, sun) * (1. - rain));
        color = mix(color, vec3(1.6, 1.85, 2.3), smoothstep(0.9993, 0.99955, moon) * (1.0 - daylight) * (1. - rain));
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
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
  // Finish the distant fade before the camera's far plane;
  // the nearby play space stays clear and the low sky uses this same horizon.
  const fog = scene.fog instanceof Fog ? scene.fog : new Fog(0x8fc4e6, 90, 175);
  fog.color.copy(colors.horizonDay); fog.near = 90; fog.far = 175;
  scene.fog = fog;
  return {
    collectLamps() {
      lamps.length = 0;
      scene.traverse(object => {
        if (object instanceof PointLight && typeof object.userData.nightIntensity === 'number') lamps.push(object);
      });
      lampGlow.sync(lamps);
    },
    update(wallTimeMillis: number, position: Position, camera: PerspectiveCamera, rainIntensity = worldRain(wallTimeMillis * .001), animationTimeSeconds: number) {
      const day = worldDay(wallTimeMillis);
      const water = lakeWaterAt(camera.position.x, camera.position.z);
      const underwater = water !== null && camera.position.y < water - .035;
      const cave = inCave(position) ? Math.min(1, Math.max(0, (position.x - 28) / 10)) : 0;
      const rain = rainIntensity * (1 - cave);
      const sunUp = day.sunDirection.y >= 0;
      direction.copy(sunUp ? day.sunDirection : day.moonDirection);
      const elevation = Math.min(1, direction.y / .2);
      const strength = elevation * elevation * (3 - 2 * elevation);
      fill.color.copy(colors.fillNight).lerp(colors.fillDay, day.daylight * (1 - cave));
      fill.color.lerp(colors.rainFill, rain * day.daylight * .4);
      fill.groundColor.copy(colors.groundNight).lerp(colors.groundDay, day.daylight * (1 - cave));
      fill.intensity = (1.4 - .25 * day.daylight) * (1 - cave) + 1.2 * cave;
      key.color.copy(sunUp ? colors.lowSun : colors.moon);
      if (sunUp) key.color.lerp(colors.sun, Math.min(1, direction.y / .65));
      key.intensity = strength * (sunUp ? 3 : .9) * (1 - cave * .9);
      key.intensity *= 1 - rain * .6;
      key.target.position.set(position.x, position.y, position.z);
      key.position.copy(key.target.position).addScaledVector(direction, 100);
      material.uniforms.zenith!.value.copy(colors.night).lerp(colors.day, day.daylight).lerp(colors.dawn, day.twilight * .45);
      material.uniforms.horizon!.value.copy(colors.horizonNight).lerp(colors.horizonDay, day.daylight).lerp(colors.horizonDawn, day.twilight * .7);
      material.uniforms.zenith!.value.lerp(colors.rainSky, rain * day.daylight * .85);
      material.uniforms.horizon!.value.lerp(colors.rainHorizon, rain * day.daylight * .8);
      material.uniforms.rain!.value = rain;
      material.uniforms.sunDirection!.value.copy(day.sunDirection);
      material.uniforms.daylight!.value = day.daylight;
      material.uniforms.cloudTime!.value = (wallTimeMillis % 86_400_000) * 0.001;
      fog.color.copy(material.uniforms.horizon!.value);
      fog.near = underwater ? .8 : 90; fog.far = underwater ? 23 : 175;
      if (underwater) {
        fog.color.set(0x245a55);
        fill.color.set(0x86b9a3); fill.groundColor.set(0x31544c); fill.intensity = 1.25;
        key.color.set(0x9bcac0); key.intensity *= .5;
      }
      if (scene.background instanceof Color) scene.background.copy(fog.color);
      sky.position.copy(camera.position);
      sky.visible = cave < 1 && !underwater;
      updateTorchFlames(animationTimeSeconds);
      lampGlow.update(animationTimeSeconds, day.daylight);
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
