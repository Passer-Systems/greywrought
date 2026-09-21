/** Paths are relative to assets/external in the repository and assets in the client. */
function pack(directory: string, names: readonly string[]): Record<string, string> {
  return Object.fromEntries(names.map(name => [name, `${directory}/${name}.glb`]));
}

export const actorAssets: Readonly<Record<string, string>> = {
  ...pack('quaternius/frostwood/actors', ['Armabee', 'Bat', 'Birb', 'Chef_Male', 'Cleric', 'Crab', 'Leela', 'MushroomKing', 'Skull', 'Wolf']),
  ...pack('quaternius/rodents', ['Rat']),
  ...pack('quaternius/class-characters', ['Warrior', 'Wizard', 'Ranger', 'Social']),
  Alchemist: 'quaternius/class-characters/Alchemist.gltf',
  Artificer: 'quaternius/class-characters/Artificer.gltf',
  ...pack('openai/actors', ['RelicWarden', 'Rattagane', 'PrimusGrey']),
};

const classModels = {
  warrior: 'Warrior', mage: 'Wizard', hunter: 'Ranger', alchemist: 'Alchemist', artificer: 'Artificer',
} as const;
export type PlayerModel = keyof typeof classModels;

export function actorAssetPath(name: string, playerModel?: PlayerModel): string {
  const key = playerModel ? classModels[playerModel] : name;
  const asset = actorAssets[key];
  if (!asset) throw new Error(`Unknown actor: ${key}`);
  return `assets/${asset}`;
}
