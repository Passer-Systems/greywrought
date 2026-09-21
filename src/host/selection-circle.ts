import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, RingGeometry, SRGBColorSpace } from 'three';

/** One texture per world, shared by the terrain-conforming selection disks. */
export function selectionCircles() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas drawing is unavailable');
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, '#ffffff0a');
  gradient.addColorStop(.65, '#ffffff21');
  gradient.addColorStop(.86, '#ffffff42');
  gradient.addColorStop(.91, '#ffffffd9');
  gradient.addColorStop(.94, '#fffffff5');
  gradient.addColorStop(.97, '#ffffff75');
  gradient.addColorStop(1, '#ffffff00');
  context.fillStyle = gradient; context.fillRect(0, 0, 128, 128);
  const map = new CanvasTexture(canvas); map.colorSpace = SRGBColorSpace;
  return (radius: number, color: number) => {
    const mesh = new Mesh(new RingGeometry(0, radius, 64, 6), new MeshBasicMaterial({
      map, color, transparent: true, depthWrite: false, side: DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    }));
    mesh.name = 'unit-selection-circle';
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    return mesh;
  };
}
