import { dirname } from "node:path";
import { authoredActors, actorAssetPath } from "../../src/art/actor-catalog.js";

/** Ship registered runtime models and their colocated attribution, never authoring files. */
export async function authoredAssetFiles(): Promise<readonly (readonly [string, string])[]> {
  const models = Object.entries(authoredActors).map(([name, asset]) =>
    [`assets/external/${asset.path}`, `dist/${actorAssetPath(name)}`] as const);
  const notes = new Set<string>();
  for (const directory of new Set(Object.values(authoredActors).map(asset => dirname(asset.path)))) {
    for await (const file of new Bun.Glob("*.{md,txt}").scan({ cwd: `assets/external/${directory}`, onlyFiles: true })) {
      notes.add(`${directory}/${file}`);
    }
  }
  return [...models, ...[...notes].sort().map(path => [`assets/external/${path}`, `dist/assets/${path}`] as const)];
}
