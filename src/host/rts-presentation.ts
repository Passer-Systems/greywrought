import {
  AmbientLight,
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  FogExp2,
  Group,
  MathUtils,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
} from "three";
import {
  createQuaterniusBattlefield,
  loadQuaterniusUnitModel,
  type QuaterniusUnitModel,
} from "./rts-quaternius.js";

export type UnitClass = "Warrior" | "Artificer" | "Rogue" | "Priest" | "Ranger";

export interface UnitView {
  readonly id: string;
  readonly name: string;
  readonly unitClass: UnitClass;
  readonly x: number;
  readonly z: number;
  readonly selected: boolean;
  readonly moving: boolean;
  readonly alive: boolean;
  readonly targeted: boolean;
  readonly healthFraction: number;
}

export type EncounterKind = UnitClass | "Cinder" | "Moonwell";

export interface EncounterActorView {
  readonly id: string;
  readonly kind: EncounterKind;
  readonly x: number;
  readonly z: number;
  readonly alive: boolean;
  readonly targeted: boolean;
  readonly healthFraction: number;
}

export interface ObstacleView {
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

interface UnitFigure {
  readonly root: Group;
  readonly placeholder: Group;
  readonly selectionRing: Mesh;
  readonly target: Vector3;
  model: QuaterniusUnitModel | null;
  moving: boolean;
}

export interface RtsPresentation {
  readonly canvas: HTMLCanvasElement;
  applyUnits(units: readonly UnitView[]): void;
  applyEncounterActors(actors: readonly EncounterActorView[]): void;
  applyObstacles(obstacles: readonly ObstacleView[]): void;
  pickActor(clientX: number, clientY: number): string | null;
  unitsInScreenRectangle(left: number, top: number, right: number, bottom: number): string[];
  groundPoint(clientX: number, clientY: number): Vector3 | null;
  showMoveDestination(point: Vector3): void;
  setPointer(clientX: number, clientY: number, inside: boolean): void;
  setPanKey(code: string, down: boolean): void;
  zoom(deltaY: number): void;
  start(): void;
  dispose(): void;
}

const classColors: Readonly<Record<UnitClass, number>> = {
  Warrior: 0x9f3028,
  Artificer: 0xb57a27,
  Rogue: 0x39313f,
  Priest: 0xe0d7b8,
  Ranger: 0x4d7134,
};

function material(color: number, roughness = 0.72, metalness = 0.08): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness, metalness });
}

function addMesh(
  owner: Group,
  geometry: BufferGeometry,
  surface: Material,
  position: readonly [number, number, number],
  scale: readonly [number, number, number] = [1, 1, 1],
): Mesh {
  const mesh = new Mesh(geometry, surface);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  owner.add(mesh);
  return mesh;
}

function createFigure(unitClass: UnitClass): UnitFigure {
  const root = new Group();
  const cloth = material(classColors[unitClass]);
  const dark = material(0x201d1a);
  const skin = material(0xb98062);
  const steel = material(0x8e9696, 0.35, 0.72);
  const gold = material(0xc3963d, 0.4, 0.58);
  const green = material(0x73d154, 0.55, 0.2);
  const selectionSurface = new MeshStandardMaterial({
    color: 0x4dff49,
    emissive: new Color(0x1a9b22),
    emissiveIntensity: 1.7,
    roughness: 0.45,
  });
  const shadowSurface = new MeshStandardMaterial({
    color: 0x071007,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });

  const shadow = addMesh(root, new CircleGeometry(0.62, 24), shadowSurface, [0, 0.018, 0]);
  shadow.rotation.x = -Math.PI / 2;
  shadow.castShadow = false;
  const selectionRing = addMesh(root, new TorusGeometry(0.72, 0.055, 7, 36), selectionSurface, [0, 0.04, 0]);
  selectionRing.rotation.x = Math.PI / 2;
  selectionRing.castShadow = false;
  selectionRing.visible = false;

  const placeholder = new Group();
  placeholder.name = `greywrought.company.${unitClass.toLowerCase()}.placeholder`;
  // The real Quaternius model is the only visible unit representation. Until
  // it arrives the unit remains absent rather than showing debug geometry.
  placeholder.visible = false;
  root.add(placeholder);

  const bodyScale: readonly [number, number, number] =
    unitClass === "Warrior" ? [0.76, 1.05, 0.55] : [0.58, 0.95, 0.48];
  addMesh(placeholder, new CylinderGeometry(0.42, 0.5, 1.15, 8), cloth, [0, 0.72, 0], bodyScale);
  addMesh(placeholder, new SphereGeometry(0.29, 12, 8), skin, [0, 1.48, 0]);

  if (unitClass === "Warrior") {
    addMesh(placeholder, new BoxGeometry(0.12, 1.25, 0.13), steel, [0.5, 0.9, 0]);
    const blade = addMesh(placeholder, new BoxGeometry(0.16, 0.72, 0.08), steel, [-0.52, 1.0, 0.04]);
    blade.rotation.z = -0.32;
    addMesh(placeholder, new CylinderGeometry(0.42, 0.42, 0.09, 12), gold, [0.54, 0.92, 0], [1, 1.25, 1]);
  } else if (unitClass === "Artificer") {
    addMesh(placeholder, new BoxGeometry(0.74, 0.22, 0.42), gold, [0, 1.02, -0.35]);
    addMesh(placeholder, new ConeGeometry(0.18, 0.52, 6), material(0x48c6df, 0.22, 0.3), [0.46, 1.28, 0]);
    addMesh(placeholder, new CylinderGeometry(0.09, 0.09, 1.25, 8), steel, [-0.48, 0.88, 0]);
  } else if (unitClass === "Rogue") {
    addMesh(placeholder, new ConeGeometry(0.39, 0.54, 8), dark, [0, 1.64, 0]);
    const left = addMesh(placeholder, new BoxGeometry(0.08, 0.68, 0.06), steel, [-0.4, 0.88, 0.08]);
    const right = addMesh(placeholder, new BoxGeometry(0.08, 0.68, 0.06), steel, [0.4, 0.88, 0.08]);
    left.rotation.z = 0.38;
    right.rotation.z = -0.38;
  } else if (unitClass === "Priest") {
    addMesh(placeholder, new CylinderGeometry(0.055, 0.07, 1.72, 8), gold, [0.47, 0.92, 0]);
    addMesh(placeholder, new SphereGeometry(0.18, 10, 8), material(0x8ddaf2, 0.25, 0.2), [0.47, 1.79, 0]);
    addMesh(placeholder, new RingGeometry(0.3, 0.36, 20), gold, [0, 1.62, -0.08]);
  } else {
    const bow = addMesh(placeholder, new TorusGeometry(0.48, 0.04, 6, 24, Math.PI), green, [0.46, 1.0, 0]);
    bow.rotation.z = Math.PI / 2;
    addMesh(placeholder, new ConeGeometry(0.32, 0.48, 8), green, [0, 1.66, 0]);
    addMesh(placeholder, new CylinderGeometry(0.08, 0.1, 0.78, 8), dark, [-0.42, 1.03, -0.08]);
  }

  return { root, placeholder, selectionRing, target: new Vector3(), model: null, moving: false };
}

export function createRtsPresentation(host: HTMLElement): RtsPresentation {
  const scene = new Scene();
  scene.background = new Color(0x172116);
  scene.fog = new FogExp2(0x172116, 0.018);
  const camera = new PerspectiveCamera(38, 1, 0.2, 120);
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.domElement.id = "world-canvas";
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("aria-label", "Greywrought tactical battlefield");
  host.prepend(renderer.domElement);

  const ownedGeometries = new Set<BufferGeometry>();
  const ownedMaterials = new Set<Material>();
  const ownTree = (object: Object3D): void => {
    object.traverse((child) => {
      if (!(child instanceof Mesh)) return;
      ownedGeometries.add(child.geometry);
      if (Array.isArray(child.material)) child.material.forEach((entry) => ownedMaterials.add(entry));
      else ownedMaterials.add(child.material);
    });
  };

  const ground = new Mesh(
    new PlaneGeometry(80, 80),
    material(0x314129, 0.96, 0),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  ownTree(ground);

  const roadSurface = material(0x66583b, 1, 0);
  const road = new Mesh(new PlaneGeometry(7, 80), roadSurface);
  road.rotation.x = -Math.PI / 2;
  road.rotation.z = -0.18;
  road.position.y = 0.012;
  road.receiveShadow = true;
  scene.add(road);
  ownTree(road);

  const battlefield = createQuaterniusBattlefield(scene);

  scene.add(new AmbientLight(0x789277, 1.35));
  const sun = new DirectionalLight(0xffd69a, 3.1);
  sun.position.set(-12, 22, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  scene.add(sun);

  const figures = new Map<string, UnitFigure>();
  const encounterFigures = new Map<string, Group>();
  const obstacleFigures = new Map<string, Mesh>();
  const pickTargets: Object3D[] = [];
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  const groundPlane = new Plane(new Vector3(0, 1, 0), 0);
  // One reusable destination marker gives immediate, readable feedback for the
  // latest right-click order without accumulating transient scene objects.
  const marker = new Group();
  const markerRingMaterial = new MeshStandardMaterial({
    color: 0x8cff5a,
    emissive: new Color(0x2c9e24),
    emissiveIntensity: 1.8,
    transparent: true,
    opacity: 0.95,
    roughness: 0.4,
    depthWrite: false,
  });
  const markerArrowMaterial = new MeshStandardMaterial({
    color: 0xffd15a,
    emissive: new Color(0xa6601a),
    emissiveIntensity: 1.5,
    transparent: true,
    opacity: 0.98,
    roughness: 0.45,
    depthWrite: false,
  });
  const markerRing = new Mesh(new TorusGeometry(0.72, 0.07, 8, 32), markerRingMaterial);
  markerRing.rotation.x = Math.PI / 2;
  markerRing.position.y = 0.055;
  markerRing.castShadow = false;
  const markerArrow = new Mesh(new ConeGeometry(0.2, 0.62, 4), markerArrowMaterial);
  markerArrow.rotation.x = Math.PI;
  markerArrow.position.y = 2.1;
  markerArrow.castShadow = false;
  marker.add(markerRing, markerArrow);
  marker.visible = false;
  scene.add(marker);
  ownedGeometries.add(markerRing.geometry);
  ownedGeometries.add(markerArrow.geometry);
  ownedMaterials.add(markerRingMaterial);
  ownedMaterials.add(markerArrowMaterial);
  let markerAge = 99;
  const focus = new Vector3(0, 0, 2);
  const pointerPixels = new Vector2(-1000, -1000);
  const panKeys = new Set<string>();
  let pointerInside = false;
  let cameraDistance = 23;
  let frame = 0;
  let alive = true;
  let previousTime = performance.now();
  const loadedCompanyModels = new Map<UnitClass, string>();
  document.body.dataset.companyAssetStatus = "loading";
  document.body.dataset.natureAssetStatus = "loading";
  void battlefield.ready.then(() => {
    if (alive) document.body.dataset.natureAssetStatus = "ready";
  }).catch((cause: unknown) => {
    if (!alive) return;
    document.body.dataset.natureAssetStatus = "error";
    console.error("Unable to load Quaternius Stylized Nature battlefield", cause);
  });

  const recordLoadedModel = (unitClass: UnitClass, sourceName: string): void => {
    loadedCompanyModels.set(unitClass, sourceName);
    const order: readonly UnitClass[] = [
      "Warrior",
      "Artificer",
      "Rogue",
      "Priest",
      "Ranger",
    ];
    document.body.dataset.companyModels = order
      .flatMap((candidate) => {
        const loaded = loadedCompanyModels.get(candidate);
        return loaded === undefined ? [] : [`${candidate}:${loaded}`];
      })
      .join(",");
    if (unitClass === "Artificer") {
      document.body.dataset.artificerSilhouette = "engineer-alchemist-kit";
    }
    if (loadedCompanyModels.size === order.length) document.body.dataset.companyAssetStatus = "ready";
  };

  const canvasPoint = (clientX: number, clientY: number): Vector2 => {
    const rectangle = renderer.domElement.getBoundingClientRect();
    return new Vector2(clientX - rectangle.left, clientY - rectangle.top);
  };

  const normalizedPoint = (clientX: number, clientY: number): Vector2 => {
    const rectangle = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((clientX - rectangle.left) / rectangle.width) * 2 - 1,
      -((clientY - rectangle.top) / rectangle.height) * 2 + 1,
    );
    return pointer;
  };

  const resize = (): void => {
    if (!alive) return;
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  // Defer layout writes out of the observer callback; synchronously changing
  // the canvas size can make Chromium report a ResizeObserver loop error.
  const resizeObserver = new ResizeObserver(() => { requestAnimationFrame(resize); });
  resizeObserver.observe(host);
  resize();

  const applyUnits = (units: readonly UnitView[]): void => {
    for (const unit of units) {
      let figure = figures.get(unit.id);
      if (figure === undefined) {
        figure = createFigure(unit.unitClass);
        figure.root.traverse((child) => { child.userData.actorId = unit.id; });
        figure.root.position.set(unit.x, 0, unit.z);
        figures.set(unit.id, figure);
        pickTargets.push(figure.root);
        scene.add(figure.root);
        ownTree(figure.root);
        const loadingFigure = figure;
        void loadQuaterniusUnitModel(unit.unitClass).then((model) => {
          if (!alive) {
            model.dispose();
            return;
          }
          model.root.traverse((child) => { child.userData.actorId = unit.id; });
          loadingFigure.model = model;
          loadingFigure.root.add(model.root);
          loadingFigure.placeholder.visible = false;
          model.setMoving(loadingFigure.moving);
          recordLoadedModel(unit.unitClass, model.sourceName);
        }).catch((cause: unknown) => {
          if (!alive) return;
          document.body.dataset.companyAssetStatus = "error";
          console.error(`Unable to load Quaternius ${unit.unitClass} model`, cause);
        });
      }
      figure.target.set(unit.x, 0, unit.z);
      figure.selectionRing.visible = unit.selected || unit.targeted;
      figure.root.visible = unit.alive;
      figure.root.scale.y = Math.max(0.35, unit.healthFraction);
      const ringSurface = figure.selectionRing.material;
      if (ringSurface instanceof MeshStandardMaterial) {
        ringSurface.color.setHex(unit.targeted ? 0xffd15a : 0x4dff49);
      }
      figure.moving = unit.moving;
      figure.model?.setMoving(unit.moving);
      figure.root.userData.moving = unit.moving;
    }
  };

  const applyEncounterActors = (actors: readonly EncounterActorView[]): void => {
    for (const actor of actors) {
      let figure = encounterFigures.get(actor.id);
      if (figure === undefined) {
        figure = new Group();
        figure.name = `greywrought.encounter.${actor.kind.toLowerCase()}.${actor.id}`;
        if (actor.kind === "Cinder") {
          addMesh(figure, new ConeGeometry(0.75, 1.8, 7), material(0x5e1711, 0.62, 0.12), [0, 0.9, 0]);
          addMesh(figure, new SphereGeometry(0.36, 12, 8), material(0xff6a24, 0.28, 0.18), [0, 1.72, 0]);
        } else {
          addMesh(figure, new CylinderGeometry(0.78, 1.05, 0.65, 16), material(0x4c675d, 0.74, 0.18), [0, 0.34, 0]);
          addMesh(
            figure,
            new CylinderGeometry(0.7, 0.7, 0.09, 20),
            new MeshStandardMaterial({ color: 0x62d8d2, emissive: 0x1c7775, emissiveIntensity: 1.5 }),
            [0, 0.68, 0],
          );
          addMesh(figure, new TorusGeometry(1.0, 0.08, 8, 28), material(0xa4f7df, 0.35, 0.15), [0, 0.76, 0]).rotation.x = Math.PI / 2;
        }
        const ring = addMesh(figure, new TorusGeometry(0.98, 0.07, 7, 30), material(0xffd15a, 0.4, 0.25), [0, 0.06, 0]);
        ring.name = "target-ring";
        ring.rotation.x = Math.PI / 2;
        ring.visible = false;
        figure.traverse((child) => { child.userData.actorId = actor.id; });
        encounterFigures.set(actor.id, figure);
        pickTargets.push(figure);
        scene.add(figure);
        ownTree(figure);
      }
      figure.position.set(actor.x, 0, actor.z);
      figure.visible = actor.alive || actor.kind === "Moonwell";
      figure.scale.y = actor.kind === "Cinder" ? Math.max(0.35, actor.healthFraction) : 1;
      const ring = figure.getObjectByName("target-ring");
      if (ring !== undefined) ring.visible = actor.targeted;
    }
  };

  const applyObstacles = (obstacles: readonly ObstacleView[]): void => {
    const present = new Set(obstacles.map((obstacle) => obstacle.id));
    for (const [id, figure] of obstacleFigures) figure.visible = present.has(id);
    for (const obstacle of obstacles) {
      let figure = obstacleFigures.get(obstacle.id);
      if (figure === undefined) {
        figure = new Mesh(new CylinderGeometry(0.7, 1, 1, 12), material(0x717068, 0.95, 0));
        figure.castShadow = true;
        figure.receiveShadow = true;
        obstacleFigures.set(obstacle.id, figure);
        scene.add(figure);
        ownTree(figure);
      }
      figure.visible = true;
      figure.position.set(obstacle.x, obstacle.radius, obstacle.z);
      figure.scale.set(obstacle.radius, obstacle.radius * 2, obstacle.radius);
    }
    document.body.dataset.obstacles = JSON.stringify(obstacles);
  };

  const frameLoop = (time: number): void => {
    if (!alive) return;
    const dt = Math.min(0.05, Math.max(0, (time - previousTime) / 1000));
    previousTime = time;
    const rectangle = renderer.domElement.getBoundingClientRect();
    let horizontal = 0;
    let vertical = 0;
    if (panKeys.has("KeyA") || panKeys.has("ArrowLeft")) horizontal -= 1;
    if (panKeys.has("KeyD") || panKeys.has("ArrowRight")) horizontal += 1;
    if (panKeys.has("KeyW") || panKeys.has("ArrowUp")) vertical -= 1;
    if (panKeys.has("KeyS") || panKeys.has("ArrowDown")) vertical += 1;
    if (pointerInside) {
      const edge = 18;
      if (pointerPixels.x < edge) horizontal -= 1;
      if (pointerPixels.x > rectangle.width - edge) horizontal += 1;
      if (pointerPixels.y < edge) vertical -= 1;
      if (pointerPixels.y > rectangle.height - edge) vertical += 1;
    }
    const panLength = Math.hypot(horizontal, vertical);
    if (panLength > 0) {
      const speed = cameraDistance * 0.42 * dt;
      focus.x = MathUtils.clamp(focus.x + (horizontal / panLength) * speed, -24, 24);
      focus.z = MathUtils.clamp(focus.z + (vertical / panLength) * speed, -24, 24);
    }
    for (const figure of figures.values()) {
      figure.model?.update(dt);
      const before = figure.root.position.clone();
      figure.root.position.lerp(figure.target, 1 - Math.exp(-dt * 13));
      const dx = figure.root.position.x - before.x;
      const dz = figure.root.position.z - before.z;
      if (Math.hypot(dx, dz) > 0.0001) figure.root.rotation.y = Math.atan2(dx, dz);
    }
    if (marker.visible) {
      markerAge += dt;
      const descent = Math.min(1, markerAge / 0.34);
      markerArrow.position.y = 2.1 - MathUtils.smoothstep(descent, 0, 1) * 1.87;
      const fade = markerAge <= 0.82 ? 1 : MathUtils.clamp(1 - (markerAge - 0.82) / 0.68, 0, 1);
      markerRingMaterial.opacity = 0.95 * fade;
      markerArrowMaterial.opacity = 0.98 * fade;
      markerRing.scale.setScalar(1 + Math.sin(Math.min(markerAge, 0.82) * 10) * 0.08);
      if (fade <= 0) marker.visible = false;
    }
    camera.position.set(focus.x + cameraDistance * 0.66, cameraDistance * 0.78, focus.z + cameraDistance * 0.66);
    camera.lookAt(focus.x, 0, focus.z);
    renderer.render(scene, camera);
    document.body.dataset.cameraX = focus.x.toFixed(2);
    document.body.dataset.cameraZ = focus.z.toFixed(2);
    document.body.dataset.cameraDistance = cameraDistance.toFixed(2);
    frame = requestAnimationFrame(frameLoop);
  };

  return {
    canvas: renderer.domElement,
    applyUnits,
    applyEncounterActors,
    applyObstacles,
    pickActor(clientX, clientY) {
      raycaster.setFromCamera(normalizedPoint(clientX, clientY), camera);
      const hit = raycaster.intersectObjects(pickTargets, true).find(({ object }) => {
        for (let owner: Object3D | null = object; owner !== null; owner = owner.parent) {
          if (!owner.visible) return false;
        }
        return typeof object.userData.actorId === "string";
      });
      return hit?.object.userData.actorId ?? null;
    },
    unitsInScreenRectangle(left, top, right, bottom) {
      const rectangle = renderer.domElement.getBoundingClientRect();
      const result: string[] = [];
      const projected = new Vector3();
      for (const [id, figure] of figures) {
        if (!figure.root.visible) continue;
        projected.copy(figure.root.position).setY(0.8).project(camera);
        const x = (projected.x * 0.5 + 0.5) * rectangle.width;
        const y = (-projected.y * 0.5 + 0.5) * rectangle.height;
        if (x >= left && x <= right && y >= top && y <= bottom && projected.z >= -1 && projected.z <= 1) result.push(id);
      }
      return result;
    },
    groundPoint(clientX, clientY) {
      raycaster.setFromCamera(normalizedPoint(clientX, clientY), camera);
      return raycaster.ray.intersectPlane(groundPlane, new Vector3());
    },
    showMoveDestination(point) {
      marker.position.set(point.x, 0, point.z);
      markerAge = 0;
      marker.visible = true;
      document.body.dataset.destinationMarker = `${point.x.toFixed(2)},${point.z.toFixed(2)}`;
    },
    setPointer(clientX, clientY, inside) {
      pointerPixels.copy(canvasPoint(clientX, clientY));
      pointerInside = inside;
    },
    setPanKey(code, down) {
      if (down) panKeys.add(code);
      else panKeys.delete(code);
    },
    zoom(deltaY) {
      cameraDistance = MathUtils.clamp(cameraDistance + Math.sign(deltaY) * 2, 12, 36);
    },
    start() {
      if (frame === 0) frame = requestAnimationFrame(frameLoop);
    },
    dispose() {
      alive = false;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      battlefield.dispose();
      figures.forEach((figure) => figure.model?.dispose());
      ownedGeometries.forEach((entry) => entry.dispose());
      ownedMaterials.forEach((entry) => entry.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
