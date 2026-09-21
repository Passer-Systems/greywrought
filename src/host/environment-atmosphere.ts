import { BufferGeometry, CanvasTexture, Color, DirectionalLight, Float32BufferAttribute, Group, LineBasicMaterial, LineSegments, Material, Matrix4, Mesh, MeshStandardMaterial, Points, PointsMaterial, Scene, Vector3 } from 'three';
import type { Position } from '../game/adventure-types.js';
import { inCave, terrainHeight } from '../game/cave-layout.js';
import { lakeWaterAt, LAKE_WATER_LEVEL } from '../game/world-elevation.js';
import { isSubmerged } from '../game/movement.js';
import { worldDay } from '../game/world-time.js';

export type AtmosphereQuality = 'off' | 'low' | 'high';
const QUALITY_KEY = 'greywrought/atmosphere-quality';
export function readAtmosphereQuality(): AtmosphereQuality {
  try { const value = localStorage.getItem(QUALITY_KEY); if (value === 'off' || value === 'low' || value === 'high') return value; } catch {}
  return 'high';
}
export function setAtmosphereQuality(value: AtmosphereQuality): void {
  try { localStorage.setItem(QUALITY_KEY, value); } catch {}
  document.body.dataset.atmosphereQuality = value;
}
const declarations = `
varying vec3 gwWorld;
uniform vec3 gwCenters[3], gwRadii[3], gwTint;
uniform float gwTime, gwQuality;
uniform mat4 gwLightMatrix;
float gwHash(vec3 p){return fract(sin(dot(p,vec3(17.1,41.7,93.3)))*43758.5453);}
float gwNoise(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(gwHash(i),gwHash(i+vec3(1,0,0)),f.x),mix(gwHash(i+vec3(0,1,0)),gwHash(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(gwHash(i+vec3(0,0,1)),gwHash(i+vec3(1,0,1)),f.x),mix(gwHash(i+vec3(0,1,1)),gwHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float gwSun(vec3 p){
 #if defined(USE_SHADOWMAP) && NUM_DIR_LIGHT_SHADOWS > 0
 if(gwQuality>1.5) return getShadow(directionalShadowMap[0],directionalLightShadows[0].shadowMapSize,
 directionalLightShadows[0].shadowIntensity,directionalLightShadows[0].shadowBias,
 directionalLightShadows[0].shadowRadius,gwLightMatrix*vec4(p,1.));
 #endif
 return .65;
}
vec3 gwMist(vec3 color){
 if(gwQuality<.5)return color;
 vec3 ray=gwWorld-cameraPosition;float limit=length(ray);ray/=max(.001,limit);
 float optical=0.,lit=0.;
 for(int v=0;v<3;v++){
  vec3 o=(cameraPosition-gwCenters[v])/gwRadii[v],d=ray/gwRadii[v];
  float a=dot(d,d),b=dot(o,d),c=dot(o,o)-1.,det=b*b-a*c;
  if(det<=0.)continue;
  float enter=max(0.,(-b-sqrt(det))/a),leave=min(limit,(-b+sqrt(det))/a);
  if(leave<=enter)continue;
  float count=gwQuality>1.5?4.:2.,stepLength=(leave-enter)/count;
  for(int s=0;s<4;s++){
   if(float(s)>=count)break;
   vec3 p=cameraPosition+ray*(enter+(float(s)+.5)*stepLength),q=(p-gwCenters[v])/gwRadii[v];
   float edge=max(0.,1.-dot(q,q));
   float density=edge*edge*(.45+.55*gwNoise(p*.24-vec3(gwTime*.16,0.,gwTime*.07)))*.024*stepLength;
   optical+=density;lit+=density*(.45+.55*gwSun(p));
  }
 }
 float opacity=1.-exp(-optical);
 return mix(color,gwTint*(optical>0.?lit/optical:1.),min(.30,opacity));
}
`;

/** Integrate local mist only up to each visible surface. The existing depth test
 * supplies occlusion; the sun's shadow map supplies light shafts within the mist. */
export function createEnvironmentAtmosphere(scene: Scene) {
  const root=new Group();root.name='environment-atmosphere';scene.add(root);
  const uniforms={
    gwCenters:{value:[new Vector3(-19,1,-107),new Vector3(-36,1.8,-69),new Vector3(-9,3.8,43)]},
    gwRadii:{value:[new Vector3(22,2.0,14),new Vector3(8,3.0,8),new Vector3(20,3.5,17)]},
    gwTint:{value:new Color()},gwTime:{value:0},gwQuality:{value:2},gwLightMatrix:{value:new Matrix4()},
  };
  const patched=new Map<Material,{compile:Material['onBeforeCompile'];key:Material['customProgramCacheKey']}>();
  let attached=false,lastAttach=0;
  function attach(){
    scene.traverse(object=>{
      if(!(object instanceof Mesh))return;
      for(const material of Array.isArray(object.material)?object.material:[object.material]){
        if(!(material instanceof MeshStandardMaterial)||patched.has(material))continue;
        const original={compile:material.onBeforeCompile,key:material.customProgramCacheKey};patched.set(material,original);
        const baseKey=original.key.call(material);
        material.onBeforeCompile=(shader,renderer)=>{
          original.compile.call(material,shader,renderer);Object.assign(shader.uniforms,uniforms);
          shader.vertexShader='varying vec3 gwWorld;\n'+shader.vertexShader;
          shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>',`#include <project_vertex>
            vec4 gwPosition=vec4(transformed,1.);
            #ifdef USE_BATCHING
            gwPosition=batchingMatrix*gwPosition;
            #endif
            #ifdef USE_INSTANCING
            gwPosition=instanceMatrix*gwPosition;
            #endif
            gwWorld=(modelMatrix*gwPosition).xyz;`);
          shader.fragmentShader=shader.fragmentShader.replace('#include <shadowmap_pars_fragment>','#include <shadowmap_pars_fragment>\n'+declarations)
            .replace('#include <opaque_fragment>','outgoingLight=gwMist(outgoingLight);\n#include <opaque_fragment>');
        };
        material.customProgramCacheKey=()=>baseKey+':local-mist-v1';material.needsUpdate=true;
      }
    });attached=true;
  }
  const count=144,positions=new Float32Array(count*3),colors=new Float32Array(count*3),seeds=new Float32Array(count),floor=new Float32Array(count);
  const hash=(i:number)=>{const n=Math.sin(i*127.1+91.7)*43758.5453;return n-Math.floor(n);};
  const smooth=(value:number)=>{const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);};
  const emitters=[[-10,44],[-34,-69],[-15,-107]] as const;
  const color=new Color();
  for(let i=0;i<count;i++){
    const emitter=emitters[i%3]!;seeds[i]=hash(i+1);
    positions[i*3]=emitter[0]+(hash(i+7)-.5)*26;positions[i*3+2]=emitter[1]+(hash(i+19)-.5)*26;
    floor[i]=Math.max(LAKE_WATER_LEVEL,terrainHeight(positions[i*3]!,positions[i*3+2]!));positions[i*3+1]=floor[i]!+hash(i+31)*7;
    color.setHex(i%3===0?0xafa378:i%3===1?0xb4ccc4:0x7d9187).toArray(colors,i*3);
  }
  const textureCanvas=document.createElement('canvas');textureCanvas.width=textureCanvas.height=32;
  const context=textureCanvas.getContext('2d')!,gradient=context.createRadialGradient(16,16,1,16,16,15);
  gradient.addColorStop(0,'#ffffffff');gradient.addColorStop(.4,'#ffffffb0');gradient.addColorStop(1,'#ffffff00');context.fillStyle=gradient;context.fillRect(0,0,32,32);
  const texture=new CanvasTexture(textureCanvas),geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('color',new Float32BufferAttribute(colors,3));
  const material=new PointsMaterial({map:texture,vertexColors:true,size:.09,transparent:true,opacity:.42,depthWrite:false});
  const particles=new Points(geometry,material);particles.name='windborne-dust';particles.frustumCulled=false;root.add(particles);
  // Rain is kept as a small, camera-local line cloud. It gives the weather a
  // readable streak rather than a noisy full-screen overlay and remains cheap
  // on low settings (the quality setting controls its density).
  const rainCount = 320;
  const rainPositions = new Float32Array(rainCount * 2 * 3);
  const rainSeeds = new Float32Array(rainCount);
  const rainFloor = new Float32Array(rainCount);
  for (let i = 0; i < rainCount; i++) {
    rainSeeds[i] = hash(i + 701);
    const index = i * 6;
    const x = (hash(i + 801) - .5) * 46;
    const z = (hash(i + 901) - .5) * 46;
    const y = 8 + hash(i + 1001) * 16;
    rainPositions[index] = x; rainPositions[index + 1] = y; rainPositions[index + 2] = z;
    rainPositions[index + 3] = x + .12; rainPositions[index + 4] = y - 1.25; rainPositions[index + 5] = z + .04;
  }
  const rainGeometry = new BufferGeometry();
  rainGeometry.setAttribute('position', new Float32BufferAttribute(rainPositions, 3));
  const rainMaterial = new LineBasicMaterial({ color: 0xb8d7e0, transparent: true, opacity: .34, depthWrite: false });
  const rain = new LineSegments(rainGeometry, rainMaterial);
  rain.name = 'weather-rain'; rain.frustumCulled = false; rain.visible = false; root.add(rain);
  let quality=readAtmosphereQuality(),floorClock=0;document.body.dataset.atmosphereQuality=quality;
  let rainIntensity = 0;
  let rainTarget = 0;
  let rainOriginReady = false;
  let rainFloorClock = .21;
  return {
    attach,
    update(wallTimeSeconds:number,delta:number,_player:Position){
      const preference=document.body.dataset.atmosphereQuality;if(preference==='off'||preference==='low'||preference==='high')quality=preference;
      uniforms.gwQuality.value=quality==='off'?0:quality==='low'?1:2;root.visible=quality!=='off';
      if(!attached||quality==='off'){ rain.visible=false; return; }
      // All clients derive the same storm from shared world time. Smooth
      // shoulders avoid a hard pop as rain starts or clears (and keep the
      // ambient weather independent of frame rate or reconnect timing).
      const cycleIndex = Math.floor(wallTimeSeconds / 120);
      const cycle = ((wallTimeSeconds % 120) + 120) % 120;
      const stormSeed = hash(cycleIndex + 1801);
      const stormStart = 12 + hash(cycleIndex + 1901) * 22;
      const stormDuration = 42 + hash(cycleIndex + 2001) * 34;
      const storm = stormSeed < .22 ? 0 : smooth(Math.min((cycle - stormStart) / 10, (stormStart + stormDuration - cycle) / 10));
      const sheltered = inCave(_player) || isSubmerged(_player);
      rainTarget = sheltered ? 0 : Math.max(0, storm);
      rainIntensity += (rainTarget - rainIntensity) * (1 - Math.exp(-delta * 3.5));
      rain.visible = rainIntensity > .005;
      rainMaterial.opacity = rainIntensity * (quality === 'high' ? .34 : .22);
      root.userData.weather = rainIntensity > .01 ? 'rain' : 'clear';
      root.userData.weatherIntensity = rainIntensity;
      root.userData.weatherSheltered = sheltered;
      const day=worldDay(wallTimeSeconds*1000);uniforms.gwTime.value=wallTimeSeconds%3600;
      uniforms.gwTint.value.setHex(0x90aaa5).multiplyScalar(.3+.7*day.daylight);
      const sun=scene.getObjectByName('sun-moon');if(sun instanceof DirectionalLight)uniforms.gwLightMatrix.value.copy(sun.shadow.matrix);
      if(wallTimeSeconds-lastAttach>2){attach();lastAttach=wallTimeSeconds;}
      const active=quality==='high'?count:72;geometry.setDrawRange(0,active);material.opacity=.25+.17*day.daylight;
      floorClock+=delta;const refresh=floorClock>.25;if(refresh)floorClock=0;
      for(let i=0;i<active;i++){
        const index=i*3,emitter=emitters[i%3]!,speed=.3+seeds[i]!*.45;
        positions[index]=positions[index]!+delta*speed;positions[index+2]=positions[index+2]!+delta*.18;positions[index+1]=positions[index+1]!-delta*(.15+seeds[i]!*.18);
        if(refresh)floor[i]=Math.max(LAKE_WATER_LEVEL,terrainHeight(positions[index]!,positions[index+2]!));
        if(positions[index+1]!<=floor[i]!+.04||positions[index]!>emitter[0]+13||positions[index+2]!>emitter[1]+13){
          positions[index]=emitter[0]+(hash(i+9)-.5)*26;positions[index+2]=emitter[1]+(hash(i+41)-.5)*26;
          floor[i]=Math.max(LAKE_WATER_LEVEL,terrainHeight(positions[index]!,positions[index+2]!));positions[index+1]=floor[i]!+5+seeds[i]!*2;
        }
      }
      geometry.getAttribute('position').needsUpdate=true;
      if (rainIntensity > .005) {
        const rainActive = quality === 'high' ? rainCount : 150;
        if (!rainOriginReady) { rain.position.set(_player.x, _player.y, _player.z); rainOriginReady = true; }
        else {
          const shiftX = _player.x - rain.position.x, shiftY = _player.y - rain.position.y, shiftZ = _player.z - rain.position.z;
          if (Math.hypot(shiftX, shiftZ) > 12 || Math.abs(shiftY) > 4) {
            for (let i = 0; i < rainCount; i++) { const k = i * 6; rainPositions[k]! -= shiftX; rainPositions[k + 1]! -= shiftY; rainPositions[k + 2]! -= shiftZ; rainPositions[k + 3]! -= shiftX; rainPositions[k + 4]! -= shiftY; rainPositions[k + 5]! -= shiftZ; }
            rain.position.set(_player.x, _player.y, _player.z);
            rainFloorClock = .21;
          }
        }
        const drops = rainGeometry.getAttribute('position');
        rainFloorClock += delta;
        const refreshRainFloor = rainFloorClock > .2; if (refreshRainFloor) rainFloorClock = 0;
        for (let i = 0; i < rainActive; i++) {
          const index = i * 6, seed = rainSeeds[i]!;
          let y = rainPositions[index + 1]! - delta * (11 + seed * 6);
          const x = rainPositions[index]!, z = rainPositions[index + 2]!;
          if (refreshRainFloor) { const worldX = rain.position.x + x, worldZ = rain.position.z + z; const water = lakeWaterAt(worldX, worldZ); rainFloor[i] = Math.max(terrainHeight(worldX, worldZ), water ?? -Infinity); }
          const ground = rainFloor[i]!;
          const wind = (2.2 + seed * 1.4) * delta;
          rainPositions[index] = x + wind;
          rainPositions[index + 2] = z + wind * .22;
          if (y < ground - rain.position.y + .5 || Math.abs(x) > 26 || Math.abs(z) > 26) {
            rainPositions[index] = (hash(i + Math.floor(wallTimeSeconds * .7)) - .5) * 46;
            rainPositions[index + 2] = (hash(i + 100 + Math.floor(wallTimeSeconds * .7)) - .5) * 46;
            y = 15 + seed * 10;
          }
          rainPositions[index + 1] = y;
          rainPositions[index + 3] = rainPositions[index]! + .12;
          rainPositions[index + 4] = y - 1.25;
          rainPositions[index + 5] = rainPositions[index + 2]! + .04;
          drops.setXYZ(i * 2, rainPositions[index]!, y, rainPositions[index + 2]!);
          drops.setXYZ(i * 2 + 1, rainPositions[index + 3]!, rainPositions[index + 4]!, rainPositions[index + 5]!);
        }
        rainGeometry.setDrawRange(0, rainActive * 2);
        drops.needsUpdate = true;
      }
    },
    setQuality(value:AtmosphereQuality){quality=value;setAtmosphereQuality(value);},get quality(){return quality;},
    dispose(){for(const [material,original]of patched){material.onBeforeCompile=original.compile;material.customProgramCacheKey=original.key;material.needsUpdate=true;}patched.clear();geometry.dispose();material.dispose();texture.dispose();rainGeometry.dispose();rainMaterial.dispose();root.removeFromParent();},
  };
}
