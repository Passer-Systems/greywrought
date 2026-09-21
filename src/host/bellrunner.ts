import { Box3, Group, Mesh, MeshStandardMaterial, PointLight, Vector3, type BufferGeometry, type Scene } from 'three';
import { supportHeight } from '../game/movement.js';
import { prop } from './frostwood-assets.js';
import type { AdventureSnapshot } from '../game/adventure-types.js';
import type { RemotePlayerView } from '../game/multiplayer-types.js';
import { BELLRUNNER_STOPS, bellrunnerDock, bellrunnerStop, flightDuration, type BellrunnerStopId } from '../game/bellrunner.js';

export function createBellrunnerFleet(scene: Scene) {
  const fleet = new Group(); scene.add(fleet);
  const riders = new Map<string, Group>();
  const burnerLights = [-1, 1].map(() => {
    const light = new PointLight(0xffa34b, 0, 3, 2); fleet.add(light); return light;
  });
  const flameGeometry: Mesh['geometry'][] = [];
  const envelopeMaterial = new MeshStandardMaterial({color:0x656953,roughness:.92,metalness:.1,vertexColors:true});
  const moorings = BELLRUNNER_STOPS.map(stop => {
    const root = new Group(), dock = bellrunnerDock(stop.id);
    root.position.set(dock.x,dock.y,dock.z); fleet.add(root);
    return { stop, root };
  });
  let template: Group | null = null, disposed = false;
  const bounds = new Box3();
  const groundLift = (id: BellrunnerStopId, turn = 0) => {
    const dock=bellrunnerDock(id), cos=Math.cos(turn), sin=Math.sin(turn);
    let floor=dock.y;
    // Sample the loaded craft's footprint, including its edges, across uneven ground.
    for (let ix=0;ix<=16;ix++) for (let iz=0;iz<=16;iz++) {
      const x=bounds.min.x+(bounds.max.x-bounds.min.x)*ix/16;
      const z=bounds.min.z+(bounds.max.z-bounds.min.z)*iz/16;
      floor=Math.max(floor,supportHeight(dock.x+x*cos+z*sin,dock.z+z*cos-x*sin));
    }
    return floor-dock.y-bounds.min.y+.3;
  };
  const routeLifts = new Map<string,number>();
  const riderLift = (player: AdventureSnapshot['player']) => {
    if (!player.flight || !template) return 0;
    const {from,to,elapsed}=player.flight, duration=flightDuration(from,to);
    const progress=Math.max(0,Math.min(1,(elapsed-4)/(duration-8)));
    const blend=progress*progress*(3-2*progress);
    return (routeLifts.get(from+to) ?? 0)*(1-blend)+(routeLifts.get(to+from) ?? 0)*blend;
  };
  const ready = Promise.all([
    prop('Boat',5.4,'width'), prop('AirBalloon',5.5), prop('works/Props_Vessel',1.8), prop('works/Details_Pipes_Long',2), prop('works/Column_1',2.6), prop('Sign_LeftRight',1.7), prop('WoodenTorch_Fire',1),
  ]).then(([boat,balloon,vessel,pipes,column,sign,torch]) => {
    if (disposed) return;
    template = new Group();
    boat.position.y=-.7; template.add(boat);
    balloon.traverse(object => {
      if (object instanceof Mesh) {
        object.material = envelopeMaterial;
      }
    });
    const flame = new Group(); flame.name='bellrunner-flame';
    torch.traverse(object => {
      if (!(object instanceof Mesh) || !Array.isArray(object.material)) return;
      const materials=object.material;
      const sourceGeometry: BufferGeometry = object.geometry;
      const groups = sourceGeometry.groups.filter(group => materials[group.materialIndex ?? 0]?.name==='Fire');
      if (!groups.length) return;
      // Fire is the torch head; Yellow belongs to a separate ember at its foot.
      const geometry=sourceGeometry.clone(), bounds=new Box3(), vertex=new Vector3();
      geometry.clearGroups();
      const positions=geometry.getAttribute('position');
      for (const group of groups) {
        geometry.addGroup(group.start,group.count,group.materialIndex);
        for (let i=group.start;i<group.start+group.count;i++) bounds.expandByPoint(vertex.fromBufferAttribute(positions,geometry.index?.getX(i) ?? i));
      }
      const center=bounds.getCenter(new Vector3()), scale=.36/(bounds.max.y-bounds.min.y);
      geometry.translate(-center.x,-bounds.min.y,-center.z); geometry.scale(scale,scale,scale);
      flameGeometry.push(geometry); flame.add(new Mesh(geometry,object.material));
    });
    for (const side of [-1,1]) {
      const bag=balloon.clone(true); bag.scale.set(.58,.62,.9); bag.position.set(side*1.5,2,0); template.add(bag);
      const tank=vessel.clone(true); tank.position.set(side*1.7,-.3,-1.2); tank.scale.setScalar(.7); template.add(tank);
      const pipe=pipes.clone(true); pipe.position.set(side*1.5,.6,0); pipe.rotation.z=side*.17; template.add(pipe);
      const burner=flame.clone(true); burner.position.set(side*1.5,2.29,0); template.add(burner);
    }
    bounds.setFromObject(template);
    for (const from of BELLRUNNER_STOPS) for (const to of BELLRUNNER_STOPS) if (from!==to) routeLifts.set(from.id+to.id,groundLift(from.id,Math.atan2(to.x-from.x,to.z-from.z)));
    for (const {root,stop} of moorings) {
      const post=column.clone(true); post.position.set(2.9,0,0); root.add(post);
      const board=sign.clone(true); board.position.set(2.9,.7,0); root.add(board);
      const skiff=template.clone(true); skiff.position.set(0,groundLift(stop.id),0); skiff.userData.groundLift=skiff.position.y; root.add(skiff);
    }
  });
  return {
    moorings, ready, riderLift,
    update(player: AdventureSnapshot['player'], others: readonly RemotePlayerView[], elapsed: number) {
      if (!template) return;
      const travellers=[{id:'self',player},...others].filter(entry => entry.player.flight);
      const present=new Set(travellers.map(entry=>entry.id));
      for (const [id,craft] of riders) if (!present.has(id)) { craft.removeFromParent(); riders.delete(id); }
      for (const entry of travellers) {
        let craft=riders.get(entry.id);
        if (!craft) { craft=template.clone(true); fleet.add(craft); riders.set(entry.id,craft); }
        craft.position.set(entry.player.position.x,entry.player.position.y+riderLift(entry.player),entry.player.position.z);
        craft.rotation.y=Math.atan2(entry.player.facing.x,entry.player.facing.z);
        animateBurners(craft,elapsed,true);
      }
      for (const {stop,root} of moorings) {
        const skiff=root.children.at(-1)!;
        skiff.visible=!travellers.some(entry => entry.player.flight?.from===stop.id || (entry.player.flight?.to===stop.id && flightDuration(entry.player.flight.from,stop.id)-entry.player.flight.elapsed < 4));
        skiff.position.y=skiff.userData.groundLift+Math.sin(elapsed*1.2)*.12;
        if (skiff instanceof Group) animateBurners(skiff,elapsed,false);
      }
      // Two nearby, unshadowed lights bound the cost as the shared fleet grows.
      const distance=(root: Group) => Math.hypot(root.position.x-player.position.x,root.position.y-player.position.y,root.position.z-player.position.z);
      const litCraft=riders.get('self') ?? moorings.reduce((nearest,mooring) =>
        distance(mooring.root) < distance(nearest.root) ? mooring : nearest).root.children.at(-1)!;
      litCraft.updateWorldMatrix(true,false);
      burnerLights.forEach((light,index) => {
        light.position.set(index ? 1.5 : -1.5,2.5,0).applyMatrix4(litCraft.matrixWorld);
        light.intensity=litCraft.visible ? (player.flight ? 3.5 : .5)*(1+Math.sin(elapsed*13+index*2)*.13) : 0;
      });
    },
    dispose() { disposed=true; riders.clear(); fleet.removeFromParent(); envelopeMaterial.dispose(); for (const geometry of flameGeometry) geometry.dispose(); },
  };
}

function animateBurners(craft: Group, elapsed: number, flying: boolean) {
  for (const burner of craft.children) if (burner.name==='bellrunner-flame') {
    const phase=elapsed*11+burner.position.x*2, pulse=1+Math.sin(phase)*.13+Math.sin(phase*1.7)*.07;
    burner.scale.set(flying ? 1 : .6,(flying ? 1 : .35)*pulse,flying ? 1 : .6);
    burner.rotation.z=Math.sin(phase*.7)*.075;
  }
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
      panel.querySelector("h2")!.textContent=`${bellrunnerStop(id).master} · Flight master`;
      const routes=panel.querySelector<HTMLElement>('#bellrunner-routes')!; routes.replaceChildren();
      for (const stop of BELLRUNNER_STOPS) if (stop.id!==id) {
        const button=document.createElement('button'); button.type='button'; button.dataset.destination=stop.id;
        button.textContent=`${stop.name} · ${Math.ceil(flightDuration(id,stop.id))} sec`;
        button.onclick=()=>{fly(stop.id);close()}; routes.append(button);
      }
    },
    update(snapshot: AdventureSnapshot) {
      const master = snapshot.flightMasterOpen;
      if (master && master !== origin) this.show(master);
      else if (origin && !master) { origin=null; panel.hidden=true; }
      const flight=snapshot.player.flight; status.hidden=!flight;
      if (flight) status.textContent=`Bellrunner → ${bellrunnerStop(flight.to).name} · ${Math.max(1,Math.ceil(flightDuration(flight.from,flight.to)-flight.elapsed))} sec`;
    },
    dispose(){panel.remove();status.remove()},
  };
}
