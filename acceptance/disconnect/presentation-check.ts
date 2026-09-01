import {
  createBranchExplanationView,
  renderBranchExplanation,
} from "../../src/host/presentation.js";

const rendered = renderBranchExplanation(
  createBranchExplanationView(
    "state-r0",
    "program-p0",
    "authority-a0",
    "activation-v0",
    "candidate-c0",
    "admitted",
    "state-r1",
  ),
);

const expected =
  "base=state-r0 program=program-p0 authority=authority-a0 activation=activation-v0 candidate=candidate-c0 disposition=admitted successor=state-r1";

if (rendered !== expected) {
  throw new Error("passive explanation projection changed");
}

console.log(rendered);
