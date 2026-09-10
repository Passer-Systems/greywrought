/** Advice describes the committed attack; it never predicts an unchosen move. */
export function enemyResponse(abilityId: string): string {
  switch (abilityId) {
    case "ember-beam": return "Block the beam. It follows its target.";
    case "fireball": return "Time your Block for impact. Running sideways will not dodge a fireball.";
    case "nest": return "The swarm follows the bee until it strikes. Leave the green area or Block, then retaliate.";
    case "warder": return "Leave the thorn area or Block the lash.";
    case "maul": return "Bait the lunge, move clear of its landing, then counterattack during its recovery.";
    case "kindle": return "Attack while it powers up. The next volley will be stronger.";
    case "ember-ward":
    case "foreman-shield": return "Let the shield expire. Use this opening to heal or power up.";
    case "foreman-pulse": return "Block the pulse. It follows its target.";
    case "foreman-press": return "Move clear of the marked ground before the press lands.";
    default: return "";
  }
}

export function enemyResponseLabel(abilityId: string): string {
  switch (abilityId) {
    case "ember-beam": case "fireball": case "foreman-pulse": return "BLOCK";
    case "nest": case "warder": case "maul": case "foreman-press": return "MOVE";
    default: return "";
  }
}
