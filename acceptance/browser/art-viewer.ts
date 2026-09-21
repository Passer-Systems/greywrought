import { Box3, Color, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { actorAssets, actorAssetPath } from '../../src/art/actor-catalog.js';
import { actor } from '../../src/host/frostwood-assets.js';

const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(320, 320);
const scene = new Scene(); scene.background = new Color(0x25383b);
scene.add(new HemisphereLight(0xf6ead2, 0x354e4b, 2.4));
const light = new DirectionalLight(0xffe6b8, 3.5); light.position.set(-3, 5, 5); scene.add(light);
const camera = new PerspectiveCamera(40, 1, .1, 100);
camera.position.set(3, 2, 4); camera.lookAt(0, 1, 0);
const loader = new GLTFLoader();
const results: { name: string; clips: number }[] = [];
function frame(box: Box3) {
  const center = box.getCenter(new Vector3());
  const distance = Math.max(.1, box.getSize(new Vector3()).length()) * 1.5;
  camera.position.copy(center).addScaledVector(new Vector3(.5, .25, 1).normalize(), distance);
  camera.near = distance / 100; camera.far = distance * 10; camera.updateProjectionMatrix();
  camera.lookAt(center);
}
try {
  for (const name of Object.keys(actorAssets)) {
    const gltf = await loader.loadAsync(actorAssetPath(name));
    const instance = await actor(name, 2);
    scene.add(instance.root);
    const poses = new Set<string>();
    for (const clip of gltf.animations) {
      instance.mixer.stopAllAction();
      const action = instance.play(clip.name, false, undefined, 0);
      action.paused = true;
      for (const fraction of [0, .35, .85]) {
        action.time = clip.duration * fraction; instance.mixer.update(0);
        scene.updateMatrixWorld(true);
        const box = new Box3().setFromObject(instance.root, true);
        if (![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)) throw Error(`${name}/${clip.name}: non-finite geometry`);
        frame(box);
        const joints: number[] = [];
        instance.model.traverse(object => { if (object.type === 'Bone') joints.push(...object.matrixWorld.elements); });
        poses.add(joints.map(n => n.toFixed(4)).join(','));
        renderer.render(scene, camera);
        if (renderer.info.render.triangles === 0) throw Error(`${name}/${clip.name}: no visible geometry`);
      }
    }
    if (poses.size < 2) throw Error(`${name}: rig did not animate`);
    const idle = gltf.animations.find(clip => /^(Idle|Flying_Idle|Flying|Dance)$/.test(clip.name)) ?? gltf.animations[0]!;
    instance.mixer.stopAllAction();
    instance.play(idle.name); instance.mixer.update(.1);
    frame(new Box3().setFromObject(instance.root, true));
    renderer.render(scene, camera);
    const card = document.createElement('figure');
    const picture = document.createElement('img'); picture.src = renderer.domElement.toDataURL(); picture.width = picture.height = 240;
    const label = document.createElement('figcaption'); label.textContent = `${name} · ${gltf.animations.length} clips`;
    card.append(picture, label); document.body.append(card);
    results.push({ name, clips: gltf.animations.length });
    instance.root.removeFromParent(); instance.dispose();
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  document.body.dataset.results = JSON.stringify(results);
  document.body.dataset.artState = 'passed';
} finally { renderer.dispose(); }
