import { Group } from "three";
import { terrainHeight } from "../game/cave-layout.js";
import { TOWN_BUILDINGS } from "../game/town-layout.js";
import { YARD } from "../game/yard-content.js";
import { prop } from "./frostwood-assets.js";

export async function buildWorldSigns(terrain: Group, register: (root: Group, id: string, name: string) => void): Promise<void> {
  const jobs: Promise<void>[] = [];
  function sign(id: string, name: string, x: number, z: number, rotation: number) {
    jobs.push(prop("Sign_LeftRight", 1.85).then(root => {
      root.name = id;
      root.position.set(x, terrainHeight(x, z), z);
      root.rotation.y = rotation;
      terrain.add(root);
      register(root, id, name);
    }));
  }
  for (const building of TOWN_BUILDINGS) {
    if (!building.sign) continue;
    // Stand beside the doorway, with the broad boards facing the approach.
    const x = building.turn === 0 ? building.x + 1.7 : building.x - building.turn * (building.width / 2 + .65);
    const z = building.turn === 0 ? building.z + building.depth / 2 + .65 : building.z + 1.7;
    sign(`sign-shop-${building.x}-${building.z}`, building.sign, x, z, -building.turn * Math.PI / 2);
  }
  sign("sign-town-gate", YARD.settlement, -2.6, 3.7, 0);
  sign("sign-hollowdeep", "Hollowdeep Cave · Danger", 25.5, -41, -Math.PI / 2);
  sign("sign-cave-exit", "Exit to the Meadow", 35.5, -49, Math.PI / 2);
  await Promise.all(jobs);
}
