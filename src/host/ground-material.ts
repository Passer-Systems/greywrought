import { CanvasTexture, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';

/** A compact, authored procedural floor: broad broken soil/grass regions with fine
 * leaf litter, grass blades and pebbles. It is generated once and repeated in
 * world-sized cells, so it adds texture detail without shipping a bitmap. */
export function createRuinedGroundMaterial() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 384;
  const ctx = canvas.getContext('2d')!;
  const hash = (x: number, y: number) => {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const smooth = (x: number, y: number, cells: number) => {
    const px = x / 384 * cells, py = y / 384 * cells;
    const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const at = (a: number, b: number) => hash((a % cells + cells) % cells, (b % cells + cells) % cells);
    return (at(ix, iy) * (1 - u) + at(ix + 1, iy) * u) * (1 - v) +
      (at(ix, iy + 1) * (1 - u) + at(ix + 1, iy + 1) * u) * v;
  };
  const image = ctx.createImageData(384, 384);
  for (let y = 0; y < 384; y++) for (let x = 0; x < 384; x++) {
    const broad = smooth(x, y, 5) * .58 + smooth(x, y, 11) * .3 + smooth(x, y, 25) * .12;
    const grain = (hash(x, y) - .5) * 18;
    const soil = Math.max(0, Math.min(1, (broad - .43) * 4));
    // Dark, desaturated Greywrought palette: grass, dead grass and exposed earth.
    const r = 52 + soil * 35 + grain;
    const g = 63 + soil * 25 + grain * .72;
    const b = 48 + soil * 18 + grain * .45;
    const i = (y * 384 + x) * 4;
    image.data[i] = r; image.data[i + 1] = g; image.data[i + 2] = b; image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const wrap = (draw: () => void) => {
    for (const x of [-384, 0, 384]) for (const y of [-384, 0, 384]) {
      ctx.save(); ctx.translate(x, y); draw(); ctx.restore();
    }
  };
  // Macro broken patches: irregular dry soil islands, rather than soft circles.
  for (let i = 0; i < 90; i++) {
    const x = hash(i, 3) * 384, y = hash(i, 9) * 384;
    const rx = 4 + hash(i, 11) * 20, ry = 2 + hash(i, 13) * 10;
    wrap(() => { ctx.save(); ctx.translate(x, y); ctx.rotate(hash(i, 17) * Math.PI);
    ctx.fillStyle = i % 4 === 0 ? 'rgba(125,105,78,.38)' : 'rgba(20,31,24,.3)';
    ctx.beginPath();
    for (let p = 0; p < 9; p++) {
      const a = p / 9 * Math.PI * 2, radius = .78 + hash(i * 19 + p, i * 23 + p) * .38;
      const px = Math.cos(a) * rx * radius, py = Math.sin(a) * ry * radius;
      if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill(); ctx.restore(); });
  }
  // Flat, irregular stones sit in loose clusters. A dark offset edge gives
  // them readable contact shading without adding geometry or payload bytes.
  for (let i = 0; i < 32; i++) {
    const x = hash(i, 301) * 384, y = hash(i, 307) * 384;
    const rx = 2 + hash(i, 311) * 6, ry = 1 + hash(i, 313) * 2.8;
    const rotation = hash(i, 317) * Math.PI;
    wrap(() => {
      for (const [offset, fill] of [[1.1, 'rgba(12,18,17,.4)'], [0, 'rgba(126,133,125,.58)']] as const) {
        ctx.save(); ctx.translate(x + offset, y + offset * .55); ctx.rotate(rotation);
        ctx.fillStyle = fill; ctx.beginPath();
        for (let p = 0; p < 7; p++) {
          const a = p / 7 * Math.PI * 2, radius = .8 + hash(i * 41 + p, i * 43 + p) * .3;
          const px = Math.cos(a) * rx * radius, py = Math.sin(a) * ry * radius;
          if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
        if (offset === 0) { ctx.strokeStyle = 'rgba(181,184,167,.35)'; ctx.lineWidth = .7; ctx.stroke(); }
        ctx.restore();
      }
    });
  }
  // Dense, low blades form the directional organic grain of the floor. Most
  // stay short and bent into the surface; a few lighter blades stand taller so
  // the separately placed tufts still read as accents rather than a grid.
  for (let i = 0; i < 7200; i++) {
    const x = hash(i, 101) * 384, y = hash(i, 107) * 384;
    const h = .45 + hash(i, 113) * (i % 13 === 0 ? 4.8 : 2.8);
    const lean = (hash(i, 127) - .5) * (2.2 + h * .55);
    ctx.strokeStyle = i % 11 === 0 ? 'rgba(157,137,88,.48)' :
      i % 5 === 0 ? 'rgba(113,128,79,.5)' : 'rgba(82,106,67,.48)';
    ctx.lineWidth = .32 + hash(i, 131) * .62;
    wrap(() => {
      ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.quadraticCurveTo(x + lean * .35, y - h * .25, x + lean, y - h); ctx.stroke();
      if (i % 4 === 0) {
        ctx.beginPath(); ctx.moveTo(x + .5, y + .6); ctx.quadraticCurveTo(x - lean * .2, y - h * .18, x - lean * .42, y - h * .62); ctx.stroke();
      }
    });
  }
  for (let i = 0; i < 240; i++) {
    const x = hash(i, 211) * 384, y = hash(i, 223) * 384, s = .7 + hash(i, 227) * 2.8;
    ctx.fillStyle = i % 3 ? 'rgba(112,108,91,.7)' : 'rgba(66,57,46,.8)';
    wrap(() => { ctx.beginPath(); ctx.ellipse(x, y, s, s * (.55 + hash(i, 229) * .4), hash(i, 233), 0, Math.PI * 2); ctx.fill(); });
  }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.wrapS = map.wrapT = RepeatWrapping;
  map.repeat.set(13, 17);
  return new MeshStandardMaterial({ map, roughness: .98, metalness: 0, vertexColors: true });
}
