import * as THREE from 'three';
import { TOWN, createCity } from './city.js';

export const SEA_LEVEL = 0;
export const ISLAND_TOP = 2;
// Runway runs along the Z axis, centred on the origin. startZ is the spawn point (plane faces -Z).
export const RUNWAY = { length: 1000, width: 30, startZ: 470 };

const FOG_COLOR = 0xcfe6f2;
const AIRPORT_R = 800;       // flat airport island radius (m)
const GRASS_R = 780;         // grass ends here, sand ring beyond
const BEACH_SLOPE = 0.05;    // metres of drop per metre past a flat island edge
const WATER_REST = -0.1;     // height the floats rest at on water
const SEABED = -6;
const MAP_SIZE = 8000;       // terrain mesh covers +-4000 m, open ocean beyond
const MAP_CELLS = 160;

// Mountain islands: peak = approximate summit height in metres
const WEST = { x: -2600, z: -300, r: 1300, peak: 650 };
const EAST = { x: 2500, z: -1500, r: 1000, peak: 260 };

/* ---- Seeded value noise ---- */
function hash(ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x, z) {
  return vnoise(x, z) * 0.55 + vnoise(x * 2.1 + 5.2, z * 2.1 + 1.3) * 0.3 + vnoise(x * 4.3 + 9.1, z * 4.3 + 7.7) * 0.15;
}

function flatIsland(d, r, top) {
  return d <= r ? top : top - 0.05 - (d - r) * BEACH_SLOPE;
}

function mountainHeight(x, z, m) {
  const d = Math.hypot(x - m.x, z - m.z);
  if (d >= m.r * 1.3) return SEABED;
  const t = 1 - d / m.r + 0.2 * (fbm(x * 0.0007 + 10, z * 0.0007) - 0.5);
  if (t <= 0) return Math.max(SEABED, t * 60);
  const ridge = 1 - Math.abs(2 * fbm(x * 0.0018, z * 0.0018) - 1);
  return m.peak * Math.pow(t, 1.5) * (0.3 + 1.1 * ridge);
}

// Terrain height above sea level (m); below WATER_REST it is underwater
function heightAt(x, z) {
  let h = Math.max(SEABED, flatIsland(Math.hypot(x, z), AIRPORT_R, ISLAND_TOP));
  h = Math.max(h, flatIsland(Math.hypot(x - TOWN.x, z - TOWN.z), TOWN.r, TOWN.top));
  h = Math.max(h, mountainHeight(x, z, WEST), mountainHeight(x, z, EAST));
  return h;
}

const surface = { height: ISLAND_TOP, friction: 0.06, type: 'grass' };

// Shared result object (no per-call allocation). Copy values you need to keep.
function surfaceAt(x, z) {
  const h = heightAt(x, z);
  if (h <= WATER_REST) {
    surface.height = WATER_REST; surface.friction = 0.3; surface.type = 'water';
    return surface;
  }
  surface.height = h;
  if (Math.abs(x) <= RUNWAY.width / 2 && Math.abs(z) <= RUNWAY.length / 2) {
    surface.friction = 0.02; surface.type = 'runway';
  } else if (Math.hypot(x - TOWN.x, z - TOWN.z) <= TOWN.r) {
    surface.friction = 0.04; surface.type = 'concrete';
  } else if (h < 2.6) {
    surface.friction = 0.1; surface.type = 'sand';
  } else if (h < 250) {
    surface.friction = Math.hypot(x, z) < GRASS_R ? 0.06 : 0.08; surface.type = 'grass';
  } else {
    surface.friction = 0.15; surface.type = 'rock';
  }
  return surface;
}

/* ---- Terrain mesh ---- */
const COLORS = {
  sand: new THREE.Color(0xe8d9a0), grass: new THREE.Color(0x7cc36a), forest: new THREE.Color(0x3f8a4c),
  rock: new THREE.Color(0x8a8479), snow: new THREE.Color(0xf4f6f8), concrete: new THREE.Color(0x8d9399),
};
const ramp = (x, a, b) => Math.min(Math.max((x - a) / (b - a), 0), 1);

function terrainColor(h, x, z, out) {
  if (h > 1 && Math.hypot(x - TOWN.x, z - TOWN.z) <= TOWN.r + 25) return out.copy(COLORS.concrete);
  if (h > 1 && Math.hypot(x, z) < GRASS_R + 10) return out.copy(COLORS.grass);
  out.copy(COLORS.sand).lerp(COLORS.grass, ramp(h, 2.2, 5));
  out.lerp(COLORS.forest, ramp(h, 30, 200));
  out.lerp(COLORS.rock, ramp(h, 200, 300));
  return out.lerp(COLORS.snow, ramp(h, 450, 520));
}

function buildTerrain() {
  const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, MAP_CELLS, MAP_CELLS).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heightAt(x, z);
    pos.setY(i, h);
    terrainColor(h, x, z, c);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
}

/* ---- Sky ---- */
const SUN_DIR = new THREE.Vector3(0.5, 0.7, 0.35).normalize();

function buildSky() {
  const R = 8000;
  const geo = new THREE.SphereGeometry(R, 32, 16);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const horizon = new THREE.Color(FOG_COLOR);
  const zenith = new THREE.Color(0x3f86d6);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(pos.getY(i) / R, 0);
    c.copy(horizon).lerp(zenith, Math.pow(t, 0.55));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false,
  }));
  sky.renderOrder = -1;

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(220, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xfff6cc, fog: false })
  );
  sun.position.copy(SUN_DIR).multiplyScalar(7400);
  sky.add(sun);
  return sky;
}

// Flat white rectangles merged into one geometry: [x, z, width, length]
function buildMarkings(rects, y) {
  const positions = [], indices = [];
  rects.forEach(([x, z, w, l], i) => {
    const hw = w / 2, hl = l / 2;
    positions.push(x - hw, y, z - hl, x + hw, y, z - hl, x + hw, y, z + hl, x - hw, y, z + hl);
    const o = i * 4;
    indices.push(o, o + 2, o + 1, o, o + 3, o + 2);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function polyOffset(material, units) {
  material.polygonOffset = true;
  material.polygonOffsetFactor = units;
  material.polygonOffsetUnits = units;
  return material;
}

export function createWorld(scene) {
  scene.fog = new THREE.Fog(FOG_COLOR, 1500, 7000);

  const sun = new THREE.DirectionalLight(0xfff4d6, 2.2);
  sun.position.copy(SUN_DIR).multiplyScalar(1000);
  scene.add(sun, new THREE.HemisphereLight(0xbfdfff, 0x6b8f5a, 1.1));

  const sky = buildSky();
  scene.add(sky);

  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(20000, 20000).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2f9fb8, roughness: 0.35, metalness: 0 })
  );
  water.position.y = SEA_LEVEL;
  scene.add(water);

  scene.add(buildTerrain());

  // Runway slab
  const runway = new THREE.Mesh(
    new THREE.PlaneGeometry(RUNWAY.width, RUNWAY.length).rotateX(-Math.PI / 2),
    polyOffset(new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.95 }), -1)
  );
  runway.position.y = ISLAND_TOP + 0.04;
  scene.add(runway);

  // Runway markings: edge lines, centre dashes, threshold bars, aiming blocks
  const half = RUNWAY.length / 2;
  const rects = [
    [-RUNWAY.width / 2 + 1, 0, 0.5, RUNWAY.length - 20],
    [RUNWAY.width / 2 - 1, 0, 0.5, RUNWAY.length - 20],
  ];
  for (let z = -half + 60; z <= half - 60; z += 40) rects.push([0, z, 1, 20]);
  for (const side of [-1, 1]) {
    for (let x = -12; x <= 12; x += 3.2) rects.push([x, side * (half - 17), 1.2, 24]);
    rects.push([-6, side * (half - 300), 3, 22], [6, side * (half - 300), 3, 22]);
  }
  scene.add(new THREE.Mesh(
    buildMarkings(rects, ISLAND_TOP + 0.08),
    polyOffset(new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.9 }), -2)
  ));

  createCity(scene);

  return {
    surfaceAt,
    // Keep sky and water centred on the camera so they appear endless
    update(camera) {
      sky.position.copy(camera.position);
      water.position.x = camera.position.x;
      water.position.z = camera.position.z;
    },
  };
}
