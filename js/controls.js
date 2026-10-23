// Keyboard controls (MDD section 6). Touch and gamepad come in later phases.
const HELD = {
  pitchUp: ['KeyS', 'ArrowDown'],
  pitchDown: ['KeyW', 'ArrowUp'],
  rollRight: ['KeyD', 'ArrowRight'],
  rollLeft: ['KeyA', 'ArrowLeft'],
  yawRight: ['KeyE'],
  yawLeft: ['KeyQ'],
  throttleUp: ['ShiftLeft', 'ShiftRight', 'KeyR'],
  throttleDown: ['ControlLeft', 'ControlRight', 'KeyF'],
  brake: ['KeyB'],
};

const PRESS = {
  Space: 'flaps',
  KeyC: 'camera',
  Escape: 'pause',
  KeyP: 'pause',
  Backspace: 'reset',
};

export function createControls() {
  const down = new Set();
  const handlers = {};
  const input = { pitch: 0, roll: 0, yaw: 0, boost: false, brake: false };

  const heldCodes = new Set(Object.values(HELD).flat());
  const isDown = (codes) => codes.some((c) => down.has(c));
  const axis = (neg, pos) => (isDown(HELD[pos]) ? 1 : 0) - (isDown(HELD[neg]) ? 1 : 0);

  window.addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.altKey) return;
    if (heldCodes.has(ev.code)) {
      down.add(ev.code);
      ev.preventDefault();
    } else if (PRESS[ev.code]) {
      ev.preventDefault();
      if (!ev.repeat && handlers[PRESS[ev.code]]) handlers[PRESS[ev.code]]();
    }
  });
  window.addEventListener('keyup', (ev) => down.delete(ev.code));
  window.addEventListener('blur', () => down.clear());

  // Touch: first finger on the left half is the steering stick, any other finger is throttle
  const STICK_RADIUS = 60, DEADZONE = 0.1;
  const touch = { stick: null, ox: 0, oy: 0, x: 0, y: 0, boosts: new Set() };
  const base = document.createElement('div'), knob = document.createElement('div');
  base.id = 'stick';
  knob.id = 'stick-knob';
  base.appendChild(knob);
  base.hidden = true;
  document.body.appendChild(base);

  window.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType === 'mouse' || ev.target.closest('#buttons')) return;
    if (touch.stick === null && ev.clientX < window.innerWidth / 2) {
      touch.stick = ev.pointerId;
      touch.ox = ev.clientX; touch.oy = ev.clientY;
      touch.x = touch.y = 0;
      base.style.left = ev.clientX + 'px';
      base.style.top = ev.clientY + 'px';
      knob.style.transform = 'translate(-50%, -50%)';
      base.hidden = false;
    } else {
      touch.boosts.add(ev.pointerId);
    }
  });
  window.addEventListener('pointermove', (ev) => {
    if (ev.pointerId !== touch.stick) return;
    let dx = ev.clientX - touch.ox, dy = ev.clientY - touch.oy;
    const len = Math.hypot(dx, dy);
    if (len > STICK_RADIUS) { dx *= STICK_RADIUS / len; dy *= STICK_RADIUS / len; }
    touch.x = dx / STICK_RADIUS;
    touch.y = dy / STICK_RADIUS;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });
  const release = (ev) => {
    if (ev.pointerId === touch.stick) { touch.stick = null; touch.x = touch.y = 0; base.hidden = true; }
    touch.boosts.delete(ev.pointerId);
  };
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  const dz = (v) => (Math.abs(v) < DEADZONE ? 0 : v);
  const clamp1 = (v) => Math.max(-1, Math.min(1, v));

  return {
    on(name, fn) { handlers[name] = fn; },
    // Returns a shared object; call once per physics step
    read() {
      // Stick: drag up = nose up, drag right = bank right
      input.pitch = clamp1(axis('pitchDown', 'pitchUp') - dz(touch.y));
      input.roll = clamp1(axis('rollLeft', 'rollRight') + dz(touch.x));
      input.yaw = axis('yawLeft', 'yawRight');
      input.boost = isDown(HELD.throttleUp) || touch.boosts.size > 0;
      input.brake = isDown(HELD.brake) || isDown(HELD.throttleDown);
      return input;
    },
  };
}
