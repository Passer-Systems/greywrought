import type { CombatActionTiming } from "./adventure-types.js";

export const COMBAT_TURN = {
  moveStart: .35, moveDuration: 1, actionBefore: 0, actionDuring: .85,
  actionAfter: 1.5, duration: 2.5, waitTick: .25, maxWaitTicks: 4,
} as const;

export function actionTimingOffset(timing: CombatActionTiming, hasMovement: boolean, movementDuration: number = COMBAT_TURN.moveDuration, waitTicks = 0): number {
  if (!hasMovement) return 0;
  const start = COMBAT_TURN.moveStart + waitTicks * COMBAT_TURN.waitTick;
  return timing === "before" ? COMBAT_TURN.actionBefore : timing === "during" ? start : start + movementDuration + .15;
}
