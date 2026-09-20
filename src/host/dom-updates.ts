/** Preserve live DOM values without invalidating styles for unchanged HUD data. */
export function setDataset(dataset: DOMStringMap, values: Readonly<Record<string, string>>): void {
  for (const key in values) if (dataset[key] !== values[key]) dataset[key] = values[key];
}

export function setAttribute(node: Element, name: string, value: string): void {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
}

export function setText(node: Node, value: string): void {
  if (node.textContent !== value) node.textContent = value;
}
