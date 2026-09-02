import {
  decodeCampaignStorage,
  encodeCampaignStorage,
} from "../src/host/campaign-persistence.js";

function equal(actual: unknown, expected: unknown, context: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${context}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}

equal(decodeCampaignStorage(null, null), { kind: "empty" }, "empty storage");
equal(
  decodeCampaignStorage(encodeCampaignStorage(2, 1234), null),
  { kind: "ready", progress: 2 },
  "current storage",
);
equal(
  decodeCampaignStorage(null, '{"version":1,"progress":2}'),
  { kind: "migrated", progress: 2 },
  "v1 migration",
);
equal(
  decodeCampaignStorage(encodeCampaignStorage(-500, 1234), null),
  { kind: "ready", progress: -500 },
  "host must pass finite observations to Clause without assigning meaning",
);
equal(decodeCampaignStorage("not json", null), { kind: "corrupt" }, "invalid JSON");
equal(
  decodeCampaignStorage('{"version":2,"admitted":{"footholdProgress":"3"},"savedAtMillis":1}', null),
  { kind: "corrupt" },
  "invalid current shape",
);
equal(
  decodeCampaignStorage('{"version":9}', '{"version":1,"progress":3}'),
  { kind: "future", version: 9 },
  "future saves are retained",
);
equal(
  decodeCampaignStorage(null, '{"version":1,"progress":null}'),
  { kind: "corrupt" },
  "invalid legacy shape",
);

console.log("Campaign persistence migration and corruption checks passed.");
