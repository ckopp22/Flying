import * as THREE from 'three';

// Town island south edge is at z = -1350; the bridge links it to the airport island.
export const TOWN = { x: 0, z: -2000, r: 650, top: 3 };

const GRID = 7;      // 7 x 7 blocks, centre row and column left empty as avenues
const PITCH = 90;    // block spacing (m): 50 m buildings + 40 m streets

// Suspension bridge along x = 0. Y values are the deck centre line.
const BR = {
  rampStart: -760, deckStart: -910, deckEnd: -1290, rampEnd: -1450,
  yStart: 1.2, yDeck: 24, yEnd: 2.2,
  halfW: 10, legX: 12, towerZ: [-950, -1200], towerTop: 85, seabed: -6,
  anchorW: -850, anchorE: -1330,
};

function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---- Merged geometry builder (one draw call per material) ---- */
function newBuilder() { return { pos: [], nrm: [], uv: [], col: [], idx: [] }; }

// corners are bottom-left, bottom-right, top-right, top-left as seen from outside
function addFace(b, c, n, u, v, color) {
  const o = b.pos.length / 3;
  for (const p of c) {
    b.pos.push(p[0], p[1], p[2]);
    b.nrm.push(n[0], n[1], n[2]);
    b.col.push(color.r, color.g, color.b);
  }
  b.uv.push(0.03, 0.03, 0.03 + u, 0.03, 0.03 + u, 0.03 + v, 0.03, 0.03 + v);
  b.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
}

// tile = true repeats the window texture along the walls
function addBox(b, cx, cz, w, d, h, y0, color, tile = true) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2, y1 = y0 + h;
  const uw = tile ? w / 9 : 0, ud = tile ? d / 9 : 0, uh = tile ? h / 4.5 : 0;
  addFace(b, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0], ud, uh, color);
  addFace(b, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0], ud, uh, color);
  addFace(b, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1], uw, uh, color);
  addFace(b, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1], uw, uh, color);
  addFace(b, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0], 0, 0, color);
  addFace(b, [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0], 0, 0, color);
}

function addRect(b, cx, cz, w, d, y, color) {
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  addFace(b, [[x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0]], [0, 1, 0], 0, 0, color);
}

function toGeometry(b) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  geo.setIndex(b.idx);
  return geo;
}

function offset(material, units) {
  material.polygonOffset = true;
  material.polygonOffsetFactor = units;
  material.polygonOffsetUnits = units;
  return material;
}

function windowTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#4a6278';
  g.fillRect(10, 14, 44, 36);
  g.fillStyle = '#7f9db5';
  g.fillRect(10, 14, 44, 10);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/* ---- Town ---- */
function buildTown(scene) {
  const rand = rng(7);
  const palette = [0x8fa8b8, 0x9fb3c0, 0xb8c4cc, 0x7d95a8, 0xc9c2b4, 0x6f8799].map((c) => new THREE.Color(c));
  const b = newBuilder();
  const mid = (GRID - 1) / 2;

  for (let i = 0; i < GRID; i++) {
    for (let j = 0; j < GRID; j++) {
      if (i === mid || j === mid) continue;
      const cx = TOWN.x + (i - mid) * PITCH + (rand() - 0.5) * 8;
      const cz = TOWN.z + (j - mid) * PITCH + (rand() - 0.5) * 8;
      const dist = Math.hypot(i - mid, j - mid);
      const h = 18 + 260 * Math.exp(-dist / 2.6) * (0.45 + 0.55 * rand());
      const w = 38 + rand() * 16, d = 38 + rand() * 16;
      const color = palette[Math.floor(rand() * palette.length)];
      addBox(b, cx, cz, w, d, h, TOWN.top, color);
      if (h > 130) addBox(b, cx, cz, w * 0.5, d * 0.5, h * 0.12, TOWN.top + h, color);
    }
  }
  scene.add(new THREE.Mesh(toGeometry(b), new THREE.MeshStandardMaterial({
    vertexColors: true, map: windowTexture(), roughness: 0.55, metalness: 0.1,
  })));

  // Streets
  const r = newBuilder();
  const road = new THREE.Color(0x3b3e43);
  const span = GRID * PITCH + 30, y = TOWN.top + 0.06;
  for (let k = -mid - 0.5; k <= mid + 0.5; k += 1) {
    addRect(r, TOWN.x + k * PITCH, TOWN.z, 16, span, y, road);
    addRect(r, TOWN.x, TOWN.z + k * PITCH, span, 16, y, road);
  }
  addRect(r, TOWN.x, TOWN.z, 30, span, y, road);
  addRect(r, TOWN.x, TOWN.z, span, 30, y, road);
  scene.add(new THREE.Mesh(toGeometry(r), offset(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1,
  }), -1)));
}

/* ---- Bridge ---- */
function centerY(z) {
  if (z >= BR.deckStart) {
    const t = (BR.rampStart - z) / (BR.rampStart - BR.deckStart);
    return BR.yStart + (BR.yDeck - BR.yStart) * Math.min(Math.max(t, 0), 1);
  }
  if (z > BR.deckEnd) return BR.yDeck;
  const t = (BR.deckEnd - z) / (BR.deckEnd - BR.rampEnd);
  return BR.yDeck + (BR.yEnd - BR.yDeck) * Math.min(Math.max(t, 0), 1);
}

function cableY(z) {
  const [z1, z2] = BR.towerZ, top = BR.towerTop;
  if (z <= z1 && z >= z2) {
    const u = (z - (z1 + z2) / 2) / ((z1 - z2) / 2);
    return top - 52 * (1 - u * u);
  }
  if (z > z1) {
    const y0 = centerY(BR.anchorW) + 2;
    return y0 + (top - y0) * Math.pow((BR.anchorW - z) / (BR.anchorW - z1), 1.7);
  }
  const y0 = centerY(BR.anchorE) + 2;
  return y0 + (top - y0) * Math.pow((z - BR.anchorE) / (z2 - BR.anchorE), 1.7);
}

// Thin slanted boxes: [ax, ay, az, bx, by, bz, width, height]; length runs a -> b
function beamMesh(items, color) {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.8 }),
    items.length
  );
  const a = new THREE.Vector3(), c = new THREE.Vector3(), dir = new THREE.Vector3(), m = new THREE.Matrix4();
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), mid = new THREE.Vector3();
  const Z = new THREE.Vector3(0, 0, 1);
  items.forEach((it, i) => {
    a.set(it[0], it[1], it[2]);
    c.set(it[3], it[4], it[5]);
    dir.subVectors(c, a);
    const len = dir.length();
    q.setFromUnitVectors(Z, dir.normalize());
    mid.addVectors(a, c).multiplyScalar(0.5);
    m.compose(mid, q, s.set(it[6], it[7], len));
    mesh.setMatrixAt(i, m);
  });
  return mesh;
}

function buildBridge(scene) {
  const orange = new THREE.Color(0xd9532e), gray = new THREE.Color(0x8c9097);
  const pierColor = new THREE.Color(0xb0b4b8), roadColor = new THREE.Color(0x3b3e43);
  const white = new THREE.Color(0xf2f2f2);
  const b = newBuilder();

  // Level deck, rails and piers under the ramps
  const len = BR.deckStart - BR.deckEnd, cz = (BR.deckStart + BR.deckEnd) / 2;
  addBox(b, 0, cz, BR.halfW * 2, len, 2, BR.yDeck - 1, gray, false);
  for (const sx of [-1, 1]) addBox(b, sx * (BR.halfW - 0.3), cz, 0.6, len, 1.2, BR.yDeck + 1, orange, false);
  for (const z of [-830, -880, -1300, -1330]) {
    addBox(b, 0, z, 8, 5, centerY(z) - BR.seabed, BR.seabed, pierColor, false);
  }

  // Towers: two legs plus crossbeams, wide enough to fly through
  for (const z of BR.towerZ) {
    for (const sx of [-1, 1]) addBox(b, sx * BR.legX, z, 3, 4, BR.towerTop - BR.seabed, BR.seabed, orange, false);
    addBox(b, 0, z, BR.legX * 2 - 3, 3, 3, 58, orange, false);
    addBox(b, 0, z, BR.legX * 2 - 3, 3, 4, BR.towerTop - 4, orange, false);
  }

  // Road surface on the level deck
  const rb = newBuilder();
  addRect(rb, 0, cz, 14, len, BR.yDeck + 1.04, roadColor);
  for (let z = BR.deckStart - 10; z > BR.deckEnd + 10; z -= 24) addRect(rb, 0, z, 0.5, 10, BR.yDeck + 1.08, white);

  scene.add(new THREE.Mesh(toGeometry(b), new THREE.MeshStandardMaterial({
    vertexColors: true, flatShading: true, roughness: 0.8,
  })));
  scene.add(new THREE.Mesh(toGeometry(rb), offset(new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1,
  }), -2)));

  // Ramps from each island up to the deck
  scene.add(beamMesh([
    [0, BR.yStart, BR.rampStart, 0, BR.yDeck, BR.deckStart, BR.halfW * 2, 2],
    [0, BR.yDeck, BR.deckEnd, 0, BR.yEnd, BR.rampEnd, BR.halfW * 2, 2],
  ], 0x6e7278));

  // Main cables and hangers
  const cables = [], hangers = [];
  const spans = [[BR.anchorW, BR.towerZ[0]], [BR.towerZ[0], BR.towerZ[1]], [BR.towerZ[1], BR.anchorE]];
  for (const sx of [-1, 1]) {
    const x = sx * BR.legX;
    for (const [za, zb] of spans) {
      const n = Math.ceil(Math.abs(za - zb) / 10);
      for (let i = 0; i < n; i++) {
        const z0 = za + ((zb - za) * i) / n, z1 = za + ((zb - za) * (i + 1)) / n;
        cables.push([x, cableY(z0), z0, x, cableY(z1), z1, 0.7, 0.7]);
      }
      for (let z = Math.min(za, zb) + 15; z < Math.max(za, zb) - 5; z += 15) {
        hangers.push([x, cableY(z), z, sx * BR.halfW, centerY(z) + 1, z, 0.25, 0.25]);
      }
    }
  }
  scene.add(beamMesh(cables, 0xd9532e), beamMesh(hangers, 0xe8e2d8));
}

export function createCity(scene) {
  buildTown(scene);
  buildBridge(scene);
}
