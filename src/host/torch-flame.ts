import { Box3, Group, Mesh, PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils, Vector3, type BufferGeometry, type Object3D } from 'three';

const time = { value: 0 };
const solidGeometries = new WeakMap<BufferGeometry, BufferGeometry>();
const geometry = new PlaneGeometry(1, 1).translate(0, .5, 0);
const material = new ShaderMaterial({
  name: 'torch-flame', transparent: true, depthWrite: false, fog: true,
  uniforms: { ...UniformsUtils.clone(UniformsLib.fog), torchTime: time },
  vertexShader: `
    uniform float torchTime;
    varying vec2 fireUv;
    varying float firePhase;
    #include <fog_pars_vertex>
    void main() {
      fireUv = uv;
      vec4 origin = modelMatrix * vec4(0., 0., 0., 1.);
      firePhase = dot(origin.xz, vec2(1.73, .91));
      vec2 size = vec2(length(modelMatrix[0].xyz), length(modelMatrix[1].xyz));
      vec4 mvPosition = viewMatrix * origin;
      mvPosition.xy += position.xy * size;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: `
    uniform float torchTime;
    varying vec2 fireUv;
    varying float firePhase;
    #include <fog_pars_fragment>
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
      return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x),
        mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.)), f.x), f.y);
    }
    float flow(vec2 p) { return noise(p)*.65 + noise(p*2.03+8.1)*.25 + noise(p*4.11)*.1; }
    float tongue(vec2 p, float height, float width, float offset, float seed) {
      float y = p.y / height;
      float turbulence = flow(vec2(p.x*3.+seed, y*3.-torchTime*2.4));
      float bend = (noise(vec2(seed, y*2.-torchTime*1.7))-.5)*.32*y;
      float radius = width*pow(max(0., 1.-y), .72);
      radius *= .78 + turbulence*.45;
      float edge = abs(p.x-offset-bend) - radius;
      return (1.-smoothstep(-.025, .055, edge)) * (1.-smoothstep(.72, 1., y))
        * smoothstep(-.025, .07, p.y);
    }
    void main() {
      vec2 p = vec2((fireUv.x-.5)*2., fireUv.y*1.65);
      float seed = firePhase;
      float heat = flow(vec2(p.x*4.+seed, p.y*4.-torchTime*3.1));
      float height = .92 + (noise(vec2(torchTime*.9, seed))-.5)*.16;
      float body = tongue(p, height, .38, 0., seed);
      float left = tongue(p, .62, .18, -.25, seed+7.);
      float right = tongue(p, .72, .16, .24, seed+19.);
      float envelope = max(body, max(left, right)*.85);
      float core = tongue(p, .48, .19, -.025, seed+31.);
      float inner = tongue(p, .7, .27, .015, seed+41.);
      vec3 color = mix(vec3(1.6,.095,.008), vec3(3.1,.8,.035), inner*(.65+heat*.35));
      color = mix(color, vec3(4.2,2.6,.62), core*.92);
      float alpha = envelope*(.68+heat*.24);
      vec3 emission = color*alpha;
      for (int i=0; i<4; i++) {
        float id = float(i);
        float age = fract(torchTime*(.28+id*.017)+id*.271+seed);
        float drift = (hash(vec2(id,seed))-.5)*.55;
        vec2 ember = vec2(drift*age + sin(age*7.+id)*.065, .42+age*1.13);
        vec2 d = (p-ember)/vec2(.012,.023);
        float spark = exp(-dot(d,d)*2.)*sin(age*3.14159265)*.7;
        emission += vec3(3.8,1.1,.12)*spark;
        alpha = max(alpha, spark);
      }
      if (alpha < .003) discard;
      gl_FragColor = vec4(emission/max(alpha,.003), alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }`,
});

export function updateTorchFlames(seconds: number): void { time.value = seconds; }

/** Shared cached resources follow the prop cache's lifetime; each torch owns only its mesh. */
export function createTorchFire(width: number, height: number): Mesh {
  const fire = new Mesh(geometry, material);
  fire.name = 'torch-flame';
  fire.scale.set(width, height * 1.65, 1);
  return fire;
}

/** Fit the authored prop first, then replace its fire without resizing the support. */
export function replaceTorchFire(root: Object3D): void {
  const surfaces: Mesh[] = [];
  root.traverse(object => {
    if (object instanceof Mesh && Array.isArray(object.material) && object.material.some(surface => surface.name === 'Fire')) surfaces.push(object);
  });
  for (const mesh of surfaces) {
    if (!Array.isArray(mesh.material)) continue;
    const materials = mesh.material, fireIndex = materials.findIndex(surface => surface.name === 'Fire');
    const bounds = new Box3(), bowl = new Box3(), vertex = new Vector3();
    const positions = mesh.geometry.getAttribute('position');
    for (const group of mesh.geometry.groups) {
      const name = materials[group.materialIndex ?? 0]!.name;
      if (name !== 'Fire' && name !== 'LightGrey') continue;
      const target = name === 'Fire' ? bounds : bowl;
      for (let index = group.start; index < group.start + group.count; index++) {
        target.expandByPoint(vertex.fromBufferAttribute(positions, mesh.geometry.index?.getX(index) ?? index));
      }
    }
    const width = bounds.max.x-bounds.min.x, height = bounds.max.y-bounds.min.y;
    const fire = createTorchFire(width*1.6, height*.72);
    fire.position.set((bounds.min.x+bounds.max.x)*.5, bowl.max.y, (bounds.min.z+bounds.max.z)*.5);
    const attachment = new Group(); attachment.name = "torch-fire-attachment";
    attachment.position.copy(mesh.position); attachment.quaternion.copy(mesh.quaternion); attachment.scale.copy(mesh.scale);
    attachment.add(fire); mesh.parent!.add(attachment);
    // The cached authored vertices still determine fitting, but only solid groups draw.
    let solid = solidGeometries.get(mesh.geometry);
    if (!solid) {
      solid = mesh.geometry.clone();
      solid.clearGroups();
      for (const group of mesh.geometry.groups) {
        const index = group.materialIndex ?? 0;
        if (index !== fireIndex) solid.addGroup(group.start, group.count, index > fireIndex ? index-1 : index);
      }
      solidGeometries.set(mesh.geometry, solid);
    }
    mesh.geometry = solid;
    mesh.material = materials.filter((_, index) => index !== fireIndex);
  }
}
