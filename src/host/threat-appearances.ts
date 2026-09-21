import { ROBOT_CRITTER_COLORS } from "./robot-critter.js";

export interface ThreatAppearance {
  readonly model: string; readonly height: number;
  readonly idle: string; readonly walk: string; readonly attack: string; readonly hit: string;
  readonly metalColor?: number; readonly tint?: number; readonly glow?: number; readonly lift?: number; readonly materialFill?: number;
}

export const threatAppearances: Readonly<Record<string, ThreatAppearance>> = {
    warder: {model:"RelicWarden",height:2.65,idle:"Idle",walk:"Run",attack:"SwordSlash",hit:"HitRecieve_1"},
    "cave-crab": {model:"Rattagane",height:2.87,idle:"Idle",walk:"Walk",attack:"Weapon",hit:"HitReact",materialFill:.35},
    "glassmire-lantern": {model:"Skull",height:1.45,idle:"Idle",walk:"Walk",attack:"Bite_Front",hit:"HitRecieve",tint:0x90cfac,glow:0x245d43,lift:1.15},
    "glassmire-stalker": {model:"Wolf",height:1.7,idle:"Idle",walk:"Gallop",attack:"Attack",hit:"Idle_HitReact1",tint:0xb5d0ce},
    "glassmire-grazer": {model:"Crab",height:1.15,idle:"Idle",walk:"Walk",attack:"Bite_InPlace",hit:"HitRecieve",metalColor:0x639780},
    "choir-cantor": {model:"Skull",height:1.85,idle:"Idle",walk:"Walk",attack:"Bite_Front",hit:"HitRecieve",tint:0xaf828d,glow:0x66374c,lift:1.3},
    "choir-hound": {model:"Wolf",height:1.85,idle:"Idle",walk:"Gallop",attack:"Attack",hit:"Idle_HitReact1",tint:0x7d838a,glow:0x45272e},
    "choir-sacristan": {model:"Leela",height:2.75,idle:"Idle",walk:"Walk",attack:"Kick",hit:"HitRecieve_1",tint:0x9c7770,glow:0x3a1820},
    "ossuary-king": {model:"MushroomKing",height:2.9,idle:"Idle",walk:"Run",attack:"Punch",hit:"HitReact",tint:0xd7c9ba,glow:0x372146},
    "ossuary-wing": {model:"Bat",height:1.55,idle:"Flying",walk:"Flying",attack:"Bite_Front",hit:"HitRecieve",tint:0xd5d0c5,lift:1.1},
    "brinewood-bee": {model:"Armabee",height:1.4,idle:"Flying_Idle",walk:"Fast_Flying",attack:"Headbutt",hit:"HitReact",tint:0xbf8c58},
    "suture-scavenger": {model:"Crab",height:.65,idle:"Idle",walk:"Walk",attack:"Bite_InPlace",hit:"HitRecieve",metalColor:0xb49c69},
    "scrap-skitter": {model:"Crab",height:0.62,idle:"Idle",walk:"Walk",attack:"Bite_InPlace",hit:"HitRecieve",metalColor:ROBOT_CRITTER_COLORS['scrap-skitter']},
    "rust-skitter": {model:"Crab",height:0.55,idle:"Idle",walk:"Walk",attack:"Bite_InPlace",hit:"HitRecieve",metalColor:ROBOT_CRITTER_COLORS['rust-skitter']},
    "moss-skitter": {model:"Crab",height:0.6,idle:"Idle",walk:"Walk",attack:"Bite_InPlace",hit:"HitRecieve",metalColor:ROBOT_CRITTER_COLORS['moss-skitter']},
    "cave-bat": {model:"Bat",height:1.5,idle:"Flying",walk:"Flying",attack:"Bite_Front",hit:"HitRecieve"},
    "lake-dreadnought": {model:"mechanical-turtle",height:2.3,idle:"Idle",walk:"Walk",attack:"Shell_Slam",hit:"HitRecieve"},
    "pond-turtle": {model:"mechanical-turtle",height:0.9,idle:"Idle",walk:"Walk",attack:"Bite_InPlace",hit:"HitRecieve"},
    "meadow-rat": {model:"Rat",height:0.65,idle:"Idle",walk:"Walk",attack:"Attack",hit:"Run"},
    "meadow-rat-2": {model:"Rat",height:0.65,idle:"Idle",walk:"Walk",attack:"Attack",hit:"Run"},
    "meadow-bird": {model:"Birb",height:0.7,idle:"Dance",walk:"Dance",attack:"Bite_Front",hit:"HitRecieve"},
    "meadow-bird-2": {model:"Birb",height:0.7,idle:"Dance",walk:"Dance",attack:"Bite_Front",hit:"HitRecieve"},
    "meadow-bird-3": {model:"Birb",height:0.7,idle:"Dance",walk:"Dance",attack:"Bite_Front",hit:"HitRecieve"},
    "meadow-rat-3": {model:"Rat",height:0.58,idle:"Idle",walk:"Walk",attack:"Attack",hit:"Run"},
    "meadow-bird-4": {model:"Birb",height:0.6,idle:"Dance",walk:"Dance",attack:"Bite_Front",hit:"HitRecieve",tint:0xc49568},
    scout: {model:"Skull",height:1.6,idle:"Idle",walk:"Walk",attack:"Bite_Front",hit:"HitRecieve",lift:1.25},
    nest: {model:"Armabee",height:1.6,idle:"Flying_Idle",walk:"Fast_Flying",attack:"Headbutt",hit:"HitReact"},
    patrol: {model:"Wolf",height:1.6,idle:"Idle",walk:"Gallop",attack:"Attack",hit:"Idle_HitReact1"},
    "ritual-guardian": {model:"Leela",height:3.2,idle:"Idle",walk:"Walk",attack:"Kick",hit:"HitRecieve_1"},
  };
