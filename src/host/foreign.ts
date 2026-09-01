export type ForeignRecord = Readonly<Record<string, unknown>>;

export function isForeignRecord(value: unknown): value is ForeignRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function requireForeignRecord(
  value: unknown,
  context: string,
): ForeignRecord {
  if (!isForeignRecord(value)) {
    throw new TypeError(`${context} must be an object`);
  }
  return value;
}

export function requireField(
  record: ForeignRecord,
  key: string,
  context: string,
): unknown {
  const value = record[key];
  if (value === undefined) {
    throw new TypeError(`${context}.${key} is absent`);
  }
  return value;
}

export function requireString(
  value: unknown,
  context: string,
): string {
  if (typeof value !== "string") {
    throw new TypeError(`${context} must be a string`);
  }
  return value;
}

export function requireNumber(
  value: unknown,
  context: string,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${context} must be a finite number`);
  }
  return value;
}

export function requireBoolean(
  value: unknown,
  context: string,
): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(`${context} must be a boolean`);
  }
  return value;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function requireArray(
  value: unknown,
  context: string,
): readonly unknown[] {
  if (!isUnknownArray(value)) {
    throw new TypeError(`${context} must be an array`);
  }
  return value;
}

export function parseForeignJson(source: string, context: string): unknown {
  try {
    const value: unknown = JSON.parse(source);
    return value;
  } catch (cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new TypeError(`${context} is not valid JSON: ${detail}`, { cause });
  }
}

export function identityString(value: unknown): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) {
    throw new TypeError("value has no JSON identity");
  }
  return encoded;
}
