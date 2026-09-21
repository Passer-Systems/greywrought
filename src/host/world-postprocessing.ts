import { ACESFilmicToneMapping, HalfFloatType, SRGBColorSpace, Vector2, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

class WorldBloomPass extends UnrealBloomPass {
  override setSize(width: number, height: number): void {
    // The pass halves this again: glow starts at quarter resolution, capped
    // at 640 pixels on its longest edge, without reducing scene detail.
    const scale = Math.min(.5, 1280 / Math.max(width, height));
    super.setSize(Math.max(2, Math.round(width * scale)), Math.max(2, Math.round(height * scale)));
  }
}

export function createWorldPostprocessing(renderer: WebGLRenderer, scene: Scene, camera: Camera) {
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  // Offscreen scene rendering remains linear HDR. OutputPass alone applies
  // the display transform after bloom; reflections retain their linear input.
  const target = new WebGLRenderTarget(1, 1, {
    type: HalfFloatType,
    samples: Math.min(2, renderer.capabilities.maxSamples),
  });
  target.texture.name = "world-hdr";
  const composer = new EffectComposer(renderer, target);
  const scenePass = new RenderPass(scene, camera);
  const bloom = new WorldBloomPass(new Vector2(2, 2), .3, .45, 1.1);
  const output = new OutputPass();
  // The last pass writes directly to the canvas; keep one stable scene buffer.
  output.needsSwap = false;
  composer.addPass(scenePass);
  composer.addPass(bloom);
  composer.addPass(output);

  return {
    resize(width: number, height: number): void {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(width, height);
    },
    async compile(): Promise<void> {
      const previousTarget = renderer.getRenderTarget();
      let compilation: ReturnType<WebGLRenderer["compileAsync"]>;
      try {
        renderer.setRenderTarget(composer.readBuffer);
        compilation = renderer.compileAsync(scene, camera);
      } finally {
        renderer.setRenderTarget(previousTarget);
      }
      await compilation;
      // Compilation leaves link diagnostics and uniform/attribute discovery
      // until first use. Finish them here so turning toward new scenery does
      // not force that driver work into a playable frame.
      let sliceStarted = performance.now();
      for (const program of renderer.info.programs ?? []) {
        program.getUniforms();
        program.getAttributes();
        if (performance.now() - sliceStarted > 8) {
          await new Promise<void>(resolve => setTimeout(resolve, 0));
          sliceStarted = performance.now();
        }
      }
    },
    render(delta: number): void {
      composer.render(delta);
    },
    dispose(): void {
      scenePass.dispose();
      bloom.materialHighPassFilter.dispose();
      bloom.dispose();
      output.dispose();
      composer.dispose();
    },
  };
}
