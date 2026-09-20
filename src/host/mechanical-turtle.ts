import { AnimationClip, AnimationMixer, CylinderGeometry, Group, KeyframeTrack, LoopOnce, LoopRepeat, Mesh, MeshBasicMaterial, MeshStandardMaterial, NumberKeyframeTrack, SphereGeometry, type AnimationAction } from "three";
import type { ForestActor } from "./frostwood-assets.js";

export function mechanicalTurtle(): ForestActor {
  const root = new Group();
  const shell = new Mesh(new SphereGeometry(.62, 16, 10), new MeshStandardMaterial({ color: 0x3f5b58, roughness: .72, metalness: .35 }));
  shell.name = "Shell"; shell.scale.set(1.35, .45, 1); shell.position.y = .46; root.add(shell);
  const plateMaterial=new MeshStandardMaterial({color:0x6f8d7d,metalness:.55,roughness:.68,flatShading:true});
  for(const [x,z,r] of [[0,0,.3],[-.34,.04,.22],[.34,.04,.22],[-.17,.32,.19],[.17,.32,.19],[-.17,-.32,.19],[.17,-.32,.19]]){
    const plate=new Mesh(new CylinderGeometry(r!,r!*.94,.065,6),plateMaterial);plate.position.set(x!,.72-Math.hypot(x!,z!)*.18,z!);root.add(plate);
  }
  const head = new Mesh(new SphereGeometry(.22, 12, 8), new MeshStandardMaterial({ color: 0x789b82, roughness: .6, metalness: .18 }));
  head.name = "Head"; head.scale.z = 1.25; head.position.set(0, .43, .68); root.add(head);
  const eyeMaterial = new MeshBasicMaterial({ color: 0xffd34f });
  for (const x of [-.1, .1]) { const eye = new Mesh(new SphereGeometry(.035, 8, 6), eyeMaterial); eye.position.set(x, .53, .84); root.add(eye); }
  const flippers: Mesh[] = [];
  for (const [x, z] of [[-.55, .35], [.55, .35], [-.5, -.35], [.5, -.35]] as const) {
    const flipper = new Mesh(new SphereGeometry(.2, 10, 6), new MeshStandardMaterial({ color: 0x628879, roughness: .7, metalness: .25 }));
    flipper.name = `Flipper${flippers.length}`; flipper.scale.set(1.8, .22, .82); flipper.position.set(x, .22, z); root.add(flipper); flippers.push(flipper);
  }
  const tail = new Mesh(new SphereGeometry(.13, 8, 6), new MeshStandardMaterial({ color: 0x628879, metalness: .25 })); tail.name = "Tail"; tail.scale.z = 1.8; tail.position.set(0, .35, -.7); root.add(tail);
  root.traverse(o=>{if(o instanceof Mesh){o.castShadow=true;o.receiveShadow=true;}});
  const mixer = new AnimationMixer(root);
  const times = [0, .5, 1];
  const idleTracks: KeyframeTrack[] = [new NumberKeyframeTrack(".rotation[y]", times, [0, .08, 0])];
  const walkTracks: KeyframeTrack[] = flippers.map((flipper, i) => new NumberKeyframeTrack(`${flipper.name}.rotation[z]`, times, [0, (i % 2 ? -.55 : .55), 0]));
  const clips = [new AnimationClip("Idle", 1, idleTracks), new AnimationClip("Walk", 1, walkTracks), new AnimationClip("Bite_InPlace", .5, [new NumberKeyframeTrack("Head.rotation[x]", [0, .25, .5], [0, -.3, 0])]), new AnimationClip("HitRecieve", .35, [new NumberKeyframeTrack("Shell.rotation[z]", [0, .17, .35], [0, .18, 0])]), new AnimationClip("Death", .7, [new NumberKeyframeTrack("Shell.rotation[z]", [0, .7], [0, Math.PI / 2])])];
  let action: AnimationAction | null = null;
  const result: ForestActor = { root, model: root, mixer, action, play(name, loop = true, duration, fade = .12) {
    const clip = clips.find(candidate => candidate.name === name); if (!clip) throw Error(`${name} is missing from mechanical turtle`);
    const next = mixer.clipAction(clip); if (action === next && next.isRunning()) return next;
    action?.fadeOut(fade); next.reset().setEffectiveWeight(1).setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1); if (duration) next.setDuration(duration); next.clampWhenFinished = !loop; next.fadeIn(fade).play(); action = next; result.action = next; return next;
  }, dispose() { mixer.stopAllAction(); mixer.uncacheRoot(root); root.traverse(object => { if (object instanceof Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()); } }); } };
  return result;
}
