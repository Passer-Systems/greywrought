import { AdditiveBlending, BufferGeometry, DoubleSide, Float32BufferAttribute, Group, Mesh, Points, PointsMaterial, ShaderMaterial } from 'three';
import { LAKE_WATER_LEVEL, STREAM_POINTS } from '../game/world-elevation.js';
import { worldDay } from '../game/world-time.js';

/** The cascade shares the stream's carved channel and ends at its first lake-level sample. */
export function buildWaterfall(parent: Group): void {
  const start = STREAM_POINTS.findIndex(p => p.x > -38.2 && p.z < -65);
  const end = STREAM_POINTS.findIndex((p, i) => i > start && p.y <= LAKE_WATER_LEVEL + .02);
  const route = STREAM_POINTS.slice(start, end + 1);
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  let length = 0;
  for (let i = 0; i < route.length; i++) {
    const p = route[i]!, a = route[Math.max(0, i - 1)]!, b = route[Math.min(route.length - 1, i + 1)]!;
    const dx = b.x-a.x, dz = b.z-a.z, distance = Math.hypot(dx,dz);
    length += Math.hypot(p.x-a.x,p.y-a.y,p.z-a.z);
    for (const side of [-1,1]) {
      positions.push(p.x-dz/distance*p.width*.72*side,p.y+.045,p.z+dx/distance*p.width*.72*side);
      uvs.push((side+1)/2,length);
    }
    if(i){const n=i*2;indices.push(n-2,n-1,n,n-1,n+1,n);}
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new Float32BufferAttribute(uvs,2));geometry.setIndex(indices);
  const material = new ShaderMaterial({ transparent:true,depthWrite:false,side:DoubleSide,blending:AdditiveBlending,
    uniforms:{time:{value:0},light:{value:1}},
    vertexShader:`varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform float time,light;varying vec2 vUv;
      float hash(float n){return fract(sin(n)*43758.5453);}
      void main(){
      // Long irregular strands advect down the channel. Their phase drifts
      // across the sheet instead of forming repeated chevrons.
      float drift=fract(vUv.y*.22-time*.34+.09*sin(vUv.x*8.+vUv.y*1.7));
      float strand=smoothstep(.82,.98,drift)*(0.62+.38*sin(vUv.x*19.+vUv.y*3.1+time*.5));
      float broken=smoothstep(.08,.35,hash(floor(vUv.y*1.7)+floor(vUv.x*7.)));
      float edge=smoothstep(0.,.2,vUv.x)*smoothstep(0.,.2,1.-vUv.x);
      gl_FragColor=vec4(vec3(.55,.78,.82)*light,(.10+.42*strand*broken)*edge);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }` });
  const sheet = new Mesh(geometry,material);sheet.name='lake-waterfall';sheet.renderOrder=3;
  sheet.onBeforeRender=()=>{material.uniforms.time!.value=performance.now()*.001;material.uniforms.light!.value=.35+.65*worldDay(Date.now()).daylight;};
  parent.add(sheet);
  const bottom=route.at(-1)!;
  const foamPositions:number[]=[];
  for(let i=0;i<28;i++){const a=i*2.399;foamPositions.push(bottom.x+Math.cos(a)*(.45+(i%4)*.18),bottom.y+.07,bottom.z+Math.sin(a)*(.4+(i%3)*.13));}
  const foamGeometry=new BufferGeometry();foamGeometry.setAttribute('position',new Float32BufferAttribute(foamPositions,3));
  const foam=new Points(foamGeometry,new PointsMaterial({color:0xcfe9df,size:.15,transparent:true,opacity:.6,depthWrite:false}));
  foam.name='lake-waterfall-foam';foam.renderOrder=4;
  foam.onBeforeRender=()=>{
    const now=performance.now()*.001, position=foam.geometry.getAttribute('position');
    for(let i=0;i<28;i++){const phase=now*2.2+i*1.7;position.setY(i,foamPositions[i*3+1]!+.035*Math.sin(phase));position.setX(i,foamPositions[i*3]!+.06*Math.sin(phase*.7));}
    position.needsUpdate=true;
  };
  parent.add(foam);
}
