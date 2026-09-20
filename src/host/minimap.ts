import { Color, DirectionalLight, HemisphereLight, Light, Mesh, Object3D, OrthographicCamera, Scene, ShaderMaterial, SkinnedMesh, Sprite, SRGBColorSpace, WebGLRenderTarget, type Group, type WebGLRenderer } from "three";
import { WORLD_BOUNDS } from "../game/world-layout.js";

const padding = 64;
const bounds = { left: WORLD_BOUNDS.minX - padding, right: WORLD_BOUNDS.maxX + padding, bottom: WORLD_BOUNDS.minZ - padding, top: WORLD_BOUNDS.maxZ + padding };
const width = bounds.right - bounds.left, height = bounds.top - bounds.bottom;

/** Bake the finished scenery once; the HUD only crops this image as the player moves. */
export async function captureMinimap(renderer: WebGLRenderer, terrain: Group, image: HTMLCanvasElement): Promise<void> {
  image.width = 2048;
  image.height = Math.round(image.width * height / width);
  const scene = new Scene();
  scene.background = new Color(0x526342);
  const water = new ShaderMaterial({
    vertexShader: "attribute float waterDepth; varying float depth; void main(){depth=waterDepth;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "varying float depth; void main(){if(depth<=.015)discard;gl_FragColor=vec4(mix(vec3(.20,.45,.46),vec3(.025,.15,.21),1.-exp(-depth*.7)),1.);\n#include <colorspace_fragment>\n}",
  });
  function cloneScenery(source: Object3D): Object3D | null {
    if (source instanceof Light || source instanceof Sprite || source instanceof SkinnedMesh) return null;
    // Reflectors own another camera and target; map water uses only their actual surface geometry.
    const mappedWater = source instanceof Mesh && source.geometry.hasAttribute("waterDepth");
    const copy = mappedWater ? new Mesh(source.geometry, water) : source.clone(false);
    if (mappedWater) { copy.copy(source, false); (copy as Mesh).material = water; }
    copy.onBeforeRender = () => {};
    for (const child of source.children) { const cloned = cloneScenery(child); if (cloned) copy.add(cloned); }
    return copy;
  }
  const scenery = cloneScenery(terrain)!;
  scene.add(scenery, new HemisphereLight(0xdbe5d8, 0x5b6342, 1.8));
  const sun = new DirectionalLight(0xffedcc, 2.5);
  const centerX = (bounds.left + bounds.right) / 2, centerZ = (bounds.top + bounds.bottom) / 2;
  sun.position.set(centerX - 80, 180, centerZ + 95);
  sun.target.position.set(centerX, 0, centerZ);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -220, right: 220, top: 220, bottom: -220, near: 1, far: 500 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = .15;
  sun.shadow.bias = -.0001;
  scene.add(sun, sun.target);
  const camera = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 1, 600);
  camera.position.set(centerX, 300, centerZ);
  camera.up.set(0, 0, -1);
  camera.lookAt(centerX, 0, centerZ);
  const target = new WebGLRenderTarget(image.width, image.height);
  target.texture.colorSpace = SRGBColorSpace;
  const previousTarget = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target);
    await renderer.compileAsync(scene, camera);
    renderer.render(scene, camera);
    const pixels = new Uint8Array(image.width * image.height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, image.width, image.height, pixels);
    const context = image.getContext("2d")!;
    const frame = context.createImageData(image.width, image.height);
    // Readback starts at the lower edge: retaining that order puts world +Z north.
    frame.data.set(pixels);
    context.putImageData(frame, 0, 0);
  } finally {
    renderer.setRenderTarget(previousTarget);
    target.dispose();
    sun.shadow.map?.dispose();
    water.dispose();
  }
}

export function createMinimap(canvas: HTMLCanvasElement) {
  canvas.width = canvas.height = 512;
  const context = canvas.getContext("2d")!;
  const span = 64;
  let atlas: HTMLCanvasElement | null = null;
  let x = 0, z = 0, drawnX = Infinity, drawnZ = Infinity, dirty = true;
  const draw = () => {
    if (!atlas || (!dirty && Math.hypot(x - drawnX, z - drawnZ) < .04)) return;
    context.fillStyle = "#526342";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(atlas, (x - span / 2 - bounds.left) / width * atlas.width, (bounds.top - z - span / 2) / height * atlas.height,
      span / width * atlas.width, span / height * atlas.height, 0, 0, canvas.width, canvas.height);
    canvas.dataset.span = String(span);
    canvas.dataset.centerX = String(x); canvas.dataset.centerZ = String(z);
    canvas.dataset.ready = "true";
    drawnX = x; drawnZ = z; dirty = false;
  };
  return {
    span,
    setAtlas(image: HTMLCanvasElement) { atlas = image; dirty = true; draw(); },
    update(centerX: number, centerZ: number) { x = centerX; z = centerZ; draw(); },
  };
}
