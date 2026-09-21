import { EXPANDED_WORLD_BOUNDS as bounds, WORLD_REGIONS, WORLD_SETTLEMENTS, REGION_ROADS, REGION_LANDMARKS } from '../game/world-regions.js';
import { dryOverworldHeight, LAKE_CENTER, LAKE_RADIUS, lakeBoundary, STREAM_POINTS } from '../game/world-elevation.js';
import { CAVE_ENTRANCE } from '../game/cave-layout.js';
import { YARD } from '../game/yard-content.js';
import type { AdventureSnapshot } from '../game/adventure-types.js';
import type { RemotePlayerView } from '../game/multiplayer-types.js';
import { BELLRUNNER_STOPS, flightDuration, flightPosition } from '../game/bellrunner.js';

const width = bounds.maxX - bounds.minX, height = bounds.maxZ - bounds.minZ;
const px = (x: number) => (bounds.maxX - x) / width * 100;
const pz = (z: number) => (bounds.maxZ - z) / height * 100;
const points = [
  { id: 'yard', name: YARD.settlement, x: 0, z: -8, kind: 'town', description: 'A safe haven. Trade, rest and prepare for the road.' },
  { id: 'engine', name: YARD.works, x: 2, z: 60, kind: 'danger', description: 'The old works beyond the north gate.' },
  { id: 'cave', name: 'Hollowdeep Cave', ...CAVE_ENTRANCE, kind: 'danger', description: 'A dark passage below the eastern hills.' },
  ...WORLD_SETTLEMENTS.map(town => ({ ...town, kind: 'town' })), ...REGION_LANDMARKS,
];
const css = `
#world-map-panel{pointer-events:auto;padding:0;width:min(960px,96vw);max-width:96vw;max-height:96dvh;border:2px solid #614a30;border-radius:5px;background:#dbc397;color:#382b1e;box-shadow:0 15px 70px #000b;font-family:Georgia,serif;overflow:auto;opacity:.92}
#world-map-panel::backdrop{background:#0e141b14}
#world-map-panel header{display:flex;align-items:center;justify-content:space-between;padding:10px 18px;border-bottom:1px solid #715b3c66;background:#b89a6844}
#world-map-panel h2{font-size:22px;margin:0;font-weight:normal;letter-spacing:2px}
#world-map-panel header small{font:10px sans-serif;letter-spacing:3px;text-transform:uppercase}
#world-map-panel button{cursor:pointer;color:#382b1e;background:#e9d7b5;border:1px solid #715b3c;border-radius:3px;padding:5px 10px;font:13px Georgia,serif}
#world-map-panel button:focus-visible{outline:3px solid #287584;outline-offset:3px}
#world-map-sheet{position:relative;width:min(100%,72dvh * ${width / height});aspect-ratio:${width}/${height};margin:auto;isolation:isolate;overflow:hidden;background:#dfc99f;cursor:crosshair}
#world-map-sheet canvas{width:100%;height:100%;display:block;pointer-events:none}
#world-map-sheet .atlas-point{position:absolute;transform:translate(-50%,-50%);width:23px;height:23px;border:0;background:transparent;padding:0;font-size:22px;line-height:23px;text-shadow:0 0 3px #fff1cd,0 0 3px #fff1cd;z-index:2}
#world-map-sheet .atlas-point[data-kind=danger]{color:#773c2c}
#world-map-sheet .atlas-point[data-kind=natural]{color:#365f56}
#world-map-sheet .atlas-point:hover,#world-map-sheet .atlas-point:focus-visible{background:#f4e1b9;z-index:4}
#world-map-player,#world-map-waypoint,.atlas-party{position:absolute;transform:translate(-50%,-50%);pointer-events:none;z-index:5}
#world-map-player{width:19px;height:24px;filter:drop-shadow(0 1px 2px #382b1e)}
#world-map-waypoint{color:#a82f25;font:28px serif;text-shadow:0 0 3px #fff}
.atlas-party{color:#38859c;font-size:20px;text-shadow:0 0 2px #fff}
#world-map-panel footer{padding:9px 16px;border-top:1px solid #715b3c66;display:flex;gap:10px;align-items:center;justify-content:space-between;min-height:44px}
#world-map-detail{font-size:13px;line-height:1.4;margin:0;max-width:75ch}
#world-map-detail strong{display:block;font-size:15px}
#world-map-panel .atlas-hint{font:11px sans-serif;opacity:.8;margin:0 16px 9px}
#map-waypoint{position:absolute;z-index:6;color:#f0b452;font-size:21px;transform:translate(-50%,-50%);pointer-events:none;text-shadow:0 1px 3px #000}
.map-party{position:absolute;z-index:4;width:16px;height:20px;pointer-events:none;filter:drop-shadow(0 1px 2px #000)}
.map-party svg{display:block;width:100%;height:100%}
#world-waypoint-guide{position:absolute;top:18px;left:50%;transform:translateX(-50%);padding:6px 12px;border-radius:3px;background:#171a17c9;color:#f0d399;font:13px Georgia,serif;pointer-events:none}
#world-map-open svg{width:28px;height:28px;fill:none;stroke:currentColor;stroke-width:1.5;color:#d3bf91}
@media(max-width:600px){#world-map-panel h2{font-size:17px}#world-map-panel header{padding:8px 12px}#world-map-panel footer{padding:8px}#world-map-detail{font-size:12px}#world-map-sheet .atlas-point{font-size:19px}}
`;

/** The paper and terrain are drawn once, independently of live markers. */
function paint(canvas: HTMLCanvasElement) {
  canvas.width = 1200; canvas.height = Math.round(1200 * height / width);
  const c = canvas.getContext('2d')!, scale = canvas.width / width;
  const X = (x: number) => px(x) * canvas.width / 100, Z = (z: number) => pz(z) * canvas.height / 100;
  c.fillStyle = '#dec89e'; c.fillRect(0, 0, canvas.width, canvas.height);
  for (const region of WORLD_REGIONS) {
    const gradient = c.createRadialGradient(X(region.x), Z(region.z), 0, X(region.x), Z(region.z), region.radius * scale * 1.5);
    gradient.addColorStop(0, region.color + '80'); gradient.addColorStop(1, region.color + '00');
    c.fillStyle = gradient; c.fillRect(0, 0, canvas.width, canvas.height);
  }
  let seed = 741;
  const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 6500; i++) {
    c.fillStyle = `rgba(88,64,33,${random() * .035})`; c.beginPath();
    c.ellipse(random() * canvas.width, random() * canvas.height, 1 + random() * 18, 1 + random() * 10, random() * 3, 0, Math.PI * 2); c.fill();
  }
  // Hachures follow the true elevation gradient; no mountain is invented for decoration.
  for (let z = bounds.minZ + 3; z < bounds.maxZ; z += 3) for (let x = bounds.minX + 3; x < bounds.maxX; x += 3) {
    const h = dryOverworldHeight(x,z), dx = dryOverworldHeight(x + 1,z) - h, dz = dryOverworldHeight(x,z + 1) - h;
    const slope = Math.hypot(dx,dz);
    if (h < 5 || slope < .15) continue;
    c.strokeStyle = `rgba(77,61,42,${Math.min(.34,.06 + slope * .17)})`; c.lineWidth = .85;
    const length = Math.min(3.4, slope * 3);
    c.beginPath(); c.moveTo(X(x),Z(z)); c.lineTo(X(x + dx / slope * length),Z(z + dz / slope * length)); c.stroke();
  }
  c.fillStyle = '#79a2a0'; c.strokeStyle = '#4f7472'; c.lineWidth = 2; c.beginPath();
  for (let i = 0; i <= 160; i++) { const a = i / 160 * Math.PI * 2, r = lakeBoundary(a), x = X(LAKE_CENTER.x + Math.cos(a) * LAKE_RADIUS.x * r), z = Z(LAKE_CENTER.z + Math.sin(a) * LAKE_RADIUS.z * r); if (!i) c.moveTo(x,z); else c.lineTo(x,z); }
  c.closePath(); c.fill(); c.stroke();
  c.lineWidth = 3; c.beginPath(); STREAM_POINTS.forEach((p,i) => { if (!i) c.moveTo(X(p.x),Z(p.z)); else c.lineTo(X(p.x),Z(p.z)); }); c.stroke();
  const roads = [...REGION_ROADS, {name:'North road', points:[[0,-43],[0,0],[0,66]]}];
  for (const road of roads) {
    c.beginPath(); road.points.forEach((p,i) => { if (!i) c.moveTo(X(p[0]!),Z(p[1]!)); else c.lineTo(X(p[0]!),Z(p[1]!)); });
    c.strokeStyle = '#eddbb4'; c.lineWidth = 6; c.setLineDash([]); c.stroke();
    c.strokeStyle = '#8a6841'; c.lineWidth = 1.6; c.setLineDash([4,4]); c.stroke();
  }
  c.setLineDash([]); c.textAlign = 'center';
  c.strokeStyle = '#457f78'; c.lineWidth = 1.8; c.setLineDash([2,6]);
  for (let from=0;from<BELLRUNNER_STOPS.length;from++) for(let to=from+1;to<BELLRUNNER_STOPS.length;to++) {
    const a=BELLRUNNER_STOPS[from]!,b=BELLRUNNER_STOPS[to]!;
    c.beginPath();
    for(let i=0;i<=32;i++) {
      const p=flightPosition({from:a.id,to:b.id,elapsed:flightDuration(a.id,b.id)*i/32});
      if(i===0)c.moveTo(X(p.x),Z(p.z));else c.lineTo(X(p.x),Z(p.z));
    }
    c.stroke();
  }
  c.setLineDash([]);
  const label = (text: string, x: number, z: number, font: string, color = '#483c2a') => {
    c.font = font; c.lineWidth = 5; c.strokeStyle = '#dfc99f'; c.strokeText(text,X(x),Z(z)); c.fillStyle = color; c.fillText(text,X(x),Z(z));
  };
  for (const region of WORLD_REGIONS) label(region.name.toUpperCase(), region.x, region.z + (region.id === 'ossuary' ? 22 : 29), 'small-caps 22px Georgia');
  for (const point of points) label(point.name,point.x,point.z - 11,'18px Georgia');
  label('Stillwater', LAKE_CENTER.x, LAKE_CENTER.z, 'italic 20px Georgia', '#264e54');
  // A neatline and restrained compass keep the atlas readable at its smallest size.
  c.strokeStyle = '#775d3c88'; c.lineWidth = 1; c.strokeRect(12,12,canvas.width-24,canvas.height-24); c.strokeRect(17,17,canvas.width-34,canvas.height-34);
  const cx = canvas.width - 64, cy = canvas.height - 75;
  c.fillStyle = '#665135'; c.font = '19px Georgia'; c.fillText('N',cx,cy-31);
  c.beginPath(); c.moveTo(cx,cy-24); c.lineTo(cx+9,cy+16); c.lineTo(cx,cy+8); c.lineTo(cx-9,cy+16); c.closePath(); c.stroke();
  c.beginPath(); c.moveTo(cx,cy-24); c.lineTo(cx,cy+8); c.lineTo(cx-9,cy+16); c.closePath(); c.fill();
  c.font = '14px Georgia'; c.textAlign = 'left'; c.fillText('50 paces',35,canvas.height-45); c.beginPath(); c.moveTo(35,canvas.height-35); c.lineTo(35+50*scale,canvas.height-35); c.stroke();
}

export function createWorldMap(hud: HTMLElement, trigger: HTMLButtonElement, onOpen: () => void, onClose: () => void) {
  const style = document.createElement('style'); style.textContent = css; document.head.append(style);
  const panel = document.createElement('dialog'); panel.id = 'world-map-panel'; panel.setAttribute('aria-labelledby','world-map-title');
  panel.innerHTML = `<header><div><small>A traveller’s atlas</small><h2 id="world-map-title">The Greywrought Marches</h2></div><button type="button" id="world-map-close" aria-label="Close world map">×</button></header><div id="world-map-sheet"><canvas aria-hidden="true"></canvas><svg id="world-map-player" viewBox="0 0 24 28" aria-label="Your position" role="img"><path d="M12 2 22 25 12 20 2 25Z" fill="#fff6cf" stroke="#493b26" stroke-width="2"/><path d="M12 5 12 19 5 22Z" fill="#c59b38"/></svg><span id="world-map-waypoint" hidden>⚑</span></div><footer><p id="world-map-detail">Select a place to mark your route.</p><button type="button" id="world-map-clear" hidden>Clear mark</button></footer><p class="atlas-hint">Dotted teal routes: Bellrunner flights · Click to mark a destination · M or Esc to return</p>`;
  hud.append(panel);
  const sheet = panel.querySelector<HTMLElement>('#world-map-sheet')!, player = panel.querySelector<SVGElement>('#world-map-player')!, flag = panel.querySelector<HTMLElement>('#world-map-waypoint')!, detail = panel.querySelector<HTMLElement>('#world-map-detail')!, clear = panel.querySelector<HTMLButtonElement>('#world-map-clear')!;
  const mini = document.createElement('span'); mini.id = 'map-waypoint'; mini.textContent = '⚑'; mini.hidden = true; document.querySelector('#map-field')!.append(mini);
  const guide = document.createElement('div'); guide.id = 'world-waypoint-guide'; guide.hidden = true; hud.append(guide);
  let ready = false, waypoint: {x:number;z:number;name:string} | null = null;
  let last: AdventureSnapshot['player'] | null = null, hover = false;
  const locate = (node: HTMLElement | SVGElement, x: number, z: number) => { node.style.left = `${px(x)}%`; node.style.top = `${pz(z)}%`; };
  const showDetail = (name: string, description: string) => { const title = document.createElement('strong'); title.textContent = name; detail.replaceChildren(title, document.createTextNode(description)); };
  const mark = (x: number, z: number, name: string) => { waypoint = {x,z,name}; locate(flag,x,z); flag.hidden = clear.hidden = guide.hidden = false; panel.dataset.waypointX = String(x); panel.dataset.waypointZ = String(z); if(last) update(last); };
  for (const point of points) {
    const marker = document.createElement('button'); marker.type = 'button'; marker.className = 'atlas-point'; marker.dataset.place = point.id; marker.dataset.kind = point.kind; marker.title = `${point.name} — ${point.description}`; marker.setAttribute('aria-label', `Mark ${point.name}`); marker.textContent = point.kind === 'town' ? '⌂' : point.kind === 'danger' ? '▲' : point.kind === 'relic' ? '✧' : '❖'; locate(marker,point.x,point.z);
    const inspect = () => { hover = true; showDetail(point.name,point.description + (point.kind === 'town' ? ' Bellrunner flights connect all three towns.' : '')); }; const leave = () => { hover = false; if(last) update(last); };
    marker.addEventListener('pointerenter',inspect); marker.addEventListener('focus',inspect); marker.addEventListener('pointerleave',leave); marker.addEventListener('blur',leave);
    marker.addEventListener('click',event => { event.stopPropagation(); mark(point.x,point.z,point.name); }); sheet.append(marker);
  }
  sheet.addEventListener('click', event => { const rect = sheet.getBoundingClientRect(); mark(bounds.maxX - (event.clientX - rect.left)/rect.width*width, bounds.maxZ - (event.clientY - rect.top)/rect.height*height, 'Your destination'); });
  clear.addEventListener('click', () => { waypoint = null; flag.hidden = clear.hidden = mini.hidden = guide.hidden = true; delete panel.dataset.waypointX; delete panel.dataset.waypointZ; detail.textContent = 'Select a place to mark your route.'; });
  const close = () => { if (!panel.open) return; panel.close(); trigger.setAttribute('aria-expanded','false'); onClose(); };
  panel.querySelector('#world-map-close')!.addEventListener('click', close);
  panel.addEventListener('cancel',event => { event.preventDefault(); close(); });
  const partyMarkers = new Map<string,HTMLElement>();
  function update(state: AdventureSnapshot['player'], party: readonly RemotePlayerView[] = []) {
    last = state;
    if (panel.open) {
      locate(player,state.position.x,state.position.z); player.style.transform = `translate(-50%,-50%) rotate(${Math.atan2(-state.cameraForward.x,state.cameraForward.z)}rad)`;
      player.dataset.worldX = String(state.position.x); player.dataset.worldZ = String(state.position.z);
      for (const [id,node] of partyMarkers) if (!party.some(p => p.id === id)) { node.remove(); partyMarkers.delete(id); }
      for (const member of party) { let node = partyMarkers.get(member.id); if (!node) { node = document.createElement('span'); node.className = 'atlas-party'; node.textContent = '●'; node.title = member.name; sheet.append(node); partyMarkers.set(member.id,node); } locate(node,member.player.position.x,member.player.position.z); }
    }
    if (!waypoint) return;
    const dx = waypoint.x-state.position.x, dz = waypoint.z-state.position.z;
    const direction = ['N','NE','E','SE','S','SW','W','NW'][(Math.round(Math.atan2(-dx,dz)/(Math.PI/4))+8)%8];
    const message = `${waypoint.name} · ${Math.round(Math.hypot(dx,dz))} paces ${direction}`;
    if(guide.textContent !== message) guide.textContent = message;
    if(panel.open && !hover && detail.textContent !== message) detail.textContent = message;
    mini.hidden = Math.abs(dx)>31 || Math.abs(dz)>31; mini.style.left = `${50-dx/64*100}%`; mini.style.top = `${50-dz/64*100}%`;
  }
  return { update, close, get isOpen() { return panel.open; }, toggle() {
    if(panel.open) { close(); return; } onOpen();
    if(!ready) { paint(sheet.querySelector('canvas')!); ready = true; panel.dataset.ready = 'true'; }
    panel.showModal(); trigger.setAttribute('aria-expanded','true'); if(last) update(last);
  }, dispose() { panel.remove(); mini.remove(); guide.remove(); style.remove(); } };
}
