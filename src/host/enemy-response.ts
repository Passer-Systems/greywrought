import type { ThreatAbilityView } from "../game/adventure-types.js";

/** Advice describes the attack's rules; the forecast decides whether a route escapes. */
export function enemyResponse(ability: ThreatAbilityView): string {
  switch (ability.id) {
    case "fire-rush": return "The rush path locks before you plan. Step sideways before it launches; stay clear of the burning trail. Defend absorbs rush and fire damage.";
    case "kindle": return "Queue an attack while it powers up. The next volley will be stronger.";
    case "ember-ward":
    case "foreman-shield": return "Let the shield expire. Use Defend or Move while it holds.";
    case "foreman-pulse": return "Defend before the pulse hits. It spreads around the Foreman and ignores cover.";
  }
  const { aim, movement, friendlyFire } = ability.profile;
  switch (aim) {
    case "ground": return movement === "lunge"
      ? "The landing point locks when the leap begins. Move clear after it commits, or lure its charge through another enemy to stagger both."
      : "Stops and commits to the marked area. Move clear before impact or Defend." + (friendlyFire ? " Enemies caught in the area take damage too." : "");
    case "direction": return "The shot flies straight after launch. Step aside after it fires or Defend." + (friendlyFire ? " Another enemy in its path can intercept it." : "");
    case "tracking": return "Follows its target; stepping aside alone will not avoid it. Defend or break its line of sight." + (friendlyFire ? " Another enemy can intercept it." : "");
    case "self": return ability.damage > 0 ? "Strikes around the attacker. Leave its reach or Defend before impact." : "";
  }
}

export function enemyResponseLabel(ability: ThreatAbilityView): string {
  if (ability.damage <= 0) return "";
  if (ability.id === "fire-rush") return "Committed rush";
  switch (ability.profile.aim) {
    case "ground": return "Locks ground";
    case "direction": return "Straight shot";
    case "tracking": return "Tracks target";
    case "self": return "Area pulse";
  }
}

export function enemyTimingLabel(ability: ThreatAbilityView, triggerSeconds: number): string {
  const trigger = triggerSeconds.toFixed(2) + "s";
  const impact = (triggerSeconds + ability.noticeSeconds).toFixed(2) + "s";
  if (ability.damage <= 0) return "at " + trigger;
  if (ability.id === "fire-rush") return "locked · rush " + trigger;
  if (ability.id === "warden-smash") return "locked · hit " + impact;
  if (ability.profile.aim === "ground") return "lock " + trigger + " · hit " + impact;
  if (ability.profile.aim === "direction") return "fires " + trigger;
  return "hit " + impact;
}
