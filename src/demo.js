import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MobileControls } from './mobile-controls.js';
import { CameraRig } from './camera-rig.js';
import { MissionSystem } from './mission-system.js';

const BASE = import.meta.env.BASE_URL;
const $ = (s) => document.querySelector(s);
const canvas = $('#game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bd2f4);
scene.fog = new THREE.Fog(0x9bd2f4, 100, 320);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 700);
scene.add(new THREE.HemisphereLight(0xd9efff, 0x655039, 2.0));
const sun = new THREE.DirectionalLight(0xffe5b7, 3.1);
sun.position.set(-35, 65, 28); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -100; sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100; sun.shadow.camera.bottom = -100; scene.add(sun);

// A fallback yard and ground stay visible while the GLB assets load.
const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshLambertMaterial({ color: 0x648d3b }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.08; ground.receiveShadow = true; scene.add(ground);
const yard = new THREE.Mesh(new THREE.PlaneGeometry(28, 36), new THREE.MeshLambertMaterial({ color: 0x9a8b6b }));
yard.rotation.x = -Math.PI / 2; yard.position.set(-10, -0.035, -10); yard.receiveShadow = true; scene.add(yard);

const START_POS = new THREE.Vector3(-12, 0, -23);
const START_ROT = Math.PI; // faces +Z, toward the field
let tractorRoot = new THREE.Group();
tractorRoot.name = 'GoldenField_Tractor_Loading';
tractorRoot.position.copy(START_POS); tractorRoot.rotation.y = START_ROT;
scene.add(tractorRoot);
let cockpitRoot = null;
let fieldRoot = null;
let farmsteadRoot = null;
let cabinAnchor = new THREE.Object3D();
cabinAnchor.position.set(0, 2.75, 0.0);
tractorRoot.add(cabinAnchor);
let steeringMesh = null;
let assetsReady = false;
let paused = false;
let steerAngle = 0;
let speed = 0;
let fuel = 100;
let money = 25680;
let plowedArea = 0;
let lastTrackPosition = null;
// One InstancedMesh (ring buffer) holds every plowed stamp, so many minutes of plowing stay at a single draw call.
const MAX_STAMPS = 6000;
function buildStampGeometry() {
  const colored = (geo, hex, y) => {
    geo.rotateX(-Math.PI / 2); geo.translate(0, y, 0);
    const c = new THREE.Color(hex); const n = geo.attributes.position.count; const arr = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { arr[k*3] = c.r; arr[k*3+1] = c.g; arr[k*3+2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return geo;
  };
  const parts = [colored(new THREE.PlaneGeometry(2.6, 1), 0x49321f, 0.035)];
  for (let k = -2; k <= 2; k++) { const f = new THREE.PlaneGeometry(0.10, 1); f.translate(k * 0.42, 0, 0); parts.push(colored(f, 0x6b4a2c, 0.043)); }
  return mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g));
}
const plowedTracks = new THREE.InstancedMesh(buildStampGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), MAX_STAMPS);
plowedTracks.name = 'DynamicPlowedTracks'; plowedTracks.count = 0; plowedTracks.frustumCulled = false; plowedTracks.receiveShadow = true; scene.add(plowedTracks);
let stampCursor = 0, stampTotal = 0;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _sc = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
let last = performance.now();
let cameraRig = null;
let missionSystem = null;
// Unplowed field plane: x -62..12, z -20..75. Farmstead sits north of it (z about -54..-27).
const fieldBounds = { minX: -62, maxX: 12, minZ: -20, maxZ: 75 };
const fuelPoint = new THREE.Vector3(-5, 0, -36);
const deliveryPoint = new THREE.Vector3(-15, 0, -33);
function inField() {
  const p = tractorRoot.position;
  return p.x > fieldBounds.minX && p.x < fieldBounds.maxX && p.z > fieldBounds.minZ && p.z < fieldBounds.maxZ;
}
function addMarker(point, color) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 4, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .75, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(point.x, 0.12, point.z); scene.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 7, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .45 }));
  beam.position.set(point.x, 3.5, point.z); scene.add(beam);
}
function distanceToPoint(point) { return Math.hypot(tractorRoot.position.x-point.x, tractorRoot.position.z-point.z); }

function setStatus(message) { const el = $('#control-hint'); if (el) el.textContent = message; }
function setGearLabel(gear) { $('#gear-selector').textContent = gear; }
function updateHud() {
  $('#control-money').textContent = '$ ' + Math.round(money).toLocaleString('en-US');
  const s = $('#speed-value'); if (s) s.textContent = `${Math.round(Math.abs(speed) * 3.6)} km/h`;
  const f = $('#fuel-value'); if (f) f.textContent = `${Math.round(fuel)}%`;
}

const controls = new MobileControls({
  root: document,
  onGearChange: setGearLabel,
  onSteeringVisual: radians => { steerAngle = radians; if (steeringMesh) steeringMesh.rotation.y = radians; },
  onPlowToggle: enabled => {
    const label = $('#plow-status'); if (label) label.textContent = enabled ? 'PLOW DOWN' : 'PLOW UP';
    setStatus(enabled ? 'Plow engaged — drive across the field to work the soil' : 'Plow raised');
  }
});

const loader = new GLTFLoader();
function loadGLB(path) { return new Promise((resolve, reject) => loader.load(path, resolve, undefined, reject)); }
function setShadows(root) {
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (o.material) { const mats = Array.isArray(o.material) ? o.material : [o.material]; mats.forEach(m => { if (m.map) m.map.colorSpace = THREE.SRGBColorSpace; }); } } });
}
function prepareCockpitMaterials(root) {
  root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(m => {
      const n = (m.name || '').toLowerCase();
      const glassLike = n.includes('glass') || n.includes('wind') || n.includes('window') || m.transparent || (m.opacity < 0.98);
      if (glassLike) {
        m.transparent = true;
        m.opacity = Math.min(m.opacity ?? 1, 0.22);
        m.depthWrite = false;
        m.side = THREE.DoubleSide;
        m.needsUpdate = true;
      }
    });
    o.renderOrder = 2;
  });
}
function stampPlowedTrack(from, to) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.35) return;
  const angle = Math.atan2(dx, dz);
  _q.setFromAxisAngle(_up, angle);
  _p.set((from.x + to.x) / 2, 0, (from.z + to.z) / 2);
  _sc.set(1, 1, len + 0.15);
  _m.compose(_p, _q, _sc);
  plowedTracks.setMatrixAt(stampCursor, _m);
  stampCursor = (stampCursor + 1) % MAX_STAMPS;
  stampTotal = Math.min(stampTotal + 1, MAX_STAMPS);
  plowedTracks.count = stampTotal;
  plowedTracks.instanceMatrix.needsUpdate = true;
}
function centerAndGround(root, scale, upAxisRotation = false) {
  if (upAxisRotation) root.rotation.x = -Math.PI / 2;
  root.scale.setScalar(scale);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (Number.isFinite(box.min.y)) root.position.y += -box.min.y;
  root.updateMatrixWorld(true);
}
function addFallbackTractor() {
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.1, 3.4), new THREE.MeshStandardMaterial({ color: 0x3d7b39 }));
  body.position.y = 1.35; body.castShadow = true; tractorRoot.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.25, 1.35), new THREE.MeshStandardMaterial({ color: 0x243d38, transparent: true, opacity: .78 }));
  cab.position.set(0, 2.35, .05); tractorRoot.add(cab);
  for (const [x,z,r] of [[-1.05,1,.7],[1.05,1,.7],[-.88,-1,.45],[.88,-1,.45]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(r,r,.26,16), new THREE.MeshStandardMaterial({color:0x202326}));
    w.rotation.z = Math.PI/2; w.position.set(x,r,z); w.castShadow = true; tractorRoot.add(w);
  }
}

async function loadWorldAssets() {
  setStatus('Loading your tractor, cockpit, farmland and farmstead…');
  try {
    const [tractorGltf, cockpitGltf, fieldGltf, farmGltf] = await Promise.all([
      loadGLB(BASE + 'models/john_deere_6R110_reference_rebuild.glb'),
      loadGLB(BASE + 'models/tractor_cockpit_transparent_glass.glb'),
      loadGLB(BASE + 'models/plowed_farm_field_replica.glb'),
      loadGLB(BASE + 'models/vintage_farmstead_asset_pack.glb')
    ]);
    scene.remove(tractorRoot);
    tractorRoot = tractorGltf.scene;
    tractorRoot.name = 'GoldenField_Tractor_GLB';
    tractorRoot.position.copy(START_POS); tractorRoot.rotation.y = START_ROT;
    setShadows(tractorRoot);
    scene.add(tractorRoot);

    // The supplied field and farmstead models use Z-up coordinates; rotate them into Three.js Y-up.
    fieldRoot = fieldGltf.scene; fieldRoot.name = 'GoldenField_PlowedField';
    centerAndGround(fieldRoot, 1, true);
    fieldRoot.position.x = -25; fieldRoot.position.z = 20;
    setShadows(fieldRoot);
    // The only supplied field GLB is already plowed. Keep it in the project, but use a
    // fresh unplowed-looking field surface in the playable scene so furrows appear only
    // where the player actually drives with the plow lowered.
    fieldRoot.visible = false; scene.add(fieldRoot);
    const fieldBase = new THREE.Mesh(new THREE.PlaneGeometry(74, 95), new THREE.MeshStandardMaterial({ color: 0x806b43, roughness: 1 }));
    fieldBase.name = 'UnplowedFieldBase'; fieldBase.rotation.x = -Math.PI/2; fieldBase.position.set(-25, 0.005, 27.5); fieldBase.receiveShadow = true; scene.add(fieldBase);
    // Light, subtle unworked soil texture lines.
    const baseRows = new THREE.Group(); baseRows.name = 'UnplowedFieldRows';
    const rowMat = new THREE.MeshStandardMaterial({ color: 0x88774e, roughness: 1, side: THREE.DoubleSide });
    for (let z=-18; z<75; z+=2.6) { const row = new THREE.Mesh(new THREE.PlaneGeometry(73, 0.035), rowMat); row.rotation.x=-Math.PI/2; row.position.set(-25,0.012,z); baseRows.add(row); }
    scene.add(baseRows);

    farmsteadRoot = farmGltf.scene; farmsteadRoot.name = 'GoldenField_Farmstead';
    centerAndGround(farmsteadRoot, 1, true);
    farmsteadRoot.position.x = -12; farmsteadRoot.position.z = -40;
    setShadows(farmsteadRoot); scene.add(farmsteadRoot);
    scene.updateMatrixWorld(true);
    // Refine mission points from the real loaded farmstead (falls back to the constants above).
    const boxOf = (root, key) => { let f = null; root.traverse(o => { if (!f && (o.name || '').toLowerCase().includes(key)) f = o; }); return f ? new THREE.Box3().setFromObject(f) : null; };
    const pad = boxOf(farmsteadRoot, 'pump_concrete_pad') || boxOf(farmsteadRoot, 'pump concrete pad');
    if (pad && Number.isFinite(pad.min.x)) { const c = pad.getCenter(new THREE.Vector3()); fuelPoint.set(c.x, 0, c.z + 2.5); }
    const barn = boxOf(farmsteadRoot, 'barn_timber_shell') || boxOf(farmsteadRoot, 'barn timber shell');
    if (barn && Number.isFinite(barn.min.x)) { const c = barn.getCenter(new THREE.Vector3()); deliveryPoint.set(c.x, 0, barn.max.z + 5); }
    addMarker(fuelPoint, 0xff9a1f); addMarker(deliveryPoint, 0x3aa0ff);

    // The supplied cockpit GLB is a separate interior asset authored Z-up. Parent it
    // to the tractor so it follows vehicle movement/rotation instead of floating at world origin.
    cockpitRoot = cockpitGltf.scene; cockpitRoot.name = 'GoldenField_CockpitAsset';
    cockpitRoot.rotation.set(-Math.PI / 2, 0, 0);
    cockpitRoot.scale.setScalar(0.25);
    cockpitRoot.position.set(0, 1.72, -0.28);
    prepareCockpitMaterials(cockpitRoot);
    setShadows(cockpitRoot);
    tractorRoot.add(cockpitRoot);
    cockpitRoot.visible = cameraRig?.mode === 'firstPerson';

    // Driver eye anchor in tractor-local coordinates (tractor nose points toward -Z).
    // Use a high, slightly rearward position to keep the camera inside the cab but
    // clear of the dashboard mesh; this can be fine-tuned against a live screenshot.
    cabinAnchor = new THREE.Object3D();
    cabinAnchor.position.set(0, 2.45, -0.72);
    tractorRoot.add(cabinAnchor);

    // The actual GLB is now the driven vehicle. Keep a named node available for steering animation if present.
    steeringMesh = null;
    tractorRoot.traverse(o => {
      const n = (o.name || '').toLowerCase();
      if (!steeringMesh && (n.includes('steering') || n.includes('steer_wheel'))) steeringMesh = o;
    });
    assetsReady = true;
    setStatus('Your tractor is ready — hold THROTTLE to drive. Tap 📷 for cockpit view.');
    if (cameraRig) {
      cameraRig.tractorRoot = tractorRoot;
      cameraRig.cabinAnchor = cabinAnchor;
      cameraRig.update(1/60);
    }
  } catch (err) {
    console.error('Could not load one or more GLB assets:', err);
    setStatus('Model loading failed. Run this project through npm run dev (not file://) and check assets/ paths.');
    addFallbackTractor();
  }
}

missionSystem = new MissionSystem({
  onReward: reward => { money += reward; updateHud(); },
  onRefuel: () => { fuel = 100; updateHud(); setStatus('Fuel tank refilled. Ready to work!'); },
  getState: () => ({ nearFuel: distanceToPoint(fuelPoint) < 9 })
});

cameraRig = new CameraRig({
  camera, tractorRoot, cabinAnchor,
  thirdPersonOffset: new THREE.Vector3(0, 4.7, 9.5),
  firstPersonOffset: new THREE.Vector3(0, 0, 0),
  storageKey: 'golden-field-camera-mode',
  onModeChange: mode => {
    $('#view-label').textContent = mode === 'firstPerson' ? 'FIRST-PERSON COCKPIT VIEW' : 'THIRD-PERSON VIEW';
    $('#camera-toggle').textContent = mode === 'firstPerson' ? '🚜' : '📷';
    if (cockpitRoot) cockpitRoot.visible = mode === 'firstPerson';
  }
});
$('#camera-toggle').addEventListener('click', () => cameraRig.toggle());
$('#control-pause').addEventListener('click', () => {
  paused = !paused; $('#control-pause').textContent = paused ? '▶' : 'Ⅱ';
  setStatus(paused ? 'PAUSED' : 'Hold pedals · Drag wheel · 📷 Change view');
});

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (!paused && assetsReady) {
    const i = controls.input;
    const gearDirection = i.gear === 'R' ? -1 : i.gear === 'N' ? 0 : 1;
    const clutch = i.clutch ? 0.12 : 1;
    const throttle = i.throttle * (i.gear === 'N' ? 0 : 1) * clutch;
    const accel = throttle * 4.2 - i.brake * 8.5;
    speed = THREE.MathUtils.clamp(speed + accel * dt, -4.5, 13.5);
    if (i.throttle === 0 && i.brake === 0) speed *= Math.pow(.986, dt * 60);
    if (i.gear === 'N') speed *= Math.pow(.82, dt * 60);
    if (i.brake > 0 && Math.abs(speed) < .12) speed = 0;
    const travel = speed * gearDirection * dt;
    tractorRoot.position.x -= Math.sin(tractorRoot.rotation.y) * travel;
    tractorRoot.position.z -= Math.cos(tractorRoot.rotation.y) * travel;
    const turnRate = (0.72 / (1 + Math.abs(speed) * .12)) * i.steer;
    tractorRoot.rotation.y -= turnRate * dt * (speed < 0 ? -1 : 1);
    if (i.plowEnabled && Math.abs(speed) > 0.8 && Math.abs(speed) < 8 && i.gear === 'D') {
      const p = tractorRoot.position;
      const insideField = inField();
      if (insideField) {
        plowedArea += Math.abs(speed) * dt * 0.12;
        const rear = new THREE.Vector3(p.x + Math.sin(tractorRoot.rotation.y)*2.0, 0, p.z + Math.cos(tractorRoot.rotation.y)*2.0);
        if (lastTrackPosition && lastTrackPosition.distanceTo(rear) > 0.45) stampPlowedTrack(lastTrackPosition, rear);
        lastTrackPosition = rear.clone();
      } else { lastTrackPosition = null; }
    } else { lastTrackPosition = null; }
    fuel = Math.max(0, fuel - throttle * dt * 0.018);
    missionSystem.update(dt, {
      inField: inField(),
      plowEnabled: i.plowEnabled,
      speedKmh: Math.abs(speed) * 3.6,
      gear: i.gear,
      nearFarm: distanceToPoint(deliveryPoint) < 6,
      nearFuel: distanceToPoint(fuelPoint) < 9
    });
    updateHud();
  }
  cameraRig.update(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
loadWorldAssets();
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
});
