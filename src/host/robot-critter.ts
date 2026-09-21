import { CanvasTexture, Material, Mesh, MeshBasicMaterial, MeshStandardMaterial, Texture } from "three";
import { actor, type ForestActor } from "./frostwood-assets.js";

export { ROBOT_CRITTER_COLORS } from "./robot-critter-colors.js";

/** Keep the authored shell, joints and native Crab animation rig under worn metal. */
export async function robotCritter(height: number, color: number): Promise<ForestActor> {
  const creature = await actor("Crab", height);
  const materials = new Map<Material, MeshStandardMaterial>();
  const textures: Texture[] = [];
  creature.model.traverse(object => {
    if (!(object instanceof Mesh)) return;
    const metal = (original: Material) => {
      let local = materials.get(original);
      if (local) return local;
      let map: Texture | null = null;
      if ((original instanceof MeshBasicMaterial || original instanceof MeshStandardMaterial) && original.map) {
        const image = original.map.image;
        if (!(image instanceof ImageBitmap || image instanceof HTMLImageElement || image instanceof HTMLCanvasElement)) throw new Error('Unsupported critter shell texture source');
        const canvas = document.createElement("canvas");
        canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.filter = "grayscale(1) brightness(1.35)";
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        // The source is painted for unlit red shell. Lift its midtones for
        // shaded metal while retaining the dark joints and eyes.
        for (let i = 0; i < pixels.data.length; i += 4) {
          const value = pixels.data[i]!;
          const metal = value < 18 ? value * .85 : Math.min(225, 96 + value * .8);
          pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = metal;
        }
        context.putImageData(pixels, 0, 0);
        map = new CanvasTexture(canvas);
        map.flipY = original.map.flipY; map.colorSpace = original.map.colorSpace;
        textures.push(map);
      }
      local = new MeshStandardMaterial({ color, map, metalness: .18, roughness: .7, side: original.side });
      materials.set(original, local);
      return local;
    };
    object.material = Array.isArray(object.material) ? object.material.map(metal) : metal(object.material);
  });
  const dispose = creature.dispose;
  creature.dispose = () => {
    dispose();
    for (const material of materials.values()) material.dispose();
    for (const texture of textures) texture.dispose();
  };
  return creature;
}
