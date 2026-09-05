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
  "warrior-class\n  shape: UnitClass",
  "warrior-2\n  shape: Unit\nwarrior-class\n  shape: UnitClass",
);
const fixture = replaceOnce(
  declared,
  "artificer-1 unit name",
  [
    'warrior-2 unit name "Bran"',
    "warrior-2 unit class warrior-class",
    "warrior-2 unit position Vec3 { x: 3.0, y: 0.0, z: 1.0 }",
    "warrior-2 unit destination Vec3 { x: 3.0, y: 0.0, z: 1.0 }",
    "warrior-2 formation offset Vec3 { x: 3.0, y: 0.0, z: -1.0 }",
    "warrior-2 movement speed 5.0",
    "warrior-2 selected true",
    "warrior-2 moving false",
    "warrior-2 vitality Vec3 { x: 155.0, y: 155.0, z: 0.0 }",
    "",
    "artificer-1 unit name",
  ].join("\n"),
);

await mkdir("build/acceptance", { recursive: true });
await Bun.write(outputPath, fixture);
console.log(outputPath);
