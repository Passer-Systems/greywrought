import { afterAll, expect, test } from "bun:test";
import {
  conventionalPartyAttack,
  type PartyAttackFixture,
  type PartyAttackOutput,
  type PartyAttackUnit,
} from "./party-attack-reference.js";

interface AttackCase {
  readonly id: string;
  readonly patch: Partial<Omit<PartyAttackFixture, "target" | "units">> & {
    readonly target?: Partial<PartyAttackFixture["target"]>;
    readonly units?: Readonly<Record<string, Partial<PartyAttackUnit>>>;
  };
  readonly targetVitality: number;
  readonly contributors: readonly string[];
}

const oracle: { base: PartyAttackFixture; cases: readonly AttackCase[] } = await Bun.file(
  Bun.env.WOUNDED_ATTACK_CASES ?? new URL("./wounded-attack-cases.json", import.meta.url),
).json();
const results: Record<string, PartyAttackOutput> = {};

for (const scenario of oracle.cases) {
  test(scenario.id, () => {
    const fixture: PartyAttackFixture = {
      ...oracle.base,
      ...scenario.patch,
      target: { ...oracle.base.target, ...scenario.patch.target },
      units: oracle.base.units.map((unit) => ({ ...unit, ...scenario.patch.units?.[unit.id] })),
    };
    const output = conventionalPartyAttack(fixture);
    results[scenario.id] = output;
    expect(output.targetVitality).toBe(scenario.targetVitality);
    expect(output.accumulatedDamage).toBe(fixture.target.vitality - scenario.targetVitality);
    expect(output.contributors).toEqual(scenario.contributors);
    expect(output.actionCooldowns).toEqual(Object.fromEntries(fixture.units.map((unit) => [
      unit.id,
      scenario.contributors.includes(unit.id) ? unit.actionPeriod : unit.actionCooldown,
    ])));
  });
}

afterAll(async () => {
  await Bun.write("build/authoring-trial/conventional-results.json", `${JSON.stringify(results, null, 2)}\n`);
});
