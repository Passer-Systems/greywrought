import {
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

console.log("Local account and character persistence checks passed.");
