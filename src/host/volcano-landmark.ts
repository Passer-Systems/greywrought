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

  const basalt = new MeshStandardMaterial({ color: 0x272629, roughness: 0.96, metalness: 0.08 });
  const time = { value: 0 };
  const lava = new ShaderMaterial({
    uniforms: { time },
    vertexShader: `varying vec2 ground;
      void main(){ground=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `uniform float time; varying vec2 ground;
      vec2 hash(vec2 p){return fract(sin(vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3))))*43758.5453);}
      void main(){
        vec2 p=ground*.65+vec2(time*.025,-time*.016);
        p+=.22*vec2(sin(p.y*1.7+time*.13),cos(p.x*1.4-time*.11));
        vec2 cell=floor(p),f=fract(p); float first=9.,second=9.;
        for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
          vec2 offset=vec2(float(x),float(y));
          vec2 center=.5+.35*sin(hash(cell+offset)*6.283+time*.09);
          float d=length(offset+center-f);
          if(d<first){second=first;first=d;}else second=min(second,d);
        }
        float seam=1.-smoothstep(.025,.16,second-first);
        float swell=.5+.5*sin(p.x*1.8+sin(p.y*2.1)+time*.31);
        float molten=max(seam,smoothstep(.67,.95,swell)*.85);
        vec3 crust=mix(vec3(.027,.018,.014),vec3(.15,.045,.015),swell);
        vec3 glow=mix(vec3(1.5,.11,.008),vec3(3.,.95,.12),seam*.7+swell*.3);
        gl_FragColor=vec4(mix(crust,glow,molten),1.);
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
      vertexShader: `uniform float time,pixelScale;attribute vec3 seed;varying float life;varying float variation;
        void main(){
          life=fract(time*${embers ? '.13' : '.034'}+seed.x);variation=seed.z;
          float spread=${embers ? '1.5+life*4.' : '1.1+life*6.'};
          vec3 p=vec3(-3.6+(seed.y-.5)*spread+life*life*4.+sin(time*.35+seed.z*8.)*life,
            18.8+life*${embers ? '13.' : '25.'},1.4+(seed.z-.5)*spread+cos(time*.24+seed.y*7.)*life);
          vec4 view=modelViewMatrix*vec4(p,1.);
          gl_Position=projectionMatrix*view;
          gl_PointSize=(${embers ? '.07+seed.z*.09' : '2.2+life*5.'})*pixelScale/max(1.,-view.z);
        }`,
      fragmentShader: `varying float life;varying float variation;
        void main(){
          vec2 uv=gl_PointCoord*2.-1.;float radius=length(uv);
          float soft=1.-smoothstep(${embers ? '0.,1.' : '.15,.95'},radius);
          float fade=smoothstep(0.,.12,life)*(1.-smoothstep(.65,1.,life));
          ${embers ? 'fade*=step(.62,variation);' : 'soft*=.75+.25*sin(uv.x*8.+variation*9.)*sin(uv.y*7.-variation*6.);'}
          float alpha=soft*fade*${embers ? '.9' : '.24'};
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
