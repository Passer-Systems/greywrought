import { startRigSocketLab } from "./rig-socket-lab.js";

void startRigSocketLab().catch((cause: unknown) => {
  document.body.dataset.labState = "failed";
  const status = document.getElementById("animation-status");
  if (status !== null) {
    status.textContent = cause instanceof Error ? cause.message : String(cause);
  }
  throw cause;
});
