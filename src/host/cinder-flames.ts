import { AdditiveBlending, BufferGeometry, CanvasTexture, Float32BufferAttribute, Group, Points, PointsMaterial, SkinnedMesh, Sprite, SpriteMaterial, Vector3, type Object3D } from 'three';
import type { ForestActor } from './frostwood-assets.js';

/** Socket centers belong to the authored Skull mesh; skin them with the face. */
export function createCinderFlames(actor: ForestActor, scene: Object3D) {
  let skull: SkinnedMesh | undefined;
  actor.model.traverse(object => { if (object instanceof SkinnedMesh) skull ??= object; });
  if (!skull) throw new Error('Cinder Watchman is missing its authored skull skin');
  const mesh = skull;
  const texture = createFlameTexture();
  const material = new SpriteMaterial({ map:texture, transparent:true, depthWrite:false, blending:AdditiveBlending });
  const eyes = new Group(); eyes.name='cinder-socket-flames'; actor.root.add(eyes);
  const position = mesh.geometry.getAttribute('position');
  const sockets = [-1,1].map(side => {
    const center = new Vector3(side*.3286567,.894756,.337381);
    let vertex=0, nearest=Infinity;
    for(let index=0;index<position.count;index++) { const gap=new Vector3().fromBufferAttribute(position,index).distanceToSquared(center); if(gap<nearest){nearest=gap;vertex=index;} }
    const flame = new Sprite(material); flame.name=side<0?'cinder-left-eye':'cinder-right-eye';eyes.add(flame);
    return { vertex, flame, side };
  });
  const trailMaterial = new PointsMaterial({ color:0xff923c,map:texture,size:.16,transparent:true,opacity:.65,depthWrite:false,blending:AdditiveBlending });
  const geometry = new BufferGeometry();const points=new Float32BufferAttribute(new Float32Array(18*3),3);geometry.setAttribute('position',points);
  const trail = new Points(geometry,trailMaterial);trail.name='cinder-ember-trail';trail.frustumCulled=false;scene.add(trail);
  const samples: { position:Vector3; age:number }[]=[];const anchor=new Vector3();let sampleTime=0;
  return {
    update(elapsed:number,delta:number,alive:boolean,moving:boolean) {
      eyes.visible=trail.visible=alive;if(!alive){samples.length=0;return;}
      actor.root.updateWorldMatrix(true,true);mesh.skeleton.update();
      for(const {vertex,flame,side} of sockets) {
        mesh.getVertexPosition(vertex,anchor);anchor.x+=side*.12;anchor.z+=.065;
        mesh.localToWorld(anchor);eyes.worldToLocal(anchor);flame.position.copy(anchor);
        flame.scale.set(.19+.012*Math.sin(elapsed*13+side),.25+.035*Math.sin(elapsed*17+side),1);
        flame.material.rotation=.09*Math.sin(elapsed*9+side);
      }
      for(const sample of samples)sample.age+=delta;
      while(samples[0]&&samples[0].age>.55)samples.shift();
      sampleTime+=delta;
      if(sampleTime>=.035){sampleTime=0;actor.root.getWorldPosition(anchor);anchor.y+=.55;samples.push({position:anchor.clone(),age:0});}
      while(samples.length>18)samples.shift();
      for(let index=0;index<samples.length;index++){const sample=samples[index]!;points.setXYZ(index,sample.position.x+.08*Math.sin(index*2.4+elapsed*7),sample.position.y+sample.age*.45,sample.position.z+.08*Math.cos(index*2.4));}
      points.needsUpdate=true;geometry.setDrawRange(0,samples.length);trailMaterial.opacity=moving?.7:.35;
    },
    dispose(){eyes.removeFromParent();trail.removeFromParent();geometry.dispose();trailMaterial.dispose();material.dispose();texture.dispose();},
  };
}

export function createFlameTexture() {
  const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const glow = context.createRadialGradient(16,43,0,16,38,23);
  glow.addColorStop(0,'#fff4bb'); glow.addColorStop(.25,'#ffd36a'); glow.addColorStop(.55,'#ff7023c0'); glow.addColorStop(1,'#ff310000');
  context.fillStyle=glow; context.beginPath();context.moveTo(16,2);context.bezierCurveTo(12,25,0,35,7,51);context.bezierCurveTo(12,66,31,55,26,42);context.bezierCurveTo(24,29,17,18,16,2);context.fill();
  return new CanvasTexture(canvas);
}
