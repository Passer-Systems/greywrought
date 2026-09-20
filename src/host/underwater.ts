import { BufferGeometry, CanvasTexture, Float32BufferAttribute, Points, PointsMaterial, type Scene } from 'three';
import type { AdventureSnapshot, Position } from '../game/adventure-types.js';
import { isSubmerged, MAX_BREATH_SECONDS } from '../game/movement.js';
import { lakeWaterAt } from '../game/world-elevation.js';

export function createUnderwater(scene: Scene, host: HTMLElement, canvas: HTMLCanvasElement) {
  const textureCanvas = document.createElement('canvas'); textureCanvas.width = textureCanvas.height = 32;
  const context = textureCanvas.getContext('2d')!;
  const gradient = context.createRadialGradient(16,16,2,16,16,15);
  gradient.addColorStop(0,'rgba(210,245,221,.18)'); gradient.addColorStop(.65,'rgba(210,245,221,.35)');
  gradient.addColorStop(.8,'rgba(210,245,221,.8)'); gradient.addColorStop(1,'rgba(210,245,221,0)');
  context.fillStyle = gradient; context.fillRect(0,0,32,32);
  const texture = new CanvasTexture(textureCanvas);
  const geometry = new BufferGeometry(), positions = new Float32BufferAttribute(new Float32Array(180 * 3),3);
  geometry.setAttribute('position',positions);
  const material = new PointsMaterial({ color:0xb4dfc5, map:texture, size:.07, transparent:true, opacity:.48, depthWrite:false });
  const particles = new Points(geometry,material); particles.name='underwater-motes'; particles.frustumCulled=false; scene.add(particles);
  const bubbleGeometry = new BufferGeometry(), bubblePositions = new Float32BufferAttribute(new Float32Array(18 * 3),3);
  bubbleGeometry.setAttribute('position',bubblePositions);
  const bubbleMaterial = new PointsMaterial({ color:0xc9eee5,map:texture,size:.11,transparent:true,opacity:.65,depthWrite:false });
  const bubbles = new Points(bubbleGeometry,bubbleMaterial); bubbles.name='diver-bubbles'; bubbles.frustumCulled=false; scene.add(bubbles);
  const hud = document.createElement('div'); hud.id='breath-hud'; hud.hidden=true;
  hud.style.cssText='position:absolute;left:50%;bottom:190px;transform:translateX(-50%);width:224px;color:#e0f3df;text-align:center;font:12px Georgia,serif;text-shadow:0 1px 3px #001c21;pointer-events:none;z-index:5';
  const label=document.createElement('div'); label.style.cssText='margin-bottom:4px;letter-spacing:1px';
  const track=document.createElement('div'); track.style.cssText='height:11px;background:#102c30e6;border:1px solid #9c9b70;border-radius:3px;overflow:hidden;box-shadow:0 2px 6px #001719';
  track.id='breath-bar';track.setAttribute('role','progressbar');track.setAttribute('aria-label','Breath');track.setAttribute('aria-valuemin','0');track.setAttribute('aria-valuemax',String(MAX_BREATH_SECONDS));
  const fill=document.createElement('div'); fill.style.cssText='height:100%;background:linear-gradient(#81d4c6,#368684);transform-origin:left';track.append(fill);
  const hint=document.createElement('div');hint.textContent='Ctrl · Dive     Space · Rise';hint.style.cssText='margin-top:6px;font-size:11px;color:#d2ddd1';
  hud.append(label,track,hint);host.append(hud);
  let firstDiveTime: number | undefined;
  return {
    update(time: number, camera: Position, player: AdventureSnapshot['player']) {
      const water=lakeWaterAt(camera.x,camera.z), underwater=water!==null&&camera.y<water-.035;
      const submerged=!player.flight&&isSubmerged(player.position);
      canvas.dataset.underwater=String(underwater);canvas.dataset.submerged=String(submerged);canvas.dataset.breathSeconds=player.breathSeconds.toFixed(2);
      particles.visible=underwater;bubbles.visible=submerged;
      if(underwater){
        for(let i=0;i<180;i++){
          const x=camera.x+((i*7.173+Math.sin(time*.12+i)*.3)%20)-10;
          const z=camera.z+((i*11.371)%20)-10;
          const y=camera.y+((i*3.317+time*.065)%7)-3.5;
          positions.setXYZ(i,x,Math.min(water!-.04,y),z);
        }
        positions.needsUpdate=true;
      }
      if(submerged){
        firstDiveTime??=time;
        for(let i=0;i<18;i++){
          const age=(time*.55+i/18)%1;
          bubblePositions.setXYZ(i,player.position.x+Math.sin(i*8.3+age*5)*(.1+age*.3),Math.min((lakeWaterAt(player.position.x,player.position.z)??0)-.03,player.position.y+1.1+age*2.3),player.position.z+Math.cos(i*3.1+age*4)*.22);
        }
        bubblePositions.needsUpdate=true;
      }
      hud.hidden=Boolean(player.flight)||(!submerged&&player.breathSeconds>=MAX_BREATH_SECONDS);
      const breath=Math.max(0,Math.ceil(player.breathSeconds));
      label.textContent=player.autoSurfacing?'Catching your breath…':`Breath · ${breath}s`;
      track.setAttribute('aria-valuenow',String(breath));fill.style.transform=`scaleX(${player.breathSeconds/MAX_BREATH_SECONDS})`;
      fill.style.background=breath<15?'linear-gradient(#e2c579,#aa8140)':'linear-gradient(#81d4c6,#368684)';
      hint.hidden=firstDiveTime!==undefined&&time-firstDiveTime>22;
    },
    dispose(){ particles.removeFromParent();bubbles.removeFromParent();geometry.dispose();bubbleGeometry.dispose();material.dispose();bubbleMaterial.dispose();texture.dispose();hud.remove(); },
  };
}
