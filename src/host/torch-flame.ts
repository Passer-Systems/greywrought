import { Box3, Vector3, type BufferGeometry, type MeshStandardMaterial } from 'three';

const time = { value: 0 };

export function updateTorchFlames(seconds: number): void { time.value = seconds; }

/** Animate only the authored fire surface; the wooden shaft stays rigid. */
export function animateTorchFlame(material: MeshStandardMaterial, geometry: BufferGeometry, materialIndex: number): void {
  const bounds = new Box3(), vertex = new Vector3();
  const positions = geometry.getAttribute('position');
  for (const group of geometry.groups) {
    if ((group.materialIndex ?? 0) !== materialIndex) continue;
    for (let index = group.start; index < group.start + group.count; index++) {
      bounds.expandByPoint(vertex.fromBufferAttribute(positions, geometry.index?.getX(index) ?? index));
    }
  }
  if (bounds.isEmpty()) geometry.computeBoundingBox();
  if (bounds.isEmpty()) bounds.copy(geometry.boundingBox!);
  const base = bounds.min.y, height = Math.max(.001, bounds.max.y - base);
  material.onBeforeCompile = shader => {
    shader.uniforms.torchTime = time;
    shader.uniforms.torchBase = { value: base };
    shader.uniforms.torchHeight = { value: height };
    shader.vertexShader = `uniform float torchTime, torchBase, torchHeight;
varying float torchFlicker;\n${shader.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
      vec4 torchOrigin = vec4(0., 0., 0., 1.);
      #ifdef USE_INSTANCING
        torchOrigin = instanceMatrix * torchOrigin;
      #endif
      torchOrigin = modelMatrix * torchOrigin;
      float phase = dot(torchOrigin.xz, vec2(1.73, .91));
      torchFlicker = .9 + .1 * sin(torchTime * 7.1 + phase) + .035 * sin(torchTime * 13.7 + phase);
      float tip = clamp((position.y - torchBase) / torchHeight, 0., 1.);
      transformed.x += torchHeight * .055 * tip * tip * sin(torchTime * 5.3 + phase);
      transformed.z += torchHeight * .035 * tip * tip * sin(torchTime * 8.7 + phase);
      transformed.y += torchHeight * .1 * tip * (torchFlicker - .9);
    `);
    shader.fragmentShader = `varying float torchFlicker;\n${shader.fragmentShader}`.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance *= torchFlicker;
    `);
  };
  material.customProgramCacheKey = () => 'torch-flame-v1';
}
