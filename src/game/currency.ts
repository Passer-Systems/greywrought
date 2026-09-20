/** Saved balances and prices are whole copper: 100 copper = 1 silver, 100 silver = 1 gold. */
export function formatMoney(copper: number): string {
  const gold = Math.floor(copper / 10_000);
  const silver = Math.floor(copper % 10_000 / 100);
  const remainder = copper % 100;
  return [gold ? `${gold} gold` : "", silver ? `${silver} silver` : "", remainder || !copper ? `${remainder} copper` : ""].filter(Boolean).join(" ");
}
