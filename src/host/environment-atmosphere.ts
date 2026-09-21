import { BufferGeometry, CanvasTexture, Color, DirectionalLight, Float32BufferAttribute, Group, Material, Matrix4, Mesh, MeshStandardMaterial, Points, PointsMaterial, Scene, Vector3 } from 'three';
import type { Position } from '../game/adventure-types.js';
import { inCave, terrainHeight } from '../game/cave-layout.js';
import { lakeWaterAt, LAKE_WATER_LEVEL } from '../game/world-elevation.js';
import { isSubmerged } from '../game/movement.js';
import { worldDay, worldRain } from '../game/world-time.js';

import { createWeatherRain } from './weather-rain.js';

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
uniform float gwTime, gwQuality, gwStorm;
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
 color=mix(color,gwTint*(optical>0.?lit/optical:1.),min(.30,opacity));
 // Rain softens distant contrast without obscuring nearby combat tells.
 float haze=gwStorm*smoothstep(12.,70.,limit)*.16;
 return mix(color*(1.-gwStorm*.12),gwTint*.7,haze);
}
`;

/** Integrate local mist only up to each visible surface. The existing depth test
 * supplies occlusion; the sun's shadow map supplies light shafts within the mist. */
export function createEnvironmentAtmosphere(scene: Scene) {
  const root=new Group();root.name='environment-atmosphere';scene.add(root);
  const uniforms={
    gwCenters:{value:[new Vector3(-19,1,-107),new Vector3(-36,1.8,-69),new Vector3(-9,3.8,43)]},
    gwRadii:{value:[new Vector3(22,2.0,14),new Vector3(8,3.0,8),new Vector3(20,3.5,17)]},
    gwStorm:{value:0},gwTint:{value:new Color()},gwTime:{value:0},gwQuality:{value:2},gwLightMatrix:{value:new Matrix4()},
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
  const rain = createWeatherRain(root);
  let quality=readAtmosphereQuality(),floorClock=0;document.body.dataset.atmosphereQuality=quality;
  let rainIntensity = 0;
  return {
    attach,
    update(wallTimeSeconds:number,delta:number,_player:Position,weatherRain = worldRain(wallTimeSeconds)){
      const preference=document.body.dataset.atmosphereQuality;if(preference==='off'||preference==='low'||preference==='high')quality=preference;
      uniforms.gwQuality.value=quality==='off'?0:quality==='low'?1:2;root.visible=quality!=='off';
      if(!attached||quality==='off'){ rain.hide(); return; }
      const sheltered = inCave(_player) || isSubmerged(_player);
      const rainTarget = sheltered ? 0 : weatherRain;
      rainIntensity += (rainTarget - rainIntensity) * (1 - Math.exp(-delta * 3.5));
      uniforms.gwStorm.value = rainIntensity;
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
      rain.update(wallTimeSeconds, delta, _player, rainIntensity, quality === 'high', day.daylight);
    },
    setQuality(value:AtmosphereQuality){quality=value;setAtmosphereQuality(value);},get quality(){return quality;},
    dispose(){for(const [material,original]of patched){material.onBeforeCompile=original.compile;material.customProgramCacheKey=original.key;material.needsUpdate=true;}patched.clear();geometry.dispose();material.dispose();texture.dispose();rain.dispose();root.removeFromParent();},
  };
}
