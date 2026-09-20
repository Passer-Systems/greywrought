import { BackSide, Color, DirectionalLight, Fog, HemisphereLight, Mesh, PCFShadowMap, PointLight, ShaderMaterial, SphereGeometry, Vector3, type PerspectiveCamera, type Scene, type WebGLRenderer } from 'three';
import { inCave } from '../game/cave-layout.js';
import type { Position } from '../game/adventure-types.js';
import { worldDay } from '../game/world-time.js';

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
    day: new Color(0x77afcb), night: new Color(0x101b34), dawn: new Color(0xb67d79),
    horizonDay: new Color(0xb5c7c4), horizonNight: new Color(0x27354c), horizonDawn: new Color(0xd39b71),
    fillDay: new Color(0xc4d7df), fillNight: new Color(0x7895c4),
    groundDay: new Color(0x59684e), groundNight: new Color(0x35414a),
    sun: new Color(0xffefd4), lowSun: new Color(0xffb779), moon: new Color(0xa7bff0),
  };
  const material = new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: {
      zenith: { value: new Color() }, horizon: { value: new Color() },
      sunDirection: { value: new Vector3() }, daylight: { value: 1 },
    },
    vertexShader: `varying vec3 skyDirection;
      void main() {
        skyDirection = position;
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = clip.xyww;
      }`,
    fragmentShader: `uniform vec3 zenith, horizon, sunDirection;
      uniform float daylight;
      varying vec3 skyDirection;
      void main() {
        vec3 direction = normalize(skyDirection);
        vec3 color = mix(horizon, zenith, smoothstep(-0.1, 0.8, direction.y));
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
  sky.name = 'sky'; sky.frustumCulled = false; sky.renderOrder = -1;
  scene.add(sky);
  const lamps: PointLight[] = [];
  const direction = new Vector3();
  const fog = scene.fog instanceof Fog ? scene.fog : new Fog(0x263d46, 58, 175);
  scene.fog = fog;
  return {
    collectLamps() {
      lamps.length = 0;
      scene.traverse(object => {
        if (object instanceof PointLight && typeof object.userData.nightIntensity === 'number') lamps.push(object);
      });
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
      fog.color.copy(material.uniforms.horizon!.value);
      sky.position.copy(camera.position);
      sky.visible = cave < 1;
      for (const lamp of lamps) lamp.intensity = lamp.userData.nightIntensity * (1 - day.daylight * .65);
      const data = renderer.domElement.dataset;
      data.worldPhase = day.phase; data.worldHour = day.hour.toFixed(3);
      data.shadowOwner = sunUp ? 'sun' : 'moon';
    },
    dispose() {
      key.shadow.dispose();
      sky.removeFromParent(); sky.geometry.dispose(); material.dispose();
      fill.removeFromParent(); key.removeFromParent(); key.target.removeFromParent();
    },
  };
}
