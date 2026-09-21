import type { AdventureSnapshot, CombatForecast, Position } from '../game/adventure-types.js';

export interface MovementPlanPreview {
  readonly destination: Position;
  readonly via: readonly Position[];
  readonly candidate: boolean;
  readonly pending: boolean;
  readonly forecast: CombatForecast | null;
}

export function movementPreviewKey(snapshot: AdventureSnapshot, destination: Position, via: readonly Position[] = [], waitTicks = 0): string {
  const { combat, player, threats } = snapshot;
  const positionKey = (position: Position) => [Math.round(position.x / 2.5), Math.round(position.z / 2.5)];
  return JSON.stringify([destination, via, waitTicks, combat.cycle, combat.queued, combat.availableStamina, combat.sprinting,
    player.position, player.health, player.stamina, player.archetype,
    // Preparation broadcasts update continuously while enemies finish their
    // opening approach. Those transient coordinates must not restart an
    // identical preview; only state that changes the simulated turn belongs
    // in the request key.
    threats.map(t => [t.id, t.health, t.active, t.aggro, t.aggro ? positionKey(t.position) : null, t.joinsNextWindow, t.windowAction, t.targetPlayerId, t.block,
      t.fireballs.map(ball => [ball.id, ball.remainingSeconds])]),
    combat.forecast?.outcomes,
    combat.forecast?.paths.map(({ beat, ...path }) => path),
    combat.forecast?.events.map(({ time, ...event }) => event)]);
}

export function createMovementPreview(request: (destination: Position, via: readonly Position[], waitTicks: number) => Promise<CombatForecast | null>) {
  let key = '', generation = 0, forecast: CombatForecast | null = null, pending = false;
  return {
    get forecast() { return forecast; },
    get pending() { return pending; },
    update(snapshot: AdventureSnapshot, destination: Position | null, via: readonly Position[] = [], waitTicks = 0) {
      const next = destination && snapshot.combat.phase === 'preparation' && !snapshot.combat.ready ? movementPreviewKey(snapshot, destination, via, waitTicks) : '';
      if (next === key) return;
      key = next; const revision = ++generation; forecast = null; pending = Boolean(next);
      if (!next || !destination) return;
      void request(destination, via, waitTicks).then(result => {
        if (generation !== revision) return;
        forecast = result; pending = false;
      }).catch(() => { if (generation === revision) pending = false; });
    },
    clear() { key = ''; generation++; forecast = null; pending = false; },
  };
}
