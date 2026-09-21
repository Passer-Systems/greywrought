import { MeshStandardMaterial, type Material } from 'three';

export type TreePalette = 'moss' | 'blue' | 'ochre' | 'copper' | 'ash';
const colors: Record<TreePalette, number> = { moss: 0x738450, blue: 0x627e79, ochre: 0xa79c57, copper: 0xa5754d, ash: 0x97978a };
const variants = new Map<string, MeshStandardMaterial>();

export function treePaletteMaterial(source: Material, palette: TreePalette): Material {
  if (!(source instanceof MeshStandardMaterial) || !source.name.startsWith('Leaves_')) return source;
  const key = `${source.uuid}:${palette}`;
  const cached = variants.get(key);
  if (cached) return cached;
  const material = source.clone();
  const compileSource = source.onBeforeCompile, sourceKey = source.customProgramCacheKey();
  material.name = `${source.name}_${palette}`;
  material.color.setHex(colors[palette]);
  if (palette === 'ash' || palette === 'ochre') material.alphaTest = Math.max(source.alphaTest, .7);
  // Recolour the authored green texture by luminance so copper and ash do not
  // become muddy green. Its texture detail, alpha, and dapple mask stay intact.
  material.onBeforeCompile = (shader, renderer) => {
    compileSource.call(source, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #include <map_fragment>
      #ifdef USE_MAP
        diffuseColor.rgb = diffuse * clamp(dot(sampledDiffuseColor.rgb, vec3(.2126, .7152, .0722)) * 1.65, .12, 1.0);
      #endif
    `);
  };
  material.customProgramCacheKey = () => `${sourceKey}:tree-palette-v1`;
  variants.set(key, material);
  return material;
}
