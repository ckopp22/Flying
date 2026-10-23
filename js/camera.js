import * as THREE from 'three';

const CHASE_DIST = 13;
const CHASE_HEIGHT = 3.5;
const LOOK_AHEAD = 20;
const ROT_LAG = 3.5;        // 1/s. Lower = lazier chase camera
const ROLL_FOLLOW = 0.35;   // how much of the plane's roll the chase camera copies
const FOV_CHASE = 62;
const FOV_SPEED_BONUS = 16; // extra FOV at full speed
const FOV_COCKPIT = 78;
const MIN_CLEARANCE = 2;    // m above ground/water
const MAX_SPEED = 85;

export function createCamera(aspect) {
  const camera = new THREE.PerspectiveCamera(FOV_CHASE, aspect, 0.3, 9000);
  const rig = new THREE.Quaternion(), target = new THREE.Quaternion();
  const e = new THREE.Euler(), look = new THREE.Vector3(), upv = new THREE.Vector3();
  let cockpit = false, seenReset = -1, fov = FOV_CHASE;

  function toggle(plane) {
    cockpit = !cockpit;
    plane.setCockpit(cockpit);
  }

  function update(dt, plane, world) {
    const p = plane.group.position, q = plane.group.quaternion;

    if (cockpit) {
      camera.position.set(0, 0.75, -0.9).applyQuaternion(q).add(p);
      camera.quaternion.copy(q);
    } else {
      e.setFromQuaternion(q, 'YXZ');
      e.z *= ROLL_FOLLOW;
      target.setFromEuler(e);
      if (plane.resetCount !== seenReset) { rig.copy(target); seenReset = plane.resetCount; }
      else rig.slerp(target, 1 - Math.exp(-ROT_LAG * dt));

      camera.position.set(0, CHASE_HEIGHT, CHASE_DIST).applyQuaternion(rig).add(p);
      const floor = Math.max(world.surfaceAt(camera.position.x, camera.position.z).height, 0) + MIN_CLEARANCE;
      if (camera.position.y < floor) camera.position.y = floor;

      look.set(0, 1, -LOOK_AHEAD).applyQuaternion(rig).add(p);
      upv.set(0, 1, 0).applyQuaternion(rig);
      camera.up.set(0, 1, 0).lerp(upv, 0.5).normalize();
      camera.lookAt(look);
    }

    const targetFov = cockpit ? FOV_COCKPIT : FOV_CHASE + FOV_SPEED_BONUS * Math.min(plane.speed / MAX_SPEED, 1);
    fov += (targetFov - fov) * (1 - Math.exp(-4 * dt));
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  return {
    camera,
    toggle,
    update,
    resize(aspect) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    },
  };
}
