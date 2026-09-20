import type { CombatActionTiming } from "./adventure-types.js";

export const COMBAT_TURN = {
  moveStart: .35, moveDuration: 1, actionBefore: 0, actionDuring: .85,
  actionAfter: 1.5, duration: 2.5,
} as const;

export function actionTimingOffset(timing: CombatActionTiming, hasMovement: boolean): number {
  if (!hasMovement) return 0;
  return timing === "before" ? COMBAT_TURN.actionBefore : timing === "during" ? COMBAT_TURN.actionDuring : COMBAT_TURN.actionAfter;
}
