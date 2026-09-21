import type { AdventureSnapshot } from '../game/adventure-types.js';

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Remember the attempted turn before sending, including across reconnects or reloads. */
export class AttackAutocast {
  enabled = false;
  private handledTurn: string | null = null;
  private readonly key: string;
  constructor(private readonly characterId: string, private readonly storage?: PreferenceStorage) {
    this.key = `greywrought/attack-autocast-v1/${characterId}`;
    try {
      const saved = JSON.parse(storage?.getItem(this.key) ?? 'null');
      this.enabled = saved?.enabled === true;
      this.handledTurn = typeof saved?.handledTurn === 'string' ? saved.handledTurn : null;
    } catch { /* Storage is optional; the setting still works for this visit. */ }
  }
  private persist(): void {
    try { this.storage?.setItem(this.key, JSON.stringify({ enabled: this.enabled, handledTurn: this.handledTurn })); } catch { /* Keep the current choice in memory. */ }
  }
  toggle(): void { this.enabled = !this.enabled; this.persist(); }
  suppress(snapshot: AdventureSnapshot, encounterId: string): void {
    if (snapshot.combat.phase !== 'preparation') return;
    const turn = `${encounterId}:${snapshot.combat.cycle}`;
    if (this.handledTurn === turn) return;
    this.handledTurn = turn; this.persist();
  }
  takeTarget(snapshot: AdventureSnapshot, encounterId: string, partyIds: readonly string[] = []): string | null {
    if (snapshot.phase !== 'expedition' || !snapshot.player.inCombat || snapshot.combat.phase !== 'preparation') return null;
    if (snapshot.combat.queued.some(entry => entry.action !== 'bait')) { this.suppress(snapshot, encounterId); return null; }
    if (!this.enabled || snapshot.combat.ready || this.handledTurn === `${encounterId}:${snapshot.combat.cycle}`) return null;
    const eligible = snapshot.threats.filter(enemy => enemy.active && enemy.health > 0 && enemy.aggro && enemy.phase !== 'returning' &&
      (encounterId !== 'shared' || enemy.targetPlayerId === this.characterId || partyIds.includes(enemy.targetPlayerId ?? '')));
    const target = eligible.find(enemy => enemy.id === snapshot.selectedThreat) ?? eligible[0];
    if (!target) return null;
    this.suppress(snapshot, encounterId);
    return target.id;
  }
}
