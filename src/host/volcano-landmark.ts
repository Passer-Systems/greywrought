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
import { LAVA_LAKE, LAVA_LAKE_SHORE, lavaLakeRatio } from '../game/lava-layout.js';

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
    uniforms: { time, channel: { value: 0 }, basin: { value: 0 } },
    vertexShader: `uniform float time,channel,basin;varying vec2 ground;varying vec2 flow;
      void main(){
        ground=position.xz;flow=uv;vec3 p=position;
        p.y+=(1.-channel)*(1.-basin*.8)*(.07*sin(p.z*1.5-time*2.)+.04*sin(p.x*2.+time*1.7));
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      }`,
    fragmentShader: `uniform float time,channel,basin; varying vec2 ground;varying vec2 flow;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){
        vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);
      }
      void main(){
        // Carry both the dark rafts and hot tongues downstream at about one pace per second.
        vec2 p=mix(ground*.55,vec2(flow.x*2.8,flow.y*.55),channel)-vec2(.08,.65)*time;
        p.x+=.22*sin(p.y*.7-time*.15);
        float coarse=noise(p*1.35),detail=noise(p*3.1+9.);
        float crust=smoothstep(.37,.64,coarse*.8+detail*.2);
        float river=mix(1.-smoothstep(.15,2.8,abs(ground.x-1.3*sin(ground.y*.35))),
          1.-smoothstep(.15,1.,abs(flow.x)),channel);
        float tongue=smoothstep(.32,.78,noise(vec2(p.x*2.2,p.y*.7)+4.));
        float edge=channel*smoothstep(.65,1.,abs(flow.x))*.7
          +basin*smoothstep(.72,1.,length(flow))*(.48+detail*.3);
        float molten=clamp(.35+river*.35+tongue*.45-crust*.95-edge,0.,1.);
        vec3 rock=mix(vec3(.024,.014,.01),vec3(.12,.035,.009),detail);
        vec3 glow=mix(vec3(1.3,.08,.003),vec3(2.8,.72,.05),molten);
        gl_FragColor=vec4(mix(rock,glow,smoothstep(.08,.6,molten)),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });

  // The channel and its banks share the mountain's surface coordinates.
  // Carving the outlet also opens the crater rim, so the flow never bridges rock.
  const segments = 176, slopes = 96;
  const rings = [
    { radius: 6.4, height: 17.8, t: 0, original: 3 },
    { radius: 10, height: 21, t: .2, original: 2 },
    { radius: 16, height: 11, t: .58, original: 1 },
    { radius: 25, height: 0, t: 1, original: 0 },
  ];
  const channelAngle = (t: number) => 1.15 + .25 * Math.sin(t * 7) - .13 * Math.sin(t * 13);
  const channelWidth = (t: number) => 1.05 + .65 * Math.sin(t * Math.PI) + .28 * Math.sin(t * 11) ** 2;
  const ringVertex = (ring: typeof rings[number], angle: number): [number, number, number] => {
    const index = angle / (Math.PI * 2) * 22, original = ring.original;
    const wobble = 1 + .11 * Math.sin(index * 2.7 + original * 1.8) + .045 * Math.sin(index * 5.1 - original);
    const radius = ring.radius * wobble;
    const px = Math.cos(angle) * radius + (original >= 2 ? -3.6 : -1.8);
    const pz = Math.sin(angle) * radius * .86 + (original >= 2 ? 1.4 : 0);
    const slope = original === 1 ? Math.sin(index * 1.7) * 1.5 : original === 2 ? Math.sin(index * 1.9 + .8) * 2.2 : 0;
    const height = original === 0
      ? terrainHeight(x + px * Math.cos(-.18) + pz * Math.sin(-.18), z - px * Math.sin(-.18) + pz * Math.cos(-.18)) - ground - .2
      : ring.height + slope;
    return [px, height, pz];
  };
  const ringPoint = (ring: typeof rings[number], angle: number): [number, number, number] => {
    const index = angle / (Math.PI * 2) * 22, start = Math.floor(index), f = index - start;
    const a = ringVertex(ring, (start % 22) / 22 * Math.PI * 2);
    const b = ringVertex(ring, ((start + 1) % 22) / 22 * Math.PI * 2);
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  };
  const surfacePoint = (t: number, angle: number): [number, number, number] => {
    const band = t <= .2 ? 0 : t <= .58 ? 1 : 2;
    const inner = rings[band]!, outer = rings[band + 1]!;
    const f = (t - inner.t) / (outer.t - inner.t);
    const a = ringPoint(inner, angle), b = ringPoint(outer, angle);
    const point: [number, number, number] = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    const radius = inner.radius + (outer.radius - inner.radius) * f;
    const distance = Math.abs(Math.atan2(Math.sin(angle - channelAngle(t)), Math.cos(angle - channelAngle(t)))) * radius;
    const bank = Math.max(0, Math.min(1, (distance - channelWidth(t)) / 1.15));
    const cut = 1 - bank * bank * (3 - 2 * bank);
    // A falling floor through the rim makes a continuous outlet from the lake.
    const floors = [17.72, 17.1, 9.6, ringPoint(rings[3]!, channelAngle(t))[1]];
    const floor = floors[band]! + (floors[band + 1]! - floors[band]!) * f;
    point[1] -= Math.max(0, point[1] - floor) * cut;
    const wx = x + point[0] * Math.cos(-.18) + point[2] * Math.sin(-.18);
    const wz = z - point[0] * Math.sin(-.18) + point[2] * Math.cos(-.18);
    const basinEdge = lavaLakeRatio(wx, wz);
    if (basinEdge < 1.35) {
      // Open the mountain's toe over the basin instead of burying hot ground under rock.
      const blend = Math.max(0, (basinEdge - 1) / .35);
      point[1] += (terrainHeight(wx, wz) - ground - .08 - point[1]) * (1 - blend * blend * (3 - 2 * blend));
    }
    return point;
  };
  const vertices: number[] = [], indices: number[] = [];
  for (let row = 0; row <= slopes; row++) for (let index = 0; index <= segments; index++) {
    vertices.push(...surfacePoint(row / slopes, index / segments * Math.PI * 2));
  }
  for (let row = 0; row < slopes; row++) for (let index = 0; index < segments; index++) {
    const a = row * (segments + 1) + index, b = a + segments + 1;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
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

  const flowVertices: number[] = [], flowUvs: number[] = [], flowIndices: number[] = [];
  const across = 10;
  let travelled = 0, previous: [number, number, number] | undefined;
  for (let row = 0; row <= slopes; row++) {
    const t = row / slopes, angle = channelAngle(t), center = surfacePoint(t, angle);
    if (previous) travelled += Math.hypot(center[0] - previous[0], center[1] - previous[1], center[2] - previous[2]);
    previous = center;
    const radius = t <= .2 ? 6.4 + t / .2 * 3.6 : t <= .58 ? 10 + (t - .2) / .38 * 6 : 16 + (t - .58) / .42 * 9;
    for (let col = 0; col <= across; col++) {
      const side = col / across * 2 - 1;
      const edge = channelWidth(t) * .92 * (1 + .045 * Math.sin(t * 83 + side * 4));
      const point = surfacePoint(t, angle + side * edge / radius);
      point[1] += .12;
      const outlet = Math.max(0, (t - .9) / .1);
      point[1] = Math.max(point[1], (LAVA_LAKE.surface - ground + .02) * outlet + point[1] * (1 - outlet));
      flowVertices.push(...point); flowUvs.push(side, travelled);
    }
  }
  for (let row = 0; row < slopes; row++) for (let col = 0; col < across; col++) {
    const a = row * (across + 1) + col, b = a + across + 1;
    flowIndices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const flowGeometry = new BufferGeometry();
  flowGeometry.setAttribute('position', new Float32BufferAttribute(flowVertices, 3));
  flowGeometry.setAttribute('uv', new Float32BufferAttribute(flowUvs, 2));
  flowGeometry.setIndex(flowIndices);
  flowGeometry.computeVertexNormals();
  const flowMaterial = lava.clone();
  flowMaterial.uniforms.time = time;
  flowMaterial.uniforms.channel!.value = 1;
  const river = new Mesh(flowGeometry, flowMaterial);
  river.name = 'greywrought.landmark.eastern-volcano.lava-river';
  root.add(river);

  // World-space basin meshes share their exact shoreline with terrain and damage.
  const lakeVertices: number[] = [LAVA_LAKE.x, LAVA_LAKE.surface, LAVA_LAKE.z], lakeUvs = [0, 0], lakeIndices: number[] = [];
  const bankVertices: number[] = [], bankIndices: number[] = [];
  for (const [index, shore] of LAVA_LAKE_SHORE.entries()) {
    const px = LAVA_LAKE.x + shore.x * LAVA_LAKE.radiusX, pz = LAVA_LAKE.z + shore.z * LAVA_LAKE.radiusZ;
    lakeVertices.push(px, LAVA_LAKE.surface, pz);
    const length = Math.hypot(shore.x, shore.z);
    lakeUvs.push(shore.x / length, shore.z / length);
    lakeIndices.push(0, (index + 1) % LAVA_LAKE_SHORE.length + 1, index + 1);
    for (const scale of [.985, 1.09, 1.28]) {
      const bx = LAVA_LAKE.x + shore.x * LAVA_LAKE.radiusX * scale, bz = LAVA_LAKE.z + shore.z * LAVA_LAKE.radiusZ * scale;
      const ridge = scale === 1.09 ? .16 + .06 * Math.sin(index * 1.7) : .025;
      bankVertices.push(bx, terrainHeight(bx, bz) + ridge, bz);
    }
    for (let band = 0; band < 2; band++) {
      const a = index * 3 + band, b = (index + 1) % LAVA_LAKE_SHORE.length * 3 + band;
      bankIndices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const lakeGeometry = new BufferGeometry();
  lakeGeometry.setAttribute('position', new Float32BufferAttribute(lakeVertices, 3));
  lakeGeometry.setAttribute('uv', new Float32BufferAttribute(lakeUvs, 2));
  lakeGeometry.setIndex(lakeIndices); lakeGeometry.computeVertexNormals();
  const lakeMaterial = lava.clone(); lakeMaterial.uniforms.time = time; lakeMaterial.uniforms.basin!.value = 1;
  const lake = new Mesh(lakeGeometry, lakeMaterial);
  lake.name = 'greywrought.landmark.eastern-volcano.lava-lake'; terrain.add(lake);
  const bankGeometry = new BufferGeometry();
  bankGeometry.setAttribute('position', new Float32BufferAttribute(bankVertices, 3));
  bankGeometry.setIndex(bankIndices); bankGeometry.computeVertexNormals();
  const scorched = basalt.clone(), compileBasalt = basalt.onBeforeCompile;
  scorched.onBeforeCompile = (shader, renderer) => {
    compileBasalt.call(scorched, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('diffuseColor.rgb=stone;', 'diffuseColor.rgb=stone*.32;');
  };
  scorched.customProgramCacheKey = () => 'volcano-scorched-bank';
  const bank = new Mesh(bankGeometry, scorched);
  bank.name = 'greywrought.landmark.eastern-volcano.scorched-bank'; bank.receiveShadow = true; terrain.add(bank);

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
