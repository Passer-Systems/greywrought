import { BoxGeometry, CanvasTexture, CylinderGeometry, Group, Mesh, MeshStandardMaterial, SRGBColorSpace, TorusGeometry } from "three";
import { terrainHeight } from "../game/cave-layout.js";
import { TOWN_BUILDINGS } from "../game/town-layout.js";
import { YARD } from "../game/yard-content.js";
import { prop } from "./frostwood-assets.js";

function shopPlaque(name: string): Group {
  const root = new Group(), canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 192;
  const paint = canvas.getContext("2d")!;
  paint.fillStyle = "#40362b"; paint.fillRect(0, 0, 256, 192);
  for (let i = 0; i < 170; i++) {
    const noise = Math.sin(i * 71.31) * 43758.5, fraction = noise - Math.floor(noise);
    paint.strokeStyle = i % 3 ? "#514334" : "#302a24";
    paint.lineWidth = .4 + fraction;
    paint.beginPath(); paint.moveTo(fraction * 256, i * 1.13);
    paint.bezierCurveTo(65, i * 1.13 - 2, 185, i * 1.13 + 2, 256, i * 1.13); paint.stroke();
  }
  paint.strokeStyle = "#a89060"; paint.lineWidth = 3; paint.strokeRect(10, 10, 236, 172);
  paint.fillStyle = "#cfbc89"; paint.strokeStyle = "#cfbc89"; paint.lineWidth = 8;
  paint.lineCap = "round"; paint.lineJoin = "round";
  paint.beginPath();
  if (name.includes("APOTHECARY")) {
    paint.moveTo(111, 48); paint.lineTo(145, 48); paint.lineTo(145, 79);
    paint.lineTo(171, 126); paint.quadraticCurveTo(178, 145, 156, 145);
    paint.lineTo(100, 145); paint.quadraticCurveTo(78, 145, 85, 126);
    paint.lineTo(111, 79); paint.closePath(); paint.stroke();
    paint.fillStyle = "#809b72"; paint.fillRect(104, 115, 48, 15);
  } else if (name.includes("BANK")) {
    for (let i = 0; i < 3; i++) { paint.beginPath(); paint.ellipse(105 + i * 22, 113 - i * 20, 30, 12, 0, 0, Math.PI * 2); paint.stroke(); }
  } else if (name.includes("WEAPONS")) {
    paint.moveTo(128, 42); paint.lineTo(139, 64); paint.lineTo(132, 120); paint.lineTo(124, 120); paint.lineTo(117, 64); paint.closePath(); paint.fill();
    paint.beginPath(); paint.moveTo(104, 122); paint.lineTo(152, 122); paint.moveTo(128, 122); paint.lineTo(128, 149); paint.stroke();
  } else if (name.includes("ARMOR")) {
    paint.moveTo(112, 51); paint.quadraticCurveTo(128, 69, 144, 51); paint.lineTo(163, 63);
    paint.lineTo(154, 89); paint.lineTo(155, 140); paint.quadraticCurveTo(128, 155, 101, 140);
    paint.lineTo(102, 89); paint.lineTo(93, 63); paint.closePath(); paint.stroke();
  } else if (name.includes("SHIELDS")) {
    paint.moveTo(94, 58); paint.lineTo(162, 58); paint.lineTo(158, 109);
    paint.quadraticCurveTo(151, 134, 128, 150); paint.quadraticCurveTo(105, 134, 98, 109); paint.closePath(); paint.stroke();
  } else {
    paint.moveTo(106, 70); paint.quadraticCurveTo(128, 45, 150, 70); paint.lineTo(155, 115);
    paint.lineTo(165, 126); paint.lineTo(91, 126); paint.lineTo(101, 115); paint.closePath(); paint.stroke();
    paint.beginPath(); paint.arc(128, 140, 6, 0, Math.PI * 2); paint.fill();
  }
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  const wood = new MeshStandardMaterial({ color: 0x655344, roughness: 1 });
  const face = new MeshStandardMaterial({ map: texture, roughness: .95 });
  const iron = new MeshStandardMaterial({ color: 0x282b28, metalness: .65, roughness: .72 });
  const board = new Mesh(new BoxGeometry(1.08, .8, .1), [wood, wood, wood, wood, face, face]);
  board.position.y = 2.55; root.add(board);
  const arm = new Mesh(new BoxGeometry(.07, .07, .9), iron); arm.position.set(0, 3.18, -.4); root.add(arm);
  const rail = new Mesh(new BoxGeometry(.84, .055, .06), iron); rail.position.set(0, 3.18, 0); root.add(rail);
  const mount = new Mesh(new BoxGeometry(.18, .42, .06), iron); mount.position.set(0, 3.05, -.83); root.add(mount);
  for (const x of [-.36, .36]) {
    const ring = new Mesh(new TorusGeometry(.065, .014, 5, 10), iron); ring.scale.y = 1.7; ring.position.set(x, 3.055, 0); root.add(ring);
    const rivet = new Mesh(new CylinderGeometry(.025, .025, .12, 6), iron); rivet.rotation.x = Math.PI / 2; rivet.position.set(x, 2.84, 0); root.add(rivet);
  }
  root.traverse(object => { if (object instanceof Mesh) { object.castShadow = true; object.receiveShadow = true; } });
  return root;
}

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
    const x = building.turn === 0 ? building.x + 1.7 : building.x - building.turn * (building.width / 2 + .65);
    const z = building.turn === 0 ? building.z + building.depth / 2 + .65 : building.z + 1.7;
    const plaque = shopPlaque(building.sign);
    plaque.name = `sign-shop-${building.x}-${building.z}`;
    plaque.position.set(x, terrainHeight(x, z), z);
    plaque.rotation.y = -building.turn * Math.PI / 2;
    terrain.add(plaque); register(plaque, plaque.name, building.sign);
  }
  sign("sign-town-gate", YARD.settlement, -2.6, 3.7, 0);
  sign("sign-hollowdeep", "Hollowdeep Cave · Danger", 25.5, -41, -Math.PI / 2);
  sign("sign-cave-exit", "Exit to the Meadow", 35.5, -49, Math.PI / 2);
  await Promise.all(jobs);
}
