import { BufferGeometry, Color, Float32BufferAttribute, Group, Matrix4, Mesh, ShaderMaterial, Vector2, Vector3 } from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { LAKE_CENTER, LAKE_RADIUS, LAKE_WATER_LEVEL, STREAM_POINTS, lakeBoundary, lakeDepthAt, overworldHeight } from '../game/world-elevation.js';
import { worldDay } from '../game/world-time.js';

export const MEADOW_WATER = {
  movement: { speed: .65, waveHeight: .03, wind: new Vector2(.86, .5) },
  look: { shallow: 0x568e97, deep: 0x123548, absorption: 1.35 },
  reflection: { strength: .8, resolution: 512, updatesPerSecond: 15 },
};
const vertexShader = `
attribute float waterDepth;
attribute vec2 current;
uniform float time, waveHeight;
uniform vec2 wind;
uniform mat4 textureMatrix;
varying vec3 world;
varying vec4 mirror;
varying float depth;
varying vec2 flow;
void main(){
 vec3 p=position;
 vec4 w=modelMatrix*vec4(p,1.);
 float amplitude=waveHeight*smoothstep(0.,.5,waterDepth);
 p.z+=amplitude*(sin(dot(w.xz,wind)*1.65+time*1.4)+.4*sin(w.x*3.1-w.z*2.3-time*1.8));
 w=modelMatrix*vec4(p,1.);world=w.xyz;mirror=textureMatrix*vec4(p,1.);depth=waterDepth;flow=current;
 gl_Position=projectionMatrix*viewMatrix*w;
}`;
const fragmentShader = `
uniform sampler2D tDiffuse;
uniform vec3 shallowColor, deepColor, sunDirection, sunColor, horizon;
uniform float time, absorption, reflectionStrength, daylight, waveHeight;
uniform vec2 wind;
varying vec3 world;
varying vec4 mirror;
varying float depth;
varying vec2 flow;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1)),f.x),f.y);}
void main(){
 if(depth<=.015)discard;
 vec2 uv=world.xz-flow*time*.85;
 float phase=dot(uv,wind)*1.65+time*1.4;
 vec2 slope=wind*cos(phase)*.12+vec2(3.1,-2.3)*cos(uv.x*3.1-uv.y*2.3-time*1.8)*.023;
 slope+=vec2(sin(uv.x*13.+time*2.),cos(uv.y*11.-time*1.3))*.025;
 slope*=waveHeight/.055;
 vec3 n=normalize(vec3(-slope.x,1.,-slope.y));
 vec3 view=normalize(cameraPosition-world);
 float fresnel=.035+.965*pow(1.-max(dot(n,view),0.),5.);
 float attenuation=1.-exp(-depth*absorption);
 vec3 base=mix(shallowColor,deepColor,attenuation)*mix(.38,1.,daylight);
 vec2 reflectUv=mirror.xy/mirror.w+slope*.015;
 vec3 reflected=texture2D(tDiffuse,clamp(reflectUv,vec2(.002),vec2(.998))).rgb;
 float glint=pow(max(dot(reflect(-sunDirection,n),view),0.),220.);
 vec3 color=mix(base,reflected,clamp(fresnel*reflectionStrength*(1.-.6*min(length(flow),1.)),0.,.94))+sunColor*glint*.24;
 float shore=(1.-smoothstep(.035,.14,depth))*smoothstep(.015,.035,depth);
 float foam=shore*smoothstep(.55,.76,noise(uv*3.1+time*.16)+.12*sin(time*1.7+depth*38.));
 color=mix(color,vec3(.72,.80,.74)*mix(.4,1.,daylight),foam*.35);
 float mist=smoothstep(65.,175.,distance(cameraPosition,world));color=mix(color,horizon,mist);
 gl_FragColor=vec4(color,clamp(.22+attenuation*.65+fresnel*.45+foam*.25,0.,.97));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}`;

export function buildWorldWater(parent: Group): (wallTimeMillis: number) => void {
  const positions:number[]=[],depths:number[]=[],flows:number[]=[],indices:number[]=[];
  function vertex(x:number,z:number,y:number,depth:number,flowX=0,flowZ=0){
    // The reflector's local XY plane maps onto world XZ, with local +Z pointing up.
    positions.push(x,-z,y-LAKE_WATER_LEVEL);depths.push(Math.max(0,depth));flows.push(flowX,flowZ);
  }
  const rings=26,segments=96;
  for(let ring=0;ring<=rings;ring++)for(let segment=0;segment<segments;segment++){
    const a=segment/segments*Math.PI*2,r=ring/rings*lakeBoundary(a);
    const x=LAKE_CENTER.x+Math.cos(a)*LAKE_RADIUS.x*r,z=LAKE_CENTER.z+Math.sin(a)*LAKE_RADIUS.z*r;
    vertex(x,z,LAKE_WATER_LEVEL,LAKE_WATER_LEVEL-overworldHeight(x,z));
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
    color:{value:new Color()},tDiffuse:{value:null},textureMatrix:{value:new Matrix4()},
    time:{value:0},waveHeight:{value:MEADOW_WATER.movement.waveHeight},wind:{value:MEADOW_WATER.movement.wind},
    shallowColor:{value:new Color(MEADOW_WATER.look.shallow)},deepColor:{value:new Color(MEADOW_WATER.look.deep)},
    absorption:{value:MEADOW_WATER.look.absorption},reflectionStrength:{value:MEADOW_WATER.reflection.strength},
    sunDirection:{value:new Vector3()},sunColor:{value:new Color()},horizon:{value:new Color()},daylight:{value:1},
  },vertexShader,fragmentShader};
  const lake=new Reflector(lakeGeometry,{textureWidth:MEADOW_WATER.reflection.resolution,textureHeight:MEADOW_WATER.reflection.resolution,multisample:0,clipBias:.003,shader});
  lake.name='meadow-lake';lake.rotation.x=-Math.PI/2;lake.position.y=LAKE_WATER_LEVEL;
  const renderReflection=lake.onBeforeRender;let nextReflection=0;
  // Ripples and glints animate every frame; the smaller scene reflection has a
  // separate update budget so nearby water does not double every frame's work.
  lake.onBeforeRender=function(...args){const now=performance.now();if(now<nextReflection)return;nextReflection=now+1000/MEADOW_WATER.reflection.updatesPerSecond;renderReflection.apply(this,args);};
  const material=lake.material as ShaderMaterial;material.transparent=true;material.depthWrite=false;lake.renderOrder=1;parent.add(lake);
  material.addEventListener('dispose',()=>lake.getRenderTarget().dispose());
  const streamPositions:number[]=[],streamDepths:number[]=[],streamFlows:number[]=[],streamIndices:number[]=[];
  const across=8;
  for(let i=0;i<STREAM_POINTS.length;i++){
    const p=STREAM_POINTS[i]!,before=STREAM_POINTS[Math.max(0,i-1)]!,after=STREAM_POINTS[Math.min(STREAM_POINTS.length-1,i+1)]!;
    const dx=after.x-before.x,dz=after.z-before.z,length=Math.hypot(dx,dz)||1;
    for(let j=0;j<=across;j++){
      const sideways=(j/across*2-1)*p.width,x=p.x-dz/length*sideways,z=p.z+dx/length*sideways;
      streamPositions.push(x,-z,p.y-LAKE_WATER_LEVEL);streamDepths.push(lakeDepthAt(x,z)>.02?0:Math.max(0,p.y-overworldHeight(x,z)));streamFlows.push(dx/length,dz/length);
    }
    if(i)for(let j=0;j<across;j++){const a=(i-1)*(across+1)+j,b=a+across+1;streamIndices.push(a,a+1,b,a+1,b+1,b);}
  }
  const streamGeometry=new BufferGeometry();streamGeometry.setAttribute('position',new Float32BufferAttribute(streamPositions,3));streamGeometry.setAttribute('waterDepth',new Float32BufferAttribute(streamDepths,1));streamGeometry.setAttribute('current',new Float32BufferAttribute(streamFlows,2));streamGeometry.setIndex(streamIndices);streamGeometry.computeVertexNormals();
  const stream=new Mesh(streamGeometry,material);stream.name='meadow-stream';stream.rotation.x=-Math.PI/2;stream.position.y=LAKE_WATER_LEVEL;stream.renderOrder=2;parent.add(stream);
  // The stream shares the lake reflection rather than rendering the whole scene a second time.
  return wallTimeMillis=>{
    const day=worldDay(wallTimeMillis),u=material.uniforms;
    u.time!.value=(wallTimeMillis%3_600_000)*.001*MEADOW_WATER.movement.speed;
    u.sunDirection!.value.copy(day.sunDirection.y>=0?day.sunDirection:day.moonDirection);
    u.sunColor!.value.set(day.sunDirection.y>=0?0xffedcf:0x7189ad);
    u.daylight!.value=day.daylight;
    u.horizon!.value.set(0x27354c).lerp(new Color(0xb5c7c4),day.daylight);
    u.waveHeight!.value=MEADOW_WATER.movement.waveHeight*(.8+.2*Math.sin(wallTimeMillis*.00004));
  };
}
