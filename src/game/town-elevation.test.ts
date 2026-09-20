import { expect, test } from 'bun:test';
import { terrainHeight } from './cave-layout.js';
import { blockedPosition, moveLocomotion } from './movement.js';
import { TOWN_BUILDINGS, restoreTownPosition } from './town-layout.js';
import { TOWN_FENCE_RUNS, TOWN_HEIGHT, townHeight } from './town-elevation.js';
import { buildTownPerimeter } from '../host/town-perimeter.js';

test('the fenced hill has a level town, smooth north and south entrances, and matching rails', () => {
  for (const building of TOWN_BUILDINGS) {
    for (const dx of [-building.width / 2, building.width / 2]) for (const dz of [-building.depth / 2, building.depth / 2]) {
      expect(townHeight(building.x + dx, building.z + dz)).toBe(TOWN_HEIGHT);
    }
  }
  for (const [x,z] of [[3.4,-7.5],[-9,-10],[5,-12],[-13,-28],[13,-28],[-9,-32]]) {
    expect(terrainHeight(x!, z!)).toBe(TOWN_HEIGHT);
    expect(blockedPosition(x!, z!)).toBe(false);
  }
  for (const [from, direction] of [[8,-1],[-48,1]]) {
    const state = { position: { x: 0, y: terrainHeight(0,from!), z: from! }, verticalSpeed: 0 };
    for (let i = 0; i < 120; i++) {
      const before = state.position.y;
      moveLocomotion(state, { forward: 1, strafe: 0, cameraX: 0, cameraZ: direction!, jump: false }, 1/60);
      expect(state.position.y).toBe(terrainHeight(state.position.x,state.position.z));
      expect(Math.abs(state.position.y - before)).toBeLessThan(.04);
    }
    expect(state.position.y).toBe(TOWN_HEIGHT);
  }
  for (const {x1,z1,x2,z2} of TOWN_FENCE_RUNS) expect(blockedPosition((x1+x2)/2,(z1+z2)/2)).toBe(true);
  for (const z of [0,-40]) for (const x of [-3,0,3]) expect(blockedPosition(x,z)).toBe(false);
  const pieces: {x:number;z:number;length:number;rotation:number}[]=[];
  buildTownPerimeter((x,z,length,rotation)=>pieces.push({x,z,length,rotation}));
  expect(pieces.length).toBeGreaterThan(40);
  for (const piece of pieces) expect(blockedPosition(piece.x,piece.z)).toBe(true);
  expect(pieces.reduce((sum,piece)=>sum+piece.length,0)).toBeCloseTo(168,8);
  expect(townHeight(28,-46)).toBe(0);
});

test('saved positions on newly placed town fences resume beside the nearest clear edge', () => {
  for (const [x,z] of [[26,-20],[-26,-20],[10,-40],[-10,0],[26,-40]]) {
    const original = {x:x!,y:TOWN_HEIGHT,z:z!};
    const restored = restoreTownPosition(original);
    expect(blockedPosition(restored.x,restored.z)).toBe(false);
    expect(Math.hypot(restored.x-original.x,restored.z-original.z)).toBeLessThan(.6);
    expect(restoreTownPosition(restored)).toEqual(restored);
  }
});
