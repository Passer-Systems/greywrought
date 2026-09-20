import { Box3, BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, PointLight, Vector3 } from 'three';
import { terrainHeight } from '../game/cave-layout.js';
import { prop } from './frostwood-assets.js';

/** Broken survey guardians built from the authored robot's riveted armor. */
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
      const isHead = object.name.split('_')[0] === 'Head';
      if (isHead) {
        // The authored Black group contains the protruding eyes and eyebrows only.
        const originalMaterials = Array.isArray(object.material) ? object.material : [object.material];
        const retained: number[] = [];
        const groups = [...geometry.groups];
        geometry.clearGroups();
        for (const group of groups) {
          if (originalMaterials[group.materialIndex ?? 0]!.name === 'Black') continue;
          const start = retained.length;
          for (let i = group.start; i < group.start + group.count; i++) retained.push(i);
          geometry.addGroup(start, retained.length - start, group.materialIndex);
        }
        geometry.setIndex(retained);
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
          const buckle = Math.max(0, x - .12) * Math.max(0, y - 4.05);
          positions.setXYZ(i, x * .68 - buckle * .24,
            2.94 + (y - 2.94) * .76 - buckle * .32,
            Math.min(z, .82) * .62 + buckle * .08);
        }
        geometry.computeVertexNormals();
      }
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
      if (isHead) {
        // A single dead inspection slit sits behind the lip, with a torn right edge.
        const outline = [[-.71, 3.79], [.48, 3.79], [.64, 3.73], [.53, 3.68],
          [.65, 3.61], [.27, 3.59], [-.7, 3.62]] as const;
        const inner = outline.map(([x, y]) => [x * .91, 3.69 + (y - 3.69) * .64] as const);
        const rimVertices: number[] = [], insetVertices: number[] = [];
        for (let i = 0; i < outline.length; i++) {
          const next = (i + 1) % outline.length;
          const a = outline[i]!, b = outline[next]!, c = inner[i]!, d = inner[next]!;
          // Outline is clockwise when viewed from the front (+Z).
          rimVertices.push(...a, .57, ...c, .524, ...b, .57,
            ...b, .57, ...c, .524, ...d, .524);
          insetVertices.push(0, 3.69, .522, ...d, .522, ...c, .522);
        }
        const surface = (vertices: number[], surfaceMaterial: MeshStandardMaterial, name: string) => {
          const face = new BufferGeometry();
          face.setAttribute('position', new Float32BufferAttribute(vertices, 3));
          face.computeVertexNormals();
          const mesh = new Mesh(face, surfaceMaterial); mesh.name = name;
          mesh.castShadow = true; mesh.receiveShadow = true; part.add(mesh);
        };
        surface(rimVertices, new MeshStandardMaterial({ color: '#635b49', roughness: .97, metalness: .22 }), 'Torn visor rim');
        surface(insetVertices, new MeshStandardMaterial({ color: '#161e1c', roughness: .92, metalness: .12 }), 'Dead recessed visor');
      }
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
    return { root, joint, remove, parts };
  }
  function settle(root: Group, x: number, z: number, burial: number) {
    root.updateWorldMatrix(true, true);
    const bottom = new Box3().setFromObject(root, true).min.y;
    root.position.set(x, root.position.y + terrainHeight(x, z) - bottom - burial, z);
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

  // The remaining foot stands north of the inlet, leaving shore and stream open.
  const colossus = ruin('The broken lake guardian');
  colossus.remove(['LowerLeg.R', 'Foot.R']);
  const fallenArm = colossus.joint(['Arm.L', 'Hand.L'], .7, 2.55, 0);
  fallenArm.removeFromParent(); fallenArm.scale.setScalar(6.0);
  fallenArm.rotation.set(1.42, .2, .3);
  settle(fallenArm, -68, -48, 1.05);
  const bowedHelmet = colossus.joint(['Head'], 0, 2.94, 0);
  bowedHelmet.rotation.set(.19, -.14, -.23);
  const brokenThigh = colossus.joint(['Leg.R'], -.7, 1.48, 0);
  brokenThigh.rotation.set(-.38, .2, -.3);
  const hangingHand = colossus.joint(['Hand.R'], -1.05, 1.75, .1);
  hangingHand.rotation.z = -.3;
  colossus.root.scale.setScalar(6.0);
  colossus.root.rotation.set(-.035, 1.25, -.095);
  settle(colossus.root, -54, -44, .85);

  // The dead shoulder socket retains a weak cold charge; the visor stays dark.
  const socket = colossus.parts.get('Shoulder.L')!;
  const socketMaterial = (socket.material as MeshStandardMaterial).clone();
  socket.material = socketMaterial;
  socketMaterial.emissive.set('#728c88'); socketMaterial.emissiveIntensity = .42;
  colossus.root.updateWorldMatrix(true, true);
  const socketPosition = colossus.root.localToWorld(new Vector3(.84, 2.52, .22));
  const coreLight = new PointLight(0xa2c4c2, 24, 18, 1.4);
  coreLight.name = 'Faint guardian shoulder light';
  coreLight.position.copy(socketPosition); coreLight.castShadow = false;
  parent.add(coreLight);
  for (const [x, z, size, yaw] of [[-56,-42,3.8,.4],[-50,-43,2.6,-.7],[-59,-45,2.1,1.1]] as const) {
    const rubble = await prop('nature/Rock_Medium_3', size);
    rubble.rotation.y = yaw; settle(rubble, x, z, .35);
  }
  await growth(-51, -41, 1.1, false);

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
