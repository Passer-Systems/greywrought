import { CanvasTexture, Group, Mesh, MeshBasicMaterial, SkinnedMesh, Sprite, SpriteMaterial, SRGBColorSpace, Vector3 } from "three";
import type { RemotePlayerView } from "../game/multiplayer-types.js";
export type { RemotePlayerView } from "../game/multiplayer-types.js";
import { actor, type ForestActor } from "./frostwood-assets.js";

export function createRemotePlayers(scene: Group | import("three").Scene) {
  const rigs = new Map<string, ReturnType<typeof createRig>>();
  function createRig(view: RemotePlayerView) {
    const root = new Group();
    root.userData.playerId = view.id;
    const target = new Vector3(view.player.position.x, view.player.position.y, view.player.position.z);
    root.position.copy(target);
    const canvas = document.createElement("canvas");
    canvas.width = 384; canvas.height = 80;
    const context = canvas.getContext("2d")!;
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
    const plate = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, sizeAttenuation: false }));
    plate.scale.set(0.14, 0.14 * 80 / 384, 1); plate.position.y = 2.65;
    root.add(plate); scene.add(root);
    let mounted: ForestActor | null = null;
    let disposed = false;
    let current = view;
    let lastAttack = view.player.attackSequence;
    let lastHealth = view.player.health;
    let dead = false;
    let actionRemaining = 0;
    let plateText = "";
    function disposeActor(value: ForestActor) {
      value.dispose();
      value.model.traverse(object => { if (object instanceof SkinnedMesh) object.skeleton.dispose(); });
      // The skeleton clone shares its model resources; only its shadow is instance-owned.
      for (const child of value.root.children) if (child !== value.model && child instanceof Mesh) {
        child.geometry.dispose();
        if (child.material instanceof MeshBasicMaterial) { child.material.map?.dispose(); child.material.dispose(); }
      }
    }
    void actor("Knight", 2.2, view.player.archetype).then(value => {
      if (disposed) { disposeActor(value); return; }
      mounted = value; root.add(value.root); value.play("Idle");
      root.userData.rigState = "ready";
    }).catch(error => { root.userData.rigState = "failed"; console.error("Unable to load companion character", error); });
    return {
      archetype: view.player.archetype,
      update(next: RemotePlayerView) { current = next; target.set(next.player.position.x, next.player.position.y, next.player.position.z); },
      render(delta: number) {
        const player = current.player;
        if (root.position.distanceToSquared(target) > 100) root.position.copy(target);
        else root.position.lerp(target, 1 - Math.exp(-delta * 22));
        const facing = Math.atan2(player.facing.x, player.facing.z);
        const turn = Math.atan2(Math.sin(facing - root.rotation.y), Math.cos(facing - root.rotation.y));
        root.rotation.y += turn * (1 - Math.exp(-delta * 22));
        const nextText = `${current.name} · ${Math.ceil(player.health)}/${player.maximumHealth}`;
        if (plateText !== nextText) {
          plateText = nextText;
          context.clearRect(0, 0, 384, 80);
          context.font = "bold 28px system-ui"; context.textAlign = "center"; context.textBaseline = "middle";
          context.lineWidth = 5; context.strokeStyle = "#10201d"; context.fillStyle = "#c8f4e3";
          context.strokeText(nextText, 192, 27, 375); context.fillText(nextText, 192, 27, 375);
          context.fillStyle = "#152620dd"; context.fillRect(72, 54, 240, 10);
          context.fillStyle = player.health > 0 ? "#72dbaa" : "#bd6c68";
          context.fillRect(72, 54, 240 * Math.max(0, Math.min(1, player.health / player.maximumHealth)), 10);
          texture.needsUpdate = true;
        }
        if (!mounted) return;
        actionRemaining = Math.max(0, actionRemaining - delta);
        if (player.health <= 0) {
          if (!dead) mounted.play("Death", false);
          dead = true;
        } else {
          if (dead) { dead = false; actionRemaining = 0; mounted.play("Idle"); }
          if (player.health < lastHealth) { mounted.play("RecieveHit", false, 0.4); actionRemaining = 0.4; }
          else if (player.attackSequence !== lastAttack) {
            mounted.play(player.archetype === "mage" ? "Staff_Attack" : player.archetype === "hunter" ? "Bow_Shoot" : "Sword_Attack", false, 0.4);
            actionRemaining = 0.4;
          } else if (actionRemaining === 0) mounted.play(player.maneuver === "disengage" || !player.grounded ? "Roll" : player.moving ? "Run" : "Idle");
        }
        lastHealth = player.health; lastAttack = player.attackSequence;
        mounted.mixer.update(delta);
      },
      dispose() { disposed = true; if (mounted) disposeActor(mounted); texture.dispose(); plate.material.dispose(); root.removeFromParent(); },
    };
  }
  return {
    update(players: readonly RemotePlayerView[]) {
      const present = new Set(players.map(player => player.id));
      for (const [id, rig] of rigs) if (!present.has(id)) { rig.dispose(); rigs.delete(id); }
      for (const player of players) {
        let rig = rigs.get(player.id);
        if (rig && rig.archetype !== player.player.archetype) { rig.dispose(); rigs.delete(player.id); rig = undefined; }
        if (!rig) { rig = createRig(player); rigs.set(player.id, rig); }
        rig.update(player);
      }
    },
    render(delta: number) { for (const rig of rigs.values()) rig.render(delta); },
    dispose() { for (const rig of rigs.values()) rig.dispose(); rigs.clear(); },
  };
}
