import { AdditiveBlending, DoubleSide, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Shape, ShapeGeometry, SphereGeometry, TorusGeometry, type Object3D } from 'three';

export function createPhotonChair(parent: Object3D, color = 0x70bfff) {
  const root = new Group(); root.name = 'photon-chair'; root.visible = false; parent.add(root);
  const shell = new MeshBasicMaterial({ color, transparent: true, opacity: .34, side: DoubleSide, depthWrite: false, blending: AdditiveBlending });
  const glow = new LineBasicMaterial({ color: 0xc4efff, transparent: true, opacity: .95, depthWrite: false, blending: AdditiveBlending });
  const shape = new Shape();
  // A high-backed, open-sided silhouette reads as a chair around the seated actor.
  shape.moveTo(-.55,.28); shape.quadraticCurveTo(-.72,.42,-.7,.82); shape.lineTo(-.64,1.68); shape.quadraticCurveTo(0,1.9,.64,1.68); shape.lineTo(.7,.82); shape.quadraticCurveTo(.72,.42,.55,.28); shape.closePath();
  const backGeometry = new ShapeGeometry(shape,16);
  const back = new Mesh(backGeometry,shell); back.position.z = -.38; root.add(back);
  const edgeGeometry = new EdgesGeometry(backGeometry);
  const edge = new LineSegments(edgeGeometry,glow); edge.position.copy(back.position); root.add(edge);
  const seatGeometry = new SphereGeometry(.7,20,10);
  const seat = new Mesh(seatGeometry,shell); seat.scale.set(1,.13,.8); seat.position.set(0,.5,.02); root.add(seat);
  const rimGeometry = new TorusGeometry(.57,.035,8,32);
  const rim = new Mesh(rimGeometry, glow); rim.rotation.x = Math.PI / 2; rim.position.set(0,.51,.02); root.add(rim);
  return {
    update(sitting: boolean) { root.visible = sitting; },
    dispose() { root.removeFromParent(); backGeometry.dispose(); edgeGeometry.dispose(); seatGeometry.dispose(); rimGeometry.dispose(); shell.dispose(); glow.dispose(); },
  };
}
