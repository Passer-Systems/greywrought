/** Shared by world actors and portraits. IDs are stable save/encounter keys. */
export interface CreatureAppearance {
  readonly model: string;
  readonly height: number;
  readonly idle: string;
  readonly walk: string;
  readonly attack: string;
  readonly hit: string;
  readonly lunge?: string;
  readonly hover?: number;
}

export const RELIC_MODELS = ["hollow-saint", "relic-warden", "hearth-keeper", "greyrot-penitent"] as const;

export const CREATURE_APPEARANCES: Readonly<Record<string, CreatureAppearance>> = {
  "cave-bat": { model: "hollow-saint", height: 2.8, idle: "Idle", walk: "Walk", attack: "Punch", hit: "HitRecieve_1" },
  "cave-crab": { model: "Crab", height: 2.3, idle: "Idle", walk: "Walk", attack: "Bite_InPlace", hit: "HitRecieve" },
  scout: { model: "Skull", height: 1.6, idle: "Idle", walk: "Walk", attack: "Bite_Front", hit: "HitRecieve", hover: 1.25 },
  nest: { model: "hearth-keeper", height: 2.35, idle: "Idle", walk: "Run", attack: "Shoot", hit: "HitRecieve_1" },
  warder: { model: "relic-warden", height: 2.65, idle: "Idle", walk: "Run", attack: "SwordSlash", hit: "HitRecieve_1" },
  patrol: { model: "greyrot-penitent", height: 2.8, idle: "Idle", walk: "Run", attack: "Punch", hit: "HitRecieve_1", lunge: "Jump" },
  "ritual-guardian": { model: "Leela", height: 3.2, idle: "Idle", walk: "Walk", attack: "Kick", hit: "HitRecieve_1" },
};

export function creatureAssetPath(name: string): string {
  return (RELIC_MODELS as readonly string[]).includes(name)
    ? `assets/greywrought/relics/${name}.glb`
    : `assets/quaternius/frostwood/actors/${name}.glb`;
}
