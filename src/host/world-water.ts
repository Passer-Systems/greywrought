import { BufferGeometry, Color, Float32BufferAttribute, Group, Matrix4, Mesh, ShaderMaterial, UniformsLib, UniformsUtils, Vector2, Vector3 } from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { LAKE_CENTER, LAKE_RADIUS, LAKE_WATER_LEVEL, lakeBoundary, lakeDepthAt, overworldHeight } from '../game/world-elevation.js';
import { worldDay } from '../game/world-time.js';
import { buildStreamGeometry } from './stream-geometry.js';

export const MEADOW_WATER = {
  movement: { speed: .65, waveHeight: .03, shoreHeight: .012, wind: new Vector2(.86, .5) },
  look: { shallow: 0x568e97, deep: 0x123548, absorption: 1.35 },
  reflection: { strength: .8, resolution: 512, updatesPerSecond: 15 },
};
// Increasing phase sends each crest from deeper water toward the bank. Geometry,
// wet coverage, and foam use the same wave so the waterline follows the wash.
export const WATER_WAVES = `
float surfaceLift(vec2 p,float d,float t){return waveHeight*smoothstep(0.,.5,d)*(sin(dot(p,wind)*1.65+t*1.4)+.4*sin(p.x*3.1-p.y*2.3-t*1.8));}
float shorePhase(vec2 p,float d,float t){return d*9.+t*.9+dot(p,vec2(.86,.5))*.13;}
float shoreLift(vec2 p,float d,float t){return shoreHeight*smoothstep(0.,.035,d)*(1.-smoothstep(.05,.5,d))*sin(shorePhase(p,d,t));}
`;
const vertexShader = `
attribute float waterDepth;
attribute vec2 current;
uniform float time, waveHeight, shoreHeight;
uniform vec2 wind;
uniform mat4 textureMatrix;
varying vec3 world;
varying vec4 mirror;
varying float depth;
varying vec2 flow;
#include <fog_pars_vertex>
${WATER_WAVES}
void main(){
 vec3 p=position;
 vec4 w=modelMatrix*vec4(p,1.);
 p.z+=surfaceLift(w.xz,waterDepth,time);
 p.z+=shoreLift(w.xz,waterDepth,time)*(1.-smoothstep(.01,.1,length(current)));
 w=modelMatrix*vec4(p,1.);world=w.xyz;mirror=textureMatrix*vec4(p,1.);depth=waterDepth;flow=current;
 vec4 mvPosition=viewMatrix*w;
 gl_Position=projectionMatrix*mvPosition;
 #include <fog_vertex>
}`;
const fragmentShader = `
uniform sampler2D tDiffuse;
uniform vec3 shallowColor, deepColor, sunDirection, sunColor;
uniform float time, absorption, reflectionStrength, daylight, waveHeight, shoreHeight;
uniform vec2 wind;
varying vec3 world;
varying vec4 mirror;
varying float depth;
varying vec2 flow;
#include <fog_pars_fragment>
${WATER_WAVES}
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
vec2 rippleGradient(vec2 p){
 vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f),du=6.*f*(1.-f);
 float a=hash(i),b=hash(i+vec2(1,0)),c=hash(i+vec2(0,1)),d=hash(i+vec2(1));
 return du*vec2(mix(b-a,d-c,u.y),mix(c-a,d-b,u.x));
}
void main(){
 float lake=1.-smoothstep(.01,.1,length(flow));
 float wetDepth=depth+shoreLift(world.xz,depth,time)*lake;
 vec2 dx=dFdx(world.xz),dy=dFdy(world.xz);
 float determinant=dx.x*dy.y-dx.y*dy.x;
 vec2 gradient=abs(determinant)>.000001?vec2(dFdx(depth)*dy.y-dFdy(depth)*dx.y,dx.x*dFdy(depth)-dy.x*dFdx(depth))/determinant:vec2(0.);
 vec2 landward=-gradient/max(length(gradient),.001);
 if(wetDepth<=.002)discard;
 float shallow=1.-smoothstep(.06,.3,depth);
 vec2 drift=mix(flow*.85,mix(wind*.32,landward*.48,shallow),lake);
 vec2 uv=world.xz-drift*time;
 vec2 slope=rippleGradient(uv*.85)*.055+rippleGradient(uv*2.7+vec2(13.,7.))*.022;
 slope*=waveHeight/.055;
 vec3 n=normalize(vec3(-slope.x,1.,-slope.y));
 vec3 view=normalize(cameraPosition-world);
 float fresnel=.035+.965*pow(1.-max(dot(n,view),0.),5.);
 float attenuation=1.-exp(-max(0.,wetDepth)*absorption);
 vec3 base=mix(shallowColor,deepColor,attenuation)*mix(.38,1.,daylight);
 vec2 reflectUv=mirror.xy/mirror.w+slope*.015;
 vec3 reflected=texture2D(tDiffuse,clamp(reflectUv,vec2(.002),vec2(.998))).rgb;
 float glint=pow(max(dot(reflect(-sunDirection,n),view),0.),220.);
 vec3 color=mix(base,reflected,clamp(fresnel*reflectionStrength*(1.-.6*min(length(flow),1.)),0.,.94))+sunColor*glint*.24;
 float washEdge=1.-smoothstep(mix(.01,.006,lake),mix(.045,.02,lake),wetDepth);
 float breakup=smoothstep(.36,.74,noise(uv*5.1)+noise(uv*11.3)*.2);
 float foam=shallow*washEdge*mix(.65,.12,lake)*breakup*smoothstep(.002,mix(.025,.012,lake),wetDepth);
 color=mix(color,vec3(.72,.80,.74)*mix(.4,1.,daylight),foam*.38);
 gl_FragColor=vec4(color,clamp(.22+attenuation*.65+fresnel*.45+foam*.25,0.,.97)*smoothstep(.002,.024,wetDepth));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 #include <fog_fragment>
}`;

export function buildWorldWater(parent: Group): (wallTimeMillis: number) => void {
  const positions:number[]=[],depths:number[]=[],flows:number[]=[],indices:number[]=[];
  function vertex(x:number,z:number,y:number,depth:number,flowX=0,flowZ=0){
    // The reflector's local XY plane maps onto world XZ, with local +Z pointing up.
    positions.push(x,-z,y-LAKE_WATER_LEVEL);depths.push(depth);flows.push(flowX,flowZ);
  }
  const rings=64,segments=384;
  for(let ring=0;ring<=rings;ring++)for(let segment=0;segment<segments;segment++){
    const a=segment/segments*Math.PI*2,r=Math.sqrt(ring/rings)*lakeBoundary(a);
    const x=LAKE_CENTER.x+Math.cos(a)*LAKE_RADIUS.x*r,z=LAKE_CENTER.z+Math.sin(a)*LAKE_RADIUS.z*r;
    vertex(x,z,LAKE_WATER_LEVEL,Math.min(lakeDepthAt(x,z),LAKE_WATER_LEVEL-overworldHeight(x,z)));
  }
  for(let ring=0;ring<rings;ring++)for(let s=0;s<segments;s++){
    const a=ring*segments+s,b=ring*segments+(s+1)%segments,c=a+segments,d=b+segments;
    indices.push(a,b,c,b,d,c);
  }
  const lakeGeometry=new BufferGeometry();
  lakeGeometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  lakeGeometry.setAttribute('waterDepth',new Float32BufferAttribute(depths,1));
  lakeGeometry.setAttribute('current',new Float32BufferAttribute(flows,2));lakeGeometry.setIndex(indices);lakeGeometry.computeVertexNormals();
  const shader={name:'MeadowWater',uniforms:{
    ...UniformsUtils.clone(UniformsLib.fog!),
    color:{value:new Color()},tDiffuse:{value:null},textureMatrix:{value:new Matrix4()},
    time:{value:0},waveHeight:{value:MEADOW_WATER.movement.waveHeight},shoreHeight:{value:MEADOW_WATER.movement.shoreHeight},wind:{value:MEADOW_WATER.movement.wind},
    shallowColor:{value:new Color(MEADOW_WATER.look.shallow)},deepColor:{value:new Color(MEADOW_WATER.look.deep)},
    absorption:{value:MEADOW_WATER.look.absorption},reflectionStrength:{value:MEADOW_WATER.reflection.strength},
    sunDirection:{value:new Vector3()},sunColor:{value:new Color()},daylight:{value:1},
  },vertexShader,fragmentShader};
  const lake=new Reflector(lakeGeometry,{textureWidth:MEADOW_WATER.reflection.resolution,textureHeight:MEADOW_WATER.reflection.resolution,multisample:0,clipBias:.003,shader});
  lake.name='meadow-lake';lake.rotation.x=-Math.PI/2;lake.position.y=LAKE_WATER_LEVEL;
  const renderReflection=lake.onBeforeRender;let nextReflection=0;
  // Ripples and glints animate every frame; the smaller scene reflection has a
  // separate update budget so nearby water does not double every frame's work.
  lake.onBeforeRender=function(...args){
    const now=performance.now();if(now<nextReflection)return;
    nextReflection=now+1000/MEADOW_WATER.reflection.updatesPerSecond;
    // The stream samples this target too, so it cannot draw into the reflection
    // while that same texture is attached as the framebuffer.
    const streamVisible=stream.visible;stream.visible=false;
    const scene=args[1],autoUpdate=scene.matrixWorldAutoUpdate;
    // The outer renderer already updated every world transform before invoking
    // this hook. The reflection changes only its camera and visibility.
    scene.matrixWorldAutoUpdate=false;
    try{renderReflection.apply(this,args);}finally{stream.visible=streamVisible;scene.matrixWorldAutoUpdate=autoUpdate;}
  };
  const material=lake.material as ShaderMaterial;material.fog=true;material.transparent=true;material.depthWrite=false;lake.renderOrder=1;parent.add(lake);
  material.addEventListener('dispose',()=>lake.getRenderTarget().dispose());
  const streamGeometry=buildStreamGeometry();
  const stream=new Mesh(streamGeometry,material);stream.name='meadow-stream';stream.rotation.x=-Math.PI/2;stream.position.y=LAKE_WATER_LEVEL;stream.renderOrder=2;parent.add(stream);
  // The stream shares the lake reflection rather than rendering the whole scene a second time.
  return wallTimeMillis=>{
    const day=worldDay(wallTimeMillis),u=material.uniforms;
    u.time!.value=(wallTimeMillis%3_600_000)*.001*MEADOW_WATER.movement.speed;
    u.sunDirection!.value.copy(day.sunDirection.y>=0?day.sunDirection:day.moonDirection);
    u.sunColor!.value.set(day.sunDirection.y>=0?0xffedcf:0x7189ad);
    u.daylight!.value=day.daylight;
    u.waveHeight!.value=MEADOW_WATER.movement.waveHeight*(.8+.2*Math.sin(wallTimeMillis*.00004));
  };
}
