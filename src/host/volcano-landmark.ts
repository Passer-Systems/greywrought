import {
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  Points,
  PointsMaterial,
  Float32BufferAttribute,
} from "three";
import { terrainHeight } from "../game/cave-layout.js";

/** The eastern ridge landmark: a quiet reminder of the machines that broke the world. */
export function buildVolcanoLandmark(terrain: Group): Group {
  const root = new Group();
  root.name = "greywrought.landmark.eastern-volcano";

  // Keep the landmark well beyond the starting meadow and off the authored roads.
  const x = 118;
  const z = 24;
  const ground = terrainHeight(x, z);
  root.position.set(x, ground, z);
  root.rotation.y = -0.18;

  const basalt = new MeshStandardMaterial({ color: 0x272629, roughness: 0.96, metalness: 0.08 });
  const lava = new MeshStandardMaterial({
    color: 0xff5425,
    emissive: 0xd92b0b,
    emissiveIntensity: 2.2,
    roughness: 0.42,
    metalness: 0.08,
  });

  // One continuous, irregular surface makes the crater read as terrain rather than stacked primitives.
  const segments = 22;
  const rings = [
    { radius: 25, height: 0 },
    { radius: 16, height: 11 },
    { radius: 10, height: 21 },
    { radius: 6.4, height: 17.8 },
  ];
  const vertices: number[] = [];
  const ringPoint = (ring: number, index: number): [number, number, number] => {
    const angle = index / segments * Math.PI * 2;
    const wobble = 1 + 0.11 * Math.sin(index * 2.7 + ring * 1.8) + 0.045 * Math.sin(index * 5.1 - ring);
    const radius = rings[ring]!.radius * wobble;
    const ox = ring >= 2 ? -3.6 : -1.8;
    const oz = ring >= 2 ? 1.4 : 0;
    const slope = ring === 1 ? Math.sin(index * 1.7) * 1.5 : ring === 2 ? Math.sin(index * 1.9 + 0.8) * 2.2 : 0;
    const px=Math.cos(angle)*radius+ox,pz=Math.sin(angle)*radius*.86+oz;
    const height=ring===0?terrainHeight(x+px*Math.cos(-.18)+pz*Math.sin(-.18),z-px*Math.sin(-.18)+pz*Math.cos(-.18))-ground-.2:rings[ring]!.height+slope;
    return [px,height,pz];
  };
  for (let ring = 0; ring < rings.length; ring++) for (let index = 0; index < segments; index++) vertices.push(...ringPoint(ring, index));
  const indices: number[] = [];
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let index = 0; index < segments; index++) {
      const next = (index + 1) % segments;
      const a = ring * segments + index, b = ring * segments + next;
      const c = (ring + 1) * segments + next, d = (ring + 1) * segments + index;
      indices.push(a, d, b, b, d, c);
    }
  }
  const volcanoGeometry = new BufferGeometry();
  volcanoGeometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  volcanoGeometry.setIndex(indices);
  volcanoGeometry.computeVertexNormals();
  const volcano = new Mesh(volcanoGeometry, basalt);
  volcano.name = "greywrought.landmark.eastern-volcano.crater-surface";
  volcano.castShadow = true;
  volcano.receiveShadow = true;
  root.add(volcano);

  const pool = new Mesh(new CylinderGeometry(6.9, 5.8, 0.22, 28), lava);
  pool.name = "greywrought.landmark.eastern-volcano.lava";
  pool.position.set(-3.6, 17.9, 1.4);
  pool.scale.set(1.22, 1, 0.8);
  root.add(pool);

  const light = new PointLight(0xff5528, 2.1, 34, 2);
  light.name = "greywrought.landmark.eastern-volcano.glow";
  light.position.set(-3.6, 18.4, 1.4);
  root.add(light);

  const ashPositions = new Float32Array(42 * 3);
  let seed = 17;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0xffffffff; };
  for (let i = 0; i < 42; i++) {
    const rise = random() * 16;
    const spread = 1.4 + rise * 0.18;
    ashPositions[i * 3] = -3.6 + (random() - 0.5) * spread;
    ashPositions[i * 3 + 1] = 18.5 + rise;
    ashPositions[i * 3 + 2] = 1.4 + (random() - 0.5) * spread * 0.72;
  }
  const ashGeometry = new BufferGeometry();
  ashGeometry.setAttribute("position", new Float32BufferAttribute(ashPositions, 3));
  const ash = new Points(ashGeometry, new PointsMaterial({ color: 0x5a5a58, size: 0.8, transparent: true, opacity: 0.42, depthWrite: false }));
  ash.name = "greywrought.landmark.eastern-volcano.ash";
  root.add(ash);

  terrain.add(root);
  return root;
}
