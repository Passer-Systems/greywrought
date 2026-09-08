import { expect, test } from "bun:test";
import {
  AnimationClip, Bone, BufferGeometry, Float32BufferAttribute, Group,
  MeshStandardMaterial, NumberKeyframeTrack, Skeleton, SkinnedMesh, Vector3,
} from "three";
import { mergeColoredSkin } from "../src/host/rts-quaternius.js";

function fixture() {
  const root = new Group();
  const bone = new Bone();
  root.add(bone);
  const skeleton = new Skeleton([bone]);
  const parts = [0xff3210, 0x238eff].map((color, index) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([index, 0, 0, index + 1, 0, 0, index, 1, 0], 3));
    geometry.setAttribute("normal", new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    geometry.setAttribute("skinIndex", new Float32BufferAttribute(new Array(12).fill(0), 4));
    geometry.setAttribute("skinWeight", new Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
    geometry.setIndex([0, 1, 2]);
    const mesh = new SkinnedMesh(geometry, new MeshStandardMaterial({ color, roughness: 0.5 }));
    mesh.name = `part${index}`;
    mesh.bind(skeleton);
    root.add(mesh);
    return mesh;
  });
  return { root, bone, parts };
}

test("merged skin preserves every deformed vertex and linear surface color", () => {
  const { root, bone, parts } = fixture();
  expect(mergeColoredSkin(root, [])).toEqual(parts);
  const merged = root.children.find((child) => child instanceof SkinnedMesh)!;
  expect(merged.geometry.index!.count).toBe(6);
  for (const angle of [0, 0.4, -0.7]) {
    bone.rotation.z = angle;
    root.updateMatrixWorld(true);
    for (const [partIndex, part] of parts.entries()) {
      part.updateMatrixWorld(true);
      for (let vertex = 0; vertex < 3; vertex++) {
        const index = partIndex * 3 + vertex;
        const original = part.getVertexPosition(vertex, new Vector3());
        const actual = merged.getVertexPosition(index, new Vector3());
        expect(actual.distanceTo(original)).toBeLessThan(0.000001);
        const colors = merged.geometry.getAttribute("color");
        expect(colors.getX(index)).toBeCloseTo(part.material.color.r, 6);
        expect(colors.getY(index)).toBeCloseTo(part.material.color.g, 6);
        expect(colors.getZ(index)).toBeCloseTo(part.material.color.b, 6);
      }
    }
  }
});

test("different surfaces and independently animated parts remain separate", () => {
  const different = fixture();
  different.parts[1]!.material.roughness = 0.9;
  expect(mergeColoredSkin(different.root, [])).toHaveLength(0);
  const animated = fixture();
  const clip = new AnimationClip("move", 1, [new NumberKeyframeTrack("part1.position[x]", [0, 1], [0, 1])]);
  expect(mergeColoredSkin(animated.root, [clip])).toHaveLength(0);
});
