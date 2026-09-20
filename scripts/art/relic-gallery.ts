import * as T from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

interface Entry { id: string; name: string; role: string; features: string[]; animations: { name: string }[] }
const manifest = await (await fetch("/models/manifest.json")).json() as { models: Entry[] };
const renderer = new T.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x171f23); renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
document.querySelector("main")!.append(renderer.domElement);
const scene = new T.Scene();
scene.add(new T.HemisphereLight(0xe8f1f0, 0x615342, 2.3));
const key = new T.DirectionalLight(0xffddac, 4.2); key.position.set(-3, 7, 5); scene.add(key);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -10, right: 10, top: 8, bottom: -8 });
key.shadow.bias = -.0005;
const rim = new T.DirectionalLight(0x8eb5c8, 2.8); rim.position.set(4, 6, -4); scene.add(rim);
const floor = new T.Mesh(new T.PlaneGeometry(200, 200), new T.MeshStandardMaterial({ color: 0x253036, roughness: 1 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.position.y = -.045; scene.add(floor);
const camera = new T.PerspectiveCamera(36, 1, .05, 150); camera.position.set(7.1, 4.7, 16);
const orbit = new OrbitControls(camera, renderer.domElement); orbit.target.set(0, 1.6, 0); orbit.enableDamping = true; orbit.minDistance = 2; orbit.maxDistance = 25;
const models: { entry: Entry; root: T.Group; mixer: T.AnimationMixer; clips: T.AnimationClip[]; action: T.AnimationAction | undefined }[] = [];
const nav = document.querySelector("nav")!, select = document.querySelector("select")!;
let selected = -1, paused = false;
for (const [i, entry] of manifest.models.entries()) {
  const loaded = await new GLTFLoader().loadAsync(`/models/${entry.id}.glb`);
  const root = loaded.scene;
  root.position.x = (i - 1.5) * 3.05;
  root.traverse(o => { if (o instanceof T.Mesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(root);
  const mixer = new T.AnimationMixer(root), clip = loaded.animations.find(a => a.name === "Idle")!;
  models.push({ entry, root, mixer, clips: loaded.animations, action: mixer.clipAction(clip).play() });
  const button = document.createElement("button"); button.textContent = entry.name; button.onclick = () => focus(i); nav.append(button);
}
function focus(index: number) {
  selected = index;
  const model = models[index];
  models.forEach((m, i) => { m.root.visible = index < 0 || i === index; });
  if (!model) {
    orbit.target.set(0, 1.5, 0); camera.position.set(6, 4.2, 16);
    document.querySelector("h2")!.textContent = "Four machines. Four surviving purposes.";
    document.querySelector("#description")!.textContent = "Orbit to inspect · Scroll to zoom · Select a machine for its animation library";
    select.replaceChildren(new Option("Idle", "Idle"));
  } else {
    orbit.target.set(model.root.position.x, 1.55, 0); camera.position.set(model.root.position.x + 3.3, 2.85, 6.4);
    document.querySelector("h2")!.textContent = model.entry.name;
    document.querySelector("#description")!.textContent = model.entry.role + " " + model.entry.features.join(" · ");
    select.replaceChildren(...model.clips.map(c => new Option(c.name, c.name))); select.value = "Idle";
  }
  play("Idle");
}
function play(name: string) {
  for (const m of models) if (m.root.visible) {
    m.mixer.stopAllAction();
    const clip = m.clips.find(c => c.name === name); if (!clip) continue;
    m.action = m.mixer.clipAction(clip).reset();
    m.action.setLoop(name === "Death" ? T.LoopOnce : T.LoopRepeat, Infinity); m.action.clampWhenFinished = true; m.action.play();
  }
}
select.onchange = () => play(select.value);
document.querySelector<HTMLButtonElement>("#all")!.onclick = () => focus(-1);
document.querySelector<HTMLButtonElement>("#pause")!.onclick = event => { paused = !paused; (event.target as HTMLButtonElement).textContent = paused ? "Resume" : "Pause"; };
const clock = new T.Clock();
function frame() {
  const w = document.querySelector("main")!.clientWidth, h = document.querySelector("main")!.clientHeight;
  if (renderer.domElement.width !== w * renderer.getPixelRatio() || renderer.domElement.height !== h * renderer.getPixelRatio()) {
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  const dt = Math.min(clock.getDelta(), .05);
  if (!paused) models.forEach(m => m.mixer.update(dt));
  orbit.update(); renderer.render(scene, camera); requestAnimationFrame(frame);
}
// Small inspection interface used by the browser asset acceptance check.
Object.assign(window, { relicGallery: { models, focus, play, camera, orbit, renderer, scene,
  pose(name: string, time: number) { paused = true; play(name); models.forEach(m => m.mixer.setTime(time)); scene.updateMatrixWorld(true); },
} });
focus(-1); document.body.dataset.galleryState = "ready"; frame();
