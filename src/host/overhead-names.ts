import { Vector3, type Object3D, type PerspectiveCamera } from "three";

type Disposition = "player" | "friendly" | "neutral" | "hostile";

export function createOverheadNames(host: HTMLElement, camera: PerspectiveCamera) {
  const style = document.createElement("style");
  style.textContent = `
    [data-overhead-names] { position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:7; }
    [data-overhead-name] { position:absolute; width:max-content; max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font:600 14px/20px system-ui,sans-serif; text-align:center; transform:translate(-50%,calc(-100% - 4px)); color:#9cefa9; -webkit-text-stroke:3px #10191e; paint-order:stroke fill; text-shadow:0 2px 3px #000; }
    [data-overhead-name][data-disposition="player"] { color:#bac5ff; }
    [data-overhead-name][data-disposition="neutral"] { color:#ffe28a; }
    [data-overhead-name][data-disposition="hostile"] { color:#ff9690; }
  `;
  const root = document.createElement("div");
  root.dataset.overheadNames = "";
  root.setAttribute("aria-hidden", "true");
  host.append(style, root);
  const names = new Map<string, HTMLDivElement>();
  const suppressed = new Set<string>();
  const present = new Set<string>();
  const anchor = new Vector3();
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = "600 14px system-ui";
  const widths = new Map<string, number>();
  const creatures: { element: HTMLDivElement; x: number; y: number; width: number }[] = [];
  return {
    begin() { present.clear(); creatures.length = 0; },
    show(id: string, name: string, actor: Object3D, height: number, disposition: Disposition, alive = true) {
      present.add(id);
      let element = names.get(id);
      if (!element) {
        element = document.createElement("div");
        element.dataset.overheadName = id;
        names.set(id, element); root.append(element);
      }
      if (element.textContent !== name) element.textContent = name;
      element.dataset.disposition = disposition;
      element.hidden = true;
      if (!name || !alive || !actor.visible || suppressed.has(id)) return;
      actor.getWorldPosition(anchor); anchor.y += height; anchor.project(camera);
      if (anchor.z < -1 || anchor.z > 1 || Math.abs(anchor.x) > 1 || Math.abs(anchor.y) > 1) return;
      const x = (anchor.x + 1) * host.clientWidth / 2;
      const y = (1 - anchor.y) * host.clientHeight / 2;
      element.style.left = `${x}px`; element.style.top = `${y}px`;
      element.hidden = y < 24;
      if (!element.hidden && id.startsWith("threat:")) {
        if (!widths.has(name)) widths.set(name, Math.min(240, measure.measureText(name).width));
        creatures.push({ element, x, y, width: widths.get(name)! });
      }
    },
    suppress(id: string, value: boolean) {
      if (value) suppressed.add(id); else suppressed.delete(id);
      const element = names.get(id);
      if (element && value) element.hidden = true;
    },
    end() {
      const placed: typeof creatures = [];
      for (const name of creatures.sort((a, b) => b.y - a.y)) {
        for (const previous of placed) {
          if (Math.abs(name.x - previous.x) < (name.width + previous.width) / 2 + 6 && Math.abs(name.y - previous.y) < 22) name.y = previous.y - 22;
        }
        name.element.style.top = `${name.y}px`;
        name.element.hidden = name.y < 24;
        placed.push(name);
      }
      for (const [id, element] of names) if (!present.has(id)) { element.remove(); names.delete(id); suppressed.delete(id); }
    },
    dispose() { root.remove(); style.remove(); names.clear(); suppressed.clear(); },
  };
}
