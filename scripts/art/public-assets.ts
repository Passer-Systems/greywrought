import { dirname } from "node:path";
import { authoredActors } from "../../src/art/actor-catalog.js";

/** Ship registered runtime models and their colocated attribution, never authoring files. */
export async function authoredAssetFiles(): Promise<readonly (readonly [string, string])[]> {
  const paths = new Set(Object.values(authoredActors).map(asset => asset.path));
  for (const directory of new Set([...paths].map(dirname))) {
    for await (const file of new Bun.Glob("*.{md,txt}").scan({ cwd: `assets/external/${directory}`, onlyFiles: true })) {
      paths.add(`${directory}/${file}`);
    }
  }
  return [...paths].sort().map(path => [`assets/external/${path}`, `dist/assets/${path}`] as const);
}
