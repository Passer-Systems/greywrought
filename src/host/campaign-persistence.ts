export const campaignStorageKey = "greywrought/campaign-v2";
export const legacyFootholdStorageKey = "greywrought/foothold-v1";

interface PersistedCampaignV2 {
  readonly version: 2;
  readonly admitted: Readonly<{
    readonly footholdProgress: number;
  }>;
  readonly savedAtMillis: number;
}

export type CampaignRead =
  | Readonly<{ kind: "empty" }>
  | Readonly<{ kind: "ready"; progress: number }>
  | Readonly<{ kind: "migrated"; progress: number }>
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

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function decodeCampaignStorage(
  currentSource: string | null,
  legacySource: string | null,
): CampaignRead {
  if (currentSource !== null) {
    const value = record(parse(currentSource));
    const version = value?.version;
    if (typeof version === "number" && Number.isSafeInteger(version) && version > 2) {
      return { kind: "future", version };
    }
    const admitted = record(value?.admitted);
    if (
      version !== 2 ||
      admitted === null ||
      !finiteNumber(admitted.footholdProgress) ||
      !finiteNumber(value?.savedAtMillis)
    ) {
      return { kind: "corrupt" };
    }
    return { kind: "ready", progress: admitted.footholdProgress };
  }

  if (legacySource === null) return { kind: "empty" };
  const legacy = record(parse(legacySource));
  if (legacy?.version !== 1 || !finiteNumber(legacy.progress)) {
    return { kind: "corrupt" };
  }
  return { kind: "migrated", progress: legacy.progress };
}

export function encodeCampaignStorage(
  admittedFootholdProgress: number,
  savedAtMillis: number,
): string {
  if (!Number.isFinite(admittedFootholdProgress) || !Number.isFinite(savedAtMillis)) {
    throw new Error("campaign persistence accepts only finite observations");
  }
  const value: PersistedCampaignV2 = {
    version: 2,
    admitted: { footholdProgress: admittedFootholdProgress },
    savedAtMillis,
  };
  return JSON.stringify(value);
}
