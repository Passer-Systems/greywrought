import { CanvasTexture, CircleGeometry, Group, Mesh, MeshBasicMaterial, Object3D, RingGeometry, Sprite, SpriteMaterial, SRGBColorSpace } from "three";
import type { AdventureSnapshot, Position, ThreatView } from "../game/adventure-types.js";
import { publicUrl } from "./public-url.js";
import type { RangeAudience } from "./combat-range.js";
import { enemyResponseLabel } from "./enemy-response.js";

const styles: Record<string, { color: number; icon: string; label: string; kind: "area" | "target" | "self" }> = {
  "ember-beam": { color: 0xff643e, icon: "lightning-bolt", label: "BEAM", kind: "target" },
  fireball: { color: 0xff4e35, icon: "fire-spell", label: "FIRE", kind: "target" },
  "ember-ward": { color: 0x90b9ff, icon: "defensive-shield", label: "SHIELD", kind: "self" },
  kindle: { color: 0xffbc49, icon: "energy-burst", label: "POWER UP", kind: "self" },
  nest: { color: 0x8fe342, icon: "poison-vial", label: "SWARM", kind: "area" },
  warder: { color: 0x51d98a, icon: "nature-leaf", label: "THORNS", kind: "area" },
  "foreman-pulse": { color: 0xffc365, icon: "lightning-bolt", label: "PULSE", kind: "target" },
  "foreman-press": { color: 0xff8055, icon: "earth-stone", label: "PRESS", kind: "area" },
  "foreman-shield": { color: 0x9cbfff, icon: "defensive-shield", label: "SHIELD", kind: "self" },
  maul: { color: 0xffb568, icon: "sword-strike", label: "MAUL", kind: "area" },
};

function warningState(threat: ThreatView, snapshot: AdventureSnapshot, audience?: RangeAudience) {
  const move = threat.cast ?? threat.currentActivity;
  if (!threat.aggro || !threat.active || threat.health <= 0 || !move) return null;
  const style = styles[move.ability.id];
  if (!style) return null;
  const seconds = Math.max(0, move.remainingSeconds);
  const remoteTarget = audience && threat.targetPlayerId && threat.targetPlayerId !== audience.selfId;
  const recipient = remoteTarget ? audience.players.find(player => player.id === threat.targetPlayerId)?.player.position : snapshot.player.position;
  if (style.kind === "target" && !recipient) return null;
  const position = style.kind === "target" ? recipient! : style.kind === "self" ? threat.position : threat.targetPosition;
  const radius = style.kind === "area" ? move.ability.range : style.kind === "target" ? 0.8 : 1.1;
  return { style, position, radius, seconds, damage: move.ability.damage, ability: move.ability.id, committed: !threat.cast || threat.cast.status === "resolving" };
}

export function createGroundTelegraphs(scene: Object3D, canvas: HTMLCanvasElement) {
  const images = new Map<string, HTMLImageElement>();
  const ready = Promise.all(Object.values(styles).map(async style => {
    const image = new Image();
    image.src = publicUrl(`assets/ui/icons/spells/${style.icon}.png`);
    await image.decode(); images.set(style.icon, image);
  })).then(() => undefined);
  const warnings = new Map<string, ReturnType<typeof createWarning>>();
  function createWarning() {
    const root = new Group(); root.visible = false; scene.add(root);
    const fill = new Mesh(new CircleGeometry(1, 64), new MeshBasicMaterial({ transparent: true, opacity: 0.17, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    fill.rotation.x = -Math.PI / 2; fill.renderOrder = 2; root.add(fill);
    const edge = new Mesh(new RingGeometry(0.975, 1, 64), new MeshBasicMaterial({ transparent: true, opacity: 0.95, depthWrite: false }));
    edge.rotation.x = -Math.PI / 2; edge.position.y = 0.015; edge.renderOrder = 3; root.add(edge);
    const card = document.createElement("canvas"); card.width = 80; card.height = 106;
    const context = card.getContext("2d");
    if (!context) throw new Error("Attack warning artwork is unavailable");
    const texture = new CanvasTexture(card); texture.colorSpace = SRGBColorSpace;
    const badge = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, sizeAttenuation: false }));
    badge.scale.set(0.055, 0.055 * card.height / card.width, 1); badge.renderOrder = 4; root.add(badge);
    return { root, fill, edge, badge, context, texture, text: "" };
  }
  return {
    ready,
    update(snapshot: AdventureSnapshot, facing: Pick<Position, "x" | "z">, audience?: RangeAudience) {
      const diagnostics: object[] = [];
      for (const threat of snapshot.threats) {
        const state = warningState(threat, snapshot, audience);
        let warning = warnings.get(threat.id);
        if (!state) { if (warning) warning.root.visible = false; continue; }
        if (!warning) { warning = createWarning(); warnings.set(threat.id, warning); }
        const { style, radius, position, seconds, damage } = state;
        warning.root.visible = true; warning.root.position.set(position.x, 0.13, position.z);
        warning.fill.scale.setScalar(radius); warning.edge.scale.setScalar(radius);
        warning.fill.material.color.setHex(style.color); warning.edge.material.color.setHex(style.color);
        warning.fill.material.opacity = state.committed ? 0.30 : 0.16;
        // Targeted spells and self buffs are already named on the caster's plate.
        warning.badge.visible = style.kind === "area";
        // The far edge keeps area icons above the lower combat HUD at the normal camera angle.
        warning.badge.position.set(facing.x * radius * 0.7, style.kind === "target" ? 2.7 : 0.25, facing.z * radius * 0.7);
        const time = seconds > 0 ? `${seconds.toFixed(1)}s` : "NOW";
        const text = `${style.label}|${time}|${damage}|${style.kind}|${state.committed}|${images.has(style.icon)}`;
        if (warning.text !== text) {
          warning.text = text;
          const ctx = warning.context, color = `#${style.color.toString(16).padStart(6, "0")}`;
          ctx.clearRect(0, 0, 80, 106);
          ctx.fillStyle = "#101820ef"; ctx.fillRect(0, 0, 80, 106);
          ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.strokeRect(2, 2, 76, 102);
          const icon = images.get(style.icon); if (icon) ctx.drawImage(icon, 5, 4, 70, 64);
          ctx.fillStyle = "#fff4df"; ctx.font = "bold 20px system-ui"; ctx.textAlign = "center";
          ctx.fillText(time, 40, 82);
          ctx.fillStyle = color; ctx.font = "bold 16px system-ui";
          ctx.fillText(enemyResponseLabel(state.ability), 40, 101);
          warning.texture.needsUpdate = true;
        }
        diagnostics.push({ enemy: threat.id, ability: state.ability, response: enemyResponseLabel(state.ability), kind: style.kind, badgeVisible: warning.badge.visible, color: style.color, radius, x: position.x, z: position.z, seconds: Number(seconds.toFixed(1)), committed: state.committed });
      }
      const serialized = JSON.stringify(diagnostics);
      if (canvas.dataset.telegraphs !== serialized) canvas.dataset.telegraphs = serialized;
    },
  };
}
