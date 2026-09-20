import { Box3, Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, } from 'three';
import { terrainHeight } from '../game/cave-layout.js';
import { prop } from './frostwood-assets.js';

/** Broken survey guardians; all parts retain the authored robot silhouette. */
export async function buildRobotRuins(parent: Group): Promise<void> {
  const source = await prop('reclaimed/Robot', 4.8);
  source.updateWorldMatrix(true, true);
  const iron = new Color('#666e69'), rust = new Color('#71513b'), moss = new Color('#4d5940');
  function ruin(name: string) {
    const root = new Group(); root.name = name;
    const parts = new Map<string, Mesh>();
    const materials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
    source.traverse(object => {
      if (!(object instanceof Mesh)) return;
      // Bake into one common frame before moving individual joints and fragments.
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      const positions = geometry.getAttribute('position');
      const colors = new Float32Array(positions.count * 3), tint = new Color();
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        const weather = Math.sin(x * 6.1 + z * 3.7) * Math.sin(y * 8.3 - z * 2.4);
        tint.copy(iron).lerp(rust, Math.max(0, weather) * .85);
        tint.lerp(moss, Math.max(0, 1 - y / 1.9) * .7);
        tint.toArray(colors, i * 3);
      }
      geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const weathered = (original: MeshStandardMaterial) => {
        let local = materials.get(original);
        if (!local) {
          local = original.clone(); local.color.set(original.name === 'Black' ? '#252b28' : '#c8c9b9');
          local.vertexColors = true; local.metalness = .18; local.roughness = .98;
          local.emissive.set(0); local.emissiveIntensity = 0;
          materials.set(original, local);
        }
        return local;
      };
      const material = Array.isArray(object.material)
        ? object.material.map(m => weathered(m as MeshStandardMaterial))
        : weathered(object.material as MeshStandardMaterial);
      const part = new Mesh(geometry, material); part.name = object.name;
      part.castShadow = true; part.receiveShadow = true;
      parts.set(part.name.split('_')[0]!, part); root.add(part);
    });
    function joint(names: string[], x: number, y: number, z: number, owner = root) {
      const pivot = new Group(); pivot.position.set(x, y, z); owner.add(pivot);
      for (const key of names) {
        const mesh = parts.get(key)!; mesh.removeFromParent();
        mesh.position.set(-x, -y, -z); pivot.add(mesh);
      }
      return pivot;
    }
    function remove(names: string[]) {
      for (const key of names) {
        const part = parts.get(key)!; part.removeFromParent(); part.geometry.dispose(); parts.delete(key);
      }
    }
    return { root, joint, remove };
  }
  function settle(root: Group, x: number, z: number, burial: number) {
    root.updateWorldMatrix(true, true);
    const bottom = new Box3().setFromObject(root).min.y;
    root.position.set(x, terrainHeight(x, z) - bottom - burial, z);
    parent.add(root);
  }
  async function growth(x: number, z: number, yaw: number, rocky: boolean) {
    const placements: readonly [string, number, number, number][] = rocky
      ? [['nature/Rock_Medium_3', -.8, .1, 1.1], ['nature/Fern_1', 1.15, -.3, .65]]
      : [['nature/Fern_1', -.9, .5, .85], ['nature/Fern_1', .5, -1.1, .55]];
    for (const [asset, dx, dz, size] of placements) {
      const decoration = await prop(asset, size);
      const px = x + dx, pz = z + dz;
      decoration.position.set(px, terrainHeight(px, pz) - .08, pz);
      decoration.rotation.y = yaw + dx; parent.add(decoration);
    }
  }

  // The lake-bank wreck lies face-up, with its torn-off arm washed farther inland.
  const fallen = ruin('Lake-bank fallen guardian');
  fallen.remove(['Leg.L', 'Leg.R', 'LowerLeg.L', 'LowerLeg.R', 'Foot.L', 'Foot.R']);
  const lostArm = fallen.joint(['Arm.L', 'Hand.L', 'Shoulder.L'], .7, 2.55, 0);
  lostArm.removeFromParent(); lostArm.rotation.set(.3, -.8, 1.25);
  settle(lostArm, -50.1, -107.7, .16);
  fallen.root.rotation.set(-1.3, -.55, .18);
  settle(fallen.root, -48, -109, .3);
  await growth(-48, -109, -.3, true);

  // One thigh folds forward and its shin folds back, a recognizably collapsed knee.
  const kneeling = ruin('Buried kneeling guardian');
  kneeling.remove(['Arm.R', 'Hand.R']);
  const thigh = kneeling.joint(['Leg.L', 'LowerLeg.L', 'Foot.L'], .7, 1.48, 0);
  const shin = kneeling.joint(['LowerLeg.L', 'Foot.L'], .7, .86, 0);
  shin.removeFromParent(); shin.position.sub(thigh.position); thigh.add(shin);
  thigh.rotation.x = -1.15; shin.rotation.x = 1.65;
  const bowedHead = kneeling.joint(['Head'], 0, 2.94, 0); bowedHead.rotation.x = .38;
  kneeling.root.rotation.set(.12, -1.05, -.16);
  settle(kneeling.root, 24, 45, .72);
  await growth(24, 45, 1.3, false);

  // The hillside torso still stands; its enormous detached head rests down-slope.
  const sentinel = ruin('Fractured hillside guardian');
  sentinel.remove(['Arm.L', 'Hand.L', 'Shoulder.L', 'LowerLeg.R', 'Foot.R']);
  const head = sentinel.joint(['Head'], 0, 3.85, 0);
  head.removeFromParent(); head.rotation.set(.45, .7, 1.1);
  settle(head, -35.2, 63.8, .26);
  sentinel.root.rotation.set(-.1, .6, -.22);
  settle(sentinel.root, -33, 65, .28);
  await growth(-33, 65, 2, true);
}
