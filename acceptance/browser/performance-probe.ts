/** Browser-only instrumentation, installed before entering a world. */
export const performanceProbe = `
(async () => {
  const { Scene } = await import('three');
  const probe = window.performanceProbe = { samples: [], gpu: [], lifecycle: [], measuring: false, callbacks: 0, skipped: 0, rendered: 0, lastFrame: 0, renderer: null, scene: null, camera: null, details: null };
  const nativeFrame = requestAnimationFrame;
  window.requestAnimationFrame = callback => nativeFrame.call(window, now => {
    const before = probe.rendered, start = performance.now();
    const frame = !probe.frameCallback || callback === probe.frameCallback ? probe.beginFrame?.() : null;
    try { callback(now); } finally { frame?.(); }
    if (probe.rendered !== before) probe.frameCallback = callback;
    if (!probe.measuring || callback !== probe.frameCallback) return;
    if (probe.combatOnly && document.body.dataset.gameCombatPhase !== 'active') { probe.lastFrame = 0; return; }
    probe.callbacks++;
    if (probe.rendered === before) { probe.skipped++; return; }
    const position = probe.scene.children.find(child => child.userData.localPlayer)?.position;
    probe.samples.push({ timestamp: now, duration: performance.now() - start, interval: probe.lastFrame ? now - probe.lastFrame : 0,
      ...probe.lastRender, position: position && { x: position.x, y: position.y, z: position.z }, serverPosition: window.performanceState?.player.position });
    probe.lastFrame = now;
  });
  const originalBefore = Scene.prototype.onBeforeRender;
  Scene.prototype.onBeforeRender = function(renderer, scene, camera, ...args) {
    originalBefore.call(this, renderer, scene, camera, ...args);
    if (renderer.domElement.id !== 'world-canvas' || !camera.isPerspectiveCamera || !scene.children.some(child => child.userData.localPlayer) || renderer.performanceWrapped) return;
    renderer.performanceWrapped = true;
    probe.renderer = renderer; probe.scene = scene; probe.camera = camera;
    const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info'), timer = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    probe.details = { renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR), width: gl.drawingBufferWidth, height: gl.drawingBufferHeight,
      pixelRatio: renderer.getPixelRatio(), gpuTimer: timer ? 'available' : 'unsupported', shadowMap: renderer.shadowMap.type };
    let nodes = 0, meshes = 0, emptyGroups = 0;
    scene.traverse(object => { nodes++; if (object.isMesh) meshes++; if (object.isGroup && !object.children.length) emptyGroups++; });
    Object.assign(probe.details, { nodes, meshes, emptyGroups });
    renderer.info.autoReset = false;
    const originalRender = renderer.render, originalDispose = renderer.dispose;
    let depth = 0, frameActive = false, passes = 0, reflectionPasses = 0, renderMs = 0;
    const pending = [];
    // One frame includes the scene, water reflections, bloom and final output.
    // Each outer renderer.render call can be only one postprocessing pass.
    probe.beginFrame = () => {
      renderer.info.reset(); passes = 0; reflectionPasses = 0; renderMs = 0; frameActive = true;
      while (pending.length && gl.getQueryParameter(pending[0].query, gl.QUERY_RESULT_AVAILABLE)) {
        const entry = pending.shift(), disjoint = gl.getParameter(timer.GPU_DISJOINT_EXT);
        if (!disjoint) probe.gpu.push({ timestamp: entry.timestamp, milliseconds: gl.getQueryParameter(entry.query, gl.QUERY_RESULT) / 1e6 });
        gl.deleteQuery(entry.query);
      }
      const query = probe.measuring && timer && pending.length < 4 ? gl.createQuery() : null;
      const timestamp = performance.now();
      if (query) gl.beginQuery(timer.TIME_ELAPSED_EXT, query);
      return () => {
        if (query) { gl.endQuery(timer.TIME_ELAPSED_EXT); pending.push({ query, timestamp }); }
        frameActive = false;
        probe.lastRender = { renderMs, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
          passes, reflectionPasses, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs.length };
      };
    };
    renderer.render = function(scene, camera) {
      const nested = depth++ > 0, start = performance.now();
      if (frameActive) { passes++; if (nested) reflectionPasses++; }
      try { return originalRender.call(this, scene, camera); }
      finally {
        depth--;
        if (!nested && frameActive) renderMs += performance.now() - start;
        if (scene === probe.scene && camera === probe.camera) probe.rendered++;
      }
    };
    renderer.dispose = function() {
      for (const entry of pending) gl.deleteQuery(entry.query);
      pending.length = 0;
      originalDispose.call(this);
      probe.lifecycle.push({ time: performance.now(), memory: { ...renderer.info.memory }, programs: renderer.info.programs.length });
      if (probe.renderer === renderer) { probe.renderer = probe.scene = probe.camera = null; probe.beginFrame = null; }
    };
  };
})();`;
