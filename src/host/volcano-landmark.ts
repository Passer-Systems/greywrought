import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Points,
  ShaderMaterial,
  AdditiveBlending,
  Vector2,
  Float32BufferAttribute,
} from "three";
import { terrainHeight } from "../game/cave-layout.js";

export function buildVolcanoLandmark(terrain: Group) {
  const root = new Group();
  root.name = "greywrought.landmark.eastern-volcano";

  // Keep the landmark well beyond the starting meadow and off the authored roads.
  const x = 118;
  const z = 24;
  const ground = terrainHeight(x, z);
  root.position.set(x, ground, z);
  root.rotation.y = -0.18;

  const basalt = new MeshStandardMaterial({ roughness: 0.96, metalness: 0.02 });
  basalt.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 basaltPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nbasaltPosition=transformed;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 basaltPosition;
float basaltHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float basaltNoise(vec3 p){
  vec3 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);
  return mix(mix(mix(basaltHash(i),basaltHash(i+vec3(1.,0.,0.)),u.x),
    mix(basaltHash(i+vec3(0.,1.,0.)),basaltHash(i+vec3(1.,1.,0.)),u.x),u.y),
    mix(mix(basaltHash(i+vec3(0.,0.,1.)),basaltHash(i+vec3(1.,0.,1.)),u.x),
    mix(basaltHash(i+vec3(0.,1.,1.)),basaltHash(i+1.),u.x),u.y),u.z);
}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec3 rockPoint=basaltPosition*.32;
vec3 warp=vec3(basaltNoise(rockPoint*.47),basaltNoise(rockPoint*.47+19.),basaltNoise(rockPoint*.47-7.));
float blocks=basaltNoise(rockPoint+(warp-.5)*2.8);
float chips=basaltNoise(rockPoint*4.7+warp*1.3);
float grain=basaltNoise(basaltPosition*5.3);
float iron=smoothstep(.58,.78,basaltNoise(rockPoint*.7+vec3(8.,-3.,2.)));
vec3 stone=mix(vec3(.024,.03,.032),vec3(.115,.098,.072),smoothstep(.25,.78,blocks));
stone=mix(stone,vec3(.12,.043,.016),iron*.7);
float fractures=(1.-smoothstep(.24,.38,chips))*smoothstep(.3,.65,blocks);
stone*=(.68+chips*.35+grain*.22)*(1.-fractures*.4);
float rim=(1.-smoothstep(7.,12.,length(basaltPosition.xz-vec2(-3.6,1.4))+(blocks-.5)*5.))
  *smoothstep(12.,19.,basaltPosition.y+(chips-.5)*4.);
stone=mix(stone,stone*.28+vec3(.009,.004,.002),rim*.85);
diffuseColor.rgb=stone;
float rockRelief=chips*.025+grain*.005-fractures*.012;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
vec3 rockDx=dFdx(-vViewPosition),rockDy=dFdy(-vViewPosition);
vec3 rockR1=cross(rockDy,normal),rockR2=cross(normal,rockDx);
float rockDet=dot(rockDx,rockR1);
vec3 rockGradient=sign(rockDet)*(dFdx(rockRelief)*rockR1+dFdy(rockRelief)*rockR2);
normal=normalize(abs(rockDet)*normal-rockGradient);`);
  };
  const time = { value: 0 };
  const lava = new ShaderMaterial({
    uniforms: { time },
    vertexShader: `uniform float time;varying vec2 ground;
      void main(){
        ground=position.xz;vec3 p=position;
        p.y+=.07*sin(p.z*1.5-time*2.)+.04*sin(p.x*2.+time*1.7);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      }`,
    fragmentShader: `uniform float time; varying vec2 ground;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
      }
      void main(){
        // Carry both the dark rafts and hot tongues downstream at about one pace per second.
        vec2 p=ground*.55-vec2(.08,.65)*time;
        p.x+=.22*sin(ground.y*.7-time*.65);
        float coarse=noise(p*1.35),detail=noise(p*3.1+9.);
        float crust=smoothstep(.37,.64,coarse*.8+detail*.2);
        float river=1.-smoothstep(.15,2.8,abs(ground.x-1.3*sin(ground.y*.35)));
        float tongue=smoothstep(.32,.78,noise(vec2(p.x*2.2,p.y*.7)+4.));
        float molten=clamp(.35+river*.35+tongue*.45-crust*.95,0.,1.);
        vec3 rock=mix(vec3(.024,.014,.01),vec3(.12,.035,.009),detail);
        vec3 glow=mix(vec3(1.3,.08,.003),vec3(2.8,.72,.05),molten);
        gl_FragColor=vec4(mix(rock,glow,smoothstep(.08,.6,molten)),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  // One continuous, irregular surface makes the crater read as terrain rather than stacked primitives.
  const segments = 22;
  const rings = [
    { radius: 25, height: 0 },
    { radius: 16, height: 11 },
    { radius: 10, height: 21 },
    { radius: 6.4, height: 17.8 },
  ];
  const vertices: number[] = [];
  const ringPoint = (ring: number, index: number): [number, number, number] => {
    const angle = index / segments * Math.PI * 2;
    const wobble = 1 + 0.11 * Math.sin(index * 2.7 + ring * 1.8) + 0.045 * Math.sin(index * 5.1 - ring);
    const radius = rings[ring]!.radius * wobble;
    const ox = ring >= 2 ? -3.6 : -1.8;
    const oz = ring >= 2 ? 1.4 : 0;
    const slope = ring === 1 ? Math.sin(index * 1.7) * 1.5 : ring === 2 ? Math.sin(index * 1.9 + 0.8) * 2.2 : 0;
    const px=Math.cos(angle)*radius+ox,pz=Math.sin(angle)*radius*.86+oz;
    const height=ring===0?terrainHeight(x+px*Math.cos(-.18)+pz*Math.sin(-.18),z-px*Math.sin(-.18)+pz*Math.cos(-.18))-ground-.2:rings[ring]!.height+slope;
    return [px,height,pz];
  };
  for (let ring = 0; ring < rings.length; ring++) for (let index = 0; index < segments; index++) vertices.push(...ringPoint(ring, index));
  const indices: number[] = [];
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let index = 0; index < segments; index++) {
      const next = (index + 1) % segments;
      const a = ring * segments + index, b = ring * segments + next;
      const c = (ring + 1) * segments + next, d = (ring + 1) * segments + index;
      indices.push(a, d, b, b, d, c);
    }
  }
  const volcanoGeometry = new BufferGeometry();
  volcanoGeometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  volcanoGeometry.setIndex(indices);
  volcanoGeometry.computeVertexNormals();
  const volcano = new Mesh(volcanoGeometry, basalt);
  volcano.name = "greywrought.landmark.eastern-volcano.crater-surface";
  volcano.castShadow = true;
  volcano.receiveShadow = true;
  root.add(volcano);

  const pool = new Mesh(new CylinderGeometry(6.9, 5.8, 0.22, 28), lava);
  pool.name = "greywrought.landmark.eastern-volcano.lava";
  pool.position.set(-3.6, 17.9, 1.4);
  pool.scale.set(1.22, 1, 0.8);
  root.add(pool);

  const light = new PointLight(0xff5528, 2.1, 34, 2);
  light.name = "greywrought.landmark.eastern-volcano.glow";
  light.position.set(-3.6, 18.4, 1.4);
  root.add(light);

  let seed = 17;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
  function particles(count: number, embers: boolean): Points {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('seed', new Float32BufferAttribute(Array.from({ length: count * 3 }, random), 3));
    const material = new ShaderMaterial({
      uniforms: { time, pixelScale: { value: 450 } }, transparent: true, depthWrite: false,
      ...(embers ? { blending: AdditiveBlending } : {}),
      vertexShader: `uniform float time,pixelScale;attribute vec3 seed;varying float life;varying float variation;varying float emission;
        void main(){
          float age=time*${embers ? '.28' : '.085'}+seed.x;
          life=fract(age);variation=seed.z;emission=1.;
          ${embers ? `
          emission=step(.48,fract(sin(floor(age)*13.+seed.z*25.)*23.));
          float angle=seed.y*6.283;
          vec3 p=vec3(-3.6+cos(angle)*(1.+life*3.),18.3+4.*life*(1.-life)*(3.5+seed.z*3.),1.4+sin(angle)*(1.+life*3.));`
          : `
          float spread=2.5+life*7.;
          vec3 p=vec3(-3.6+(seed.y-.5)*spread+life*life*8.+sin(time*.7+seed.z*8.)*life,
            18.8+life*25.,1.4+(seed.z-.5)*spread+cos(time*.5+seed.y*7.)*life*1.5);`}
          vec4 view=modelViewMatrix*vec4(p,1.);
          gl_Position=projectionMatrix*view;
          gl_PointSize=(${embers ? '.16+seed.z*.16' : '3.2+life*6.'})*pixelScale/max(1.,-view.z);
        }`,
      fragmentShader: `varying float life;varying float variation;varying float emission;
        void main(){
          vec2 uv=gl_PointCoord*2.-1.;float radius=length(uv);
          float soft=1.-smoothstep(${embers ? '0.,1.' : '.15,.95'},radius);
          float fade=smoothstep(0.,.12,life)*(1.-smoothstep(.65,1.,life));
          ${embers ? 'fade*=emission;' : 'soft*=.75+.25*sin(uv.x*8.+variation*9.)*sin(uv.y*7.-variation*6.);'}
          float alpha=soft*fade*${embers ? '.95' : '.3'};
          if(alpha<.005)discard;
          gl_FragColor=vec4(${embers ? 'vec3(2.5,.55,.035)' : 'mix(vec3(.14,.12,.115),vec3(.31,.29,.27),life)'},alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const points = new Points(geometry, material), size = new Vector2();
    points.name = `greywrought.landmark.eastern-volcano.${embers ? 'embers' : 'ash'}`;
    // Motion lives in the shader, beyond the static geometry's bounds.
    points.frustumCulled = false;
    points.onBeforeRender = renderer => { material.uniforms.pixelScale!.value = renderer.getDrawingBufferSize(size).y * .5; };
    root.add(points);
    return points;
  }
  particles(48, false);
  particles(16, true);

  terrain.add(root);
  return { root, update(seconds: number) {
    time.value = seconds;
    light.intensity = 2.1 + .35 * Math.sin(seconds * 1.7) + .18 * Math.sin(seconds * 4.13 + .8);
  } };
}
