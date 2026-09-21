import { CanvasTexture, AdditiveBlending, PointLight, Scene, Sprite, SpriteMaterial, SRGBColorSpace } from "three";

interface Glow { readonly light: PointLight; readonly sprite: Sprite; readonly base: number; }

function glowTexture(): CanvasTexture {
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Canvas drawing is unavailable");
  const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, "#fff4cf"); gradient.addColorStop(0.1, "#ffdc96dd");
  gradient.addColorStop(0.28, "#ffad4b66"); gradient.addColorStop(0.58, "#ff78271c"); gradient.addColorStop(1, "#ff4a0000");
  context.fillStyle = gradient; context.fillRect(0, 0, 64, 64);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace; return texture;
}

export function createLampGlow(scene: Scene) {
  const glows: Glow[] = [];
  const texture = glowTexture();
  return {
    sync(lamps: readonly PointLight[]) {
      const known = new Set(lamps);
      for (let index = glows.length - 1; index >= 0; index--) {
        if (known.has(glows[index]!.light)) continue;
        glows[index]!.sprite.removeFromParent(); glows[index]!.sprite.material.dispose(); glows.splice(index, 1);
      }
      for (const light of lamps) {
        if (glows.some(glow => glow.light === light)) continue;
        const material = new SpriteMaterial({ map: texture, transparent: true, opacity: 0.45, depthWrite: false, blending: AdditiveBlending });
        material.color.multiplyScalar(5);
        const sprite = new Sprite(material); sprite.name = "lamp-warm-halo";
        sprite.scale.setScalar(Math.min(2.3, Math.max(1.1, light.distance * 0.15)));
        scene.add(sprite); glows.push({ light, sprite, base: light.userData.nightIntensity });
      }
    },
    update(time: number, daylight: number) {
      const night = Math.max(0, 1 - daylight);
      for (const glow of glows) {
        glow.light.getWorldPosition(glow.sprite.position);
        const flicker = 0.9 + 0.1 * Math.sin(time * 7.1 + glow.light.id * 1.73) + 0.035 * Math.sin(time * 13.7 + glow.light.id);
        glow.sprite.visible = glow.light.visible && night > 0.02;
        glow.sprite.material.opacity = Math.min(0.62, 0.18 + night * 0.34) * flicker;
        glow.light.intensity = glow.base * (0.78 + 0.22 * flicker) * (0.35 + 0.65 * night);
      }
    },
    dispose() {
      for (const glow of glows) { glow.sprite.removeFromParent(); glow.sprite.material.dispose(); }
      glows.length = 0; texture.dispose();
    },
  };
}
