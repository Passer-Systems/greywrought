import { dirname } from 'node:path';
import { actorAssets } from '../../src/art/actor-catalog.js';

/** Package every registered actor and its pack's source notes/licenses. */
export async function actorAssetFiles(): Promise<readonly (readonly [string, string])[]> {
  const models = Object.values(actorAssets).map(asset =>
    [`assets/external/${asset.source}`, `dist/${asset.publicPath}`] as const);
  const notes = new Set<string>();
  for (const sourceDirectory of new Set(Object.values(actorAssets).map(asset => dirname(asset.source)))) {
    let directory = sourceDirectory;
    while (directory !== '.') {
      const files = await Array.fromAsync(new Bun.Glob('*.{md,txt}').scan({ cwd: `assets/external/${directory}`, onlyFiles: true }));
      for (const file of files) notes.add(`${directory}/${file}`);
      if (files.length) break;
      directory = dirname(directory);
    }
  }
  return [...models, ...[...notes].sort().map(path => [`assets/external/${path}`, `dist/assets/${path}`] as const)];
}
