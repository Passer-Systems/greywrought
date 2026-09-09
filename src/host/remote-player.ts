import { Group, Mesh, MeshBasicMaterial, SkinnedMesh, Vector3 } from "three";
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
    scene.add(root);
    let mounted: ForestActor | null = null;
    let disposed = false;
    let current = view;
    let lastAttack = view.player.attackSequence;
    let lastHealth = view.player.health;
    let dead = false;
    let actionRemaining = 0;
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
      root,
      get name() { return current.name; },
      get alive() { return current.player.health > 0; },
      archetype: view.player.archetype,
      update(next: RemotePlayerView) { current = next; target.set(next.player.position.x, next.player.position.y, next.player.position.z); },
      render(delta: number) {
        const player = current.player;
        root.position.copy(target);
        const facing = Math.atan2(player.facing.x, player.facing.z);
        root.rotation.y = facing;
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
      dispose() { disposed = true; if (mounted) disposeActor(mounted); root.removeFromParent(); },
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
    entries() { return rigs.entries(); },
    render(delta: number) { for (const rig of rigs.values()) rig.render(delta); },
    dispose() { for (const rig of rigs.values()) rig.dispose(); rigs.clear(); },
  };
}
