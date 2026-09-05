export interface PartyAttackUnit {
  readonly id: string;
  readonly selected: boolean;
  readonly alive: boolean;
  readonly vitality: number;
  readonly x: number;
  readonly z: number;
  readonly attackDamage: number;
  readonly attackRange: number;
  readonly actionCooldown: number;
  readonly actionPeriod: number;
}

export interface PartyAttackFixture {
  readonly encounterActive: boolean;
  readonly chosenTargetMatches: boolean;
  readonly target: Readonly<{
    id: string;
    x: number;
    z: number;
    vitality: number;
    hostile: boolean;
  }>;
  readonly units: readonly PartyAttackUnit[];
}

export interface PartyAttackOutput {
  readonly targetVitality: number;
  readonly actionCooldowns: Readonly<Record<string, number>>;
  readonly contributors: readonly string[];
  readonly accumulatedDamage: number;
}

function eligible(fixture: PartyAttackFixture, unit: PartyAttackUnit): boolean {
  const dx = fixture.target.x - unit.x;
  const dz = fixture.target.z - unit.z;
  return fixture.encounterActive && fixture.chosenTargetMatches && fixture.target.hostile &&
    fixture.target.vitality > 0 && unit.selected && unit.alive && unit.vitality > 0 &&
    unit.actionCooldown <= 0 && dx * dx + dz * dz <= unit.attackRange * unit.attackRange;
}

// This deliberately conventional reference consumes trusted, already-decoded
// data. It is isolated acceptance code and is never imported by game/build/play.
export function conventionalPartyAttack(fixture: PartyAttackFixture): PartyAttackOutput {
  const contributors = fixture.units.filter((unit) => eligible(fixture, unit));
  // Clause evaluates every eligible rule against pre-state, canonicalizes all
  // finite F64 deltas with f64::total_cmp, then folds them into the prior value.
  const deltas = contributors.map((unit) => 0 - unit.attackDamage).sort((left, right) => left - right);
  const targetVitality = deltas.reduce((value, delta) => value + delta, fixture.target.vitality);
  const accumulatedDamage = fixture.target.vitality - targetVitality;
  const contributorIds = contributors.map((unit) => unit.id).sort();
  const included = new Set(contributorIds);
  return {
    targetVitality,
    actionCooldowns: Object.fromEntries(fixture.units.map((unit) => [
      unit.id,
      included.has(unit.id) ? unit.actionPeriod : unit.actionCooldown,
    ])),
    contributors: contributorIds,
    accumulatedDamage,
  };
}
