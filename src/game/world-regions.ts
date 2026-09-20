/** Shared geography for the roads, settlements, scenery and traveller's map. */
export const EXPANDED_WORLD_BOUNDS = { minX: -180, maxX: 255, minZ: -160, maxZ: 245 } as const;

export const WORLD_REGIONS = [
  { id: 'frostwood', name: 'Frostwood', x: 0, z: 35, radius: 66, color: '#6f7952', description: 'Old woodland grows through the bones of the Ninth Bell works.' },
  { id: 'glassmire', name: 'Glassmire', x: 35, z: 165, radius: 54, color: '#7b8e81', description: 'Pale reeds drink from alchemical pools. Something below answers the birds.' },
  { id: 'suture-reach', name: 'Suture Reach', x: 150, z: 125, radius: 65, color: '#8d795d', description: 'Free machines mend their little houses and wait for a shift that never ends.' },
  { id: 'brinewood', name: 'Brinewood', x: -120, z: 125, radius: 63, color: '#88735f', description: 'Copper leaves shelter still-houses, salt gardens and prayer-wound dynamos.' },
  { id: 'choirworks', name: 'The Choirworks', x: 190, z: -20, radius: 70, color: '#666f70', description: 'A buried thinking engine sings through the animals wearing its spare parts.' },
  { id: 'ossuary', name: 'The Blooming Ossuary', x: 110, z: 207, radius: 43, color: '#9b9285', description: 'Ivory fungi bloom inside dead cooling towers. Their spores remember voices.' },
] as const;

export const WORLD_SETTLEMENTS = [
  { id: 'suture', name: 'Suture', x: 157, z: 117, minX: 138, maxX: 178, minZ: 98, maxZ: 137,
    description: 'A village of autonomous maintenance machines. Each house belongs to a duty rather than a family.' },
  { id: 'brinewick', name: 'Brinewick', x: -125, z: 128, minX: -148, maxX: -103, minZ: 106, maxZ: 151,
    description: 'Alchemists keep salvaged minds alive in brine, using their murmurs to drive mills and stills.' },
] as const;

export const REGION_BUILDINGS = [
  { town: 'suture', model: 'House_1', x: 143, z: 110, width: 7, depth: 6, height: 5.2, turn: 1, sign: 'THE HOUSE OF REPAIRS' },
  { town: 'suture', model: 'House_3', x: 169, z: 106, width: 6, depth: 6, height: 4.6, turn: -1, sign: 'SPARE MEMORY' },
  { town: 'suture', model: 'House_1', x: 168, z: 128, width: 7, depth: 7, height: 5.8, turn: -1, sign: 'THE EMPTY SHIFT' },
  { town: 'suture', model: 'House_3', x: 145, z: 129, width: 6, depth: 5, height: 4.3, turn: 1, sign: 'MENDING HALL' },
  { town: 'brinewick', model: 'Inn', x: -138, z: 118, width: 9, depth: 7, height: 6.8, turn: 1, sign: 'THE DROWNED SAINT' },
  { town: 'brinewick', model: 'House_1', x: -111, z: 118, width: 7, depth: 6, height: 5.5, turn: -1, sign: 'MOTHER VITRIOL’S STILL' },
  { town: 'brinewick', model: 'House_3', x: -113, z: 140, width: 6, depth: 5, height: 4.7, turn: -1, sign: 'SALT & COPPER' },
  { town: 'brinewick', model: 'House_1', x: -139, z: 141, width: 7, depth: 6, height: 5.6, turn: 1, sign: 'THE BORROWED MIND' },
] as const;

export const REGION_ROADS: readonly { readonly name: string; readonly width: number; readonly points: readonly (readonly [number, number])[] }[] = [
  { name: 'The Salt Road', width: 4, points: [[0,66],[-15,80],[-43,91],[-80,104],[-102,125],[-111,128],[-125,128]] },
  { name: 'Mender’s Way', width: 4, points: [[0,66],[15,88],[52,112],[97,120],[137,117],[157,117]] },
  { name: 'Glass Causeway', width: 3, points: [[52,112],[42,137],[28,161],[46,182],[88,204],[114,208]] },
  { name: 'The Cinder Circuit', width: 4, points: [[0,-43],[13,-65],[43,-76],[92,-77],[133,-57],[177,-32],[197,-21],[178,32],[163,77],[157,117]] },
  { name: 'Brinewood Pilgrim Track', width: 3, points: [[-125,128],[-125,152],[-97,163],[-82,165],[-57,159],[-8,167],[28,161]] },
] as const;

export const REGION_LANDMARKS = [
  { id: 'glass-heart', name: 'The Listening Pools', x: 29, z: 168, kind: 'natural', description: 'Shallow glass-green pools and petrified reeds surround a listening machine.' },
  { id: 'choir-engine', name: 'The Choir Engine', x: 202, z: -24, kind: 'danger', description: 'A broken cathedral of cooling fins. Its congregation still has teeth.' },
  { id: 'spore-towers', name: 'The Blooming Towers', x: 111, z: 211, kind: 'natural', description: 'Dead towers bear enormous ivory mushroom shelves and dim violet spores.' },
  { id: 'pilgrim-wheel', name: 'The Pilgrim Wheel', x: -82, z: 155, kind: 'relic', description: 'Prayer ribbons turn in the ribs of a fallen machine, with no wind to move them.' },
] as const;

export function settlementAt(x: number, z: number) {
  return WORLD_SETTLEMENTS.find(town => x >= town.minX && x <= town.maxX && z >= town.minZ && z <= town.maxZ);
}

export function regionAt(x: number, z: number) {
  return WORLD_REGIONS.reduce((nearest, region) => Math.hypot(x-region.x,z-region.z)/region.radius < Math.hypot(x-nearest.x,z-nearest.z)/nearest.radius ? region : nearest, WORLD_REGIONS[0]);
}
