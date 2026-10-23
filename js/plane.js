import * as THREE from 'three';
import { RUNWAY } from './world.js';

/* ============================================================
 * FLIGHT TUNING: change feel here. Units: metres, seconds, kg, N.
 * ============================================================ */
const MAX_THRUST = 4000;          // N at full throttle. Higher = faster acceleration and top speed
const MASS = 1000;                // kg. Higher = sluggish acceleration, less gravity/drag effect per N
const GRAVITY = 9.81;             // m/s^2
const TAKEOFF_SPEED = 30;         // m/s. Lift equals weight here (LIFT_COEFF is derived from it)
const LIFT_COEFF = (MASS * GRAVITY) / (TAKEOFF_SPEED * TAKEOFF_SPEED); // N per (m/s)^2. Higher = floatier
const DRAG_COEFF = 0.7;           // N per (m/s)^2. Top speed ~ sqrt(MAX_THRUST / DRAG_COEFF) = ~75 m/s
const STALL_SPEED = 22;           // m/s. Below this lift fades and the nose drops (soft stall)
const MAX_SPEED = 85;             // m/s hard cap (reached only in dives)
const PITCH_RATE = 1.0;           // rad/s at full authority. Lower = less twitchy
const ROLL_RATE = 1.9;            // rad/s
const YAW_RATE = 0.45;            // rad/s
const AUTO_LEVEL_STRENGTH = 1.5;  // 1/s. Wing levelling when no roll input. 0 = off, higher = snappier

/* Secondary tuning */
const CRUISE_THROTTLE = 0.45;     // throttle in the air when not boosting (plane keeps flying by itself)
const THROTTLE_RESPONSE = 1.5;    // 1/s. How quickly throttle eases to its target
const INPUT_SMOOTHING = 7;        // 1/s. Lower = smoother, laggier controls
const VELOCITY_ALIGN = 2.5;       // 1/s. How fast the flight path follows the nose
const STALL_NOSE_DROP = 0.7;      // rad/s nose-down pitch when fully stalled
const LIFT_CAP_G = 1.1;           // lift never exceeds this many g (stops climbing by speed alone)
const FLAPS_LIFT = 1.3;           // lift multiplier with flaps down
const FLAPS_DRAG = 0.6;           // extra drag fraction with flaps down
const BANK_TURN = 1.0;            // how strongly banking turns the nose (1 = coordinated turn)
const CEILING = 1500;             // m. Lift fades out approaching this altitude
const GEAR_HEIGHT = 1.45;         // m from plane origin down to wheel bottoms
const MAX_GROUND_PITCH = 0.26;    // rad nose-up allowed on the runway
const ROTATE_SPEED = 0.7 * TAKEOFF_SPEED; // m/s. Nose can lift only above ~half of this
const GROUND_STEER_RATE = 0.7;    // rad/s steering on the ground
const BRAKE_DECEL = 9;            // m/s^2

const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function buildModel() {
  const mat = (color) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.7 });
  const white = mat(0xf4f1ea), red = mat(0xe8542f), dark = mat(0x2a2d33), glass = mat(0x7ec8e8);
  const group = new THREE.Group();
  const add = (geo, m, x, y, z, parent = group) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };

  // Nose points toward -Z. Parts hidden in cockpit view:
  const hidden = [];
  hidden.push(add(new THREE.CylinderGeometry(0.4, 0.75, 6, 8).rotateX(Math.PI / 2), white, 0, 0, 0.3));
  hidden.push(add(new THREE.CylinderGeometry(0.75, 0.5, 1, 8).rotateX(Math.PI / 2), red, 0, 0, -3.2));
  hidden.push(add(new THREE.BoxGeometry(0.9, 0.5, 1.4), glass, 0, 0.7, -0.6));
  hidden.push(add(new THREE.ConeGeometry(0.28, 0.6, 8).rotateX(-Math.PI / 2), dark, 0, 0, -3.95));

  // Wings and tail
  add(new THREE.BoxGeometry(11, 0.14, 1.9), red, 0, -0.25, -0.4);
  add(new THREE.BoxGeometry(3.8, 0.1, 1.1), red, 0, 0.2, 3.2);
  add(new THREE.BoxGeometry(0.1, 1.4, 1.2), red, 0, 0.95, 3.1);

  // Propeller
  const prop = new THREE.Group();
  prop.position.set(0, 0, -4.3);
  prop.add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.6, 0.06), dark));
  group.add(prop);
  hidden.push(prop);

  // Landing gear and small floats
  for (const s of [-1, 1]) {
    add(new THREE.BoxGeometry(0.32, 0.22, 3.2), red, s * 0.95, -1.22, -0.4);          // float
    add(new THREE.BoxGeometry(0.07, 0.8, 0.07), dark, s * 0.95, -0.72, -0.4);         // float strut
    add(new THREE.BoxGeometry(0.07, 0.8, 0.07), dark, s * 1.55, -0.72, -0.4);         // wheel strut
    add(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 10).rotateZ(Math.PI / 2), dark, s * 1.55, -1.15, -0.4);
  }
  add(new THREE.BoxGeometry(0.07, 0.6, 0.07), dark, 0, -0.85, -2.2);
  add(new THREE.CylinderGeometry(0.3, 0.3, 0.18, 10).rotateZ(Math.PI / 2), dark, 0, -1.15, -2.2);

  return { group, prop, hidden };
}

export function createPlane(scene, world) {
  const model = buildModel();
  const group = model.group;
  scene.add(group);

  const pos = new THREE.Vector3(), vel = new THREE.Vector3(), quat = new THREE.Quaternion();
  const prevPos = new THREE.Vector3(), prevQuat = new THREE.Quaternion();
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
  const flat = new THREE.Vector3(), acc = new THREE.Vector3(), tmp = new THREE.Vector3();
  const dq = new THREE.Quaternion(), e = new THREE.Euler();

  let throttle = 0, flaps = false, flapsAmt = 0;
  let pitchIn = 0, rollIn = 0, yawIn = 0;

  const plane = {
    group, pos, autoLevel: true,
    speed: 0, throttle: 0, agl: 0, altitude: 0, flaps: false,
    onGround: true, stalled: false, surface: 'runway', resetCount: 0,
    step, render, reset, toggleFlaps, setCockpit,
  };

  function axes() {
    fwd.set(0, 0, -1).applyQuaternion(quat);
    right.set(1, 0, 0).applyQuaternion(quat);
    up.set(0, 1, 0).applyQuaternion(quat);
  }

  function reset() {
    const h = world.surfaceAt(0, RUNWAY.startZ).height;
    pos.set(0, h + GEAR_HEIGHT, RUNWAY.startZ);
    vel.set(0, 0, 0);
    quat.identity();
    throttle = 0; flaps = false; flapsAmt = 0;
    pitchIn = rollIn = yawIn = 0;
    plane.onGround = true;
    prevPos.copy(pos); prevQuat.copy(quat);
    plane.resetCount++;
    render(1);
  }

  function toggleFlaps() { flaps = !flaps; }

  function setCockpit(on) { for (const m of model.hidden) m.visible = !on; }

  function airOrient(dt) {
    const fs = vel.dot(fwd);
    const authority = clamp(plane.speed / TAKEOFF_SPEED, 0.2, 1);
    const stall = 1 - smooth(STALL_SPEED * 0.6, STALL_SPEED, fs);

    const dPitch = pitchIn * PITCH_RATE * authority * dt - STALL_NOSE_DROP * stall * dt;
    let dRoll = -rollIn * ROLL_RATE * authority * dt;
    const dYaw = -yawIn * YAW_RATE * authority * dt;
    if (plane.autoLevel) {
      const bank = Math.atan2(right.y, up.y); // + when right wing is high
      dRoll -= AUTO_LEVEL_STRENGTH * bank * (1 - Math.abs(rollIn)) * dt;
    }
    dq.setFromEuler(e.set(dPitch, dYaw, dRoll, 'YXZ'));
    quat.multiply(dq);

    // Banking turns the nose (right wing down -> turn right)
    const turn = clamp(BANK_TURN * GRAVITY * (right.y / Math.max(up.y, 0.25)) / Math.max(plane.speed, TAKEOFF_SPEED * 0.7), -1, 1);
    dq.setFromAxisAngle(Y_AXIS, turn * dt);
    quat.premultiply(dq).normalize();
  }

  function groundOrient(dt) {
    e.setFromQuaternion(quat, 'YXZ');
    const rotAuth = clamp((plane.speed - ROTATE_SPEED * 0.5) / (ROTATE_SPEED * 0.5), 0, 1);
    const targetPitch = Math.max(pitchIn, 0) * MAX_GROUND_PITCH * rotAuth;
    e.x += (targetPitch - e.x) * (1 - Math.exp(-3 * dt));
    e.z += (0 - e.z) * (1 - Math.exp(-6 * dt));
    const steerAuth = clamp(plane.speed / 6, 0, 1) * (1 - 0.6 * clamp(plane.speed / TAKEOFF_SPEED, 0, 1));
    e.y -= clamp(yawIn + 0.6 * rollIn, -1, 1) * GROUND_STEER_RATE * steerAuth * dt;
    quat.setFromEuler(e);
  }

  function step(dt, input) {
    prevPos.copy(pos); prevQuat.copy(quat);

    const k = 1 - Math.exp(-INPUT_SMOOTHING * dt);
    pitchIn += (input.pitch - pitchIn) * k;
    rollIn += (input.roll - rollIn) * k;
    yawIn += (input.yaw - yawIn) * k;
    // Simple throttle: hold = full power, release = cruise in the air / idle on the ground
    const throttleTarget = input.boost ? 1 : (plane.onGround ? 0 : CRUISE_THROTTLE);
    throttle += (throttleTarget - throttle) * (1 - Math.exp(-THROTTLE_RESPONSE * dt));
    flapsAmt += ((flaps ? 1 : 0) - flapsAmt) * (1 - Math.exp(-2 * dt));

    plane.speed = vel.length();
    axes();
    if (plane.onGround) groundOrient(dt); else airOrient(dt);
    axes();
    flat.copy(fwd).setY(0).normalize();

    // Forces (as accelerations)
    acc.copy(plane.onGround ? flat : fwd).multiplyScalar((throttle * MAX_THRUST) / MASS);
    acc.addScaledVector(vel, -(DRAG_COEFF * (1 + FLAPS_DRAG * flapsAmt) * plane.speed) / MASS);

    const fs = Math.max(vel.dot(fwd), 0);
    let lift = Math.min((LIFT_COEFF * (1 + (FLAPS_LIFT - 1) * flapsAmt) * fs * fs) / MASS, LIFT_CAP_G * GRAVITY);
    lift *= smooth(STALL_SPEED * 0.6, STALL_SPEED, fs);
    lift *= clamp((CEILING - pos.y) / 200, 0, 1);
    if (plane.onGround) lift *= 0.75 + 0.25 * clamp(Math.asin(clamp(fwd.y, -1, 1)) / 0.15, 0, 1); // must rotate to lift off
    acc.y += lift * up.y - GRAVITY;

    vel.addScaledVector(acc, dt);

    const here = world.surfaceAt(pos.x, pos.z);
    const friction = here.friction;

    if (plane.onGround) {
      // Wheels: no sideways slip, rolling friction and brake only slow the roll
      let s = vel.x * flat.x + vel.z * flat.z;
      const decel = (friction * GRAVITY + (input.brake ? BRAKE_DECEL : 0)) * dt;
      s -= Math.sign(s) * Math.min(decel, Math.abs(s));
      vel.x = flat.x * s;
      vel.z = flat.z * s;
    } else {
      // Flight path follows the nose, keeping speed
      const sp = vel.length();
      if (sp > 1) {
        const a = 1 - Math.exp(-VELOCITY_ALIGN * clamp(sp / TAKEOFF_SPEED, 0.3, 1) * dt);
        vel.lerp(tmp.copy(fwd).multiplyScalar(sp), a).setLength(sp);
      }
    }

    if (vel.length() > MAX_SPEED) vel.setLength(MAX_SPEED);
    pos.addScaledVector(vel, dt);

    // Ground contact (landing evaluation and crashes come in Phase 4)
    const ground = world.surfaceAt(pos.x, pos.z);
    const groundY = ground.height + GEAR_HEIGHT;
    if (pos.y <= groundY) {
      pos.y = groundY;
      if (vel.y < 0) vel.y = 0;
      plane.onGround = true;
    } else {
      plane.onGround = false;
    }

    plane.speed = vel.length();
    plane.throttle = throttle;
    plane.flaps = flaps;
    plane.agl = pos.y - groundY;
    plane.altitude = pos.y - GEAR_HEIGHT;
    plane.surface = ground.type;
    plane.stalled = !plane.onGround && vel.dot(fwd) < STALL_SPEED;

    model.prop.rotation.z += (8 + throttle * 70) * dt;
  }

  // Interpolate between physics steps for smooth rendering at any frame rate
  function render(alpha) {
    group.position.lerpVectors(prevPos, pos, alpha);
    group.quaternion.copy(prevQuat).slerp(quat, alpha);
  }

  reset();
  return plane;
}
