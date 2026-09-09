import {
  archiveFallenCharacter,
  decodeCharacterProfile,
  encodeCharacterProfile,
  normalizedCharacterName,
  normalizedDisplayName,
  type LocalProfile,
} from "../src/host/character-profile.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const profile: LocalProfile = {
  version: 1,
  displayName: "Conference Guest",
  characters: [{
    id: "local-1",
    name: "Ash Warden",
    archetype: "warrior",
    createdAtMillis: 1,
  }],
  selectedCharacterId: "local-1",
  savedAtMillis: 2,
};
const decoded = decodeCharacterProfile(encodeCharacterProfile(profile));
assert(decoded.kind === "ready", "valid local profile did not round trip");
assert(decoded.kind !== "ready" || decoded.profile.characters[0]?.archetype === "warrior", "archetype changed during persistence");
assert(decodeCharacterProfile(null).kind === "empty", "missing local profile was not empty");
assert(decodeCharacterProfile("bad json").kind === "corrupt", "invalid JSON was accepted");
assert(decodeCharacterProfile('{"version":2}').kind === "future", "future profile was not preserved");
assert(normalizedDisplayName("  Grey   Guest ") === "Grey Guest", "display-name normalization failed");
assert(normalizedCharacterName("  Ash   Warden ") === "Ash Warden", "character-name normalization failed");
assert(normalizedCharacterName("<script>") === null, "invalid character name was accepted");

const withSurvivor: LocalProfile = {
  ...profile,
  characters: [...profile.characters, { id: "local-2", name: "Survivor", archetype: "mage", createdAtMillis: 2 }],
};
const memorial = archiveFallenCharacter(withSurvivor, "local-1", 3);
const restoredMemorial = decodeCharacterProfile(encodeCharacterProfile(memorial));
assert(restoredMemorial.kind === "ready" && restoredMemorial.profile.characters[0]?.fallenAtMillis === 3, "fallen status did not survive persistence");
assert(memorial.selectedCharacterId === "local-2", "death did not select a living character");
assert(memorial.characters[1] === withSurvivor.characters[1], "death changed another character");
assert(archiveFallenCharacter(memorial, "local-1", 4).characters[0]?.fallenAtMillis === 3, "archiving again changed the memorial date");
assert(archiveFallenCharacter(memorial, "local-2", 4).selectedCharacterId === null, "fallen character remained selected for play");
const fullRoster = { ...memorial, characters: [memorial.characters[0]!, ...Array.from({ length: 8 }, (_, i) => ({ ...profile.characters[0]!, id: `living-${i}` }))], selectedCharacterId: "living-0" };
assert(decodeCharacterProfile(JSON.stringify(fullRoster)).kind === "ready", "memorial consumed a playable roster slot");
assert(decodeCharacterProfile(JSON.stringify({ ...profile, characters: [{ ...profile.characters[0], fallenAtMillis: "yesterday" }] })).kind === "corrupt", "invalid memorial date was accepted");

console.log("Local account and character persistence checks passed.");
