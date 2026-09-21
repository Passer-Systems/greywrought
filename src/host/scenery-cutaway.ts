import { Material, Mesh, MeshStandardMaterial, Vector3, Vector4, type Object3D } from 'three';
import type { Position } from '../game/adventure-types.js';
import { COMBAT_CELL_SIZE } from '../game/combat-grid.js';

/** A soft, dithered window through scenery. World-space vertices keep each
 * instance independent, while opaque depth/shadows and batching stay intact. */
export function createSceneryCutaway() {
  const uniforms = {
    cutawayEye: { value: new Vector3() },
    cutawayPlayer: { value: new Vector4() },
    cutawayGround: { value: new Vector4() },
    cutawayEnabled: { value: 0 },
  };
  const copies = new Map<Material, Material>();
  let groundRadius = 0;
  function material(source: Material): Material {
    const existing = copies.get(source);
    if (existing) return existing;
    const copy = source.clone(), compile = source.onBeforeCompile, key = source.customProgramCacheKey();
    copies.set(source, copy);
    // Some scenery changes colour/emission as objectives complete.
    copy.onBeforeRender = (...args) => {
      source.onBeforeRender(...args);
      if (source instanceof MeshStandardMaterial && copy instanceof MeshStandardMaterial) {
        copy.color.copy(source.color); copy.emissive.copy(source.emissive); copy.emissiveIntensity = source.emissiveIntensity;
      }
    };
    copy.onBeforeCompile = (shader, renderer) => {
      compile.call(source, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = 'varying vec3 cutawayWorld;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <project_vertex>', `
        #include <project_vertex>
        vec4 cutawayVertex = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cutawayVertex = instanceMatrix * cutawayVertex;
        #endif
        cutawayWorld = (modelMatrix * cutawayVertex).xyz;
      `);
      shader.fragmentShader = `
        varying vec3 cutawayWorld;
        uniform vec3 cutawayEye;
        uniform vec4 cutawayPlayer;
        uniform vec4 cutawayGround;
        uniform float cutawayEnabled;
        float cutawayWindow(vec4 target) {
          vec3 boom = target.xyz - cutawayEye;
          float lengthSquared = dot(boom, boom);
          float along = dot(cutawayWorld - cutawayEye, boom) / max(lengthSquared, 0.01);
          float radius = target.w * max(along, 0.0);
          float radial = length(cutawayWorld - cutawayEye - boom * along);
          // End at the protected subject: background scenery stays solid.
          return (1.0 - smoothstep(radius * 0.75, max(radius, 0.001), radial))
            * step(0.0, along) * (1.0 - smoothstep(0.98, 1.0, along));
        }
        float cutawayGroundWindow() {
          vec3 ray = cutawayWorld - cutawayEye;
          if (ray.y >= -0.001 || cutawayGround.w <= 0.0) return 0.0;
          float groundAt = (cutawayGround.y - cutawayEye.y) / ray.y;
          if (groundAt <= 1.0) return 0.0;
          vec2 ground = cutawayEye.xz + ray.xz * groundAt;
          // Reveal the ground on both sides of the player, not just a cone
          // ending at their torso. Pixels behind the ground stay opaque.
          return 1.0 - smoothstep(cutawayGround.w, cutawayGround.w + 1.875,
            distance(ground, cutawayGround.xz));
        }
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
        #include <alphatest_fragment>
        float reveal = max(cutawayWindow(cutawayPlayer), cutawayGroundWindow()) * cutawayEnabled;
        // Fixed screen-space coverage avoids transparency sorting and temporal sparkle.
        float coverage = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (coverage < reveal) discard;
      `);
    };
    copy.customProgramCacheKey = () => `${key}:scenery-cutaway-v2`;
    return copy;
  }
  return {
    uniforms,
    install(root: Object3D, keepSolid: readonly Object3D[] = []) {
      const excluded = new Set(keepSolid);
      root.traverse(object => {
        if (!(object instanceof Mesh) || object.userData.walkableGround || object.type === 'SkinnedMesh') return;
        for (let parent: Object3D | null = object; parent; parent = parent.parent) if (excluded.has(parent)) return;
        const apply = (source: Material) => source.transparent || source.type === 'ShaderMaterial' ? source : material(source);
        object.material = Array.isArray(object.material) ? object.material.map(apply) : apply(object.material);
      });
    },
    update(eye: Vector3, player: Position, aimHeight: number, movementRange: number, delta: number, enabled = true) {
      uniforms.cutawayEye.value.copy(eye);
      uniforms.cutawayPlayer.value.set(player.x, player.y + aimHeight, player.z, 1.8);
      uniforms.cutawayEnabled.value = enabled ? 1 : 0;
      const blend = 1 - Math.exp(-Math.max(0, delta) * 12);
      const radius = Math.max(COMBAT_CELL_SIZE * 3, movementRange) + COMBAT_CELL_SIZE;
      groundRadius = groundRadius === 0 ? radius : groundRadius + (radius - groundRadius) * blend;
      uniforms.cutawayGround.value.set(player.x, player.y + .1, player.z, groundRadius);
    },
  };
}
