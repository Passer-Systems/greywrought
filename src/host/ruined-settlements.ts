import { Box3, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { terrainHeight } from '../game/cave-layout.js';
import { prop } from './frostwood-assets.js';

/** Abandoned belongings sit outside the road and the open encounter grounds. */
export async function buildRuinedSettlements(parent: Group): Promise<void> {
  const jobs: Promise<void>[] = [];
  const soot = new Color('#514c42'), iron = new Color('#62655c'), brass = new Color('#80704b');
  function place(site: Group, name: string, x: number, z: number, size: number,
    yaw: number, roll = 0, pitch = 0, burial = .025) {
    jobs.push(prop(name, size).then(model => {
      const industrial = name.startsWith('works/');
      const localMaterials = new Map<MeshStandardMaterial, MeshStandardMaterial>();
      model.traverse(object => {
        if (!(object instanceof Mesh)) return;
        const weather = (original: MeshStandardMaterial) => {
          let material = localMaterials.get(original);
          if (!material) {
            material = original.clone();
            if (industrial) material.color.copy(original.name === 'Accent' ? brass : iron);
            else material.color.lerp(soot, .48);
            material.roughness = .98; material.metalness = industrial ? .22 : .02;
            material.emissive.set(0); material.emissiveIntensity = 0;
            localMaterials.set(original, material);
          }
          return material;
        };
        object.material = Array.isArray(object.material)
          ? object.material.map(material => weather(material as MeshStandardMaterial))
          : weather(object.material as MeshStandardMaterial);
      });
      model.rotation.set(pitch, yaw, roll);
      model.updateWorldMatrix(true, true);
      const bottom = new Box3().setFromObject(model).min.y;
      model.position.set(x, terrainHeight(x, z) - bottom - burial, z);
      site.add(model);
    }));
  }
  function site(name: string) { const group = new Group(); group.name = name; parent.add(group); return group; }

  // An interrupted journey: the cart's cargo trails out toward the wooded verge.
  const roadside = site('Overturned provision cart');
  place(roadside, 'Cart', 14, -60, 1.55, -.65, 1.32, .12, .13);
  place(roadside, 'Crate', 15.7, -58.9, .7, .48, .16, -.08);
  place(roadside, 'Crate', 17.1, -59.6, .48, -.8, .4, .1, .07);
  place(roadside, 'Barrel', 14.9, -62, .83, .7, 1.48, -.08, .08);
  place(roadside, 'works/Props_Vessel', 16.6, -61.7, .4, -.3, 1.15, .3, .08);
  place(roadside, 'nature/Fern_1', 13.5, -58.9, .62, 2.1);
  place(roadside, 'nature/Fern_1', 17.5, -60.4, .48, -.7);

  // A low workbench and cold apparatus survive where a scavenger once sheltered.
  const camp = site('Abandoned alchemist camp');
  place(camp, 'Bench_1', -12, 17.3, .7, -.4, -.04, .03);
  place(camp, 'works/Props_Vessel', -11.4, 16.4, .33, .5, .12, 0, .04);
  place(camp, 'works/Props_Base', -13.3, 18.1, .42, .35, -.1, .1, .06);
  place(camp, 'works/Props_Capsule', -13.7, 17.3, .78, 1.1, .18, 1.4, .11);
  place(camp, 'Barrel', -12.5, 15.7, .8, -.9, .07, .03, .06);
  place(camp, 'Crate', -10.9, 18.8, .56, -.4, .2, -.12, .09);
  place(camp, 'works/Props_Vessel', -10.5, 18, .34, .6, 1.42, 0, .04);
  place(camp, 'nature/Fern_1', -13.1, 19, .76, .5);
  place(camp, 'nature/Fern_1', -11.9, 16.3, .45, 1.8);

  // Salvagers arranged dead apparatus beside the headless guardian, then left it.
  const shrine = site('Deserted guardian repair site');
  place(shrine, 'works/Props_Base', -30.9, 65.1, .46, -.7, .06, .04, .05);
  place(shrine, 'works/Props_Vessel', -30.1, 64.7, .52, .3, .16, 0, .03);
  place(shrine, 'Crate', -31.8, 67, .62, .6, -.05, .04);
  place(shrine, 'works/Props_Capsule', -32.8, 67.1, .88, -.5, .22, 1.32, .14);
  place(shrine, 'works/Props_Vessel', -30, 66.3, .28, 1.2, -.85, .2, .05);
  place(shrine, 'nature/Fern_1', -32.1, 66.1, .63, -.6);
  await Promise.all(jobs);
}
