import { Box3, CylinderGeometry, Group, Mesh, MeshStandardMaterial, PointLight, Quaternion, Vector3, type BufferGeometry, type Scene } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { supportHeight } from '../game/movement.js';
import { prop } from './frostwood-assets.js';
import { createTorchFire } from './torch-flame.js';
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
  const riggingMaterials = [
    new MeshStandardMaterial({color:0x66503a,roughness:1}),
    new MeshStandardMaterial({color:0xa08c61,roughness:1}),
    new MeshStandardMaterial({color:0x43463c,roughness:.8,metalness:.55}),
  ];
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
    prop('Boat',5.4,'width'), prop('AirBalloon',5.5), prop('works/Props_Vessel',1.8), prop('works/Column_1',2.6), prop('Sign_LeftRight',1.7),
  ]).then(([boat,balloon,vessel,column,sign]) => {
    if (disposed) return;
    template = new Group();
    boat.position.y=-.7; template.add(boat);
    balloon.traverse(object => {
      if (object instanceof Mesh) {
        object.material = envelopeMaterial;
      }
    });
    const flame = new Group(); flame.name='bellrunner-flame';
    flame.add(createTorchFire(.34, .36));
    const rigging: BufferGeometry[][] = [[],[],[]];
    const spar = (start: number[], end: number[], radius: number, material: number) => {
      const a=new Vector3(...start), b=new Vector3(...end), direction=b.clone().sub(a);
      const geometry=new CylinderGeometry(radius,radius,direction.length(),material===0 ? 4 : 6);
      geometry.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),direction.normalize()));
      geometry.translate(...a.add(b).multiplyScalar(.5).toArray()); rigging[material]!.push(geometry);
    };
    for (const z of [-.8,.8]) spar([-1.85,1.96,z],[1.85,1.96,z],.075,0);
    for (const side of [-1,1]) {
      const bag=balloon.clone(true); bag.scale.set(.58,.62,.9); bag.position.set(side*1.5,2,0); template.add(bag);
      const tank=vessel.clone(true); tank.position.set(side*1.7,-.3,-1.2); tank.scale.setScalar(.7); template.add(tank);
      for (const fore of [-1,1]) {
        spar([side*1.18,.25,fore*1.5],[side*1.5,1.96,fore*.8],.085,0);
        spar([side*1.13,.18,fore*1.52],[side*1.23,.51,fore*1.4],.115,2);
        spar([side*1.5,1.96,fore*.8],[side*1.5,2.51,fore*.46],.045,1);
      }
      spar([side*1.5,1.96,-.86],[side*1.5,1.96,.86],.08,0);
      // Sling follows the authored envelope's vertex rings, outside its front/back surface.
      const rings=[[.824,.511],[1.775,.794],[2.25,1.25],[3.338,1.823],[4.272,1.794],[5.031,1.396],[5.5,.476]];
      for (const fore of [-1,1]) for (let i=1;i<rings.length;i++) {
        const [y0,r0]=rings[i-1]!, [y1,r1]=rings[i]!;
        spar([side*1.5,2+y0!*.62,fore*(r0!*.9+.025)],[side*1.5,2+y1!*.62,fore*(r1!*.9+.025)],.035,1);
      }
      spar([side*1.5,5.435,-.453],[side*1.5,5.435,.453],.035,1);
      spar([side*1.7,.7,-1.2],[side*1.5,1.96,-.8],.035,2);
      spar([side*1.5,1.96,-.8],[side*1.5,2.12,0],.035,2);
      const burner=flame.clone(true); burner.position.set(side*1.493,2.18,-.01); template.add(burner);
    }
    rigging.forEach((parts,index) => {
      const geometry=mergeGeometries(parts)!; parts.forEach(part=>part.dispose()); flameGeometry.push(geometry);
      const mesh=new Mesh(geometry,riggingMaterials[index]); mesh.name='bellrunner-rigging'; mesh.castShadow=true; mesh.receiveShadow=true; template!.add(mesh);
    });
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
        sizeBurners(craft,true);
      }
      for (const {stop,root} of moorings) {
        const skiff=root.children.at(-1)!;
        skiff.visible=!travellers.some(entry => entry.player.flight?.from===stop.id || (entry.player.flight?.to===stop.id && flightDuration(entry.player.flight.from,stop.id)-entry.player.flight.elapsed < 4));
        skiff.position.y=skiff.userData.groundLift+Math.sin(elapsed*1.2)*.12;
        if (skiff instanceof Group) sizeBurners(skiff,false);
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
    dispose() { disposed=true; riders.clear(); fleet.removeFromParent(); envelopeMaterial.dispose(); riggingMaterials.forEach(material=>material.dispose()); for (const geometry of flameGeometry) geometry.dispose(); },
  };
}

function sizeBurners(craft: Group, flying: boolean) {
  for (const burner of craft.children) if (burner.name==='bellrunner-flame') {
    burner.scale.set(flying ? 1 : .6, flying ? 1 : .35, flying ? 1 : .6);
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
