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

const START_POS = new THREE.Vector3(-30, 0, -8);
const START_ROT = -Math.PI / 2; // faces +X, toward the field
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
let previousSpeedKmh = 0;
function loadNum(key, fallback, min = 0, max = Infinity) {
  try { const raw = localStorage.getItem(key); if (raw === null) return fallback; const n = Number(raw); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; } catch { return fallback; }
}
let fuel = loadNum('golden-field-fuel', 100, 0, 100);
let money = loadNum('golden-field-money', 25680, 0);
let plowedArea = 0;
let lastTrackPosition = null;
const plowedCells = new Set((() => { try { const a = JSON.parse(localStorage.getItem('golden-field-plowed-cells') || '[]'); return Array.isArray(a) ? a.filter(k => typeof k === 'string') : []; } catch { return []; } })());
let progressDirty = false;
const CELL_SIZE = 1.5;
function markNewPlowedCells(x, z) {
  // Count unique soil cells rather than awarding progress for repeatedly driving over one track.
  const cx = Math.floor(x / CELL_SIZE), cz = Math.floor(z / CELL_SIZE);
  let added = 0;
  for (let ox = -1; ox <= 1; ox++) for (let oz = -1; oz <= 1; oz++) {
    const px = (cx + ox + 0.5) * CELL_SIZE, pz = (cz + oz + 0.5) * CELL_SIZE;
    if (px < fieldBounds.minX || px > fieldBounds.maxX || pz < fieldBounds.minZ || pz > fieldBounds.maxZ) continue;
    const key = `${cx + ox},${cz + oz}`; if (!plowedCells.has(key)) { plowedCells.add(key); added++; }
  }
  if (added) { plowedArea += added * CELL_SIZE * CELL_SIZE; progressDirty = true; }
  return added;
}
let stampBaseY = 0.5; // soil surface height, refined from the field model after loading
// One InstancedMesh (ring buffer) holds every plowed stamp: many minutes of plowing stay at one draw call.
const MAX_STAMPS = 6000;
function buildStampGeometry() {
  const colored = (geo, hex, y) => {
    geo.rotateX(-Math.PI / 2); geo.translate(0, y, 0);
    const c = new THREE.Color(hex); const n = geo.attributes.position.count; const arr = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { arr[k*3] = c.r; arr[k*3+1] = c.g; arr[k*3+2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return geo;
  };
  const parts = [colored(new THREE.PlaneGeometry(3.0, 1), 0x49321f, 0.03)];
  for (let k = -3; k <= 3; k++) { const f = new THREE.PlaneGeometry(0.13, 1); f.translate(k * 0.40, 0, 0); parts.push(colored(f, 0x392719, 0.045)); }
  return mergeGeometries(parts.map(g => g.index ? g.toNonIndexed() : g));
}
const plowedTracks = new THREE.InstancedMesh(buildStampGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), MAX_STAMPS);
plowedTracks.name = 'DynamicPlowedTracks'; plowedTracks.count = 0; plowedTracks.frustumCulled = false; plowedTracks.receiveShadow = true; scene.add(plowedTracks);
let stampCursor = 0, stampTotal = 0;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _sc = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
let last = performance.now();
let cameraRig = null;
let missionSystem = null;
// Plowable soil: x -25..53, z -72..20 (from the field GLB). The farmstead sits west of it. Both are refined from the loaded models.
const fieldBounds = { minX: -25, maxX: 53, minZ: -72, maxZ: 20 };
const fuelPoint = new THREE.Vector3(-43, 0, -26);
const deliveryPoint = new THREE.Vector3(-53, 0, -23.7);
const groundZones = []; // { minX, maxX, minZ, maxZ, y } measured from the loaded models
function groundHeightAt(x, z) {
  let y = 0;
  for (const g of groundZones) if (x >= g.minX && x <= g.maxX && z >= g.minZ && z <= g.maxZ && g.y > y) y = g.y;
  return y;
}
function inField() {
  const p = tractorRoot.position;
  return p.x > fieldBounds.minX && p.x < fieldBounds.maxX && p.z > fieldBounds.minZ && p.z < fieldBounds.maxZ;
}
function addMarker(point, color, y) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(3.2, 4, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .75, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(point.x, y + 0.12, point.z); scene.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 7, 12), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .45 }));
  beam.position.set(point.x, y + 3.5, point.z); scene.add(beam);
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
        m.opacity = Math.min(m.opacity ?? 1, 0.12);
        m.depthWrite = false;
        m.side = THREE.DoubleSide;
        m.needsUpdate = true;
      }
    });
    o.renderOrder = 2;
  });
}
// Redraw previously plowed cells (saved progress) as furrow stamps once the field height is known.
function restorePlowedVisuals() {
  for (const key of plowedCells) {
    const [cx, cz] = key.split(',').map(Number);
    if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue;
    _q.identity(); _p.set((cx + 0.5) * CELL_SIZE, stampBaseY, (cz + 0.5) * CELL_SIZE); _sc.set(0.5, 1, CELL_SIZE + 0.15);
    _m.compose(_p, _q, _sc); plowedTracks.setMatrixAt(stampCursor, _m);
    stampCursor = (stampCursor + 1) % MAX_STAMPS; stampTotal = Math.min(stampTotal + 1, MAX_STAMPS);
  }
  plowedTracks.count = stampTotal; plowedTracks.instanceMatrix.needsUpdate = true;
}
// Progress is written at most every 2 s (and when the app is hidden), not every frame.
let lastSaveAt = 0;
function savePrefs(force = false) {
  const t = performance.now();
  if (!force && t - lastSaveAt < 2000) return;
  lastSaveAt = t;
  try {
    localStorage.setItem('golden-field-fuel', String(fuel));
    localStorage.setItem('golden-field-money', String(money));
    if (progressDirty) { localStorage.setItem('golden-field-plowed-cells', JSON.stringify([...plowedCells])); progressDirty = false; }
    missionSystem?.save();
  } catch { /* storage full or unavailable */ }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) savePrefs(true); });
window.addEventListener('pagehide', () => savePrefs(true));
function stampPlowedTrack(from, to) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.35) return;
  _q.setFromAxisAngle(_up, Math.atan2(dx, dz));
  _p.set((from.x + to.x) / 2, stampBaseY, (from.z + to.z) / 2);
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
    // Load assets independently: an optional cockpit/farmstead failure must not block driving.
    const loadOptional = async (name, path) => {
      try { return await loadGLB(BASE + path); }
      catch (error) { console.warn(`Optional/required asset failed (${name}); continuing with fallback:`, error); return null; }
    };
    const [tractorGltf, cockpitGltf, fieldGltf, farmGltf] = await Promise.all([
      loadOptional('tractor', 'models/john_deere_6R110_reference_rebuild.glb'),
      loadOptional('cockpit', 'models/tractor_cockpit_transparent_glass.glb'),
      loadOptional('unplowed field', 'models/unplowed_farm_field.glb'),
      loadOptional('farmstead', 'models/vintage_farmstead_asset_pack.glb')
    ]);
    if (tractorGltf) {
      scene.remove(tractorRoot);
      tractorRoot = tractorGltf.scene;
    tractorRoot.name = 'GoldenField_Tractor_GLB';
    tractorRoot.position.copy(START_POS); tractorRoot.rotation.y = START_ROT;
    setShadows(tractorRoot);
    scene.add(tractorRoot);
    } else { addFallbackTractor(); }

    // The supplied field and farmstead models use Z-up coordinates; rotate them into Three.js Y-up.
    fieldRoot = fieldGltf?.scene || null;
    if (fieldRoot) { fieldRoot.name = 'GoldenField_UnplowedField';
    centerAndGround(fieldRoot, 1, true);
    fieldRoot.position.x = -25; fieldRoot.position.z = 20;
    setShadows(fieldRoot);
    // Use the user's newly supplied UNPLOWED GLB as the real field surface.
    // Keep the already-plowed GLB loaded and available in assets, but do not place it
    // over the unplowed model: that would make the whole field look plowed from frame one.
    fieldRoot.visible = true;
    scene.add(fieldRoot);
    } else { console.warn('Unplowed field unavailable; fallback ground remains playable.'); }
    // Keep the supplied plowed field available for future terrain blending; never overlay it across the whole starting field.

    farmsteadRoot = farmGltf?.scene || null;
    if (farmsteadRoot) { farmsteadRoot.name = 'GoldenField_Farmstead';
    centerAndGround(farmsteadRoot, 1, true);
    farmsteadRoot.position.x = -50; farmsteadRoot.position.z = -30;
    setShadows(farmsteadRoot); scene.add(farmsteadRoot);
    }
    scene.updateMatrixWorld(true);
    // Measure the loaded models so zones, markers, plow tracks and wheel height all match what is on screen.
    const nodeBox = (root, ...keys) => { if (!root) return null; let f = null; root.traverse(o => { const n = (o.name || '').toLowerCase(); if (!f && keys.some(k => n.includes(k))) f = o; }); if (!f) return null; const b = new THREE.Box3().setFromObject(f); return Number.isFinite(b.min.x) ? b : null; };
    const soil = nodeBox(fieldRoot, 'plowed_soil', 'plowed soil');
    if (soil) { Object.assign(fieldBounds, { minX: soil.min.x, maxX: soil.max.x, minZ: soil.min.z, maxZ: soil.max.z }); stampBaseY = soil.max.y + 0.03; groundZones.push({ minX: soil.min.x, maxX: soil.max.x, minZ: soil.min.z, maxZ: soil.max.z, y: soil.max.y }); }
    const dry = nodeBox(fieldRoot, 'dry_ground', 'dry ground');
    if (dry) groundZones.push({ minX: dry.min.x, maxX: dry.max.x, minZ: dry.min.z, maxZ: dry.max.z, y: dry.max.y });
    const yardBox = nodeBox(farmsteadRoot, 'farmyard_base', 'farmyard base');
    if (yardBox) groundZones.push({ minX: yardBox.min.x, maxX: yardBox.max.x, minZ: yardBox.min.z, maxZ: yardBox.max.z, y: yardBox.max.y });
    const pad = nodeBox(farmsteadRoot, 'pump_concrete_pad', 'pump concrete pad');
    if (pad) { const c = pad.getCenter(new THREE.Vector3()); fuelPoint.set(c.x, 0, c.z + 2.5); }
    const barn = nodeBox(farmsteadRoot, 'barn_timber_shell', 'barn timber shell');
    if (barn) { const c = barn.getCenter(new THREE.Vector3()); deliveryPoint.set(c.x, 0, barn.max.z + 5); }
    addMarker(fuelPoint, 0xff9a1f, groundHeightAt(fuelPoint.x, fuelPoint.z)); addMarker(deliveryPoint, 0x3aa0ff, groundHeightAt(deliveryPoint.x, deliveryPoint.z));
    restorePlowedVisuals();

    // The supplied cockpit GLB is a separate interior asset authored Z-up. Parent it
    // to the tractor so it follows vehicle movement/rotation instead of floating at world origin.
    cockpitRoot = cockpitGltf?.scene || null;
    if (cockpitRoot) { cockpitRoot.name = 'GoldenField_CockpitAsset';
    cockpitRoot.rotation.set(-Math.PI / 2, 0, 0);
    cockpitRoot.scale.setScalar(0.25);
    cockpitRoot.position.set(0, 1.72, -0.28);
    prepareCockpitMaterials(cockpitRoot);
    setShadows(cockpitRoot);
    tractorRoot.add(cockpitRoot);
    cockpitRoot.visible = cameraRig?.mode === 'firstPerson';
    }

    // Driver eye anchor in tractor-local coordinates (tractor nose points toward -Z).
    // Use a high, slightly rearward position to keep the camera inside the cab but
    // clear of the dashboard mesh; this can be fine-tuned against a live screenshot.
    cabinAnchor = new THREE.Object3D();
    cabinAnchor.position.set(0, 2.35, -0.45);
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
    if (!tractorRoot.children.length) addFallbackTractor();
    assetsReady = true;
  }
}

missionSystem = new MissionSystem({
  onReward: reward => { money += reward; updateHud(); },
  onRefuel: () => { fuel = 100; updateHud(); setStatus('Fuel tank refilled. Ready to work!'); },
  getState: () => ({ nearFuel: distanceToPoint(fuelPoint) < 9, nearFarm: distanceToPoint(deliveryPoint) < 6, fuelPercent: fuel, speedKmh: Math.abs(speed)*3.6, gear: controls.input.gear, plowEnabled: controls.input.plowEnabled })
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
    const speedBeforeFrame = Math.abs(speed) * 3.6;
    const gearDirection = i.gear === 'R' ? -1 : i.gear === 'N' ? 0 : 1;
    const clutch = i.clutch ? 0.12 : 1;
    const throttle = fuel > 0 ? i.throttle * (i.gear === 'N' ? 0 : 1) * clutch : 0;
    // speed is always a non-negative magnitude; gear alone chooses travel direction.
    if (i.brake > 0) speed = Math.max(0, speed - i.brake * 8.5 * dt);
    else if (gearDirection !== 0) speed = Math.min(i.gear === 'R' ? 4.5 : 13.5, speed + throttle * 4.2 * dt);
    if (i.throttle === 0 && i.brake === 0) speed *= Math.pow(.986, dt * 60);
    if (i.gear === 'N') speed *= Math.pow(.82, dt * 60);
    if (speed < 0.035) speed = 0;
    const travel = speed * gearDirection * dt;
    tractorRoot.position.x -= Math.sin(tractorRoot.rotation.y) * travel;
    tractorRoot.position.z -= Math.cos(tractorRoot.rotation.y) * travel;
    tractorRoot.position.y += (groundHeightAt(tractorRoot.position.x, tractorRoot.position.z) - tractorRoot.position.y) * Math.min(1, dt * 5);
    const turnRate = (0.72 / (1 + Math.abs(speed) * .12)) * i.steer * Math.min(1, speed / 1.2);
    tractorRoot.rotation.y -= turnRate * dt * (gearDirection < 0 ? -1 : 1);
    if (i.plowEnabled && Math.abs(speed) > 0.8 && Math.abs(speed) < 8 && i.gear === 'D') {
      const p = tractorRoot.position;
      const insideField = inField();
      if (insideField) {
        const rear = new THREE.Vector3(p.x + Math.sin(tractorRoot.rotation.y)*2.0, 0, p.z + Math.cos(tractorRoot.rotation.y)*2.0);
        if (lastTrackPosition && lastTrackPosition.distanceTo(rear) > 0.45) { stampPlowedTrack(lastTrackPosition, rear); markNewPlowedCells(rear.x, rear.z); }
        lastTrackPosition = rear.clone();
      } else { lastTrackPosition = null; }
    } else { lastTrackPosition = null; }
    fuel = Math.max(0, fuel - throttle * dt * 0.018);
    savePrefs();
    updateHud();
    missionSystem?.update(dt, {
      inField: inField(), nearFuel: distanceToPoint(fuelPoint) < 9, nearFarm: distanceToPoint(deliveryPoint) < 6,
      speedKmh: Math.abs(speed) * 3.6, previousSpeedKmh: speedBeforeFrame, gear: i.gear,
      plowEnabled: i.plowEnabled, fuelPercent: fuel, brakePressed: i.brake > 0, distanceDelta: Math.abs(travel)
    });
  }
  cameraRig.update(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);
loadWorldAssets();
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
});
