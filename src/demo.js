import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MobileControls } from './mobile-controls.js';
import { CameraRig } from './camera-rig.js';

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

let tractorRoot = new THREE.Group();
tractorRoot.name = 'GoldenField_Tractor_Loading';
tractorRoot.position.set(0, 0, 7);
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
let last = performance.now();
let cameraRig = null;

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
    tractorRoot.position.set(0, 0, 7);
    setShadows(tractorRoot);
    scene.add(tractorRoot);

    // The supplied field and farmstead models use Z-up coordinates; rotate them into Three.js Y-up.
    fieldRoot = fieldGltf.scene; fieldRoot.name = 'GoldenField_PlowedField';
    centerAndGround(fieldRoot, 1, true);
    fieldRoot.position.x = -25; fieldRoot.position.z = 20;
    setShadows(fieldRoot); scene.add(fieldRoot);

    farmsteadRoot = farmGltf.scene; farmsteadRoot.name = 'GoldenField_Farmstead';
    centerAndGround(farmsteadRoot, 1, true);
    farmsteadRoot.position.x = -48; farmsteadRoot.position.z = 0;
    setShadows(farmsteadRoot); scene.add(farmsteadRoot);

    // Fit the cockpit asset to tractor scale and align its Z-up authoring axis with the world.
    // It is shown in first-person mode; the driver eye anchor is placed in the tractor cab.
    cockpitRoot = cockpitGltf.scene; cockpitRoot.name = 'GoldenField_CockpitAsset';
    cockpitRoot.rotation.x = -Math.PI / 2;
    cockpitRoot.scale.setScalar(0.25);
    cockpitRoot.position.set(0, 1.55, 0);
    setShadows(cockpitRoot);
    tractorRoot.add(cockpitRoot);
    cockpitRoot.visible = cameraRig?.mode === 'firstPerson';

    // Anchor in local tractor coordinates: tractor model's front faces -Z.
    cabinAnchor = new THREE.Object3D();
    cabinAnchor.position.set(0, 2.65, -0.05);
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
      plowedArea += Math.abs(speed) * dt * 0.12;
      if (Math.floor(plowedArea) % 10 === 0) money = Math.max(0, money - 0.002);
    }
    fuel = Math.max(0, fuel - throttle * dt * 0.018);
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
