import * as THREE from 'three';
import { createWorld } from './world.js';
import { createPlane } from './plane.js';
import { createControls } from './controls.js';
import { createCamera } from './camera.js';

const STEP = 1 / 60; // physics rate, decoupled from rendering

const canvas = document.getElementById('game');
const debugEl = document.getElementById('debug');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0xcfe6f2);

const scene = new THREE.Scene();
const world = createWorld(scene);
const plane = createPlane(scene, world);
const cam = createCamera(window.innerWidth / window.innerHeight);
const controls = createControls();

let paused = false;
controls.on('flaps', () => plane.toggleFlaps());
controls.on('camera', () => cam.toggle(plane));
controls.on('reset', () => plane.reset());
const pauseBtn = document.getElementById('btn-pause');
function togglePause() {
  paused = !paused;
  pauseBtn.innerHTML = paused ? '&#9654;' : '&#10074;&#10074;';
}
controls.on('pause', togglePause);
pauseBtn.addEventListener('click', togglePause);
document.getElementById('btn-camera').addEventListener('click', () => cam.toggle(plane));
document.getElementById('btn-reset').addEventListener('click', () => plane.reset());

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  cam.resize(window.innerWidth / window.innerHeight);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
resize();

function updateDebug() {
  const kmh = Math.round(plane.speed * 3.6);
  const flags = [plane.onGround ? plane.surface.toUpperCase() : 'AIR', plane.stalled ? 'STALL' : '', paused ? 'PAUSED' : '']
    .filter(Boolean).join(' ');
  debugEl.textContent =
    `SPEED  ${kmh} km/h\n` +
    `ALT    ${Math.round(plane.altitude)} m  (AGL ${Math.max(0, Math.round(plane.agl))} m)\n` +
    `THR    ${Math.round(plane.throttle * 100)}%   FLAPS ${plane.flaps ? 'ON' : 'off'}\n` +
    flags;
}

let last = performance.now(), acc = 0, debugTimer = 0;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
  last = now;

  if (!paused) {
    acc += dt;
    while (acc >= STEP) {
      plane.step(STEP, controls.read());
      acc -= STEP;
    }
  }
  plane.render(acc / STEP);
  cam.update(dt, plane, world);
  world.update(cam.camera);
  renderer.render(scene, cam.camera);

  debugTimer += dt;
  if (debugTimer > 0.1) { debugTimer = 0; updateDebug(); }
}
requestAnimationFrame(frame);
