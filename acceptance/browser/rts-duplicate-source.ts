import { mkdir } from "node:fs/promises";

const sourcePath = "src/world/embodied-encounter.clause";
const outputPath = "build/acceptance/embodied-encounter-duplicate.clause";
const source = await Bun.file(sourcePath).text();

function replaceOnce(value: string, search: string, replacement: string): string {
  const first = value.indexOf(search);
  if (first < 0 || value.indexOf(search, first + search.length) >= 0) {
    throw new Error(`duplicate RTS fixture anchor must occur exactly once: ${search}`);
  }
  return value.slice(0, first) + replacement + value.slice(first + search.length);
}

const declared = replaceOnce(
  source,
  "cinder-1\n  shape: Enemy",
  "warrior-2\n  shape: Unit\n  shape: Actor\ncinder-1\n  shape: Enemy",
);
const overrides = new Map([
  ["actor name", '"Bran"'],
  ["actor position", "Vec3 { x: 3.0, y: 0.0, z: 1.0 }"],
  ["unit destination", "Vec3 { x: 3.0, y: 0.0, z: 1.0 }"],
  ["formation offset", "Vec3 { x: 3.0, y: 0.0, z: -1.0 }"],
]);
const unitRows = source.split("\n").filter((line) => line.startsWith("warrior-1 ")).map((line) => {
  const copied = line.replace("warrior-1 ", "warrior-2 ");
  for (const [relation, value] of overrides) {
    const prefix = `warrior-2 ${relation} `;
    if (copied.startsWith(prefix)) return prefix + value;
  }
  return copied;
});
if (unitRows.length === 0) throw new Error("duplicate RTS fixture has no source unit rows");
const fixture = replaceOnce(
  declared,
  "cinder-1 actor name",
  [
    ...unitRows,
    "",
    "cinder-1 actor name",
  ].join("\n"),
);

await mkdir("build/acceptance", { recursive: true });
await Bun.write(outputPath, fixture);
console.log(outputPath);
