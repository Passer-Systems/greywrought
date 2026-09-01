const portSource = Bun.env.GREYWROUGHT_RIG_PORT;
const port = portSource === undefined ? 4174 : Number.parseInt(portSource, 10);

const files: Readonly<Record<string, string>> = {
  "/": "src/host/rig_socket_lab.html",
  "/index.html": "src/host/rig_socket_lab.html",
  "/app/rig-socket-lab-entry.js": "build/host/rig-socket-lab-entry.js",
  "/app/rig-socket-lab.js": "build/host/rig-socket-lab.js",
  "/app/rig-socket-lab.css": "src/host/rig_socket_lab.css",
  "/vendor/three.module.js": "node_modules/three/build/three.module.js",
  "/vendor/three.core.js": "node_modules/three/build/three.core.js",
  "/vendor/three-addons/loaders/GLTFLoader.js":
    "node_modules/three/examples/jsm/loaders/GLTFLoader.js",
  "/vendor/three-addons/utils/BufferGeometryUtils.js":
    "node_modules/three/examples/jsm/utils/BufferGeometryUtils.js",
  "/vendor/three-addons/utils/SkeletonUtils.js":
    "node_modules/three/examples/jsm/utils/SkeletonUtils.js",
  "/assets/quaternius/rig/base/Superhero_Female_FullBody.gltf":
    "assets/external/quaternius/rig-socket-prototype/base/Superhero_Female_FullBody.gltf",
  "/assets/quaternius/rig/base/Superhero_Female_FullBody.bin":
    "assets/external/quaternius/rig-socket-prototype/base/Superhero_Female_FullBody.bin",
  "/assets/quaternius/rig/base/T_Eye_Brown.png":
    "assets/external/quaternius/rig-socket-prototype/base/T_Eye_Brown.png",
  "/assets/quaternius/rig/base/T_Eye_Normal.png":
    "assets/external/quaternius/rig-socket-prototype/base/T_Eye_Normal.png",
  "/assets/quaternius/rig/base/T_Hair_2_BaseColor.png":
    "assets/external/quaternius/rig-socket-prototype/base/T_Hair_2_BaseColor.png",
  "/assets/quaternius/rig/base/T_Hair_2_Normal.png":
    "assets/external/quaternius/rig-socket-prototype/base/T_Hair_2_Normal.png",
  "/assets/quaternius/rig/base/T_Superhero_Female_Dark_BaseColor.png":
    "assets/external/quaternius/rig-socket-prototype/base/T_Superhero_Female_Dark_BaseColor.png",
  "/assets/quaternius/rig/base/T_Superhero_Female_Normal.png":
    "assets/external/quaternius/rig-socket-prototype/base/T_Superhero_Female_Normal.png",
  "/assets/quaternius/rig/base/T_Superhero_Female_Roughness.png":
    "assets/external/quaternius/rig-socket-prototype/base/T_Superhero_Female_Roughness.png",
  "/assets/quaternius/rig/animations/UAL1_Standard.glb":
    "assets/external/quaternius/rig-socket-prototype/animations/UAL1_Standard.glb",
};

const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch(request): Response {
    const path = files[new URL(request.url).pathname];
    return path === undefined
      ? new Response("Not found", { status: 404 })
      : new Response(Bun.file(path));
  },
});

console.log(`Greywrought rig socket lab is available at ${server.url}`);

export {};
