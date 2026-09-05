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
const fixture = replaceOnce(
  declared,
  "cinder-1 actor name",
  [
    'warrior-2 actor name "Bran"',
    'warrior-2 presentation kind "Warrior"',
    "warrior-2 unit class warrior-class",
    "warrior-2 actor position Vec3 { x: 3.0, y: 0.0, z: 1.0 }",
    "warrior-2 unit destination Vec3 { x: 3.0, y: 0.0, z: 1.0 }",
    "warrior-2 formation offset Vec3 { x: 3.0, y: 0.0, z: -1.0 }",
    "warrior-2 movement speed 5.0",
    "warrior-2 selected true",
    "warrior-2 moving false",
    "warrior-2 hostile false",
    "warrior-2 vitality 155.0",
    "warrior-2 maximum vitality 155.0",
    "warrior-2 alive true",
    "warrior-2 ward remaining 0.0",
    "warrior-2 burn remaining 0.0",
    "warrior-2 attack damage 22.0",
    "warrior-2 attack range 18.0",
    "warrior-2 healing power 0.0",
    "warrior-2 ward duration 0.0",
    "warrior-2 action cooldown 0.0",
    "warrior-2 action period 0.8",
    "",
    "cinder-1 actor name",
  ].join("\n"),
);

await mkdir("build/acceptance", { recursive: true });
await Bun.write(outputPath, fixture);
console.log(outputPath);
