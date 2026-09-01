export interface BranchExplanationView {
  readonly base: string;
  readonly program: string;
  readonly authority: string;
  readonly activation: string;
  readonly candidate: string;
  readonly disposition: string;
  readonly successor: string;
}

export function createBranchExplanationView(
  base: string,
  program: string,
  authority: string,
  activation: string,
  candidate: string,
  disposition: string,
  successor: string,
): BranchExplanationView {
  return { base, program, authority, activation, candidate, disposition, successor };
}

export function renderBranchExplanation(view: BranchExplanationView): string {
  return `base=${view.base} program=${view.program} authority=${view.authority} activation=${view.activation} candidate=${view.candidate} disposition=${view.disposition} successor=${view.successor}`;
}
