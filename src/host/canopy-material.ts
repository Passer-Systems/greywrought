import { CanvasTexture, DoubleSide, MeshStandardMaterial, RepeatWrapping, type Material } from 'three';

let mask: CanvasTexture | undefined;
const variants = new Map<string, MeshStandardMaterial>();

function canopyMask(): CanvasTexture {
  if (mask) return mask;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#ffffff'; context.fillRect(0, 0, 64, 64);
  // Small irregular holes let sunlight thread through leaves while avoiding a
  // regular checkerboard. The same alphaMap/alphaTest is honored by shadows.
  for (let index = 0; index < 46; index++) {
    const x = (Math.sin(index * 17.13) * 0.5 + .5) * 64;
    const y = (Math.sin(index * 31.71 + 1.4) * 0.5 + .5) * 64;
    const radius = 1.2 + (index % 5) * .75;
    context.fillStyle = index % 3 ? '#000000' : '#202020';
    context.beginPath(); context.ellipse(x, y, radius * 1.35, radius, index * .41, 0, Math.PI * 2); context.fill();
  }
  mask = new CanvasTexture(canvas); mask.wrapS = mask.wrapT = RepeatWrapping; mask.repeat.set(1.7, 1.3);
  return mask;
}

export function canopyMaterial(material: Material): Material {
  if (!(material instanceof MeshStandardMaterial)) return material;
  if (!/^Leaves_(NormalTree|TwistedTree)/.test(material.name)) return material;
  const cached = variants.get(material.uuid);
  if (cached) return cached;
  const variant = material.clone();
  variant.name = `${material.name}_Dappled`;
  variant.alphaMap = canopyMask();
  variant.alphaTest = .48;
  variant.transparent = false;
  variant.depthWrite = true;
  // Preserve the authored leaf double-sided silhouette, which is also used by
  // the renderer's shadow depth pass.
  variant.side = DoubleSide;
  variants.set(material.uuid, variant);
  return variant;
}
