import type { AdventureSnapshot } from "../game/adventure-types.js";

export function createBankPanel(host: HTMLElement, callbacks: {
  onTransfer(operation: "deposit" | "withdraw", kind: "supplies" | "potions", quantity: number): void;
  onClose(): void;
}) {
  const panel = document.createElement("section");
  panel.id = "bank-panel"; panel.hidden = true;
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-labelledby", "bank-title");
  panel.innerHTML = `<style>
    #bank-panel { position:absolute;z-index:44;left:22px;top:16%;width:min(440px,calc(100% - 44px));max-height:calc(84% - 165px);overflow:auto;border:3px ridge #79796f;border-radius:5px;background:linear-gradient(110deg,#242721,#111713 70%);color:#ddd3b9;pointer-events:auto;font:var(--ui-font-body)/1.45 system-ui;box-shadow:0 8px 25px #0009; }
    #bank-panel[hidden] { display:none; }
    #bank-panel header { --window-header-height:44px; }
    #bank-panel p { margin:12px; }
    #bank-panel table { width:calc(100% - 24px);margin:12px;border-collapse:collapse;text-align:left; }
    #bank-panel th,#bank-panel td { padding:6px 3px;border-bottom:1px solid #616653; }
    #bank-panel input { width:68px;background:#111b14;color:#eee2c2;border:1px solid #a39672;padding:5px; }
    #bank-panel button:not(.rpg-window-close) { background:#293425;color:#f0ddb1;border:1px solid #9b8e67;border-radius:3px;padding:6px;cursor:pointer; }
    #bank-panel button:disabled { opacity:.45;cursor:default; }
    #bank-panel .bank-actions { display:flex;gap:6px;justify-content:flex-end; }
    #bank-panel input:focus-visible,#bank-panel button:focus-visible { outline:2px solid #efd286;outline-offset:2px; }
    #bank-report { color:#ead293;min-height:2.9em; }
    #bank-stakes { color:#b9c2ad;font-size:var(--ui-font-small); }
  </style><header class="rpg-window-header"><h2 id="bank-title" class="rpg-window-title">Elian · Bank</h2><button id="bank-close" class="rpg-window-close" type="button" aria-label="Close bank">×</button></header>
  <p>Keep supplies and health potions here between expeditions.</p>
  <table><thead><tr><th scope="col">Goods</th><th scope="col">In bags</th><th scope="col">In bank</th><th scope="col">Quantity</th></tr></thead><tbody></tbody></table>
  <p id="bank-report" role="status"></p><p id="bank-stakes">These goods belong to this character. If this character falls, their bank is lost too.</p>`;
  const rows = (["supplies", "potions"] as const).map(kind => {
    const label = kind === "supplies" ? "Supplies" : "Health potions";
    const row = document.createElement("tr"), actions = document.createElement("tr");
    row.innerHTML = `<th scope="row">${label}</th><td id="bank-bags-${kind}"></td><td id="bank-stored-${kind}"></td><td><input id="bank-quantity-${kind}" type="number" min="1" step="1" value="1" aria-label="${label} quantity"></td>`;
    actions.innerHTML = `<td colspan="4"><div class="bank-actions"><button id="bank-deposit-${kind}" type="button">Deposit ${label.toLowerCase()}</button><button id="bank-withdraw-${kind}" type="button">Withdraw ${label.toLowerCase()}</button></div></td>`;
    panel.querySelector("tbody")!.append(row, actions);
    const input = row.querySelector("input")!;
    const deposit = actions.querySelector<HTMLButtonElement>(`#bank-deposit-${kind}`)!;
    const withdraw = actions.querySelector<HTMLButtonElement>(`#bank-withdraw-${kind}`)!;
    deposit.addEventListener("click", () => callbacks.onTransfer("deposit", kind, input.valueAsNumber));
    withdraw.addEventListener("click", () => callbacks.onTransfer("withdraw", kind, input.valueAsNumber));
    return { kind, input, deposit, withdraw, bags: row.children[1]!, stored: row.children[2]! };
  });
  panel.querySelector("#bank-close")!.addEventListener("click", callbacks.onClose);
  panel.addEventListener("keydown", event => {
    if (event.code !== "Escape") return;
    event.preventDefault(); event.stopPropagation(); callbacks.onClose();
  });
  host.append(panel);
  let current: AdventureSnapshot | undefined;
  function update(snapshot: AdventureSnapshot): void {
    current = snapshot;
    panel.hidden = !snapshot.bankOpen;
    if (!snapshot.bankOpen) return;
    for (const row of rows) {
      const quantity = row.input.valueAsNumber, valid = Number.isSafeInteger(quantity) && quantity > 0;
      row.bags.textContent = String(snapshot[row.kind]); row.stored.textContent = String(snapshot.bank[row.kind]);
      row.deposit.disabled = !valid || quantity > snapshot[row.kind];
      row.withdraw.disabled = !valid || quantity > snapshot.bank[row.kind];
    }
    panel.querySelector("#bank-report")!.textContent = snapshot.report;
  }
  for (const row of rows) row.input.addEventListener("input", () => { if (current) update(current); });
  return { update, dispose() { panel.remove(); } };
}
