/** Advice describes the committed attack; it never predicts an unchosen move. */
export function enemyResponse(abilityId: string): string {
  switch (abilityId) {
    case "ember-beam": return "Plan Block on the beam’s beat. It follows its target.";
    case "fireball": return "Plan Block for impact, 0.9 seconds after launch. Fireballs follow their target.";
    case "nest": return "Plan a retreat from the swarm or Block its impact.";
    case "warder": return "Plan a retreat from the thorns or Block the lash.";
    case "maul": return "Plan Disengage or Block on the Maul beat.";
    case "kindle": return "Attack while it powers up. The next volley will be stronger.";
    case "ember-ward":
    case "foreman-shield": return "Let the shield expire. Use this opening to heal or power up.";
    case "foreman-pulse": return "Plan Block on the pulse’s beat. It follows its target.";
    case "foreman-press": return "Plan a retreat or Block before the press lands.";
    default: return "";
  }
}

export function enemyResponseLabel(abilityId: string): string {
  switch (abilityId) {
    case "ember-beam": case "fireball": case "foreman-pulse": return "BLOCK";
    case "nest": case "warder": case "maul": case "foreman-press": return "RETREAT";
    default: return "";
  }
}
