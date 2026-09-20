/** Author Greywrought relic characters from Quaternius limb primitives and rigs.
 * Run: bun scripts/art/lore-models.ts
 * No source pack files are modified. All coordinates below are in source bind space.
 */
import * as T from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { mkdir, copyFile } from "node:fs/promises";
import { CREATURE_APPEARANCES } from "../../src/host/creature-appearances.js";

// The loader/exporter only need these two small browser IO adapters in Bun.
if (typeof globalThis.ProgressEvent === "undefined") {
  Object.defineProperty(globalThis, "ProgressEvent", { value: class extends Event {
    constructor(type: string, properties: object = {}) { super(type); Object.assign(this, properties); }
  } });
}
if (typeof globalThis.FileReader === "undefined") {
  Object.defineProperty(globalThis, "FileReader", { value: class {
    result: ArrayBuffer | string | null = null;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob) { void blob.arrayBuffer().then(data => { this.result = data; this.onloadend?.(); }); }
    readAsDataURL(blob: Blob) { void blob.arrayBuffer().then(data => {
      this.result = `data:${blob.type};base64,${Buffer.from(data).toString("base64")}`; this.onloadend?.();
    }); }
  } });
}

const pack = "3d/Animated Mech Pack - March 2021";
const output = "3d/greywrought-relics";
type XYZ = [number, number, number];
type Surface = "iron" | "rust" | "bronze" | "bone" | "wood" | "thatch" | "cloth" | "dark" | "blue" | "amber" | "rot";
export const designs = [
  { id: "hollow-saint", name: "Hollow Saint", source: "Stan", height: 3.25, color: "#c0a77a",
    role: "A walking shrine kept alive by the village that worships it.",
    story: "The saint has forgotten every blessing. Its chest still warms the votive lamps. Villagers replace its cracked plates with shrine timber and carry its broken halo through the dark.",
    lore: ["design_note:greywrought-condition", "design_note:bounded-embodied-agents"],
    features: ["Split sun halo", "Empty chapel face", "Caged amber heart", "Wax offerings", "Bell-staff", "Torn liturgical cloth"] },
  { id: "relic-warden", name: "Relic Warden", source: "Mike", height: 2.65, color: "#779b96",
    role: "A village guardian whose power can be cut by a keeper's key.",
    story: "A medieval harness surrounds an older machine. Its shield carries a sealed circuit relic; a great iron key lets its appointed keeper interrupt any command.",
    lore: ["design_note:bounded-embodied-agents", "design_note:player-agency-against-greying"],
    features: ["Slit-faced great helm", "Asymmetric heraldic shield", "Relic sword", "Lamellar shoulders", "Keeper's disconnect key", "Deepbellow-blue core"] },
  { id: "hearth-keeper", name: "Hearth Keeper", source: "Leela", height: 2.8, color: "#d6b075",
    role: "A thatch-covered walking hearth that powers isolated village homes.",
    story: "Wattle, timber and straw shelter an irreplaceable generator. Ceramic insulators carry current to cottages; the front knife-switch allows each household to refuse the connection.",
    lore: ["design_note:greywrought-condition", "design_note:player-agency-against-greying"],
    features: ["Layered thatched roof", "Half-timbered furnace body", "Lit hearth grille", "Ceramic power mast", "Copper cables", "Manual knife-switch"] },
  { id: "greyrot-penitent", name: "Greyrot Penitent", source: "George", height: 3.05, color: "#a8aa72",
    role: "A failed repair machine dressed in the offerings of frightened pilgrims.",
    story: "An obsolete repair loop builds the same reliquary again and again. Unequal ribs, three competing cores and stolen prayer plates betray incompatible fragments of Greyrot.",
    lore: ["design_note:greyrot", "design_note:memory-vocabulary"],
    features: ["Broken iron cowl", "Open rib cage", "Three mismatched cores", "Bent reliquary spines", "Pilgrim tags", "Scavenged asymmetrical limbs"] },
] as const;

function noise(x: number) { return (Math.sin(x * 127.1 + 311.7) * 43758.5453) % 1 + 1; }
function material(name: string, color: string, metalness = 0.2, emission?: string) {
  return new T.MeshStandardMaterial({ name, color, metalness, roughness: .88,
    flatShading: true, vertexColors: true, side: T.DoubleSide,
    ...(emission ? { emissive: emission, emissiveIntensity: 1.8 } : {}),
  });
}
function palette(id: string): Record<Surface, T.MeshStandardMaterial> {
  return {
    iron: material("Pitted wrought iron", "#596467", .65), rust: material("Oxidised seams", "#783f29", .25),
    bronze: material("Tarnished votive brass", "#9e8150", .65), bone: material("Aged ceramic", "#c2b895", .08),
    wood: material("Smoke-dark oak", "#69503a", 0), thatch: material("Old straw", "#a28a54", 0),
    cloth: material("Frayed dyed linen", id === "relic-warden" ? "#375e60" : id === "greyrot-penitent" ? "#666849" : "#785043", 0),
    dark: material("Soot and recesses", "#191e20", .15),
    blue: material("Bounded current", "#729c9c", .2, "#248caa"),
    amber: material("Hearth current", "#dfb66c", .15, "#d8882c"),
    rot: material("Conflicting current", "#c1c379", .2, "#8e9d34"),
  };
}

/** Non-uniform surface wear is baked into vertex colors, with no external textures. */
function weather(geometry: T.BufferGeometry, seed: number, strength = .22) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = g.getAttribute("position"), colors: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const shade = 1 - strength * noise(seed + position.getX(i) * 2.1 + position.getY(i) * 3.7 + position.getZ(i) * 5.3);
    colors.push(Math.round(shade * 255), Math.round(shade * .98 * 255), Math.round(shade * .94 * 255));
  }
  g.setAttribute("color", new T.Uint8BufferAttribute(colors, 3, true));
  g.deleteAttribute("uv");
  return g;
}

class Forge {
  readonly bones = new Map<string, T.Bone>();
  readonly surfaces: Record<Surface, T.MeshStandardMaterial>;
  readonly batches = new Map<string, { bone: T.Bone; surface: Surface; geometries: T.BufferGeometry[]; names: string[] }>();
  count = 0;
  constructor(readonly scene: T.Group, readonly id: string) {
    this.surfaces = palette(id);
    scene.updateMatrixWorld(true);
    scene.traverse(node => { if (node instanceof T.Bone) this.bones.set(node.name, node); });
  }
  point(name: string): XYZ { return this.bones.get(name)!.getWorldPosition(new T.Vector3()).toArray() as XYZ; }
  add(boneName: string, name: string, geometry: T.BufferGeometry, surface: Surface, at: XYZ = [0, 0, 0], rotation: XYZ = [0, 0, 0]) {
    const bone = this.bones.get(boneName);
    if (!bone) throw new Error(`Missing attachment bone ${boneName}`);
    const matrix = new T.Matrix4().compose(new T.Vector3(...at), new T.Quaternion().setFromEuler(new T.Euler(...rotation)), new T.Vector3(1, 1, 1));
    geometry.applyMatrix4(matrix);
    const g = weather(geometry, this.count++ * 7.3, ["amber", "blue", "rot"].includes(surface) ? .08 : .19);
    g.applyMatrix4(bone.matrixWorld.clone().invert());
    const key = boneName + "/" + surface;
    if (!this.batches.has(key)) this.batches.set(key, { bone, surface, geometries: [], names: [] });
    this.batches.get(key)!.geometries.push(g);
    this.batches.get(key)!.names.push(name);
  }
  box(b: string, name: string, at: XYZ, size: XYZ, surface: Surface, rot: XYZ = [0, 0, 0]) {
    this.add(b, name, new T.BoxGeometry(...size), surface, at, rot);
  }
  ball(b: string, name: string, at: XYZ, size: XYZ, surface: Surface) {
    this.add(b, name, new T.IcosahedronGeometry(1, 1).scale(...size), surface, at);
  }
  rod(b: string, name: string, a: XYZ, z: XYZ, radius: number, surface: Surface, top = radius, segments = 8) {
    const from = new T.Vector3(...a), to = new T.Vector3(...z), d = to.clone().sub(from);
    const g = new T.CylinderGeometry(top, radius, d.length(), segments);
    g.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()));
    this.add(b, name, g, surface, from.add(to).multiplyScalar(.5).toArray() as XYZ);
  }
  ring(b: string, name: string, at: XYZ, radius: number, tube: number, surface: Surface, arc = Math.PI * 2, rot: XYZ = [0, 0, 0]) {
    this.add(b, name, new T.TorusGeometry(radius, tube, 5, 28, arc), surface, at, rot);
  }
  plate(b: string, name: string, points: [number, number][], z: number, depth: number, surface: Surface) {
    const shape = new T.Shape(points.map(p => new T.Vector2(...p)));
    const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 1, steps: 1, bevelSize: .025, bevelThickness: .025 });
    this.add(b, name, g, surface, [0, 0, z]);
  }
  cable(b: string, name: string, points: XYZ[], radius: number, surface: Surface = "dark") {
    const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
    this.add(b, name, new T.TubeGeometry(curve, 14, radius, 5, false), surface);
  }
  rivets(b: string, x: number, y: number, z: number, width: number, height: number) {
    for (const dx of [-width / 2, width / 2]) for (const dy of [-height / 2, height / 2]) {
      this.ball(b, "Hand-forged rivet", [x + dx, y + dy, z], [.048, .048, .025], "bronze");
    }
  }
  candle(b: string, x: number, y: number, z: number, h: number) {
    this.rod(b, "Votive socket", [x, y - .04, z], [x, y + .035, z], .14, "bronze", .18);
    this.rod(b, "Wax offering", [x, y, z], [x, y + h, z], .085, "bone", .07);
    this.ball(b, "Small votive light", [x, y + h + .055, z], [.04, .09, .04], "amber");
    for (let i = 0; i < 3; i++) this.rod(b, "Wax run", [x + .07 * Math.cos(i * 2), y + h * .45, z + .07 * Math.sin(i * 2)], [x + .07 * Math.cos(i * 2), y + h * .94, z + .07 * Math.sin(i * 2)], .018, "bone");
  }
  cloth(b: string, name: string, x: number, y: number, z: number, width: number, length: number) {
    const verts: number[] = [];
    const p = (i: number, j: number): XYZ => [x + (i / 6 - .5) * width, y - j / 5 * length + (j === 5 ? .13 * Math.sin(i * 3.8) : 0), z + .07 * Math.sin(i * 2.2) + j * j * .009];
    for (let j = 0; j < 5; j++) for (let i = 0; i < 6; i++) {
      if (j === 4 && i === 1) continue;
      verts.push(...p(i, j), ...p(i + 1, j), ...p(i, j + 1), ...p(i + 1, j), ...p(i + 1, j + 1), ...p(i, j + 1));
    }
    const g = new T.BufferGeometry(); g.setAttribute("position", new T.Float32BufferAttribute(verts, 3)); g.computeVertexNormals();
    this.add(b, name, g, "cloth");
  }
  finish() {
    for (const batch of this.batches.values()) {
      const merged = mergeGeometries(batch.geometries);
      if (!merged) throw new Error("Could not combine authored parts");
      const mesh = new T.Mesh(mergeVertices(merged), this.surfaces[batch.surface]);
      mesh.name = `${this.id}_${batch.bone.name}_${batch.surface}`;
      mesh.userData = { authoredParts: batch.names, attachment: batch.bone.name };
      batch.bone.add(mesh);
    }
    this.scene.updateMatrixWorld(true);
  }
}

/** Retain actual pack geometry only where a triangle belongs to an articulated limb.
 * Head/torso/shoulder shells are removed, not concealed under replacement shells.
 */
function salvageLimbs(f: Forge) {
  const meshes: T.SkinnedMesh[] = [];
  f.scene.traverse(n => { if (n instanceof T.SkinnedMesh) meshes.push(n); });
  let retainedTriangles = 0;
  for (const [m, mesh] of meshes.entries()) {
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const joints = g.getAttribute("skinIndex"), weights = g.getAttribute("skinWeight");
    const keep: number[] = [];
    for (let i = 0; i < joints.count; i += 3) {
      let limb = 0;
      for (let j = 0; j < 3; j++) for (let k = 0; k < 4; k++) {
        const name = mesh.skeleton.bones[joints.getComponent(i + j, k)]?.name ?? "";
        if (/Arm|Palm|Pinky|Ring|Index|Thumb|Leg|Foot/.test(name) && !/Pole/.test(name)) limb += weights.getComponent(i + j, k);
      }
      if (limb > 2.2) keep.push(i, i + 1, i + 2);
    }
    if (keep.length === 0) { mesh.removeFromParent(); continue; }
    const result = new T.BufferGeometry();
    for (const name of ["position", "normal", "skinIndex", "skinWeight"]) {
      const a = g.getAttribute(name), values: number[] = [];
      for (const i of keep) for (let c = 0; c < a.itemSize; c++) values.push(a.getComponent(i, c));
      result.setAttribute(name, name === "skinIndex" ? new T.Uint16BufferAttribute(values, a.itemSize) : new T.Float32BufferAttribute(values, a.itemSize));
    }
    // Reprofile the surviving limb shells about their weighted bind-joint centers.
    // Bone positions and their native animation tracks remain unchanged.
    const p = result.getAttribute("position"), js = result.getAttribute("skinIndex"), ws = result.getAttribute("skinWeight");
    const inverse = mesh.matrixWorld.clone().invert();
    const centers = mesh.skeleton.bones.map(b => b.getWorldPosition(new T.Vector3()).applyMatrix4(inverse));
    for (let i = 0; i < p.count; i++) {
      const center = new T.Vector3();
      for (let c = 0; c < 4; c++) center.addScaledVector(centers[js.getComponent(i, c)]!, ws.getComponent(i, c));
      const v = new T.Vector3().fromBufferAttribute(p, i).sub(center);
      const factor = f.id === "greyrot-penitent" ? (center.x > 0 ? .77 : 1.06) : f.id === "hollow-saint" ? .82 : f.id === "hearth-keeper" ? 1.08 : .95;
      v.x *= factor; v.z *= factor; v.add(center); p.setXYZ(i, v.x, v.y, v.z);
    }
    result.computeVertexNormals();
    mesh.geometry = mergeVertices(weather(result, m * 11));
    mesh.material = f.surfaces[(["iron", "bronze", "rust", "iron", "dark", "bone"] as const)[m % 6]!];
    mesh.name = `${f.id}_salvaged_limb_${m}`;
    mesh.userData = { provenance: "Quaternius Animated Mech Pack", operation: "Limb-only triangle extraction and shell reprofiling", originalPrimitive: m };
    retainedTriangles += keep.length / 3;
  }
  return retainedTriangles;
}

function hollowSaint(f: Forge) {
  // An open chapel occupies the torso; the void and split halo define the silhouette.
  f.box("Torso", "Shrine foundation", [0, 3.25, 0], [1.58, .32, 1.04], "wood");
  f.box("Chest", "Chapel shadow", [0, 4.15, -.30], [1.23, 1.7, .34], "dark");
  for (const x of [-.73, .73]) {
    f.box("Chest", "Oak shrine upright", [x, 4.25, .11], [.2, 1.9, .66], "wood");
    f.box("Chest", "Iron strap", [x, 4.25, .47], [.23, .19, .045], "iron");
    f.rivets("Chest", x, 4.25, .51, .12, .1);
    f.rod("Chest", "Gothic chapel arch", [x, 5.08, .24], [0, 5.72, .24], .095, "bronze", .07);
  }
  f.box("Chest", "Heart plinth", [0, 3.71, .16], [1.3, .13, .9], "bronze");
  f.ball("Chest", "Amber reliquary", [0, 4.22, .13], [.30, .43, .25], "amber");
  for (const x of [-.4, -.2, .2, .4]) f.rod("Chest", "Heart cage", [x, 3.78, .52], [x * .6, 4.85, .4], .035, "iron");
  f.ring("Chest", "Halo on the heart", [0, 4.22, .42], .5, .036, "bronze");
  f.box("Head", "Hollow face", [.08, 5.7, -.14], [.5, .61, .3], "dark");
  f.plate("Head", "Left ceramic face", [[-.31, 5.34], [-.37, 5.95], [-.05, 6.18], [-.08, 5.47]], .08, .09, "bone");
  f.plate("Head", "Right ceramic face", [[.18, 5.47], [.12, 6.18], [.42, 5.96], [.43, 5.4]], .07, .09, "bone");
  f.box("Head", "Remaining eye", [-.14, 5.77, .21], [.13, .05, .045], "amber");
  f.ring("Head", "Broken solar halo", [.06, 5.91, -.39], .96, .07, "bronze", Math.PI * 1.65, [0, 0, .67]);
  for (let i = 0; i < 11; i++) {
    const a = .8 + i * .45, x = .06 + Math.cos(a), y = 5.91 + Math.sin(a);
    f.rod("Head", "Unequal halo ray", [x, y, -.39], [.06 + Math.cos(a) * (1.17 + .07 * (i % 3)), 5.91 + Math.sin(a) * (1.17 + .07 * (i % 3)), -.39], .035, "bronze", .006);
  }
  f.cloth("Torso", "Split sanctuary cloth left", -.46, 3.35, .62, .7, 1.43);
  f.cloth("Torso", "Split sanctuary cloth right", .42, 3.35, .62, .57, 1.08);
  for (const side of ["L", "R"]) {
    const [x, y, z] = f.point("UpperArm" + side);
    f.box("UpperArm" + side, "Offering shelf", [x, y + .08, z], [.92, .15, .77], "wood");
    for (let i = 0; i < 3; i++) f.candle("UpperArm" + side, x + (i - 1) * .25, y + .18, z, .2 + (i % 2) * .16);
  }
  const [x, y, z] = f.point("PalmPR");
  f.rod("PalmPR", "Pilgrim bell-staff", [x - .16, y - 2.65, z + .18], [x - .16, y + 1.55, z + .18], .065, "wood");
  f.ring("PalmPR", "Bell crook", [x + .05, y + 1.3, z + .18], .29, .046, "bronze", Math.PI * 1.5);
  f.rod("PalmPR", "Bell shell", [x + .23, y + .79, z + .18], [x + .23, y + 1.09, z + .18], .22, "bronze", .085);
  f.ball("PalmPR", "Bell clapper", [x + .23, y + .76, z + .18], [.065, .08, .065], "iron");
  f.cable("Chest", "Disconnected shrine lead", [[-.5, 4.65, -.3], [-.9, 3.9, -.63], [-.5, 3.35, -.64]], .042, "bronze");
}

function relicWarden(f: Forge) {
  f.plate("Chest", "Forged breastplate", [[-.86, 3.93], [-.72, 4.37], [.74, 4.37], [.92, 3.93], [.53, 3.25], [-.54, 3.25]], .18, .32, "iron");
  f.box("Chest", "Brigandine backing", [0, 3.78, -.17], [1.35, 1.12, .7], "dark");
  for (let i = 0; i < 5; i++) f.box("Torso", "Waist lamella", [0, 3.2 - i * .13, .16], [1.54 - i * .085, .17, .82], i % 2 ? "iron" : "bronze");
  f.ring("Chest", "Blue core bezel", [.04, 3.9, .56], .25, .065, "bronze");
  f.ball("Chest", "Deepbellow witness light", [.04, 3.9, .52], [.19, .22, .10], "blue");
  f.rod("Chest", "Core lock bar", [-.24, 3.9, .64], [.32, 3.9, .64], .04, "iron");
  f.rivets("Chest", 0, 3.82, .55, 1.24, .55);
  // Angular great helm, rather than the source robot's face.
  f.add("Head", "Octagonal great helm", new T.CylinderGeometry(.43, .49, .79, 8), "iron", [.07, 4.89, -.07]);
  f.box("Head", "Dark sight slit", [.07, 5.02, .386], [.65, .078, .035], "dark");
  f.box("Head", "Single current eye", [.21, 5.02, .413], [.12, .03, .021], "blue");
  f.box("Head", "Helm nose strip", [.07, 4.84, .415], [.075, .45, .05], "bronze");
  for (const x of [-.2, -.08, .19, .31]) f.box("Head", "Breathing vent", [x, 4.69, .40], [.035, .10, .03], "dark");
  f.rod("Head", "Broken crest", [.06, 5.22, -.13], [.06, 5.63, -.22], .09, "bronze", .025);
  f.cloth("Chest", "Warden tabard", 0, 3.33, .7, .81, 1.28);
  for (const side of ["L", "R"]) {
    const [x, y, z] = f.point("UpperArm" + side);
    for (let i = 0; i < 3; i++) f.box("UpperArm" + side, "Layered pauldron", [x, y + .1 - i * .15, z], [1.05 - i * .09, .2, .9], i === 0 ? "bronze" : "iron", [0, 0, side === "L" ? -.2 : .2]);
  }
  const [lx, ly, lz] = f.point("LowerArmL");
  f.plate("LowerArmL", "Kite shield rim", [[lx - .63, ly + .65], [lx + .55, ly + .65], [lx + .65, ly], [lx, ly - 1.12], [lx - .64, ly]], lz + .54, .12, "bronze");
  f.plate("LowerArmL", "Kite shield field", [[lx - .51, ly + .52], [lx + .44, ly + .52], [lx + .52, ly], [lx, ly - .92], [lx - .52, ly]], lz + .69, .05, "cloth");
  f.box("LowerArmL", "Shield relic casket", [lx, ly + .09, lz + .79], [.4, .62, .12], "dark");
  for (let i = 0; i < 4; i++) {
    f.rod("LowerArmL", "Sealed old circuit", [lx - .12 + i * .08, ly - .12, lz + .87], [lx - .12 + i * .08, ly + .31 - .06 * (i % 2), lz + .87], .015, "blue");
  }
  f.rivets("LowerArmL", lx, ly + .09, lz + .89, .46, .68);
  const [x, y, z] = f.point("PalmPR");
  f.rod("PalmPR", "Sword grip", [x, y - .23, z + .21], [x, y + .3, z + .21], .075, "wood");
  f.rod("PalmPR", "Crossguard", [x - .42, y + .28, z + .21], [x + .42, y + .28, z + .21], .065, "bronze");
  f.plate("PalmPR", "Chipped relic sword", [[x - .14, y + .34], [x + .14, y + .34], [x + .12, y + 1.55], [x + .06, y + 1.65], [x + .09, y + 1.82], [x, y + 2.12], [x - .13, y + 1.65]], z + .16, .08, "iron");
  f.rod("PalmPR", "Blade's old conductor", [x, y + .4, z + .265], [x, y + 1.68, z + .265], .018, "blue");
  f.ring("Torso", "Keeper key bow", [-.7, 2.91, .71], .14, .035, "bronze");
  f.rod("Torso", "Disconnect key", [-.7, 2.8, .71], [-.7, 2.43, .71], .04, "bronze");
  f.box("Torso", "Key bit", [-.61, 2.46, .71], [.19, .09, .06], "bronze");
  f.cable("Chest", "Independent power circuit", [[.47, 4.15, .39], [.76, 3.62, .51], [.5, 3.4, .35]], .035, "bronze");
}

function hearthKeeper(f: Forge) {
  f.box("Torso", "Hearth foundation", [0, 2.75, .05], [2.2, .27, 1.48], "iron");
  f.box("Chest", "Sooted hearth chamber", [0, 3.45, -.08], [1.89, 1.42, 1.17], "dark");
  f.box("Chest", "Clay infill", [0, 3.68, -.12], [1.97, .85, 1.13], "bone");
  for (const x of [-1.02, 1.02]) {
    f.box("Chest", "Oak corner post", [x, 3.56, .1], [.18, 1.59, 1.36], "wood");
    f.rod("Chest", "Diagonal timber brace", [x, 3, .79], [x * .48, 4.18, .79], .075, "wood", .075, 4);
    f.rivets("Chest", x, 3.56, .81, .09, 1.14);
  }
  f.box("Chest", "Hearth opening", [0, 3.38, .58], [1.15, .92, .13], "dark");
  f.ball("Chest", "Caged generator glow", [0, 3.35, .68], [.43, .32, .06], "amber");
  for (let i = 0; i < 7; i++) f.rod("Chest", "Furnace grille", [-.54 + i * .18, 2.98, .8], [-.54 + i * .18, 3.82, .8], .028, "iron");
  for (const y of [2.96, 3.83]) f.box("Chest", "Grille frame", [0, y, .8], [1.26, .08, .10], "bronze");
  // A small, unmistakable machine face remains beneath the eaves.
  f.box("Head", "Hearth keeper brow", [0, 4.12, .63], [.72, .24, .30], "iron");
  for (const x of [-.2, .2]) f.ball("Head", "Ceramic eye socket", [x, 4.14, .82], [.13, .11, .055], "bone");
  for (const x of [-.2, .2]) f.ball("Head", "Watchful hearth eye", [x, 4.14, .872], [.065, .055, .025], "blue");
  // Layered, individually broken straw bundles define the roof instead of a smooth cone.
  for (const side of [-1, 1]) {
    for (let layer = 0; layer < 4; layer++) {
      for (let row = 0; row < 18; row++) {
        const z = -.88 + row * .105, x1 = side * (.02 + layer * .29), x2 = side * (.53 + layer * .29);
        const y1 = 5.18 - layer * .19, y2 = 4.86 - layer * .19 - .035 * noise(row + layer * 9);
        f.rod("Chest", "Overlapping straw bundle", [x2, y2, z], [x1, y1, z], .066, row % 5 === 0 ? "wood" : "thatch", .045, 5);
      }
    }
    f.rod("Chest", "Gable fascia", [0, 5.17, .96], [side * 1.5, 4.26, .96], .095, "wood", .08, 4);
  }
  f.rod("Chest", "Ridge beam", [0, 5.2, -1.03], [0, 5.2, 1.05], .11, "wood");
  f.box("Chest", "Crooked chimney", [-.71, 4.88, -.45], [.29, 1.22, .33], "iron", [0, 0, -.10]);
  f.box("Chest", "Chimney rain cap", [-.78, 5.53, -.45], [.5, .08, .49], "rust", [0, 0, -.1]);
  f.rod("Chest", "Electric service mast", [.92, 3.68, -.55], [.92, 5.95, -.55], .075, "wood");
  f.rod("Chest", "Insulator crossarm", [.38, 5.66, -.55], [1.47, 5.66, -.55], .07, "iron");
  for (const x of [.48, 1.36]) {
    f.rod("Chest", "Ceramic insulator", [x, 5.64, -.55], [x, 6.05, -.55], .06, "bone");
    for (let i = 0; i < 4; i++) f.ring("Chest", "Insulator skirt", [x, 5.73 + i * .075, -.55], .10, .025, "bone", Math.PI * 2, [Math.PI / 2, 0, 0]);
    f.cable("Chest", "Copper cottage lead", [[x, 6.04, -.55], [x + .23, 5.49, -.76], [1.35, 4.37, -.25], [1.16, 3.64, .48]], .026, "bronze");
  }
  f.box("Chest", "Knife-switch backplate", [1.07, 3.56, .66], [.4, .55, .14], "bone");
  f.rod("Chest", "Manual disconnect blade", [1.04, 3.33, .79], [1.21, 3.71, .99], .035, "bronze");
  f.ball("Chest", "Disconnect wooden handle", [1.21, 3.71, .99], [.075, .075, .055], "wood");
  for (const side of ["L", "R"]) {
    const [x, y, z] = f.point("LowerLeg" + side);
    f.box("LowerLeg" + side, "Timber leg repair", [x, y - .1, z], [.20, .75, .31], "wood", [0, 0, side === "L" ? -.16 : .16]);
    for (const dy of [-.31, .13]) f.box("LowerLeg" + side, "Repair iron band", [x, y + dy, z + .17], [.29, .09, .06], "iron");
  }
}

function greyrotPenitent(f: Forge) {
  f.rod("Chest", "Exposed spinal screw", [0, 2.98, -.4], [.09, 4.59, -.37], .16, "iron");
  for (let i = 0; i < 8; i++) f.ring("Chest", "Vertebral collar", [.02, 3.07 + i * .18, -.38], .2, .05, i % 3 === 0 ? "bronze" : "rust", Math.PI * 2, [Math.PI / 2, 0, 0]);
  for (let i = 0; i < 5; i++) for (const side of [-1, 1]) {
    const y = 3.1 + i * .25, wide = .86 - Math.abs(i - 2) * .085;
    f.cable("Chest", "Mismatched open rib", [[.02, y, -.36], [side * wide, y + .04, -.11], [side * wide, y - .05, .44], [side * (.23 + .06 * (i % 2)), y - .2, .58]], .065, (i + side) % 3 === 0 ? "bronze" : "iron");
  }
  for (let i = 0; i < 3; i++) {
    const x = [-.31, .28, .08][i]!, y = [3.48, 3.87, 4.25][i]!;
    f.ball("Chest", "Competing repair core", [x, y, .12], [.18, .24, .19], i === 1 ? "amber" : "rot");
    f.cable("Chest", "Unbounded repair loop", [[x, y, .17], [x - .28, y - .32, .55], [x + .25, y - .45, .07]], .037, "bronze");
  }
  f.plate("Head", "Left broken cowl", [[-.48, 4.91], [-.38, 5.54], [-.11, 6.13], [.06, 5.51], [-.08, 4.91]], -.17, .20, "iron");
  f.plate("Head", "Right broken cowl", [[.15, 4.88], [.13, 5.47], [.43, 5.76], [.56, 5.02]], -.15, .19, "rust");
  f.box("Head", "Vacant pilgrim face", [.05, 5.16, -.12], [.33, .58, .16], "dark");
  f.box("Head", "Unequal eye", [-.035, 5.33, .04], [.075, .05, .06], "rot");
  f.rod("Head", "Penitent mouth bars", [-.13, 5.02, .07], [.21, 5.02, .07], .033, "bone");
  for (let i = 0; i < 3; i++) f.rod("Head", "Mouth rivet", [-.08 + i * .11, 4.94, .06], [-.08 + i * .11, 5.11, .06], .021, "iron");
  // Unequal reliquary spars and salvaged shingles lean above the shoulders.
  for (let i = 0; i < 4; i++) {
    const x = -.95 + i * .55, h = [5.05, 5.73, 5.37, 4.94][i]!;
    f.rod("Chest", "Bent reliquary spar", [x * .65, 3.1, -.62], [x, h, -.84], .057, "iron");
    f.rod("Chest", "Broken spar tip", [x, h, -.84], [x + .23, h + .19, -.67], .057, "rust", .025);
    f.box("Chest", "Stolen shrine plate", [x, h - .5, -.86], [.32, .48, .1], i % 2 ? "bone" : "bronze", [.15, 0, -.2 + i * .15]);
  }
  f.cloth("Torso", "Pilgrim's ruined apron", -.22, 3.01, .59, 1.01, .98);
  const [x, y, z] = f.point("UpperArmR");
  for (let i = 0; i < 4; i++) f.plate("UpperArmR", "Scavenged shoulder shingle", [[x - .66 + i * .12, y + .31 - i * .2], [x + .18, y + .51 - i * .2], [x + .45, y + .23 - i * .2], [x - .5 + i * .1, y - .02 - i * .2]], z + .09, .12, i % 2 ? "rust" : "iron");
  const [ax, ay, az] = f.point("LowerArmL");
  f.cable("LowerArmL", "Dangling repair cable", [[ax, ay, az], [ax + .4, ay - .7, az + .17], [ax + .2, ay - 1.2, az + .2]], .05, "bronze");
  for (let i = 0; i < 7; i++) {
    const px = -.7 + i * .23, py = 3.00 + .10 * Math.sin(i);
    f.ring("Torso", "Offering link", [px, py, .65], .05, .013, "bronze");
    f.box("Torso", "Individual pilgrim tag", [px, py - .17, .66], [.14, .23 + .08 * (i % 2), .025], i % 2 ? "bone" : "bronze", [0, 0, .16 * Math.sin(i)]);
    f.box("Torso", "Witness notch", [px, py - .15, .681], [.07, .015, .007], "dark");
  }
}

const authors = [hollowSaint, relicWarden, hearthKeeper, greyrotPenitent];
await mkdir(output, { recursive: true });
await mkdir(`${output}/runtime`, { recursive: true });
const manifest: object[] = [];
for (const [index, design] of designs.entries()) {
  const sourcePath = `${pack}/Flat Colors/glTF/${design.source}.gltf`;
  const source = await new GLTFLoader().parseAsync(await Bun.file(sourcePath).text(), "");
  // Drop redundant identical keys without changing interpolation or any motion.
  for (const clip of source.animations) clip.optimize();
  source.scene.name = design.id;
  const forge = new Forge(source.scene, design.id);
  const retainedTriangles = salvageLimbs(forge);
  authors[index]!(forge);
  forge.finish();
  const box = new T.Box3().setFromObject(source.scene, true);
  const scale = design.height / (box.max.y - box.min.y);
  const root = new T.Group(); root.name = design.name;
  root.add(source.scene); root.scale.setScalar(scale); root.position.y = -box.min.y * scale;
  root.userData = { ...design, authoring: "New Greywrought designs: reconstructed heads, torsos, clothing and equipment; salvaged and reprofiled Quaternius limb primitives; original rig and clips.",
    sourcePack: "Quaternius Animated Mech Pack — March 2021", sourceLicense: "CC0-1.0", sourcePath,
    loreSource: "docs/legacy-lore.json", canonStatus: "New visual concepts, not pre-existing named lore characters",
    coordinateSystem: "Y up; face +Z; units metres", retainedTriangles, authoredParts: forge.count,
  };
  root.updateMatrixWorld(true);
  const bytes = await new GLTFExporter().parseAsync(root, { binary: true, animations: source.animations, onlyVisible: true });
  if (!(bytes instanceof ArrayBuffer)) throw new Error("Expected binary glTF");
  await Bun.write(`${output}/${design.id}.glb`, bytes);
  const look = Object.values(CREATURE_APPEARANCES).find(a => a.model === design.id)!;
  const runtimeClips = new Set([look.idle, look.walk, look.attack, look.hit, look.lunge, "Death", ...(look.lunge ? ["Walk"] : [])]);
  const runtimeAnimations = source.animations.filter(clip => runtimeClips.has(clip.name));
  const runtime = await new GLTFExporter().parseAsync(root, { binary: true, animations: runtimeAnimations });
  if (!(runtime instanceof ArrayBuffer)) throw new Error("Expected binary runtime glTF");
  await Bun.write(`${output}/runtime/${design.id}.glb`, runtime);
  let triangles = 0, meshCount = 0;
  root.traverse(n => { if (n instanceof T.Mesh) { triangles += (n.geometry.index?.count ?? n.geometry.getAttribute("position").count) / 3; meshCount++; } });
  const record = { ...root.userData, file: `${design.id}.glb`, bytes: bytes.byteLength, triangles, meshCount, rigJoints: forge.bones.size,
    runtime: { file: `runtime/${design.id}.glb`, bytes: runtime.byteLength, animations: runtimeAnimations.map(a => a.name) },
    animations: source.animations.map(a => ({ name: a.name, duration: a.duration, tracks: a.tracks.length })),
    bounds: new T.Box3().setFromObject(root, true).getSize(new T.Vector3()).toArray(),
  };
  manifest.push(record);
  console.log(`${design.name}: ${triangles} triangles, ${forge.count} authored parts, ${source.animations.length} clips; full ${(bytes.byteLength / 1048576).toFixed(2)} MiB, runtime ${(runtime.byteLength / 1048576).toFixed(2)} MiB`);
}
await Bun.write(`${output}/manifest.json`, JSON.stringify({ formatVersion: 1, models: manifest }, null, 2) + "\n");
await copyFile(`${pack}/License.txt`, `${output}/QUATERNIUS-LICENSE.txt`);
