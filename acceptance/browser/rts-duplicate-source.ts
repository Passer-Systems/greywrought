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

const overrides = new Map([
  ["actor name", '"Bran"'],
  ["actor position", "\n    x: 4.0\n    y: 0.0\n    z: 1.0"],
  ["unit destination", "\n    x: 4.0\n    y: 0.0\n    z: 1.0"],
  ["formation offset", "\n    x: 3.0\n    y: 0.0\n    z: -1.0"],
]);
const blocks = source.match(/^warrior-1\n(?:[ \t][^\n]*(?:\n|$)|\n)+/gm);
if (!blocks?.length) throw new Error("duplicate RTS fixture has no grouped source unit");
let copied = blocks.map(block => "warrior-2\n" + block.slice("warrior-1\n".length)).join("\n");
for (const [relation, value] of overrides) {
  const facts = copied.match(new RegExp(`^  ${relation}:[^\\n]*(?:\\n    [^\\n]*)*`, "gm"));
  if (facts?.length !== 1) throw new Error(`duplicate RTS fixture needs one ${relation} fact`);
  const separator = value.startsWith("\n") ? "" : " ";
  copied = replaceOnce(copied, facts[0], `  ${relation}:${separator}${value}`);
}
const fixture = replaceOnce(
  source,
  "cinder-1\n  member of: Enemy",
  copied + "\ncinder-1\n  member of: Enemy",
);

await mkdir("build/acceptance", { recursive: true });
await Bun.write(outputPath, fixture);
console.log(outputPath);
