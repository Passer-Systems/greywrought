/** Advice describes the committed attack; it never predicts an unchosen move. */
export function enemyResponse(abilityId: string): string {
  switch (abilityId) {
    case "ember-beam": return "Defend before the beam fires. It follows its target.";
    case "fireball": return "Bait the fireball through another enemy or a spilled swarm. Block covers its delayed impact.";
    case "nest": return "Interrupt this bee with a collision to spill its swarm. A fireball can ignite the spill.";
    case "warder": return "Plan a retreat from the blade or Block the cleave.";
    case "maul": return "Bait the charge through another enemy. Their collision staggers both and can interrupt attacks.";
    case "kindle": return "Queue an attack while it powers up. The next volley will be stronger.";
    case "ember-ward":
    case "foreman-shield": return "Let the shield expire. Use Defend or Move while it holds.";
    case "foreman-pulse": return "Defend before the pulse hits. It follows its target.";
    case "foreman-press": return "Plan a retreat or Block before the press lands.";
    default: return "";
  }
}

export function enemyResponseLabel(abilityId: string): string {
  switch (abilityId) {
    case "fireball": case "maul": case "nest": return "TURN IT AGAINST THEM";
    case "ember-beam": case "foreman-pulse": return "BLOCK";
    case "warder": case "foreman-press": return "RETREAT";
    default: return "";
  }
}
