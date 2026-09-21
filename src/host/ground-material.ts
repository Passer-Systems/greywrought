import { MeshStandardMaterial, NoColorSpace, RepeatWrapping, SRGBColorSpace, TextureLoader } from 'three';

/** Shared world-space layers: leaf-strewn earth, stony moss and exposed rock.
 * Texture fields remain on the material so the world's shared-resource disposer
 * owns their lifetime, including the extra layers used by the shader. */
export function createRuinedGroundMaterial() {
  const loader = new TextureLoader();
  const texture = (name: string, color: boolean) => {
    const map = loader.load(`/assets/ground/${name}.webp`);
    map.colorSpace = color ? SRGBColorSpace : NoColorSpace;
    map.wrapS = map.wrapT = RepeatWrapping;
    map.anisotropy = 8;
    return map;
  };
  const material = Object.assign(new MeshStandardMaterial({
    map: texture('forest-floor-color', true),
    normalMap: texture('forest-floor-normal', false),
    roughness: .94, metalness: 0, vertexColors: true,
  }), {
    groundMossMap: texture('moss-color', true),
    groundMossNormal: texture('moss-normal', false),
    groundStoneMap: texture('stone-color', true),
    groundStoneNormal: texture('stone-normal', false),
  });
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, {
      groundMossMap: { value: material.groundMossMap },
      groundMossNormal: { value: material.groundMossNormal },
      groundStoneMap: { value: material.groundStoneMap },
      groundStoneNormal: { value: material.groundStoneNormal },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 groundWorldPos;
varying vec3 groundWorldNormal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
groundWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
groundWorldNormal = normalize(mat3(modelMatrix) * normal);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 groundWorldPos;
varying vec3 groundWorldNormal;
uniform sampler2D groundMossMap;
uniform sampler2D groundMossNormal;
uniform sampler2D groundStoneMap;
uniform sampler2D groundStoneNormal;
float groundHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * .1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float groundNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(groundHash(i), groundHash(i + vec2(1., 0.)), u.x),
    mix(groundHash(i + vec2(0., 1.)), groundHash(i + vec2(1.)), u.x), u.y);
}`)
      .replace('#include <map_fragment>', `
// Independent scales/orientations keep the two authored surfaces from forming
// a repeated composite tile. Only the narrow irregular edges mix their detail.
vec2 groundP = groundWorldPos.xz;
vec2 litterUv = groundP * .32;
vec2 mossUv = mat2(.8, -.6, .6, .8) * groundP * .19 + vec2(.37, .61);
vec3 litter = texture2D(map, litterUv).rgb;
vec3 moss = texture2D(groundMossMap, mossUv).rgb;
float largePatch = groundNoise(groundP * .047);
float surfacePatch = largePatch * .5 + groundNoise(groundP * .17 + largePatch * 3.) * .34
  + groundNoise(groundP * .63) * .16;
float mossCover = smoothstep(.40, .57, surfacePatch + (moss.g - litter.r) * .16);
float slope = 1. - max(0., normalize(groundWorldNormal).y);
float rockCover = smoothstep(.16, .46, slope + (surfacePatch - .5) * .13);
vec3 groundColor = mix(litter * vec3(.78, .73, .64), moss * vec3(.74, .86, .65), mossCover);
vec3 stoneWeights = pow(abs(normalize(groundWorldNormal)), vec3(4.));
stoneWeights /= dot(stoneWeights, vec3(1.));
vec3 stoneP = groundWorldPos * .27;
if (rockCover > .001) {
  vec3 stone = texture2D(groundStoneMap, stoneP.zy).rgb * stoneWeights.x
    + texture2D(groundStoneMap, stoneP.xz).rgb * stoneWeights.y
    + texture2D(groundStoneMap, stoneP.xy).rgb * stoneWeights.z;
  groundColor = mix(groundColor, stone * vec3(.78, .81, .77), rockCover);
}
diffuseColor.rgb *= groundColor * mix(.86, 1.08, largePatch);`)
      .replace('#include <color_fragment>', `
#ifdef USE_COLOR
// Vertex colours describe regional terrain tint, not a second dark albedo.
diffuseColor.rgb *= mix(vec3(1.), vColor.rgb, .32);
#ifdef USE_COLOR_ALPHA
diffuseColor.a *= vColor.a;
#endif
#endif`)
      .replace('#include <normal_fragment_maps>', `
// Derivative frames keep relief aligned with each world-space projection on
// curved terrain; geometry and gameplay heights remain untouched.
vec3 groundBaseNormal = normal;
mat3 litterFrame = getTangentFrame(-vViewPosition, groundBaseNormal, litterUv);
mat3 mossFrame = getTangentFrame(-vViewPosition, groundBaseNormal, mossUv);
vec3 litterN = texture2D(normalMap, litterUv).xyz * 2. - 1.;
vec3 mossN = texture2D(groundMossNormal, mossUv).xyz * 2. - 1.;
litterN.xy *= .7;
mossN.xy *= .85;
vec3 floorN = normalize(mix(normalize(litterFrame * litterN), normalize(mossFrame * mossN), mossCover));
// Calculate derivative frames outside the slope branch, where all fragments
// in the quad participate, to keep shoreline transitions well-defined.
mat3 stoneFrameX = getTangentFrame(-vViewPosition, groundBaseNormal, stoneP.zy);
mat3 stoneFrameY = getTangentFrame(-vViewPosition, groundBaseNormal, stoneP.xz);
mat3 stoneFrameZ = getTangentFrame(-vViewPosition, groundBaseNormal, stoneP.xy);
if (rockCover > .001) {
  vec3 nx = texture2D(groundStoneNormal, stoneP.zy).xyz * 2. - 1.;
  vec3 ny = texture2D(groundStoneNormal, stoneP.xz).xyz * 2. - 1.;
  vec3 nz = texture2D(groundStoneNormal, stoneP.xy).xyz * 2. - 1.;
  nx.xy *= .85; ny.xy *= .85; nz.xy *= .85;
  vec3 stoneN = normalize((stoneFrameX * nx) * stoneWeights.x
    + (stoneFrameY * ny) * stoneWeights.y + (stoneFrameZ * nz) * stoneWeights.z);
  floorN = normalize(mix(floorN, stoneN, rockCover));
}
normal = floorN;`);
  };
  material.customProgramCacheKey = () => 'ruined-ground-layered-v1';
  return material;
}
