import {
  CircleGeometry,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Texture,
  type BufferGeometry,
  type Scene,
} from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";

const ASSET_ROOT = "/assets/quaternius/nature";

interface Placement {
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly scale: number;
}

interface FieldAssetSpec {
  readonly name: string;
  readonly placements: readonly Placement[];
}

interface LoadedFieldAsset {
  readonly spec: FieldAssetSpec;
  readonly gltf: GLTF;
}

export interface OpenFieldEnvironment {
  readonly root: Group;
  readonly ready: Promise<void>;
  dispose(): void;
}

const FIELD_ASSETS: readonly FieldAssetSpec[] = [
  {
    name: "CommonTree_2",
    placements: [
      { x: -8.5, z: -7.5, yaw: 0.3, scale: 0.72 },
      { x: 8.8, z: -8, yaw: 2.1, scale: 0.64 },
      { x: -10.5, z: 5.5, yaw: 4.6, scale: 0.76 },
      { x: 9.5, z: 10.5, yaw: 1.3, scale: 0.68 },
    ],
  },
  {
    name: "CommonTree_5",
    placements: [
      { x: -7.5, z: 10.5, yaw: 3.6, scale: 0.74 },
      { x: 11.5, z: 2.5, yaw: 0.7, scale: 0.66 },
      { x: 4.5, z: -11.5, yaw: 5.1, scale: 0.7 },
    ],
  },
  {
    name: "Pine_5",
    placements: [
      { x: -11.5, z: -1, yaw: 4.1, scale: 0.78 },
      { x: 11.5, z: 8.5, yaw: 2.7, scale: 0.7 },
      { x: -10, z: 11.5, yaw: 0.9, scale: 0.82 },
    ],
  },
  {
    name: "Bush_Common",
    placements: [
      { x: -6.5, z: -5.2, yaw: 0.1, scale: 0.72 },
      { x: 6.8, z: -5.8, yaw: 1.8, scale: 0.64 },
      { x: -7.6, z: 7.5, yaw: 3.2, scale: 0.78 },
      { x: 8.5, z: 7.6, yaw: 5.4, scale: 0.72 },
      { x: 3.2, z: 8.8, yaw: 2.4, scale: 0.62 },
    ],
  },
  {
    name: "Grass_Common_Short",
    placements: [
      { x: -4, z: -7.5, yaw: 0.2, scale: 0.72 },
      { x: 5.2, z: -8.4, yaw: 2.8, scale: 0.68 },
      { x: -7.8, z: 2.5, yaw: 4.5, scale: 0.76 },
      { x: 8.2, z: 3.5, yaw: 1.5, scale: 0.7 },
      { x: -4.5, z: 9, yaw: 5.7, scale: 0.68 },
      { x: 3.8, z: 9.2, yaw: 3.1, scale: 0.74 },
    ],
  },
  {
    name: "Rock_Medium_3",
    placements: [
      { x: -7.8, z: -1.7, yaw: 1.1, scale: 0.38 },
      { x: 8.6, z: -2.2, yaw: 4.2, scale: 0.46 },
      { x: -3.5, z: 8.5, yaw: 2.6, scale: 0.42 },
      { x: 8.5, z: 6.8, yaw: 5.3, scale: 0.36 },
    ],
  },
];

function collectDisposableResources(roots: readonly Object3D[]): {
  readonly geometries: Set<BufferGeometry>;
  readonly materials: Set<Material>;
  readonly textures: Set<Texture>;
} {
  const geometries = new Set<BufferGeometry>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  for (const root of roots) {
    root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      const meshMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of meshMaterials) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof Texture) textures.add(value);
        }
      }
    });
  }
  return { geometries, materials, textures };
}

function disposeLoadedRoots(roots: readonly Object3D[]): void {
  const { geometries, materials, textures } = collectDisposableResources(roots);
  for (const texture of textures) texture.dispose();
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}

function validateAsset(asset: LoadedFieldAsset): void {
  let meshCount = 0;
  asset.gltf.scene.traverse((object) => {
    if (object instanceof Mesh) {
      meshCount += 1;
      object.castShadow = false;
      object.receiveShadow = false;
    }
  });
  if (meshCount === 0) {
    throw new Error(`${asset.spec.name} contains no renderable mesh`);
  }
}

async function loadFieldAssets(): Promise<readonly LoadedFieldAsset[]> {
  const loader = new GLTFLoader();
  const results = await Promise.allSettled(
    FIELD_ASSETS.map(async (spec): Promise<LoadedFieldAsset> => ({
      spec,
      gltf: await loader.loadAsync(`${ASSET_ROOT}/${spec.name}.gltf`),
    })),
  );
  const loaded = results.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failure !== undefined) {
    disposeLoadedRoots(loaded.map(({ gltf }) => gltf.scene));
    const detail =
      failure.reason instanceof Error
        ? failure.reason.message
        : String(failure.reason);
    throw new Error(`Unable to load the Quaternius open field: ${detail}`, {
      cause: failure.reason,
    });
  }
  try {
    for (const asset of loaded) validateAsset(asset);
  } catch (cause: unknown) {
    disposeLoadedRoots(loaded.map(({ gltf }) => gltf.scene));
    throw cause;
  }
  return loaded;
}

function createTerrain(): Group {
  const root = new Group();
  root.name = "greywrought.open-field.terrain";
  const fieldMaterial = new MeshStandardMaterial({
    color: 0x314b30,
    roughness: 0.98,
    metalness: 0,
  });
  const field = new Mesh(new CircleGeometry(42, 72), fieldMaterial);
  field.rotation.x = -Math.PI / 2;
  field.position.y = -0.08;
  const clearingMaterial = new MeshStandardMaterial({
    color: 0x4d4a32,
    roughness: 1,
    metalness: 0,
  });
  const clearing = new Mesh(new CircleGeometry(10.5, 56), clearingMaterial);
  clearing.rotation.x = -Math.PI / 2;
  clearing.position.y = -0.065;
  clearing.scale.set(1.35, 1, 0.92);
  root.add(field, clearing);
  return root;
}

function instantiateAssets(assets: readonly LoadedFieldAsset[]): Group {
  const root = new Group();
  root.name = "greywrought.open-field.quaternius";
  for (const { spec, gltf } of assets) {
    for (const [index, placement] of spec.placements.entries()) {
      const instance = gltf.scene.clone(true);
      instance.name = `greywrought.open-field.${spec.name}.${index}`;
      instance.position.set(placement.x, 0, placement.z);
      instance.rotation.y = placement.yaw;
      instance.scale.setScalar(placement.scale);
      root.add(instance);
    }
  }
  return root;
}

export function createOpenFieldEnvironment(
  scene: Scene,
): OpenFieldEnvironment {
  const root = createTerrain();
  scene.add(root);
  let disposed = false;
  let loadedRoots: readonly Object3D[] = [];
  const ready = loadFieldAssets().then((assets) => {
    loadedRoots = assets.map(({ gltf }) => gltf.scene);
    if (disposed) {
      disposeLoadedRoots(loadedRoots);
      loadedRoots = [];
      return;
    }
    root.add(instantiateAssets(assets));
  });
  return {
    root,
    ready,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      scene.remove(root);
      disposeLoadedRoots([root, ...loadedRoots]);
      loadedRoots = [];
    },
  };
}
