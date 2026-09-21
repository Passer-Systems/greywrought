/** Source paths are relative to assets/external; public actor routes use model names. */
export interface AuthoredActor {
  readonly path: string;
  readonly encounterId: string;
  readonly height: number;
  readonly idle: string;
  readonly walk: string;
  readonly attack: string;
  readonly hit: string;
  readonly materialFill?: number;
}

export const authoredActors: Readonly<Record<string, AuthoredActor>> = {
  RelicWarden: {
    path: "relic-warden/relic-warden-runtime.glb", encounterId: "warder",
    height: 2.65, idle: "Idle", walk: "Run", attack: "SwordSlash", hit: "HitRecieve_1",
  },
  Rattagane: {
    path: "openai/rattagane/rattagane.glb", encounterId: "cave-crab",
    height: 2.87, idle: "Idle", walk: "Walk", attack: "Weapon", hit: "HitReact", materialFill: .35,
  },
};

export const authoredAppearances = Object.fromEntries(
  Object.entries(authoredActors).map(([model, asset]) => [asset.encounterId, { model, ...asset }]),
);

const actorPaths: Readonly<Record<string, string>> = {
  Rat: "quaternius/rodents/Rat.glb",
  ...Object.fromEntries(Object.keys(authoredActors).map(name => [name, `openai/actors/${name}.glb`])),
};
const classModels = {
  warrior: "Warrior.glb", mage: "Wizard.glb", hunter: "Ranger.glb",
  alchemist: "Alchemist.gltf", artificer: "Artificer.gltf",
} as const;
export type PlayerModel = keyof typeof classModels;

export function actorAssetPath(name: string, playerModel?: PlayerModel): string {
  if (playerModel) return `assets/quaternius/class-characters/${classModels[playerModel]}`;
  return `assets/${actorPaths[name] ?? `quaternius/frostwood/actors/${name}.glb`}`;
}
