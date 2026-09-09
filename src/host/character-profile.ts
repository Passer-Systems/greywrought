export const characterProfileStorageKey = "greywrought/local-profile-v1";

export type CharacterArchetype = "warrior" | "mage" | "hunter";

export interface LocalCharacter {
  readonly id: string;
  readonly name: string;
  readonly archetype: CharacterArchetype;
  readonly createdAtMillis: number;
  readonly fallenAtMillis?: number;
}

export interface LocalProfile {
  readonly version: 1;
  readonly displayName: string;
  readonly characters: readonly LocalCharacter[];
  readonly selectedCharacterId: string | null;
  readonly savedAtMillis: number;
}

export type CharacterProfileRead =
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "ready"; profile: LocalProfile }>
  | Readonly<{ kind: "corrupt" }>
  | Readonly<{ kind: "future"; version: number }>;

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function parse(source: string): unknown | null {
  try {
    return JSON.parse(source) as unknown;
  } catch {
    return null;
  }
}

function archetype(value: unknown): value is CharacterArchetype {
  return value === "warrior" || value === "mage" || value === "hunter";
}

export function normalizedDisplayName(source: string): string | null {
  const value = source.trim().replace(/\s+/g, " ");
  return value.length >= 2 && value.length <= 24 ? value : null;
}

export function normalizedCharacterName(source: string): string | null {
  const value = source.trim().replace(/\s+/g, " ");
  return value.length >= 2 && value.length <= 18 && /^[\p{L}][\p{L}' -]*$/u.test(value)
    ? value
    : null;
}

export function decodeCharacterProfile(source: string | null): CharacterProfileRead {
  if (source === null) return { kind: "empty" };
  const value = record(parse(source));
  const version = value?.version;
  if (typeof version === "number" && Number.isSafeInteger(version) && version > 1) {
    return { kind: "future", version };
  }
  if (
    version !== 1 ||
    typeof value?.displayName !== "string" ||
    normalizedDisplayName(value.displayName) !== value.displayName ||
    !Array.isArray(value.characters) ||
    !(value.selectedCharacterId === null || typeof value.selectedCharacterId === "string") ||
    typeof value.savedAtMillis !== "number" ||
    !Number.isFinite(value.savedAtMillis)
  ) {
    return { kind: "corrupt" };
  }
  const characters: LocalCharacter[] = [];
  const ids = new Set<string>();
  for (const candidate of value.characters) {
    const item = record(candidate);
    if (
      item === null ||
      typeof item.id !== "string" ||
      item.id.length < 1 ||
      item.id.length > 80 ||
      ids.has(item.id) ||
      typeof item.name !== "string" ||
      normalizedCharacterName(item.name) !== item.name ||
      !archetype(item.archetype) ||
      typeof item.createdAtMillis !== "number" ||
      !Number.isFinite(item.createdAtMillis) ||
      (item.fallenAtMillis !== undefined && (typeof item.fallenAtMillis !== "number" || !Number.isFinite(item.fallenAtMillis)))
    ) {
      return { kind: "corrupt" };
    }
    ids.add(item.id);
    characters.push({
      id: item.id,
      name: item.name,
      archetype: item.archetype,
      createdAtMillis: item.createdAtMillis,
      ...(typeof item.fallenAtMillis === "number" ? { fallenAtMillis: item.fallenAtMillis } : {}),
    });
  }
  if (characters.filter((character) => character.fallenAtMillis === undefined).length > 8) return { kind: "corrupt" };
  if (value.selectedCharacterId !== null && !ids.has(value.selectedCharacterId)) {
    return { kind: "corrupt" };
  }
  return {
    kind: "ready",
    profile: {
      version: 1,
      displayName: value.displayName,
      characters,
      selectedCharacterId: value.selectedCharacterId,
      savedAtMillis: value.savedAtMillis,
    },
  };
}

export function archiveFallenCharacter(profile: LocalProfile, id: string, now: number): LocalProfile {
  const characters = profile.characters.map((character) => character.id === id && character.fallenAtMillis === undefined
    ? { ...character, fallenAtMillis: now }
    : character);
  const selected = characters.find((character) => character.id === profile.selectedCharacterId && character.fallenAtMillis === undefined)
    ?? characters.find((character) => character.fallenAtMillis === undefined);
  return { ...profile, characters, selectedCharacterId: selected?.id ?? null, savedAtMillis: now };
}

export function encodeCharacterProfile(profile: LocalProfile): string {
  const decoded = decodeCharacterProfile(JSON.stringify(profile));
  if (decoded.kind !== "ready") {
    throw new Error("character profile must be valid before persistence");
  }
  return JSON.stringify(decoded.profile);
}
