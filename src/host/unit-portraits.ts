import { Color, DirectionalLight, HemisphereLight, Mesh, OrthographicCamera, Scene, SRGBColorSpace, WebGLRenderer } from "three";
import { actor } from "./frostwood-assets.js";
import { mechanicalTurtle } from "./mechanical-turtle.js";
import { robotCritter, ROBOT_CRITTER_COLORS } from "./robot-critter.js";

const appearances = [
  ["cave-bat", "Bat"], ["cave-crab", "Crab"],
  ["scout", "Skull"], ["nest", "Armabee"], ["warder", "MushroomKing"],
  ["patrol", "Wolf"], ["ritual-guardian", "Leela"],
  ["lake-dreadnought", "mechanical-turtle"], ["pond-turtle", "mechanical-turtle"], ["pond-turtle-west", "mechanical-turtle"], ["pond-turtle-north", "mechanical-turtle"], ["pond-turtle-south", "mechanical-turtle"], ["meadow-rat", "Rat"], ["meadow-rat-2", "Rat"],
  ["meadow-bird", "Birb"], ["meadow-bird-2", "Birb"], ["meadow-bird-3", "Birb"],
  ['scrap-skitter', 'Crab'], ['rust-skitter', 'Crab'], ['moss-skitter', 'Crab'],
  ['glassmire-lantern', 'Skull'], ['glassmire-stalker', 'Wolf'], ['glassmire-grazer', 'Crab'],
  ['choir-cantor', 'Skull'], ['choir-hound', 'Wolf'], ['choir-sacristan', 'Leela'],
  ['ossuary-king', 'MushroomKing'], ['ossuary-wing', 'Bat'], ['brinewood-bee', 'Armabee'], ['suture-scavenger', 'Crab'],
] as const;

/** One portrait pass; model geometry and textures remain owned by the shared asset cache. */
export async function createUnitPortraits(models: readonly (readonly [string, string])[] = appearances): Promise<ReadonlyMap<string, string>> {
  const portraits = new Map<string, string>();
  const renderer = new WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setSize(128, 128, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene(); scene.background = new Color(0x25383b);
  scene.add(new HemisphereLight(0xf6ead2, 0x354e4b, 2.4));
  const light = new DirectionalLight(0xffe6b8, 3.5); light.position.set(-3, 5, 5); scene.add(light);
  const camera = new OrthographicCamera(-1.03, 1.03, 1.03, -1.03, 0.1, 20);
  camera.position.set(1.4, 1.65, 4); camera.lookAt(0, 1.3, 0);
  try {
    for (const [id, model] of models) {
      const turtle = model === "mechanical-turtle";
      const metal = Object.entries(ROBOT_CRITTER_COLORS).find(([key]) => key === id)?.[1];
      const creature = turtle ? mechanicalTurtle(id === "lake-dreadnought") : metal !== undefined ? await robotCritter(2, metal) : await actor(model, 2);
      if (turtle) { creature.model.scale.setScalar(id === "lake-dreadnought" ? 1.1 : 1.4); creature.model.position.y = .45; }
      try {
        creature.play(model === "Armabee" ? "Flying_Idle" : model === "Birb" ? "Dance" : model === "Bat" ? "Flying" : "Idle");
        creature.mixer.update(0.01);
        creature.model.removeFromParent();
        scene.add(creature.model);
        scene.updateMatrixWorld(true);
        renderer.render(scene, camera);
        portraits.set(id, renderer.domElement.toDataURL("image/png"));
      } finally {
        scene.remove(creature.model);
        creature.dispose();
        if (turtle) continue;
        // Removing the shared model leaves only this instance's contact shadow.
        creature.root.traverse(object => {
          if (!(object instanceof Mesh)) return;
          object.geometry.dispose();
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
            if ("map" in material) material.map?.dispose();
            material.dispose();
          }
        });
      }
    }
    return portraits;
  } finally { renderer.dispose(); renderer.forceContextLoss(); }
}
