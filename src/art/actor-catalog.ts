/** All actor assets use the same source-to-public-path mapping, regardless of origin. */
export interface ActorAsset {
  readonly source: string;
  readonly publicPath: string;
}

function pack(directory: string, names: readonly string[]): Record<string, ActorAsset> {
  return Object.fromEntries(names.map(name => [name, {
    source: `${directory}/${name}.glb`, publicPath: `assets/${directory}/${name}.glb`,
  }]));
}

export const actorAssets: Readonly<Record<string, ActorAsset>> = {
  ...pack('quaternius/frostwood/actors', ['Armabee', 'Bat', 'Birb', 'Chef_Male', 'Cleric', 'Crab', 'Leela', 'MushroomKing', 'Skull', 'Wolf']),
  ...pack('quaternius/rodents', ['Rat']),
  ...pack('quaternius/class-characters', ['Warrior', 'Wizard', 'Ranger', 'Social']),
  Alchemist: { source: 'quaternius/class-characters/Alchemist.gltf', publicPath: 'assets/quaternius/class-characters/Alchemist.gltf' },
  Artificer: { source: 'quaternius/class-characters/Artificer.gltf', publicPath: 'assets/quaternius/class-characters/Artificer.gltf' },
  RelicWarden: { source: 'openai/relic-warden/relic-warden.glb', publicPath: 'assets/openai/actors/RelicWarden.glb' },
  Rattagane: { source: 'openai/rattagane/rattagane.glb', publicPath: 'assets/openai/actors/Rattagane.glb' },
  PrimusGrey: { source: 'openai/primus-grey/PrimusGrey.glb', publicPath: 'assets/openai/actors/PrimusGrey.glb' },
};

const classModels = {
  warrior: 'Warrior', mage: 'Wizard', hunter: 'Ranger', alchemist: 'Alchemist', artificer: 'Artificer',
} as const;
export type PlayerModel = keyof typeof classModels;

export function actorAssetPath(name: string, playerModel?: PlayerModel): string {
  const key = playerModel ? classModels[playerModel] : name;
  const asset = actorAssets[key];
  if (!asset) throw new Error(`Unknown actor: ${key}`);
  return asset.publicPath;
}
