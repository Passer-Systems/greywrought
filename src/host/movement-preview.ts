import type { AdventureSnapshot, CombatForecast, Position } from '../game/adventure-types.js';

export function movementPreviewKey(snapshot: AdventureSnapshot, destination: Position): string {
  const { combat, player, threats } = snapshot;
  return JSON.stringify([destination, combat.cycle, combat.queued, combat.availableStamina,
    player.position, player.health, player.stamina, player.archetype,
    threats.map(t => [t.id, t.position, t.health, t.active, t.aggro, t.joinsNextWindow, t.windowAction, t.targetPlayerId, t.targetPosition, t.block, t.fireballs]),
    combat.forecast?.outcomes,
    combat.forecast?.paths.map(({ beat, ...path }) => path),
    combat.forecast?.events.map(({ time, ...event }) => event)]);
}

export function createMovementPreview(request: (destination: Position) => Promise<CombatForecast | null>) {
  let key = '', generation = 0, forecast: CombatForecast | null = null, pending = false;
  return {
    get forecast() { return forecast; },
    get pending() { return pending; },
    update(snapshot: AdventureSnapshot, destination: Position | null) {
      const next = destination && snapshot.combat.phase === 'preparation' && !snapshot.combat.ready ? movementPreviewKey(snapshot, destination) : '';
      if (next === key) return;
      key = next; const revision = ++generation; forecast = null; pending = Boolean(next);
      if (!next || !destination) return;
      void request(destination).then(result => {
        if (generation !== revision) return;
        forecast = result; pending = false;
      }).catch(() => { if (generation === revision) pending = false; });
    },
    clear() { key = ''; generation++; forecast = null; pending = false; },
  };
}
