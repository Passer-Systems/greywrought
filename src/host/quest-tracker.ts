import type { AdventureSnapshot } from "../game/adventure-types.js";

export function updateQuestTracker(snapshot: AdventureSnapshot): void {
  const s = snapshot;
  const guardian = s.threats.find(t => t.id === "ritual-guardian");
  const relic = s.loot.find(item => item.kind === "relic" && item.available);
  const complete = s.phase === "town" && s.bankedRelics > 0 && s.ritualCalled && guardian?.health === 0 && !relic;
  const step = complete ? 4 : s.phase === "town" ? 0 : s.carriedRelics > 0 ? 3 : s.ritualCalled ? 2 : s.cargo >= 6 ? 1 : 0;
  const destination = s.places.find(place => place.id === (step === 3 ? "forest-gate" : step === 0 ? "frost-cores" : "ritual-site"));
  const target = step === 2 ? relic?.position ?? guardian?.position : destination?.position;
  let title = "Gather frost cores";
  let detail = s.phase === "town"
    ? "Follow the road north through the gate to the blue crystals. Click the Frost Cores twice, waiting 2 seconds between gathers."
    : "Stand by the blue crystals in the first clearing. Click the Frost Cores to gather 3; wait 2 seconds before gathering again. G also gathers.";
  let warning = s.phase === "town" || s.threats.some(t => t.id === "warder" && t.health > 0)
    ? "Each gather costs 8 health while the Root warder lives. Defeat it deeper in the forest to gather safely."
    : "The Root warder is defeated. Gathering is safe.";
  if (step === 1) {
    title = "Summon the grove guardian";
    detail = "Follow the road north to the Deep Grove. Stand by the shrine and press R to offer 6 cores. Be ready to fight.";
    warning = "Returning to town banks your cores as supplies. Keep all 6 with you for the offering.";
  } else if (step === 2) {
    title = relic ? "Loot the guardian’s relic" : "Defeat the grove guardian";
    detail = relic ? "Approach the fallen guardian, press F to open its loot, then click the Frost relic to take it."
      : "Select the guardian. Read its next attack and queue your attacks and blocks. The relic is on its body.";
    warning = relic ? "The relic is still on the body. Killing the guardian does not collect it."
      : "Offering accepted. Defeat the guardian before heading home.";
  } else if (step === 3) {
    title = "Bring the Frost relic home";
    detail = "Follow the road south through the north gate into Hearthstead. Your relic is secured automatically when you enter town.";
    warning = "Relic in your bag. Return alive to keep it.";
  } else if (complete) {
    title = "Frost relic secured!";
    detail = "You brought the relic home. Rest with Rowan at the inn and buy potions from Mara before another expedition.";
    warning = `${s.bankedRelics} ${s.bankedRelics === 1 ? "relic" : "relics"} secured. Head north to begin another run.`;
  }
  if (s.phase === "lost") {
    title = "Expedition lost";
    detail = "This adventurer has fallen. Choose a new character to attempt the grove again.";
    warning = "Your carried loot was lost.";
  }
  const set = (id: string, value: string) => {
    const node = document.getElementById(id)!;
    if (node.textContent !== value) node.textContent = value;
  };
  set("route-objective", title);
  set("route-detail", detail);
  set("route-warning", warning);
  set("quest-progress", complete ? "COMPLETE" : `STEP ${step + 1} OF 4`);
  const labels = [
    `Gather cores · ${step > 0 ? 6 : Math.min(s.cargo, 6)} / 6`,
    "Offer 6 cores at the Deep Grove",
    "Defeat guardian & loot relic",
    "Return to Hearthstead alive",
  ];
  labels.forEach((label, index) => {
    const row = document.getElementById(`quest-step-${index}`)!;
    const state = index < step ? "done" : index === step ? "current" : "future";
    row.dataset.state = state;
    if (index === step) row.setAttribute("aria-current", "step"); else row.removeAttribute("aria-current");
    set(`quest-step-${index}`, `${index < step ? "✓" : index + 1 + "."} ${label}`);
  });
  let direction = "";
  if (target && !complete && s.phase !== "lost") {
    const dx = target.x - s.player.position.x, dz = target.z - s.player.position.z;
    const distance = Math.hypot(dx, dz);
    const compass = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][(Math.round(Math.atan2(dx, dz) / (Math.PI / 4)) + 8) % 8];
    const name = step === 2 ? relic ? "Guardian’s remains" : "Grove guardian" : destination?.name ?? "";
    direction = `${name} · ${distance <= 3 ? "Nearby" : `${compass} · ${Math.ceil(distance)} m`}`;
  }
  set("quest-destination", direction);
  document.getElementById("quest-destination")!.hidden = !direction;
  document.getElementById("quest-tracker")!.dataset.step = complete ? "complete" : String(step);
  for (const marker of document.querySelectorAll<HTMLElement>("[data-map-place]")) {
    const active = !complete && s.phase !== "lost" && step !== 2 && marker.dataset.mapPlace === destination?.id;
    marker.classList.toggle("quest-destination", active);
  }
  document.querySelector('.map-enemy[data-enemy-id="ritual-guardian"]')?.classList.toggle("quest-destination", step === 2 && s.phase === "expedition");
  set("cargo-summary", `At risk: ${s.cargo} cores · ${s.carriedSalvage} salvage · ${s.carriedRelics} relics`);
}
