# AIRPLANE — Master Design Document (MDD)

**Version:** 1.0
**Platform:** Web (PWA), playable in browser and installable on iPhone/Android/desktop
**Built with:** Claude Code in VS Code
**Hosting:** GitHub Pages
**Genre:** Simple 3D flight simulator (casual, no missions required)

---

## 1. Overview

**Airplane** is a simple, relaxing 3D flying game. The player starts on a runway, takes off, flies freely around a map, and lands again, on either land or water. There are no enemies, timers, or fail-state pressure. The fun is in the feel of flying and the satisfaction of a smooth landing.

### Design Pillars
1. **Easy to pick up.** Anyone can fly within 30 seconds. Forgiving controls, no realistic-sim complexity.
2. **Satisfying take-off and landing.** The two core moments should feel great.
3. **Beautiful and calm.** Low-poly style, soft colors, smooth motion.
4. **Works everywhere.** Touch controls on phones, keyboard on desktop, runs smoothly on an iPhone.

### Scope
Small and finishable. One plane, one map, no accounts, no backend. Everything runs client-side.

---

## 2. Required Features (from the brief)

| Feature | Description |
|---|---|
| Main menu | Title screen with Play, How to Play, and Sound toggle |
| Sound toggle | On/off for all audio, remembered between sessions |
| How to Play | Screen explaining controls and landing rules |
| Take off | Accelerate on runway, pull up, lift off |
| Fly around | Free flight over a map with land and water |
| Land | Touch down on the runway, open land, **or water** |
| Web + PWA | Hosted on GitHub Pages, installable, works offline |

---

## 3. Tech Stack

- **Language:** Plain HTML / CSS / JavaScript (ES modules). No build step required.
- **3D engine:** three.js (vendored locally into `/lib/` so the PWA works offline, not loaded from a CDN)
- **Audio:** Web Audio API with synthesized sounds (no audio files needed). Keeps the download tiny.
- **Storage:** `localStorage` for sound setting and (optional) best landing score
- **PWA:** `manifest.json` + `service-worker.js` + icons
- **Hosting:** GitHub Pages from the `main` branch root
- **All asset paths must be relative** (`./`), since GitHub Pages serves from `/repo-name/`.

---

## 4. File Structure

```
airplane/
├── index.html
├── manifest.json
├── service-worker.js
├── css/
│   └── style.css
├── js/
│   ├── main.js          # boot, state machine, game loop
│   ├── world.js         # terrain, water, sky, runway, scenery
│   ├── plane.js         # plane model + flight physics
│   ├── controls.js      # keyboard, touch, gamepad (optional)
│   ├── camera.js        # chase camera + cockpit option
│   ├── audio.js         # synthesized engine/wind/splash sounds
│   ├── ui.js            # menus, HUD, how-to-play, toasts
│   └── storage.js       # localStorage wrapper
├── lib/
│   └── three.module.min.js
├── icons/
│   ├── icon-192.png
│   ├── icon-512.png
│   ├── icon-maskable-512.png
│   └── apple-touch-icon.png
└── README.md
```

---

## 5. Game Flow & Screens

### State machine
`MENU → PLAYING → (PAUSED) → PLAYING … → MENU`

### 5.1 Main Menu
- Title: **AIRPLANE**
- Background: the 3D world with the plane slowly circling or parked on the runway (live scene behind the menu)
- Buttons:
  - **Play**
  - **How to Play**
  - **Sound: On/Off** (toggle button with speaker icon)
- Small footer: version number

### 5.2 How to Play
A simple overlay with:
- **Controls** (shows keyboard and touch layouts)
- **Take off:** Hold throttle, build speed on the runway, pull the nose up
- **Landing:** Slow down, line up, descend gently, and touch down with the wheels level
- **Landing on water:** Plane floats (pontoon-style), so you can land on any water
- **Tips:** Use flaps/low throttle to slow down, watch the altitude and speed readouts
- **Back** button

### 5.3 Gameplay
- Plane begins at the end of the runway, engine idle
- HUD visible; pause button in the corner

### 5.4 Pause Menu
- Resume
- Sound toggle
- How to Play
- Quit to Menu
- Restart at runway (also available as a quick button if the plane crashes or gets stuck)

---

## 6. Controls

### Desktop (Keyboard)
| Action | Keys |
|---|---|
| Pitch down / up | `W` / `S` or `↑` / `↓` |
| Roll left / right | `A` / `D` or `←` / `→` |
| Yaw (rudder) | `Q` / `E` |
| Throttle up / down | `Shift` / `Ctrl` (or `R` / `F`) |
| Flaps toggle | `Space` |
| Brake | `B` |
| Camera change | `C` |
| Pause | `Esc` or `P` |
| Reset to runway | `Backspace` |

### Mobile (Touch, landscape recommended)
- **Left side:** virtual joystick for pitch (up/down) and roll (left/right)
- **Right side:** vertical throttle slider
- **Buttons:** Flaps, Brake, Camera, Pause
- Optional **tilt/gyro steering** toggle (off by default; needs iOS permission prompt)
- Buttons must be large (min 56px), with `touch-action: none` and multi-touch supported so joystick and throttle work at the same time.

### Gamepad (optional, stretch)
Standard mapping: left stick = pitch/roll, triggers = throttle.

---

## 7. Flight Model (Simplified Arcade Physics)

Goal: **feels like flying, forgiving, not a real aerodynamics sim.**

### Core variables
- `position`, `velocity`, `orientation (quaternion)`, `throttle (0–1)`, `speed`, `flaps (on/off)`, `onGround`, `inWater`

### Per-frame update (fixed timestep, e.g. 60 Hz)
1. **Thrust:** `throttle × maxThrust` along the plane's forward direction.
2. **Drag:** proportional to speed² (more with flaps and landing gear down).
3. **Lift:** proportional to speed² × lift coefficient, along the plane's up vector. Lift becomes strong enough to overcome gravity at about **takeoff speed**.
4. **Gravity:** constant downward force.
5. **Stall:** below a minimum airspeed the lift fades and the nose drops gently. This is a soft stall, **no spinning out of control**. Show a "STALL" warning on the HUD.
6. **Control response:** pitch/roll/yaw rates scale with airspeed (controls are sluggish when slow, responsive when fast). Smooth input with easing so it never feels twitchy.
7. **Auto-level assist (default ON):** when no roll input, the plane gently levels its wings. Toggle in settings for players who want full manual control.
8. **Speed cap & altitude ceiling:** soft ceiling (~1500 m) so players can't fly off forever; gently push back near map edges (see World).

### Tunable constants (put at the top of `plane.js`)
`MAX_THRUST, MASS, GRAVITY, LIFT_COEFF, DRAG_COEFF, STALL_SPEED, TAKEOFF_SPEED, MAX_SPEED, PITCH_RATE, ROLL_RATE, YAW_RATE, AUTO_LEVEL_STRENGTH`

Claude Code should keep these in one clearly commented block so feel can be adjusted easily.

---

## 8. Take-off & Landing Rules

### Take-off
- On the runway with throttle up, the plane accelerates.
- Above **TAKEOFF_SPEED**, pulling back lifts the nose and the plane leaves the ground.
- Flaps help lift off at lower speed.
- Taking off from **water** also works: the plane planes along the surface and lifts at the same speed (slightly more drag).

### Landing (any surface)
A landing is evaluated at first contact with ground or water:

| Condition | Result |
|---|---|
| Vertical speed ≤ safe limit, pitch/roll within limits, forward speed under limit | **Good landing** |
| Slightly over limits | **Rough landing** (bounce, wheels/floats skid, no penalty) |
| Far over limits | **Crash** (screen shake, "Crashed!" toast, auto-reset to runway after 2 s, with a Retry button) |

To keep the game gentle, the **safe thresholds are generous** (tunable constants). Crashing should be possible but not frustrating.

### Surfaces
- **Runway / land (grass, sand):** wheels roll, brake slows the plane. Grass has more rolling friction than runway. Plane rolls to a stop.
- **Water:** the plane **floats** with a gentle bobbing motion. Splash particles and a splash sound on touchdown. Drag is higher, so the plane slows quickly, then idles on the water. The player can take off again from water.
- **Mountains / trees / buildings:** treated as obstacles. Hitting them at speed is a crash.

### Landing feedback
- HUD toast: "Smooth landing!" / "Rough landing" / "Splashdown!"
- Optional **landing score** (0–100) based on vertical speed, alignment, and runway centering. Best score saved in `localStorage`. (Stretch goal.)

---

## 9. World / Map

One handcrafted map, roughly **8 km × 8 km**, low-poly style.

### Terrain
- Generated heightmap (simple noise, seeded so the map is the same every time) with:
  - A **flat main island** with the **airport and runway**
  - Hills and a few mountains
  - Beaches blending into water
  - A couple of smaller islands and a large lake/bay, so water landings are easy to find
- Terrain mesh with vertex colors by height (sand → grass → forest → rock → snow)

### Water
- Large flat plane at sea level with a simple animated shader or scrolling normal-style effect, semi-transparent blue. Keep it cheap for mobile.

### Airport
- One main runway (about 1000 m long) with markings, edge lights (optional), a windsock, and a small hangar/tower
- Optional second small grass airstrip on another island

### Scenery (instanced for performance)
- Low-poly trees, a few houses/small town, clouds drifting overhead
- Keep draw calls low (use `InstancedMesh`)

### Sky
- Gradient sky + sun directional light + soft fog to hide the draw distance
- Optional time-of-day setting (day / sunset), stretch goal

### Map edges
- Past the edge, show open ocean. If the plane flies too far, a toast says "Turn back!" and the plane gets a gentle nudge toward the center. (No hard wall.)

---

## 10. Plane

- Single low-poly airplane built from simple three.js primitives (fuselage, wings, tail, propeller, landing gear/floats) so no external model files are needed. (A `.glb` model can be swapped in later.)
- **Spinning propeller**, speed tied to throttle
- **Visible control surfaces** (ailerons, elevator, rudder) tilt with input (polish)
- Wheels retract visually at altitude (optional polish) and float pontoons are always present as small floats under the wheels, so the plane can sit on water
- 2–3 paint color options in a settings menu (stretch)

---

## 11. Camera

- **Chase camera (default):** behind and slightly above the plane, smoothly following with lag; FOV widens slightly with speed
- **Cockpit/first-person:** toggle with the Camera button
- **Orbit/free look** while paused or on the menu screen
- Camera must never clip into terrain (clamp above ground height)

---

## 12. HUD

Minimal and readable on a phone:
- **Speed** (knots or km/h)
- **Altitude** (m above ground and above sea level)
- **Throttle bar**
- **Flaps indicator**
- **Warnings:** STALL, "PULL UP", "Low altitude"
- **Compass / heading** strip (optional)
- **Mini-map** (stretch): small top-down map with plane and runway icons
- Pause button, sound icon

HUD uses HTML/CSS overlays (not canvas) for crisp text. Respect iPhone safe areas (`env(safe-area-inset-*)`).

---

## 13. Audio

All synthesized with the Web Audio API (no files to download).

| Sound | Method |
|---|---|
| Engine | Oscillator(s) + filtered noise; pitch and volume follow throttle |
| Wind | Filtered noise; volume follows airspeed |
| Touchdown thump | Short low-frequency burst |
| Water splash | Noise burst with a lowpass sweep |
| Stall beeper | Short repeating beep |
| UI click | Tiny blip on buttons |

- **Sound toggle** in Main Menu and Pause Menu; setting saved to `localStorage` and applies instantly (master gain to 0 and suspend context).
- Audio context must be started **after a user tap** (iOS requirement). Starting on the Play button handles this.
- Pause audio when the tab is hidden.

---

## 14. Visual Style

- Low-poly, flat-shaded, bright and soft colors
- Soft shadows only if the framerate allows (shadow map just around the plane)
- Fog for depth and performance
- Clean, rounded UI font (system font stack, no external font downloads for offline use)
- Color palette: sky blue, ocean teal, grass green, sand yellow, warm white UI, a bold orange accent for buttons

---

## 15. PWA Requirements

### manifest.json
- `name: "Airplane"`, `short_name: "Airplane"`
- `start_url: "./"`, `scope: "./"`
- `display: "fullscreen"` (fallback `standalone`)
- `orientation: "landscape"`
- `theme_color` and `background_color` set to match the sky/menu
- Icons: 192, 512, maskable 512, plus `apple-touch-icon.png` (180×180)

### index.html essentials
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">`
- `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-touch-icon`
- Prevent scroll/zoom/pull-to-refresh/long-press selection on the game canvas (`touch-action: none`, `overscroll-behavior: none`, `user-select: none`)

### service-worker.js
- Pre-cache every file (HTML, CSS, JS, three.js, icons) on install
- Cache-first strategy for offline play
- **Versioned cache name** (e.g. `airplane-v1`) bumped each release; delete old caches on activate, so updates actually arrive
- Show an "Update available, reload" toast when a new service worker is waiting (polish)

### Install
- Android/desktop Chrome: handle `beforeinstallprompt` and show an optional **Install** button on the menu
- iOS: Safari has no install prompt, so show a small one-time hint on the menu: "Tap Share → Add to Home Screen"

---

## 16. Deployment (GitHub Pages)

1. Create a repo named `airplane` and push the project to `main`.
2. Repo **Settings → Pages → Deploy from branch → `main` / root**.
3. The game goes live at `https://<username>.github.io/airplane/`.
4. All paths relative; service worker registered with a relative path (`./service-worker.js`).
5. After each update: bump the cache version in `service-worker.js`, commit, push.
6. Test the installed PWA on a real iPhone and Android device after each deploy.

---

## 17. Performance Targets

- **60 fps** on a recent iPhone, 30 fps minimum on older devices
- Cap pixel ratio at 2 (`renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`)
- Use `InstancedMesh` for trees/buildings, merge static geometry
- Limit draw distance with fog + camera far plane
- Fixed-timestep physics decoupled from render framerate
- Total download under ~2 MB (three.js is the biggest piece)
- Optional **Graphics Quality** setting (Low / High) that toggles shadows, water effects, and tree density

---

## 18. Settings (stretch, keep simple)

- Sound on/off (required)
- Graphics quality
- Auto-level assist on/off
- Tilt controls on/off
- Invert pitch
- Plane color

All saved to `localStorage` under a single `airplane_settings` key.

---

## 19. Build Plan for Claude Code (Phases)

Do these in order and test each phase in the browser (use a local server such as `npx serve` or VS Code Live Server; service workers require http/https, not `file://`).

**Phase 1 — Skeleton**
Project structure, `index.html`, three.js scene with sky, flat water, simple terrain, and a placeholder plane. Render loop running.

**Phase 2 — Plane & flight**
Plane model from primitives, flight physics, keyboard controls, chase camera. Plane can take off from a flat runway and fly.

**Phase 3 — World**
Heightmap terrain with islands, runway, airport buildings, trees (instanced), clouds, fog.

**Phase 4 — Landing & surfaces**
Ground collision, surface types (runway/grass/water), landing evaluation, crash and reset, water floating and splash.

**Phase 5 — UI**
Main menu, How to Play, pause menu, HUD, sound toggle (UI wired, even before audio is done).

**Phase 6 — Audio**
Synthesized engine/wind/splash/stall sounds, with the sound toggle working and persisted.

**Phase 7 — Mobile controls**
Virtual joystick, throttle slider, buttons, safe areas, landscape layout, multi-touch tested on a real phone.

**Phase 8 — PWA**
Manifest, icons, service worker, offline test, install hints (iOS and Android).

**Phase 9 — Polish & deploy**
Performance pass, tune flight constants, landing messages, README, push to GitHub Pages, test on real devices.

---

## 20. Testing Checklist

- [ ] Menu → Play → plane spawns on runway
- [ ] Can take off, fly in all directions, and not fall through the world
- [ ] Can land on the runway and roll to a stop
- [ ] Can land on grass/sand
- [ ] Can land on water and float; can take off from water again
- [ ] Crash triggers a reset; reset always works
- [ ] Stall behavior is gentle and recoverable
- [ ] Sound toggle works in menu and pause; persists after reload
- [ ] How to Play opens and closes from both menu and pause
- [ ] Touch controls work with two thumbs at once on iPhone
- [ ] No page scroll, bounce, or zoom while playing on mobile
- [ ] Works offline after first load
- [ ] Installs to the home screen on iOS and Android with the correct icon and name
- [ ] New deploy actually updates installed copies (cache version bump)
- [ ] Holds target framerate on a real phone

---

## 21. Out of Scope (v1)

Multiplayer, missions/career mode, realistic aerodynamics, weather systems, multiple planes with different handling, leaderboards/accounts, in-app purchases. These could be considered for a v2.

---

## 22. Starter Prompt for Claude Code

> Read `Airplane_MDD.md` fully. Build the game "Airplane" in plain HTML/CSS/JS with three.js vendored locally in `/lib/`, following the file structure and phases in the MDD. Start with Phase 1 and 2, run it locally, and tell me what to test before moving on. Keep all flight constants in one block at the top of `plane.js`. Use relative paths everywhere so it works on GitHub Pages.
