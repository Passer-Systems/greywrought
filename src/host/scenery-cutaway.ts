import { Box3, Material, Mesh, MeshStandardMaterial, Vector3, Vector4, type Object3D } from 'three';
import type { Position } from '../game/adventure-types.js';
import { COMBAT_CELL_SIZE } from '../game/combat-grid.js';

/** A soft, dithered window through scenery. World-space vertices keep each
 * instance independent, while opaque depth/shadows and batching stay intact. */
export function createSceneryCutaway() {
  const uniforms = {
    cutawayEye: { value: new Vector3() },
    cutawayPlayer: { value: new Vector4() },
    cutawayGrid: { value: new Vector4() },
    cutawayEnabled: { value: 0 },
  };
  const copies = new Map<Material, Material>();
  const bounds = new Box3(), center = new Vector3(), size = new Vector3();
  let gridStrength = 0;
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
        uniform vec4 cutawayGrid;
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
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
        #include <alphatest_fragment>
        float reveal = max(cutawayWindow(cutawayPlayer), cutawayWindow(cutawayGrid)) * cutawayEnabled;
        // Fixed screen-space coverage avoids transparency sorting and temporal sparkle.
        float coverage = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
        if (coverage < reveal * 0.88) discard;
      `);
    };
    copy.customProgramCacheKey = () => `${key}:scenery-cutaway-v1`;
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
    update(eye: Vector3, player: Position, aimHeight: number, tiles: readonly Position[], delta: number, enabled = true) {
      uniforms.cutawayEye.value.copy(eye);
      uniforms.cutawayPlayer.value.set(player.x, player.y + aimHeight, player.z, 1.8);
      uniforms.cutawayEnabled.value = enabled ? 1 : 0;
      const blend = 1 - Math.exp(-Math.max(0, delta) * 12);
      gridStrength += ((tiles.length ? 1 : 0) - gridStrength) * blend;
      if (tiles.length) {
        bounds.makeEmpty();
        for (const tile of tiles) bounds.expandByPoint(center.set(tile.x, tile.y, tile.z));
        bounds.getCenter(center); bounds.getSize(size);
        uniforms.cutawayGrid.value.set(center.x, center.y + .15, center.z, (size.length() / 2 + COMBAT_CELL_SIZE) * gridStrength);
      } else uniforms.cutawayGrid.value.w *= 1 - blend;
    },
  };
}
