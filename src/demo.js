import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
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
renderer.toneMappingExposure = 1.25;
renderer.setClearColor(0x9bd2f4, 1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9bd2f4);
scene.fog = new THREE.Fog(0x9bd2f4, 100, 320);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 700);
scene.add(new THREE.HemisphereLight(0xeaf5ff, 0x77705f, 2.5));
scene.add(new THREE.AmbientLight(0xffffff, 0.65));
// A lightweight studio environment gives metallic/PBR GLB materials something to reflect.
// This is generated locally: no HDR download or internet connection is required.
const environmentPmrem = new THREE.PMREMGenerator(renderer);
const studioEnvironment = new RoomEnvironment();
scene.environment = environmentPmrem.fromScene(studioEnvironment, 0.04).texture;
studioEnvironment.dispose();
environmentPmrem.dispose();
const sun = new THREE.DirectionalLight(0xfff0d6, 3.4);
sun.position.set(-35, 65, 28); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -100; sun.shadow.camera.right = 100;
sun.shadow.camera.top = 100; sun.shadow.camera.bottom = -100; scene.add(sun);

// A fallback yard and ground stay visible while the GLB assets load.
const ground = new THREE.Mesh(new THREE.PlaneGeometry(500, 500), new THREE.MeshLambertMaterial({ color: 0x648d3b }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.08; ground.receiveShadow = true; scene.add(ground);
const yard = new THREE.Mesh(new THREE.PlaneGeometry(28, 36), new THREE.MeshLambertMaterial({ color: 0x9a8b6b }));
yard.rotation.x = -Math.PI / 2; yard.position.set(-10, -0.035, -10); yard.receiveShadow = true; scene.add(yard);

// Driver eye position in tractor-local space (tractor nose points toward -Z).
const COCKPIT_EYE = new THREE.Vector3(0, 2.6, 0.4);
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
function markSweptPlowCells(from, to, width = 2.4) {
  // Credit only grid cells intersecting the actual swept implement corridor.
  // This avoids the old 3x3 stamp that could credit ~20 m² after a tiny movement.
  const half = width / 2;
  const minX = Math.max(fieldBounds.minX, Math.min(from.x, to.x) - half - CELL_SIZE * 0.71);
  const maxX = Math.min(fieldBounds.maxX, Math.max(from.x, to.x) + half + CELL_SIZE * 0.71);
  const minZ = Math.max(fieldBounds.minZ, Math.min(from.z, to.z) - half - CELL_SIZE * 0.71);
  const maxZ = Math.min(fieldBounds.maxZ, Math.max(from.z, to.z) + half + CELL_SIZE * 0.71);
  const dx = to.x - from.x, dz = to.z - from.z;
  const lenSq = dx * dx + dz * dz;
  let added = 0;
  for (let cx = Math.floor(minX / CELL_SIZE); cx <= Math.floor(maxX / CELL_SIZE); cx++) {
    for (let cz = Math.floor(minZ / CELL_SIZE); cz <= Math.floor(maxZ / CELL_SIZE); cz++) {
      const px = (cx + 0.5) * CELL_SIZE, pz = (cz + 0.5) * CELL_SIZE;
      if (px < fieldBounds.minX || px > fieldBounds.maxX || pz < fieldBounds.minZ || pz > fieldBounds.maxZ) continue;
      const t = lenSq > 1e-8 ? Math.max(0, Math.min(1, ((px-from.x)*dx + (pz-from.z)*dz) / lenSq)) : 0;
      const nearX = from.x + t * dx, nearZ = from.z + t * dz;
      const radius = half + CELL_SIZE * 0.7072;
      if ((px-nearX)**2 + (pz-nearZ)**2 > radius*radius) continue;
      const key = `${cx},${cz}`;
      if (!plowedCells.has(key)) { plowedCells.add(key); added++; }
    }
  }
  const area = added * CELL_SIZE * CELL_SIZE;
  if (added) { plowedArea += area; progressDirty = true; }
  return area;
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
  onGearChange: gear => {
    const prevDrive = tractorRoot.userData.driveGear || 'D'; // last non-neutral gear
    if (gear !== 'N' && gear !== prevDrive && Math.abs(speed) * 3.6 > 1.2) {
      setStatus('Stop the tractor before changing direction.');
      controls.input.gear = tractorRoot.userData.lastGear || 'N';
      setGearLabel(controls.input.gear);
      return;
    }
    if (gear !== 'N') tractorRoot.userData.driveGear = gear;
    setGearLabel(gear);
    tractorRoot.userData.lastGear = gear;
  },
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
// In cockpit view only the cockpit interior is drawn; the tractor's own body would otherwise surround the
// camera (backfaces, dark interior). Third-person view shows the full tractor again.
function setTractorBodyVisible(visible) {
  tractorRoot.children.forEach(c => { if (c !== cockpitRoot && c !== cabinAnchor) c.visible = visible; });
}
function prepareCockpitMaterials(root) {
  root.traverse(o => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    mats.forEach(m => {
      const n = (m.name || '').toLowerCase();
      const glassLike = n.includes('glass') || n.includes('windshield') || n.includes('window');
      if (glassLike) {
        // Preserve the GLB's authored alpha (the supplied windshield is already BLEND).
        // Do not force every transparent material in the cockpit to near-invisible opacity.
        m.transparent = true;
        m.opacity = Math.min(Number.isFinite(m.opacity) ? m.opacity : 0.22, 0.28);
        m.depthWrite = false;
        m.side = THREE.DoubleSide;
        if ('metalness' in m) m.metalness = 0;
        if ('roughness' in m) m.roughness = 0.18;
        m.needsUpdate = true;
      }
    });
    // Keep interior surfaces visible from the driver's side even if the source normals
    // were exported with the opposite winding.
    o.material = Array.isArray(o.material) ? o.material : o.material;
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
  } catch (err) { console.error('Golden Field save failed:', err); setStatus('SAVE FAILED — free device storage and retry.'); }
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

    // The cockpit GLB is authored Z-up (footwell floor at z~0, windshield spanning z 1.95-6.05, hood
    // extending toward +Y). Rotating -90 degrees about X maps its forward (+Y) to the tractor's -Z and
    // its up (+Z) to +Y. The driver's eye in cockpit coordinates is about (0, -2.2, 3.3) behind the
    // steering wheel; at scale 0.25 that is (0, 0.825, 0.55) in tractor space, so the cockpit is placed
    // so that point lands exactly on the camera anchor below.
    cockpitRoot = cockpitGltf?.scene || null;
    if (cockpitRoot) { cockpitRoot.name = 'GoldenField_CockpitAsset';
    cockpitRoot.rotation.set(-Math.PI / 2, 0, 0);
    cockpitRoot.scale.setScalar(0.25);
    cockpitRoot.position.set(0, COCKPIT_EYE.y - 0.825, COCKPIT_EYE.z - 0.55);
    prepareCockpitMaterials(cockpitRoot);
    setShadows(cockpitRoot);
    tractorRoot.add(cockpitRoot);
    cockpitRoot.visible = cameraRig?.mode === 'firstPerson';
    setTractorBodyVisible(cameraRig?.mode !== 'firstPerson');
    }

    // Driver eye anchor in tractor-local coordinates (tractor nose points toward -Z).
    // Use a high, slightly rearward position to keep the camera inside the cab but
    // clear of the dashboard mesh; this can be fine-tuned against a live screenshot.
    cabinAnchor = new THREE.Object3D();
    cabinAnchor.position.copy(COCKPIT_EYE);
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
    if (cockpitRoot) { cockpitRoot.visible = mode === 'firstPerson'; setTractorBodyVisible(mode !== 'firstPerson'); }
  }
});
$('#camera-toggle').addEventListener('click', () => cameraRig.toggle());
$('#control-pause').addEventListener('click', () => {
  paused = !paused; if (paused) controls.releaseAll(); savePrefs(true); $('#control-pause').textContent = paused ? '▶' : 'Ⅱ';
  setStatus(paused ? 'PAUSED' : 'Hold pedals · Drag wheel · 📷 Change view');
});

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  if (!paused && assetsReady) {
    const i = controls.input;
    const speedBeforeFrame = Math.abs(speed) * 3.6;
    const gearDirection = i.gear === 'R' ? -1 : i.gear === 'N' ? 0 : 1;
    // Direction changes are interlocked in the gear-change handler (onGearChange), so gear alone sets direction here.
    const clutch = i.clutch ? 0 : 1;
    const plowLoad = i.plowEnabled && inField() ? 0.62 : 1;
    const throttle = fuel > 0 ? i.throttle * (i.gear === 'N' ? 0 : 1) * clutch * plowLoad : 0;
    // Speed is a magnitude; gear chooses direction, but cannot instantly reverse a moving tractor.
    if (i.brake > 0) speed = Math.max(0, speed - i.brake * 5.5 * dt);
    else if (gearDirection !== 0 && !i.clutch) speed = Math.min(i.gear === 'R' ? 2.8 : 10.5, speed + throttle * 2.7 * dt);
    if (i.throttle === 0 || i.clutch || i.gear === 'N') speed *= Math.pow(i.gear === 'N' ? .91 : .992, dt * 60);
    if (speed < 0.025) speed = 0;
    const travelDirection = gearDirection !== 0 ? gearDirection : (tractorRoot.userData.driveGear === 'R' ? -1 : 1); // coast in the last drive direction when in neutral
    const travel = speed * travelDirection * dt;
    tractorRoot.position.x -= Math.sin(tractorRoot.rotation.y) * travel;
    tractorRoot.position.z -= Math.cos(tractorRoot.rotation.y) * travel;
    tractorRoot.position.y += (groundHeightAt(tractorRoot.position.x, tractorRoot.position.z) - tractorRoot.position.y) * Math.min(1, dt * 5);
    // Bicycle-model approximation: steering angle determines curvature; reverse naturally turns the other way.
    const steeringAngle = i.steer * 0.48;
    const wheelbase = 2.65;
    const yawRate = speed > 0.05 ? (speed / wheelbase) * Math.tan(steeringAngle) : 0;
    tractorRoot.rotation.y -= yawRate * dt * (travelDirection < 0 ? -1 : 1);
    let cultivatedAreaDelta = 0;
    if (i.plowEnabled && Math.abs(speed) > 0.8 && Math.abs(speed) < 8 && i.gear === 'D') {
      const p = tractorRoot.position;
      const insideField = inField();
      if (insideField) {
        const rear = new THREE.Vector3(p.x + Math.sin(tractorRoot.rotation.y)*2.0, 0, p.z + Math.cos(tractorRoot.rotation.y)*2.0);
        if (lastTrackPosition && lastTrackPosition.distanceTo(rear) > 0.15) {
          stampPlowedTrack(lastTrackPosition, rear);
          cultivatedAreaDelta = markSweptPlowCells(lastTrackPosition, rear, 2.4);
        }
        lastTrackPosition = rear.clone();
      } else { lastTrackPosition = null; }
    } else { lastTrackPosition = null; }
    fuel = Math.max(0, fuel - dt * (0.0015 + i.throttle * 0.012 + (i.plowEnabled && inField() && speed > 0.3 ? 0.014 : 0)));
    savePrefs();
    updateHud();
    missionSystem?.update(dt, {
      inField: inField(), nearFuel: distanceToPoint(fuelPoint) < 9, nearFarm: distanceToPoint(deliveryPoint) < 6,
      speedKmh: Math.abs(speed) * 3.6, previousSpeedKmh: speedBeforeFrame, gear: i.gear,
      plowEnabled: i.plowEnabled, fuelPercent: fuel, brakePressed: i.brake > 0, distanceDelta: Math.abs(travel), cultivatedAreaDelta
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
renderer.getContext().canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); setStatus('Graphics paused by the device. Return to the game to retry.'); });
window.addEventListener('error', event => { console.error('Golden Field runtime error:', event.error || event.message); });
