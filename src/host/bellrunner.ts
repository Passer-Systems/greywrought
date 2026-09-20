import { Group, Mesh, MeshStandardMaterial, type Scene } from 'three';
import { prop } from './frostwood-assets.js';
import type { AdventureSnapshot } from '../game/adventure-types.js';
import type { RemotePlayerView } from '../game/multiplayer-types.js';
import { BELLRUNNER_STOPS, bellrunnerDock, bellrunnerStop, nearbyBellrunner, flightDuration, type BellrunnerStopId } from '../game/bellrunner.js';

export function createBellrunnerFleet(scene: Scene) {
  const fleet = new Group(); scene.add(fleet);
  const riders = new Map<string, Group>();
  const moorings = BELLRUNNER_STOPS.map(stop => {
    const root = new Group(), dock = bellrunnerDock(stop.id);
    root.position.set(dock.x,dock.y,dock.z); fleet.add(root);
    return { stop, root };
  });
  let template: Group | null = null, disposed = false;
  const ready = Promise.all([
    prop('Boat',5.4,'width'), prop('AirBalloon',5.5), prop('works/Props_Vessel',1.8), prop('works/Details_Pipes_Long',2), prop('works/Column_1',2.6), prop('Sign_LeftRight',1.7),
  ]).then(([boat,balloon,vessel,pipes,column,sign]) => {
    if (disposed) return;
    template = new Group();
    boat.position.y=-.7; template.add(boat);
    balloon.traverse(object => {
      if (object instanceof Mesh) {
        const material = new MeshStandardMaterial({color:0x656953,roughness:.92,metalness:.1,vertexColors:true});
        object.material = material;
      }
    });
    for (const side of [-1,1]) {
      const bag=balloon.clone(true); bag.scale.set(.58,.62,.9); bag.position.set(side*1.5,2,0); template.add(bag);
      const tank=vessel.clone(true); tank.position.set(side*1.7,-.3,-1.2); tank.scale.setScalar(.7); template.add(tank);
      const pipe=pipes.clone(true); pipe.position.set(side*1.5,.6,0); pipe.rotation.z=side*.17; template.add(pipe);
    }
    for (const {root} of moorings) {
      const post=column.clone(true); post.position.set(2.9,0,0); root.add(post);
      const board=sign.clone(true); board.position.set(2.9,.7,0); root.add(board);
      const skiff=template.clone(true); skiff.position.set(0,.2,0); root.add(skiff);
    }
  });
  return {
    moorings, ready,
    update(player: AdventureSnapshot['player'], others: readonly RemotePlayerView[], elapsed: number) {
      if (!template) return;
      const travellers=[{id:'self',player},...others].filter(entry => entry.player.flight);
      const present=new Set(travellers.map(entry=>entry.id));
      for (const [id,craft] of riders) if (!present.has(id)) { craft.removeFromParent(); riders.delete(id); }
      for (const entry of travellers) {
        let craft=riders.get(entry.id);
        if (!craft) { craft=template.clone(true); fleet.add(craft); riders.set(entry.id,craft); }
        craft.position.set(entry.player.position.x,entry.player.position.y,entry.player.position.z);
        craft.rotation.y=Math.atan2(entry.player.facing.x,entry.player.facing.z);
      }
      for (const {stop,root} of moorings) {
        const skiff=root.children.at(-1)!;
        skiff.visible=!travellers.some(entry => entry.player.flight?.from===stop.id || (entry.player.flight?.to===stop.id && flightDuration(entry.player.flight.from,stop.id)-entry.player.flight.elapsed < 4));
        skiff.position.y=.2+Math.sin(elapsed*1.2)*.12;
      }
    },
    dispose() { disposed=true; riders.clear(); },
  };
}

export function createBellrunnerPanel(host: HTMLElement, fly: (destination: BellrunnerStopId) => void, focus: () => void) {
  const panel=document.createElement('section'); panel.id='bellrunner-panel'; panel.hidden=true;
  panel.innerHTML=`<style>
    #bellrunner-panel {position:absolute;top:18%;left:50%;transform:translateX(-50%);z-index:48;width:min(340px,calc(100% - 24px));border:3px ridge #929580;border-radius:5px;background:#17201bf5;color:#f5e6c8;pointer-events:auto;box-shadow:0 8px 30px #0008;font:var(--ui-font-body)/1.5 system-ui,sans-serif}
    #bellrunner-panel[hidden]{display:none} #bellrunner-panel p {margin:12px 16px} #bellrunner-routes {display:grid;gap:8px;margin:14px} #bellrunner-routes button {padding:12px;color:#ffe6b8;border:2px ridge #938561;background:#594832;cursor:pointer;font:inherit} #bellrunner-routes button:hover {background:#756043}
    #bellrunner-status {position:absolute;top:90px;left:50%;transform:translateX(-50%);padding:6px 14px;background:#15271de8;border:1px solid #809384;color:#e4d8b7;pointer-events:none;z-index:20;font:var(--ui-font-small) system-ui,sans-serif}
  </style><header class="rpg-window-header"><h2 class="rpg-window-title">Bellrunner</h2><button id="bellrunner-close" class="rpg-window-close" type="button" aria-label="Close flights">×</button></header><p>Patched hull. Borrowed breath. Next stop?</p><div id="bellrunner-routes"></div><p>No fare · Keep your hands inside the skiff.</p>`;
  const status=document.createElement('div'); status.id='bellrunner-status'; status.hidden=true;
  host.append(panel,status);
  let origin: BellrunnerStopId | null=null;
  const close=()=>{origin=null;panel.hidden=true;focus()};
  panel.querySelector<HTMLButtonElement>('#bellrunner-close')!.onclick=close;
  return {
    get open() { return !panel.hidden; }, close,
    show(id: BellrunnerStopId) {
      origin=id; panel.hidden=false;
      const routes=panel.querySelector<HTMLElement>('#bellrunner-routes')!; routes.replaceChildren();
      for (const stop of BELLRUNNER_STOPS) if (stop.id!==id) {
        const button=document.createElement('button'); button.type='button'; button.dataset.destination=stop.id;
        button.textContent=`${stop.name} · ${Math.ceil(flightDuration(id,stop.id))} sec`;
        button.onclick=()=>{fly(stop.id);close()}; routes.append(button);
      }
    },
    update(snapshot: AdventureSnapshot) {
      if (origin && (snapshot.player.flight || snapshot.player.inCombat || nearbyBellrunner(snapshot.player.position)?.id!==origin)) close();
      const flight=snapshot.player.flight; status.hidden=!flight;
      if (flight) status.textContent=`Bellrunner → ${bellrunnerStop(flight.to).name} · ${Math.max(1,Math.ceil(flightDuration(flight.from,flight.to)-flight.elapsed))} sec`;
    },
    dispose(){panel.remove();status.remove()},
  };
}
