import { expect, test } from 'bun:test';
import { actorAssets, actorAssetPath } from './actor-catalog.js';
import { actorAssetFiles } from '../../scripts/art/public-assets.js';
import { threatAppearances } from '../host/threat-appearances.js';

const files = await actorAssetFiles();
for (const [name, asset] of Object.entries(actorAssets)) {
  test(`${name}: runtime route, source and encounter animations are valid`, async () => {
    expect(files).toContainEqual([`assets/external/${asset.source}`, `dist/${actorAssetPath(name)}`]);
    const bytes = await Bun.file(`assets/external/${asset.source}`).arrayBuffer();
    const json = asset.source.endsWith('.glb')
      ? new TextDecoder().decode(bytes.slice(20, 20 + new DataView(bytes).getUint32(12, true)))
      : new TextDecoder().decode(bytes);
    const gltf = JSON.parse(json);
    expect(gltf.meshes.length).toBeGreaterThan(0);
    expect(gltf.skins.length).toBeGreaterThan(0);
    expect(gltf.animations.length).toBeGreaterThan(0);
    for (const look of Object.values(threatAppearances).filter(look => look.model === name)) {
      for (const clip of [look.idle, look.walk, look.attack, look.hit, 'Death']) {
        expect(gltf.animations.some((animation: { name: string }) => animation.name === clip)).toBe(true);
      }
    }
  });
}

test('all packaged actor files exist and no authoring files are shipped', async () => {
  for (const [path] of files) expect(await Bun.file(path).exists()).toBe(true);
  expect(files.some(([path]) => path.endsWith('.blend'))).toBe(false);
  expect(new Set(files.map(([, path]) => path)).size).toBe(files.length);
});
