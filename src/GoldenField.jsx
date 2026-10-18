import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";

const CONTRACTS = [
  {
    id: 1,
    title: "PLOW FIELD A",
    target: 100,
    reward: 650,
    tool: "PLOW",
    description: "Plow 100 unique patches in the marked brown field."
  },
  {
    id: 2,
    title: "SEED FIELD A",
    target: 60,
    reward: 480,
    tool: "SEEDER",
    description: "Seed 60 plowed patches in Field A."
  },
  {
    id: 3,
    title: "HARVEST FIELD B",
    target: 40,
    reward: 720,
    tool: "HARVESTER",
    description: "Harvest 40 standing crops from the green field to the east."
  }
];

const TOOL_CYCLE = ["PLOW", "SEEDER", "HARVESTER"];

const availableToolsFor = (state) => TOOL_CYCLE.slice(0, state.contractsComplete ? TOOL_CYCLE.length : state.contractIndex + 1);
const advanceToolState = (state) => {
  const tools = availableToolsFor(state);
  const current = tools.indexOf(state.tool);
  state.tool = tools[(current + 1 + tools.length) % tools.length];
  return state.tool;
};

/**
 * GoldenField.jsx
 * A single-file React + Three.js farming-game scene.
 * Features: optional /models/tractor.glb, generated Web Audio effects, periodic rain weather.
 * Dependency: npm install three
 *
 * Mount with: <GoldenField />
 */
const GEAR_TOP = [3.5, 5.5, 7.5, 9.5, 11.2, 13];
const IDLE_RPM = 850;
const MAX_RPM = 2400;

export default function GoldenField() {
  const mountRef = useRef(null);
  const gameRef = useRef(null);
  const [steeringWheelAngle, setSteeringWheelAngle] = useState(0);
  const steeringDragRef = useRef(null);
  const throttleTrackRef = useRef(null);
  const [throttleVisual, setThrottleVisual] = useState(0);
  const [hud, setHud] = useState({ cash: 25680, fuel: 86, nearPump: false, progress: 0, cropUnits: 0, speed: 0, gear: "D", tool: "PLOW", time: "08:30", status: "Tractor ready · Plow attached", contractTitle: "PLOW FIELD A", contractDescription: "Plow 100 unique patches in the marked brown field.", contractIndex: 1, contractCount: 0, contractTarget: 100, contractReward: 650, contractsComplete: false });
  const [cameraMode, setCameraMode] = useState(0);
  const [showHome, setShowHome] = useState(true);
  const [homeTab, setHomeTab] = useState("home");
  const [paused, setPaused] = useState(false);
  const [toast, setToast] = useState("");
  const [showGarage, setShowGarage] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const toastTimer = useRef(null);
  const notifyRef = useRef(null);
  const advanceToolRef = useRef(null);
  const togglePauseRef = useRef(null);
  const saveGameRef = useRef(null);
  const refuelPumpRef = useRef(null);
  const toggleEngineRef = useRef(null);
  const toggleHitchRef = useRef(null);
  const shiftGearRef = useRef(null);
  const resettingRef = useRef(false);

  const notify = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  };
  notifyRef.current = notify;
  const refuelAtPump = () => {
    const state = gameRef.current;
    if (!state || !state.pumpNear) return;
    if (state.fuel >= 99.5) {
      notify("Fuel tank is already full");
      return;
    }
    if (state.cash < 80) {
      notify("Not enough cash · Refuel costs $80");
      return;
    }
    state.cash -= 80;
    state.fuel = 100;
    notify("Diesel pump used · Tank full · $80 charged");
  };
  refuelPumpRef.current = refuelAtPump;
  const toggleEngine = () => {
    const state = gameRef.current;
    if (!state || state.paused) return;
    if (state.engineOn) { state.engineOn = false; haptic(); notify("Engine off"); return; }
    if (state.fuel <= 0) { notify("No fuel — refuel at the diesel pump"); return; }
    if (state.gear === "D" && !(state.clutch || state.keys.shift) && state.manualGear > 1 && Math.abs(state.speed) < 0.3) {
      notify("Engine started · select gear 1 or hold the clutch next time");
    } else notify("Engine started");
    state.engineOn = true; state.engineRPM = Math.max(state.engineRPM, 600); haptic();
  };
  toggleEngineRef.current = toggleEngine;
  const toggleHitch = () => {
    const state = gameRef.current;
    if (!state) return;
    if (state.tool !== "PLOW") { notify("Switch to the plow tool to use the hitch"); return; }
    state.plowAttached = !state.plowAttached;
    haptic();
    notify(state.plowAttached ? "Plow attached" : "Plow detached");
  };
  toggleHitchRef.current = toggleHitch;
  const shiftGear = (delta) => {
    const state = gameRef.current;
    if (!state || state.paused) return;
    // Shifting is always allowed; the clutch only matters for stalling in tall gears.
    const next = Math.min(GEAR_TOP.length, Math.max(1, state.manualGear + delta));
    if (next === state.manualGear) { notify(delta > 0 ? "Top gear" : "Lowest gear"); return; }
    state.manualGear = next;
    notify(`Gear ${next}`);
  };
  shiftGearRef.current = shiftGear;

  useEffect(() => {
    const host = mountRef.current;
    if (!host) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#a9d4ec");
    scene.fog = new THREE.Fog("#a9d4ec", 100, 450);

    const camera = new THREE.PerspectiveCamera(57, host.clientWidth / host.clientHeight, 0.3, 2000);
    camera.position.set(0, 6, -13);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    host.appendChild(renderer.domElement);
    // Post-processing (SSAO/bokeh/bloom) removed: it re-rendered the scene several times per frame, which is far too heavy for phones.

    // Optional local HDRI: add /textures/farm_environment.hdr for physically based reflections.
    // Sky shader remains the visible background so the day/night and rain cycle continue to work.
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    let pmremDisposed = false;
    const disposePmrem = () => {
      if (!pmremDisposed) {
        pmremDisposed = true;
        pmremGenerator.dispose();
      }
    };
    let environmentTarget = null;
    new RGBELoader().load(`${import.meta.env.BASE_URL}textures/farm_environment.hdr`, (hdr) => {
      // The component may have unmounted while the optional HDR was loading.
      if (pmremDisposed) {
        hdr.dispose();
        return;
      }
      pmremGenerator.compileEquirectangularShader();
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      environmentTarget = pmremGenerator.fromEquirectangular(hdr);
      scene.environment = environmentTarget.texture;
      scene.environmentIntensity = 0.72;
      hdr.dispose();
      disposePmrem();
    }, undefined, () => { disposePmrem(); });

    const sky = new Sky();
    sky.scale.setScalar(1000);
    sky.material.depthWrite = false;
    sky.renderOrder = -1;
    scene.add(sky);
    const skyU = sky.material.uniforms;
    skyU.turbidity.value = 2;
    skyU.rayleigh.value = 1.0;
    skyU.mieCoefficient.value = 0.005;
    skyU.mieDirectionalG.value = 0.8;
    const skySun = new THREE.Vector3();

    scene.add(new THREE.HemisphereLight(0xe5f4ff, 0x52613a, 2.1));
    const sun = new THREE.DirectionalLight(0xffedc5, 3.1);
    sun.position.set(-55, 85, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -85, right: 85, top: 85, bottom: -85 });
    scene.add(sun);
    scene.add(sun.target);

    // Optional CC0 farm set-piece: try the bundled file first for offline APKs,
    // then use the public CC0 GLB CDN as an online fallback.
    // This is placed beyond the starting yard as an explorable-looking farm extension.
    const farmSceneLoader = new GLTFLoader();
    const farmSceneLocalUrl = `${import.meta.env.BASE_URL}models/farm-scene.glb`;
    const farmSceneRemoteUrl = "https://cdn.3dassets.dev/assets/29167/v1/model.glb";
    const addFarmScene = (gltf) => {
      const farmSet = gltf.scene;
      farmSet.name = "CC0_HarvestDayFarm_Set";
      farmSet.scale.setScalar(0.72);
      farmSet.position.set(42, 0, -42);
      farmSet.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material.side = THREE.DoubleSide;
          }
        }
      });
      scene.add(farmSet);
    };
    farmSceneLoader.load(farmSceneLocalUrl, addFarmScene, undefined, () => {
      farmSceneLoader.load(farmSceneRemoteUrl, addFarmScene, undefined, () => {
        // Keep the original procedural world fully playable if offline or blocked.
      });
    });

    // Bundled plowed-field model supplied for this build. Kept as a visual
    // farm set-piece beside the playable fields so it does not block gameplay.
    const plowedFieldLoader = new GLTFLoader();
    plowedFieldLoader.load(`${import.meta.env.BASE_URL}models/plowed-field.glb`, (gltf) => {
      const fieldModel = gltf.scene;
      fieldModel.name = "ImportedPlowedFarmField";
      fieldModel.scale.setScalar(0.28);
      fieldModel.updateMatrixWorld(true);
      const fieldBounds = new THREE.Box3().setFromObject(fieldModel);
      fieldModel.position.y -= fieldBounds.min.y;
      fieldModel.position.set(43, fieldModel.position.y, -43);
      fieldModel.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });
      scene.add(fieldModel);
    }, undefined, () => {
      // Optional model: the procedural farm remains available if it fails to load.
    });

    // Vintage diesel pump from the supplied farmstead asset pack. Only the
    // pump and its concrete pad are extracted, so the pack's barn/props don't
    // clutter the playable yard. The source asset is Z-up, so rotate it into
    // Three.js Y-up coordinates and place it beside the starting yard.
    let statePumpReady = false;
    const fuelPumpLoader = new GLTFLoader();
    fuelPumpLoader.load(`${import.meta.env.BASE_URL}models/vintage-farmstead.glb`, (gltf) => {
      const pumpGroup = new THREE.Group();
      pumpGroup.name = "VintageDieselFuelPump";
      const keepNames = new Set([
        "Pump concrete pad", "Vintage red gas pump body", "Pump shoulder",
        "Glass cylinder top", "Pump cap", "Cream mechanical gauge", "Gauge glass",
        "Gauge markings", "Coin slot", "Pump bolt", "Rubber fuel hose",
        "Fuel nozzle grip", "Metal nozzle spout"
      ]);
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.children.forEach((part) => {
        if (!keepNames.has(part.name)) return;
        const copy = part.clone();
        copy.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        pumpGroup.add(copy);
      });
      pumpGroup.rotation.x = -Math.PI / 2;
      pumpGroup.position.set(-20, 0.18, 14.5);
      pumpGroup.userData.isFuelPump = true;
      scene.add(pumpGroup);
      statePumpReady = true;
    }, undefined, () => {
      // The rest of the farm remains playable if the optional pump asset fails.
    });

    const material = (color, roughness = 0.82, metalness = 0) =>
      new THREE.MeshStandardMaterial({ color, roughness, metalness });
    const mats = {
      grass: material("#71964c"), grassLight: material("#83a956"), dirt: material("#795137"),
      soil: material("#4c3524"), rubber: material("#171a18"), tread: material("#292d29"),
      steel: material("#65716d", 0.38, 0.72), green: material("#398b35", 0.4, 0.12),
      greenLight: material("#5aa744", 0.42, 0.08), black: material("#202923", 0.55, 0.2),
      yellow: material("#e8c64c", 0.45, 0.12), wood: material("#88613b"),
      roof: material("#4e5146"), glass: new THREE.MeshPhysicalMaterial({
        color: "#7ba6ad", roughness: 0.18, metalness: 0.1, transparent: true, opacity: 0.58
      }), white: material("#e4e1d1")
    };
    // Small generated tiling textures keep the project self-contained (no external image files required).
    const makeTilingTexture = (base, fleck, count = 700) => {
      const canvas = document.createElement("canvas"); canvas.width = 256; canvas.height = 256;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
      for (let i = 0; i < count; i++) {
        ctx.globalAlpha = 0.12 + Math.random() * 0.22; ctx.fillStyle = fleck;
        const x = Math.random() * 256, y = Math.random() * 256;
        const w = 1 + Math.random() * 8, h = 1 + Math.random() * 4;
        ctx.fillRect(x, y, w, h);
      }
      ctx.globalAlpha = 1;
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 4);
      return texture;
    };
    const grassTexture = makeTilingTexture("#71964c", "#b2c77b", 1300);
    grassTexture.repeat.set(24, 24);
    mats.grass.map = grassTexture; mats.grass.needsUpdate = true;
    const dirtTexture = makeTilingTexture("#795137", "#b18a5e", 1000);
    dirtTexture.repeat.set(7, 9);
    mats.dirt.map = dirtTexture; mats.dirt.needsUpdate = true;

    // Optional Poly Haven / ambientCG PBR packs. If files are absent, generated textures remain in use.
    const pbrLoader = new THREE.TextureLoader();
    const applyPBRSet = (mat, folder, repeatX, repeatY) => {
      const loadMap = (name, assign, colorSpace = THREE.NoColorSpace) => {
        pbrLoader.load(`${import.meta.env.BASE_URL}textures/${folder}/${name}.jpg`, (tex) => {
          tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
          tex.repeat.set(repeatX, repeatY);
          tex.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
          tex.colorSpace = colorSpace;
          assign(tex);
          if (mat.normalMap) mat.normalScale.set(0.8, 0.8);
          if (mat.roughnessMap) mat.roughness = 1;
          mat.needsUpdate = true;
        }, undefined, () => {});
      };
      loadMap("albedo", tex => { mat.map = tex; }, THREE.SRGBColorSpace);
      loadMap("normal", tex => { mat.normalMap = tex; });
      loadMap("roughness", tex => { mat.roughnessMap = tex; });
    };
    applyPBRSet(mats.grass, "grass", 24, 24);
    applyPBRSet(mats.dirt, "dirt", 7, 9);

    const box = (parent, w, h, d, mat, x, y, z) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh);
      return mesh;
    };
    const cylinder = (parent, rTop, rBottom, length, mat, x, y, z, rx = 0, ry = 0, rz = Math.PI / 2, segments = 18) => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, length, segments), mat);
      mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz);
      mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    const groundRect = (x, z, w, d, mat, y = 0.025) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, d), mat);
      mesh.position.set(x, y, z); mesh.receiveShadow = true; scene.add(mesh); return mesh;
    };

    // Rolling, low-poly terrain with soft atmospheric depth.
    // The farm zone is dead flat so fields, roads and the pond are never buried by the hills;
    // the hills fade out again at the map edge so it blends into the ground skirt.
    const heightAt = (x, z) => {
      const dx = Math.max(-100 - x, 0, x - 100), dz = Math.max(-45 - z, 0, z - 65);
      const farm = THREE.MathUtils.smoothstep(Math.hypot(dx, dz), 0, 25);
      const edge = 1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(x), Math.abs(z)), 135, 160);
      const broad = Math.sin(x * 0.021) * 1.25 + Math.cos(z * 0.019) * 1.15;
      const detail = Math.sin(x * 0.073 + z * 0.041) * 0.24 + Math.cos(z * 0.087 - x * 0.032) * 0.18;
      const ridge = Math.sin((x + z) * 0.012) * 0.65;
      return (broad + detail + ridge) * farm * edge;
    };
    const terrainGeometry = new THREE.PlaneGeometry(320, 320, 100, 100);
    terrainGeometry.rotateX(-Math.PI / 2);
    const vertices = terrainGeometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), z = vertices.getZ(i);
      vertices.setY(i, heightAt(x, z));
    }
    terrainGeometry.computeVertexNormals();
    const terrain = new THREE.Mesh(terrainGeometry, mats.grass);
    terrain.receiveShadow = true; scene.add(terrain);
    // Huge ground skirt so the edge of the terrain never shows the sky underneath.
    const skirt = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), material("#5f8040", 1));
    skirt.rotation.x = -Math.PI / 2; skirt.position.y = -0.15; scene.add(skirt);

    // Distant hills.
    for (let i = 0; i < 18; i++) {
      const radius = 13 + (i % 5) * 5;
      const hill = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), i % 2 ? mats.grass : mats.grassLight);
      hill.scale.y = 0.28 + (i % 4) * 0.035;
      hill.position.set(-145 + i * 17, -1.7, 90 + Math.sin(i * 1.7) * 28);
      hill.receiveShadow = true; scene.add(hill);
    }

    // Main cultivated field and neighboring crop field.
    groundRect(-10, 29, 50, 57, mats.dirt, 0.025);
    groundRect(39, 29, 34, 53, material("#67863b"), 0.028);
    const cropMaterial = material("#8ea94b");
    const stemMaterial = material("#53792e");
    // Instanced crop meshes: hundreds of plants rendered in only two draw calls.
    const cropCount = 22 * 29;
    const stemGeo = new THREE.CylinderGeometry(0.025, 0.035, 0.56, 6);
    const headGeo = new THREE.ConeGeometry(0.12, 0.32, 5);
    const MAX_SEEDS = 800;
    const seedHeads = new THREE.InstancedMesh(headGeo, cropMaterial, MAX_SEEDS);
    seedHeads.count = 0;
    seedHeads.frustumCulled = false;
    seedHeads.castShadow = false;
    seedHeads.receiveShadow = false;
    scene.add(seedHeads);
    const cropStems = new THREE.InstancedMesh(stemGeo, stemMaterial, cropCount);
    const cropHeads = new THREE.InstancedMesh(headGeo, cropMaterial, cropCount);
    const cropDummy = new THREE.Object3D();
    let cropIndex = 0;
    const cropPositions = [];
    for (let row = 0; row < 22; row++) {
      const x = 24 + row * 1.3;
      for (let n = 0; n < 29; n++) {
        const scale = 0.65 + ((row * 7 + n * 3) % 5) * 0.055;
        const px = x + Math.sin(n * 2.7 + row) * 0.12;
        const pz = 7 + n * 1.55;
        cropPositions.push({ x: px, z: pz, index: cropIndex });
        cropDummy.position.set(px, 0.08 + 0.28 * scale, pz);
        cropDummy.rotation.set(0, ((row * 13 + n * 7) % 17) * 0.12, 0);
        cropDummy.scale.setScalar(scale); cropDummy.updateMatrix();
        cropStems.setMatrixAt(cropIndex, cropDummy.matrix);
        cropDummy.position.y += 0.28 * scale + 0.16 * scale;
        cropDummy.updateMatrix(); cropHeads.setMatrixAt(cropIndex, cropDummy.matrix);
        cropIndex++;
      }
    }
    cropStems.instanceMatrix.needsUpdate = true; cropHeads.instanceMatrix.needsUpdate = true;
    cropStems.castShadow = false; cropStems.receiveShadow = true; cropHeads.castShadow = false;
    scene.add(cropStems, cropHeads);

    // Instanced grass clumps around the field edges; avoid crop beds and the main road.
    const tuftCount = 900;
    const tuftGeo = new THREE.ConeGeometry(0.075, 0.3, 4);
    const tuftMat = material("#789a48", 1);
    const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftCount);
    const tuftDummy = new THREE.Object3D();
    let tuftIndex = 0, attempts = 0;
    while (tuftIndex < tuftCount && attempts < tuftCount * 5) {
      attempts++;
      const x = (Math.random() - 0.5) * 240, z = (Math.random() - 0.5) * 240;
      const onField = x > -35 && x < 15 && z > 3 && z < 58;
      const onCrop = x > 22 && x < 56 && z > 5 && z < 55;
      const onRoad = Math.abs(z + 18) < 5 || (Math.abs(x - 52) < 4 && z > -32 && z < -4);
      if (onField || onCrop || onRoad) continue;
      tuftDummy.position.set(x, heightAt(x, z) + 0.13, z); tuftDummy.rotation.y = Math.random() * Math.PI;
      tuftDummy.scale.setScalar(0.65 + Math.random() * 0.7); tuftDummy.updateMatrix();
      tufts.setMatrixAt(tuftIndex++, tuftDummy.matrix);
    }
    tufts.count = tuftIndex; tufts.instanceMatrix.needsUpdate = true; tufts.receiveShadow = false; scene.add(tufts);

    // Dense, crossed alpha-free grass blades (instanced geometry, rather than cone-shaped tufts).
    const bladeGeo = new THREE.BufferGeometry();
    bladeGeo.setAttribute("position", new THREE.Float32BufferAttribute([
      -0.055, 0, 0, 0.055, 0, 0, 0.008, 0.42, 0,
      0, 0, -0.045, 0, 0, 0.045, -0.025, 0.35, 0.006
    ], 3));
    bladeGeo.computeVertexNormals();
    const bladeMat = new THREE.MeshStandardMaterial({ color: "#71964a", roughness: 1, side: THREE.DoubleSide });
    const bladeCount = 2600;
    const grassBlades = new THREE.InstancedMesh(bladeGeo, bladeMat, bladeCount);
    const bladeDummy = new THREE.Object3D();
    let bladeIndex = 0, bladeAttempts = 0;
    while (bladeIndex < bladeCount && bladeAttempts < bladeCount * 5) {
      bladeAttempts++;
      const x = (Math.random() - 0.5) * 250, z = (Math.random() - 0.5) * 250;
      const onField = x > -35 && x < 15 && z > 3 && z < 58;
      const onCrop = x > 20 && x < 58 && z > 3 && z < 55;
      const onRoad = Math.abs(z + 18) < 5 || (Math.abs(x - 52) < 4 && z > -32 && z < -4);
      if (onField || onCrop || onRoad) continue;
      bladeDummy.position.set(x, heightAt(x, z) + 0.12, z);
      bladeDummy.rotation.set((Math.random() - 0.5) * 0.2, Math.random() * Math.PI, (Math.random() - 0.5) * 0.2);
      bladeDummy.scale.set(0.55 + Math.random() * 1.2, 0.55 + Math.random() * 1.4, 0.55 + Math.random() * 1.2);
      bladeDummy.updateMatrix(); grassBlades.setMatrixAt(bladeIndex++, bladeDummy.matrix);
    }
    grassBlades.count = bladeIndex; grassBlades.instanceMatrix.needsUpdate = true;
    grassBlades.receiveShadow = false; scene.add(grassBlades);

    // Farm roads and yard.
    const asphaltMat = material("#626358", 0.92);
    const asphaltTexture = makeTilingTexture("#626358", "#aaa99a", 900);
    asphaltTexture.repeat.set(18, 2);
    asphaltMat.map = asphaltTexture; asphaltMat.needsUpdate = true;
    applyPBRSet(asphaltMat, "asphalt", 18, 2);
    groundRect(0, -18, 190, 8, asphaltMat, 0.07);
    groundRect(0, -27, 46, 6, asphaltMat, 0.07);
    groundRect(52, -18, 6, 28, asphaltMat, 0.07);
    for (let i = 0; i < 36; i++) groundRect(-87 + i * 5, -18, 2.2, 0.12, mats.white, 0.12);

    // Farmhouse barn, roof, door, trim, silo and hay bales.
    const barn = new THREE.Group();
    box(barn, 17, 8, 12, mats.wood, 0, 4, 0);
    const roofLeft = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.55, 13), mats.roof);
    roofLeft.position.set(-4.25, 8.35, 0); roofLeft.rotation.z = -0.34; roofLeft.castShadow = true; barn.add(roofLeft);
    const roofRight = new THREE.Mesh(new THREE.BoxGeometry(9.5, 0.55, 13), mats.roof);
    roofRight.position.set(4.25, 8.35, 0); roofRight.rotation.z = 0.34; roofRight.castShadow = true; barn.add(roofRight);
    box(barn, 4.5, 5.2, 0.25, mats.roof, 0, 2.65, 6.1);
    box(barn, 0.25, 7.4, 0.3, mats.white, -7.9, 4, 6.12);
    box(barn, 0.25, 7.4, 0.3, mats.white, 7.9, 4, 6.12);
    barn.position.set(16, 0, -39); scene.add(barn);
    cylinder(scene, 3.1, 3.5, 12, material("#b5b9ad", 0.5, 0.15), 31, 6, -35, 0, 0, 0, 24);
    cylinder(scene, 3.4, 3.1, 1.2, mats.steel, 31, 12.2, -35, 0, 0, 0, 24);
    for (let i = 0; i < 5; i++) {
      const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 12), material("#c4a55c"));
      bale.rotation.z = Math.PI / 2; bale.position.set(6 + (i % 3) * 1.5, 0.8, -29 + Math.floor(i / 3) * 1.6); bale.castShadow = true; scene.add(bale);
    }

    // Fence lines and scattered trees.
    const fenceMat = material("#bba77d");
    for (let i = 0; i < 29; i++) {
      const x = -39 + i * 2.1;
      box(scene, 0.12, 1.05, 0.12, fenceMat, x, 0.53, -3);
      if (i < 28) {
        box(scene, 2.1, 0.09, 0.09, fenceMat, x + 1.05, 0.75, -3);
        box(scene, 2.1, 0.09, 0.09, fenceMat, x + 1.05, 0.4, -3);
      }
    }
    for (let i = 0; i < 32; i++) {
      const x = -95 + i * 6.1, z = 30 + Math.sin(i * 1.9) * 20;
      const trunk = cylinder(scene, 0.35, 0.45, 3, mats.wood, x, 1.5, z, 0, 0, 0, 8);
      trunk.castShadow = true;
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.5 + (i % 3) * 0.5, 1), material(i % 2 ? "#456e37" : "#557e3e"));
      crown.position.set(x, 4, z); crown.castShadow = true; scene.add(crown);
    }

    // Utility poles, a windmill, road signs, and simple looping AI traffic.
    const poleMat = material("#625c4e");
    const wireMat = new THREE.MeshStandardMaterial({ color: "#343630", roughness: 0.7 });
    for (let i = 0; i < 7; i++) {
      const x = -78 + i * 25;
      cylinder(scene, 0.12, 0.16, 7, poleMat, x, 3.5, -25, 0, 0, 0, 8);
      box(scene, 1.7, 0.12, 0.12, poleMat, x, 6.35, -25);
      if (i < 6) {
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 25, 5), wireMat);
        wire.position.set(x + 12.5, 6.2, -25); wire.rotation.z = Math.PI / 2; scene.add(wire);
      }
    }
    const signPostMat = material("#e2e0d2");
    for (const sx of [-44, 44]) {
      cylinder(scene, 0.055, 0.055, 1.8, signPostMat, sx, 0.9, -22, 0, 0, 0, 8);
      box(scene, 0.95, 0.62, 0.08, material(sx < 0 ? "#397b42" : "#d9bd4c"), sx, 1.82, -22);
    }
    const windmill = new THREE.Group();
    cylinder(windmill, 0.22, 0.34, 9, material("#d8d1b9"), 0, 4.5, 0, 0, 0, 0, 10);
    const hub = new THREE.Group(); hub.position.set(0, 8.3, 0.28); windmill.add(hub);
    const sailMat = material("#e9e4d5");
    for (let i = 0; i < 4; i++) {
      const sail = box(hub, 0.28, 3.5, 0.12, sailMat, 0, 1.75, 0);
      sail.rotation.z = i * Math.PI / 2;
    }
    scene.add(windmill); windmill.position.set(86, 0, 54);

    const trafficCars = [];
    for (let i = 0; i < 4; i++) {
      const car = new THREE.Group();
      const paint = material(["#bd493b", "#d6d0b5", "#466e9b", "#d4a23e"][i], 0.38, 0.12);
      box(car, 1.55, 0.52, 3.1, paint, 0, 0.72, 0);
      box(car, 1.22, 0.62, 1.35, mats.glass, 0, 1.22, -0.12);
      for (const wx of [-0.78, 0.78]) for (const wz of [-0.95, 0.95]) {
        const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.18, 12), mats.rubber);
        tire.rotation.z = Math.PI / 2; tire.position.set(wx, 0.35, wz); car.add(tire);
      }
      car.position.set(-86 + i * 43, 0, -18 + (i % 2 ? 1.6 : -1.6));
      scene.add(car); trafficCars.push({ car, direction: i % 2 ? -1 : 1, phase: i * 17 });
    }

    // A small blue pond beyond the field.
    const pond = new THREE.Mesh(new THREE.CircleGeometry(15, 40), new THREE.MeshStandardMaterial({ color: "#5b9db1", roughness: 0.24, metalness: 0.1 }));
    pond.rotation.x = -Math.PI / 2; pond.scale.set(1.4, 0.7, 1); pond.position.set(-63, 0.04, 42); scene.add(pond);

    // Tractor model: body, hood, cab, exhaust, yellow rims, wheel treads and front weights.
    const tractor = new THREE.Group();
    const chassis = new THREE.Group(); tractor.add(chassis);
    const headlights = [-0.62, 0.62].map(x => {
      const light = new THREE.SpotLight(0xfff3c4, 0, 30, Math.PI / 6, 0.4, 1.2);
      light.position.set(x, 1.9, 2.2);
      light.target.position.set(x, 0.5, 12);
      tractor.add(light, light.target);
      return light;
    });
    box(chassis, 2.25, 0.68, 4.2, mats.green, 0, 1.45, 0.05);
    box(chassis, 1.9, 0.82, 1.7, mats.greenLight, 0, 1.92, 1.0);
    // Rounded nose overlay softens the box-built bonnet silhouette.
    const roundedHood = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mats.greenLight);
    roundedHood.scale.set(0.93, 0.36, 0.86); roundedHood.position.set(0, 2.02, 1.02);
    roundedHood.castShadow = true; chassis.add(roundedHood);
    box(chassis, 1.62, 1.8, 1.55, mats.green, 0, 2.68, -0.85);
    box(chassis, 1.48, 1.22, 1.4, mats.glass, 0, 2.86, -0.84);
    box(chassis, 1.72, 0.13, 1.7, mats.greenLight, 0, 3.63, -0.85);
    box(chassis, 1.82, 0.22, 0.15, mats.yellow, 0, 2.05, 1.87);
    box(chassis, 1.6, 0.35, 0.15, mats.black, 0, 1.45, 2.1);
    for (const x of [-0.58, 0.58]) box(chassis, 0.12, 0.32, 0.12, mats.white, x, 1.78, 2.08);
    cylinder(chassis, 0.09, 0.09, 1.25, mats.black, 0.68, 3.25, -1.15, 0, 0, 0, 10);
    cylinder(chassis, 0.11, 0.11, 0.42, mats.black, 0.68, 3.92, -1.15, 0, 0, 0, 10);
    // Cab pillars.
    for (const x of [-0.78, 0.78]) for (const z of [-1.58, -0.13]) box(chassis, 0.1, 1.65, 0.1, mats.green, x, 2.78, z);
    box(chassis, 1.7, 0.12, 1.65, mats.green, 0, 3.58, -0.85);
    // Wheels are separate groups so steering can rotate front wheels.
    const wheels = [];
    function makeWheel(x, z, radius, width, front) {
      const pivot = new THREE.Group(); pivot.position.set(x, radius * 0.88, z); tractor.add(pivot);
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 24, 1), mats.rubber);
      tire.rotation.z = Math.PI / 2; tire.castShadow = true; tire.receiveShadow = true; pivot.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.57, radius * 0.57, width + 0.035, 20), mats.yellow);
      rim.rotation.z = Math.PI / 2; rim.castShadow = true; pivot.add(rim);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.22, radius * 0.22, width + 0.07, 16), mats.steel);
      hub.rotation.z = Math.PI / 2; pivot.add(hub);
      for (let t = 0; t < 14; t++) {
        const tread = new THREE.Mesh(new THREE.BoxGeometry(width * 1.04, 0.12, 0.22), mats.tread);
        const a = t / 14 * Math.PI * 2;
        tread.position.set(0, Math.sin(a) * radius * 0.94, Math.cos(a) * radius * 0.94);
        tread.rotation.x = a; tread.castShadow = true; pivot.add(tread);
      }
      wheels.push({ pivot, radius, front, x, z });
    }
    makeWheel(-1.28, 1.25, 0.83, 0.47, false); makeWheel(1.28, 1.25, 0.83, 0.47, false);
    makeWheel(-1.12, -1.28, 0.57, 0.36, true); makeWheel(1.12, -1.28, 0.57, 0.36, true);
    // Curved wheel-arch fenders add a more agricultural silhouette.
    for (const side of [-1, 1]) {
      const rearFender = new THREE.Mesh(new THREE.TorusGeometry(0.91, 0.095, 8, 28, Math.PI), mats.green);
      rearFender.rotation.z = Math.PI; rearFender.rotation.y = Math.PI / 2;
      rearFender.position.set(side * 1.26, 1.32, 1.25); rearFender.scale.set(1, 1.35, 1);
      rearFender.castShadow = true; tractor.add(rearFender);
      box(tractor, 0.12, 0.13, 1.85, mats.green, side * 1.3, 1.94, 1.2);
    }
    // Plow frame and three blades trail behind the tractor.
    const plow = new THREE.Group();
    box(plow, 0.14, 0.14, 2.7, mats.steel, 0, 0.58, -2.9);
    for (let i = -1; i <= 1; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.75, 0.72), mats.steel);
      blade.position.set(i * 0.75, 0.28, -3.12); blade.rotation.x = -0.23; blade.rotation.z = -0.2; blade.castShadow = true; plow.add(blade);
    }
    tractor.add(plow); plow.position.y = -0.15;

    // Seeder attachment is visible when selected instead of leaving the tractor with empty hitch space.
    const seeder = new THREE.Group();
    box(seeder, 1.6, 0.7, 1.0, mats.greenLight, 0, 0.5, -2.9);
    box(seeder, 0.12, 0.12, 1.8, mats.steel, 0, 0.1, -3.1);
    for (let i = -1; i <= 1; i++) {
      cylinder(seeder, 0.06, 0.06, 0.25, mats.steel, i * 0.6, 0.05, -3.6, 0, 0, 0, 8);
    }
    tractor.add(seeder); seeder.position.y = -0.15; seeder.visible = false;

    // Harvester header with a rotating reel.
    const harvester = new THREE.Group();
    box(harvester, 4.5, 0.4, 0.6, mats.yellow, 0, 0.5, 2.85);
    const reel = new THREE.Group();
    cylinder(reel, 0.055, 0.055, 4.0, mats.steel, 0, 0, 0, 0, 0, Math.PI / 2, 10);
    for (let i = 0; i < 6; i++) {
      const tine = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.85, 0.07), mats.steel);
      tine.position.set(-1.8 + i * 0.72, 0, 0);
      reel.add(tine);
    }
    reel.position.set(0, 0.83, 2.85);
    harvester.add(reel);
    tractor.add(harvester);
    harvester.position.y = -0.15;
    harvester.visible = false;

    // Trailer follows the tractor; grain fill grows with harvested inventory.
    const trailer = new THREE.Group();
    box(trailer, 2.45, 0.18, 3.7, mats.steel, 0, 0.48, -5.0);
    box(trailer, 2.35, 0.85, 0.14, mats.greenLight, 0, 0.91, -6.78);
    box(trailer, 0.14, 0.85, 3.55, mats.greenLight, -1.12, 0.91, -5.0);
    box(trailer, 0.14, 0.85, 3.55, mats.greenLight, 1.12, 0.91, -5.0);
    box(trailer, 2.35, 0.85, 0.14, mats.greenLight, 0, 0.91, -3.22);
    const grain = new THREE.Mesh(
      new THREE.BoxGeometry(2.12, 0.72, 3.25),
      material("#d4b45c", 0.9)
    );
    grain.position.set(0, 0.56, -5.0);
    grain.scale.y = 0.01;
    grain.castShadow = false;
    trailer.add(grain);
    for (const x of [-1.0, 1.0]) {
      for (const z of [-6.0, -4.0]) {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 16), mats.rubber);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(x, 0.34, z);
        trailer.add(wheel);
      }
    }
    tractor.add(trailer);

    // Cockpit controls: dashboard, steering wheel, spokes, and gauge faces.
    const dashboard = new THREE.Group();
    box(dashboard, 1.5, 0.18, 0.45, mats.black, 0, 1.95, -0.55);
    const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 8, 24), mats.black);
    steeringWheel.position.set(0, 2.18, -0.72); steeringWheel.rotation.x = -0.5; dashboard.add(steeringWheel);
    for (let i = 0; i < 3; i++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.025, 0.2), mats.steel);
      spoke.position.set(0, 2.18, -0.72); spoke.rotation.z = (i / 3) * Math.PI * 2; spoke.rotation.x = -0.5; dashboard.add(spoke);
    }
    const gaugeGeo = new THREE.CircleGeometry(0.09, 16);
    for (const x of [-0.28, 0.28]) {
      const gauge = new THREE.Mesh(gaugeGeo, mats.white); gauge.position.set(x, 2.05, -0.68); gauge.rotation.x = -0.7; dashboard.add(gauge);
      const needle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, 0.075), mats.yellow);
      needle.position.set(x, 2.05, -0.66); needle.rotation.x = -0.7; dashboard.add(needle);
    }
    tractor.add(dashboard);

    // Optional user-provided GLB: place tractor.glb in public/models. Procedural model remains fallback.
    const fallbackParts = [...chassis.children.filter(c => c !== dashboard && c !== roundedHood), ...wheels.map(w => w.pivot)];
    const gltfLoader = new GLTFLoader();
    const installTractorModel = (gltf) => {
      const model = gltf.scene;
      model.name = "ImportedTractorGLB";
      model.traverse(child => {
        if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; }
      });
      const bounds = new THREE.Box3().setFromObject(model);
      const size = bounds.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      model.scale.setScalar(4.4 / maxDim);
      model.rotation.y = Math.PI;
      const scaledBounds = new THREE.Box3().setFromObject(model);
      model.position.y -= scaledBounds.min.y;
      tractor.add(model);
      fallbackParts.forEach(part => { part.visible = false; });
    };
    gltfLoader.load(`${import.meta.env.BASE_URL}models/tractor.glb`, installTractorModel, undefined, () => {
      // Online fallback: direct, CORS-enabled CC0 Modern Tractor GLB.
      gltfLoader.load("https://cdn.3dassets.dev/assets/16840/v1/model.glb", installTractorModel, undefined, () => {
        gltfLoader.load("https://cdn.3dassets.dev/assets/20024/v1/model.glb", installTractorModel, undefined, () => {
        /* Optional assets missing or offline: retain the procedural tractor. */
        });
      });
    });
    tractor.position.set(-7, 0, 16); scene.add(tractor);

    // Supplied transparent-glass cockpit model: show it only in the fourth
    // camera mode ("Cockpit view") so the other three exterior views remain unchanged.
    let cockpitInterior = null;
    const cockpitLoader = new GLTFLoader();
    cockpitLoader.load(`${import.meta.env.BASE_URL}models/tractor-cockpit.glb`, (gltf) => {
      cockpitInterior = gltf.scene;
      cockpitInterior.name = "TransparentGlassCockpitInterior";
      cockpitInterior.scale.setScalar(0.25);
      cockpitInterior.position.set(0, 0.7, -0.6);
      cockpitInterior.visible = state.cameraMode === 3;
      cockpitInterior.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            child.material.side = THREE.DoubleSide;
            // Preserve the transparent windshield/windows authored in the GLB.
            if (child.material.transparent) child.material.depthWrite = false;
          }
        }
      });
      tractor.add(cockpitInterior);
    }, undefined, () => {
      // Keep the standard cockpit and camera controls if this optional model fails.
    });

    // Gameplay state.
    // Reusable dust puffs keep motion feedback lightweight on mobile.
    const dustMaterial = new THREE.MeshBasicMaterial({ color: 0xc8b79a, transparent: true, opacity: 0.32, depthWrite: false });
    const dustPuffs = Array.from({ length: 18 }, () => {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.18, 7, 5), dustMaterial.clone());
      puff.visible = false; puff.userData.life = 0; scene.add(puff); return puff;
    });
    let dustCursor = 0;

    // Lightweight rain curtain follows the tractor; weather repeats in short dry/wet spells.
    const rainCount = 520;
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPositions[i * 3] = (Math.random() - 0.5) * 70;
      rainPositions[i * 3 + 1] = Math.random() * 28;
      rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
    const rainMaterial = new THREE.PointsMaterial({
      color: 0xc9e2f2, size: 0.12, transparent: true, opacity: 0,
      depthWrite: false, sizeAttenuation: true
    });
    const rain = new THREE.Points(rainGeometry, rainMaterial);
    rain.frustumCulled = false;
    rain.visible = true;
    scene.add(rain);

    // Web Audio is initialized only after the player's first gesture (browser autoplay policy).
    let audioContext = null;
    let engineOsc = null;
    let engineGain = null;
    let engineFilter = null;
    const startAudio = () => {
      if (audioContext || !window.AudioContext) return;
      try {
        audioContext = new window.AudioContext();
        engineOsc = audioContext.createOscillator();
        engineOsc.type = "sawtooth";
        engineFilter = audioContext.createBiquadFilter();
        engineFilter.type = "lowpass";
        engineFilter.frequency.value = 240;
        engineGain = audioContext.createGain();
        engineGain.gain.value = 0.0001;
        engineOsc.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(audioContext.destination);
        engineOsc.start();
      } catch (_) { audioContext = null; }
    };
    const playHydraulic = () => {
      startAudio();
      if (!audioContext) return;
      const now = audioContext.currentTime;
      const duration = 0.24;
      const length = Math.floor(audioContext.sampleRate * duration);
      const buffer = audioContext.createBuffer(1, length, audioContext.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = audioContext.createBufferSource();
      const filter = audioContext.createBiquadFilter();
      const gain = audioContext.createGain();
      filter.type = "bandpass"; filter.frequency.value = 1250; filter.Q.value = 0.7;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.055, now + 0.035);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      source.buffer = buffer; source.connect(filter); filter.connect(gain); gain.connect(audioContext.destination);
      source.start(now); source.stop(now + duration);
    };
    const playCashSound = () => {
      startAudio();
      if (!audioContext) return;
      [1046, 1568, 2093].forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const start = audioContext.currentTime + index * 0.075;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.09, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.19);
        oscillator.connect(gain); gain.connect(audioContext.destination);
        oscillator.start(start); oscillator.stop(start + 0.2);
      });
    };
    const state = {
      speed: 0, heading: 0, gear: "D", tool: "PLOW", fuel: 86, cash: 25680, progress: 0,
      paused: false, cameraMode: 0, day: 0.35, steer: 0, throttle: 0, brake: false, pumpNear: false,
      engineOn: true, manualGear: 1, clutch: false, plowAttached: true, engineRPM: 850, stallNotice: 0,
      telemetry: { speedKmh: 0, engineRPM: 850, currentGear: 1, fuelLevel: 86 },
      keys: {}, plowedCells: new Set(), seededCells: new Set(), plowedMarks: new Map(),
      seedCount: 0, harvestCount: 0, seedHeads: null, cropDummy: new THREE.Object3D(), seedCapNotified: false,
      harvestedCropIndices: new Set(), harvestTimer: 0, grain,
      contractIndex: 0, contractProgress: 0, contractsComplete: false,
      scene, lastHud: 0, elapsed: 0
    };
    state.seedHeads = seedHeads;
    state.audioToolChange = playHydraulic;
    state.audioSell = playCashSound;
    gameRef.current = state;

    // Reuse mark geometry/materials to keep field edits lightweight.
    const plowedMarkGeometry = new THREE.BoxGeometry(0.78, 0.025, 1.35);
    const seededMarkGeometry = new THREE.BoxGeometry(0.78, 0.025, 1.35);
    const activeContract = () => state.contractsComplete ? null : CONTRACTS[state.contractIndex];
    const availableTools = () => availableToolsFor(state);
    const recordContractWork = (tool, amount = 1) => {
      const contract = activeContract();
      if (!contract || contract.tool !== tool || amount <= 0) return;
      state.contractProgress += amount;
      if (state.contractProgress >= contract.target) {
        state.cash += contract.reward;
        const finished = contract;
        state.contractIndex += 1;
        state.contractProgress = 0;
        if (state.contractIndex >= CONTRACTS.length) {
          state.contractsComplete = true;
          state.progress = 100;
          notifyRef.current?.(`All contracts complete! +$${finished.reward}`);
        } else {
          state.progress = 0;
          notifyRef.current?.(`Contract complete! +$${finished.reward} · Next: ${CONTRACTS[state.contractIndex].title} · ${CONTRACTS[state.contractIndex].tool} unlocked, tap the tool button`);
        }
      } else {
        state.progress = (state.contractProgress / contract.target) * 100;
      }
    };

    // Restore the latest local save on startup. Scene objects are rebuilt from saved cell/index sets.
    try {
      const rawSave = localStorage.getItem("golden-field-save");
      if (rawSave) {
        const saved = JSON.parse(rawSave);
        if (saved && typeof saved === "object" && saved.version === 2) {
          state.cash = Number.isFinite(saved.cash) ? saved.cash : state.cash;
          state.fuel = Number.isFinite(saved.fuel) ? THREE.MathUtils.clamp(saved.fuel, 0, 100) : state.fuel;
          state.gear = ["D", "N", "R"].includes(saved.gear) ? saved.gear : state.gear;
          state.contractIndex = Number.isInteger(saved.contractIndex) ? THREE.MathUtils.clamp(saved.contractIndex, 0, CONTRACTS.length) : 0;
          state.contractProgress = Number.isFinite(saved.contractProgress) ? Math.max(0, saved.contractProgress) : 0;
          state.contractsComplete = Boolean(saved.contractsComplete) || state.contractIndex >= CONTRACTS.length;
          if (state.contractsComplete) state.contractIndex = CONTRACTS.length;
          const unlockedTools = TOOL_CYCLE.slice(0, state.contractsComplete ? TOOL_CYCLE.length : state.contractIndex + 1);
          state.tool = unlockedTools.includes(saved.tool) ? saved.tool : (CONTRACTS[state.contractIndex]?.tool || "HARVESTER");
          state.harvestCount = Number.isFinite(saved.harvestCount) ? Math.max(0, saved.harvestCount) : 0;
          state.plowedCells = new Set(Array.isArray(saved.plowedCells) ? saved.plowedCells.filter(v => typeof v === "string") : []);
          state.seededCells = new Set(Array.isArray(saved.seededCells) ? saved.seededCells.filter(v => typeof v === "string") : []);
          state.harvestedCropIndices = new Set(Array.isArray(saved.harvestedCropIndices)
            ? saved.harvestedCropIndices.filter(v => Number.isInteger(v) && v >= 0 && v < cropCount)
            : []);

          // Recreate visible soil marks while retaining the 2000-mark memory cap.
          state.plowedCells.forEach(cell => {
            const [cx, cz] = cell.split(":").map(Number);
            if (!Number.isFinite(cx) || !Number.isFinite(cz)) return;
            const mark = new THREE.Mesh(plowedMarkGeometry, mats.soil);
            mark.position.set(cx * 1.25 - 35, 0.085, cz * 1.25 + 3);
            mark.receiveShadow = true;
            scene.add(mark);
            state.plowedMarks.set(cell, mark);
            if (state.plowedMarks.size > 2000) {
              const oldestKey = state.plowedMarks.keys().next().value;
              const oldestMark = state.plowedMarks.get(oldestKey);
              if (oldestMark) scene.remove(oldestMark);
              state.plowedMarks.delete(oldestKey);
              state.plowedCells.delete(oldestKey);
            }
          });

          // Restore seeded patches as visible seed heads.
          state.seededCells.forEach(cell => {
            if (state.seedCount >= MAX_SEEDS) return;
            const [cx, cz] = cell.split(":").map(Number);
            if (!Number.isFinite(cx) || !Number.isFinite(cz)) return;
            state.cropDummy.position.set(cx * 1.25 - 35, 0.28, cz * 1.25 + 3);
            state.cropDummy.rotation.set(0, 0, 0);
            state.cropDummy.scale.setScalar(1);
            state.cropDummy.updateMatrix();
            seedHeads.setMatrixAt(state.seedCount++, state.cropDummy.matrix);
          });
          seedHeads.count = state.seedCount;
          seedHeads.instanceMatrix.needsUpdate = true;

          // Hide crops already harvested in the saved session.
          state.harvestedCropIndices.forEach(index => {
            state.cropDummy.position.set(0, -100, 0);
            state.cropDummy.rotation.set(0, 0, 0);
            state.cropDummy.scale.setScalar(0);
            state.cropDummy.updateMatrix();
            cropStems.setMatrixAt(index, state.cropDummy.matrix);
            cropHeads.setMatrixAt(index, state.cropDummy.matrix);
          });
          cropStems.instanceMatrix.needsUpdate = true;
          cropHeads.instanceMatrix.needsUpdate = true;
          grain.scale.y = Math.max(0.01, Math.min(1, state.harvestCount / 40));
          grain.position.y = 0.54 + 0.36 * grain.scale.y;
          const contract = activeContract();
          state.progress = state.contractsComplete ? 100 : contract
            ? THREE.MathUtils.clamp(state.contractProgress / contract.target * 100, 0, 100) : 0;
        } else if (saved && typeof saved === "object") {
          console.warn(`Unsupported farm save version: ${String(saved.version)}`);
        }
      }
    } catch (error) {
      console.warn("Could not restore Golden Field save:", error);
    }

    const minimap = document.createElement("canvas");
    minimap.width = 180; minimap.height = 180;
    const mapCtx = minimap.getContext("2d");
    const fieldMap = document.createElement("canvas");
    fieldMap.width = 180; fieldMap.height = 180;
    const fieldMapCtx = fieldMap.getContext("2d");
    let fieldMapDirty = true;
    // Minimap: 1 px per world metre. World window x -90..90, z -70..110 (z grows downward).
    const MAP_X0 = 90, MAP_Z0 = 70;
    function redrawFieldMap() {
      const c = fieldMapCtx;
      c.clearRect(0, 0, 180, 180);
      c.fillStyle = "#547c3e"; c.fillRect(0, 0, 180, 180);
      c.fillStyle = "#8a633f"; c.fillRect(-35 + MAP_X0, 0.5 + MAP_Z0, 50, 57);
      c.fillStyle = "#8da94b"; c.fillRect(22 + MAP_X0, 2.5 + MAP_Z0, 34, 53);
      c.fillStyle = "#60665a";
      c.fillRect(0, -22 + MAP_Z0, 180, 8);
      c.fillRect(-23 + MAP_X0, -30 + MAP_Z0, 46, 6);
      c.fillRect(49 + MAP_X0, -32 + MAP_Z0, 6, 28);
      c.fillStyle = "#5c9eaf"; c.beginPath(); c.ellipse(-63 + MAP_X0, 42 + MAP_Z0, 21, 10.5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#d2c19a"; c.fillRect(7.5 + MAP_X0, -45 + MAP_Z0, 17, 12);
      c.fillStyle = "rgba(70,45,28,0.9)";
      state.plowedCells.forEach(cell => {
        const [cx, cz] = cell.split(":").map(Number);
        c.fillRect(cx * 1.25 - 35 + MAP_X0 - 0.7, cz * 1.25 + 3 + MAP_Z0 - 0.7, 1.4, 1.4);
      });
      c.fillStyle = "rgba(95,220,105,0.95)";
      state.seededCells.forEach(cell => {
        const [cx, cz] = cell.split(":").map(Number);
        c.fillRect(cx * 1.25 - 35 + MAP_X0 - 0.7, cz * 1.25 + 3 + MAP_Z0 - 0.7, 1.4, 1.4);
      });
      c.fillStyle = "rgba(35,35,25,0.9)";
      state.harvestedCropIndices.forEach(index => {
        const crop = cropPositions[index];
        if (crop) c.fillRect(crop.x + MAP_X0 - 0.65, crop.z + MAP_Z0 - 0.65, 1.3, 1.3);
      });
      fieldMapDirty = false;
    }
    function drawMap() {
      if (fieldMapDirty) redrawFieldMap();
      mapCtx.clearRect(0, 0, 180, 180);
      mapCtx.drawImage(fieldMap, 0, 0);
      const arrowX = THREE.MathUtils.clamp(tractor.position.x + MAP_X0, 8, 172);
      const arrowZ = THREE.MathUtils.clamp(tractor.position.z + MAP_Z0, 8, 172);
      mapCtx.save(); mapCtx.translate(arrowX, arrowZ); mapCtx.rotate(Math.PI - state.heading);
      mapCtx.fillStyle = "#f4d35e"; mapCtx.strokeStyle = "#1c2b20"; mapCtx.lineWidth = 1.5;
      mapCtx.beginPath(); mapCtx.moveTo(0, -8); mapCtx.lineTo(5, 5); mapCtx.lineTo(-5, 5); mapCtx.closePath(); mapCtx.fill(); mapCtx.stroke(); mapCtx.restore();
    }
    function updateMinimap() {
      const visible = host.parentElement?.querySelector?.(".gf-mapcanvas");
      if (visible) { const ctx = visible.getContext("2d"); ctx.clearRect(0, 0, 180, 180); ctx.drawImage(minimap, 0, 0); }
    }
    drawMap();

    const keyDown = (event) => {
      startAudio();
      const key = event.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) event.preventDefault();
      state.keys[key] = true;
      if (event.repeat) return;
      if (key === "c") state.cameraMode = (state.cameraMode + 1) % 4;
      if (key === "p") advanceToolRef.current?.();
      if (key === "e") { if (state.pumpNear && state.fuel < 99.5) refuelPumpRef.current?.(); else toggleEngineRef.current?.(); }
      if (key === "h") toggleHitchRef.current?.();
      if (key === "control") shiftGearRef.current?.(-1);
      if (key === "w" && event.shiftKey) shiftGearRef.current?.(1);
      if (key === "escape") togglePauseRef.current?.();
    };
    const keyUp = (event) => { state.keys[event.key.toLowerCase()] = false; };
    const onBlur = () => { state.keys = {}; };
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    const audioGesture = () => {
      startAudio();
      if (audioContext && audioContext.state === "suspended") audioContext.resume().catch(() => {});
    };
    window.addEventListener("pointerdown", audioGesture);
    const onAudioVisibility = () => {
      if (!audioContext) return;
      if (document.visibilityState === "hidden") audioContext.suspend().catch(() => {});
      else audioContext.resume().catch(() => {});
    };
    document.addEventListener("visibilitychange", onAudioVisibility);

    const resize = () => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);

    const clock = new THREE.Clock();
    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.04);
      if (state.paused && audioContext && engineGain) engineGain.gain.setTargetAtTime(0.0001, audioContext.currentTime, 0.1);
      if (!state.paused) {
        state.elapsed += dt;
        trafficCars.forEach(({ car, direction, phase }) => {
          car.position.x += direction * dt * 5.2;
          if (car.position.x > 98) car.position.x = -98;
          if (car.position.x < -98) car.position.x = 98;
          car.rotation.y = direction > 0 ? Math.PI / 2 : -Math.PI / 2;
        });
        hub.rotation.z += dt * 0.7;
        state.day = (state.day + dt * 0.0015) % 1;
        const k = (Math.sin(state.day * Math.PI * 2 - Math.PI / 2) + 1) / 2;
        // Rain arrives periodically, then clears; wet weather dims the sky and sunlight.
        const weatherPhase = state.elapsed % 78;
        const rainAmount = THREE.MathUtils.smoothstep(weatherPhase, 42, 48) *
          (1 - THREE.MathUtils.smoothstep(weatherPhase, 67, 74));
        state.isRaining = rainAmount > 0.08;
        rainMaterial.opacity = rainAmount * 0.72;
        rain.visible = rainAmount > 0.01;
        rain.position.copy(tractor.position);
        const rainAttr = rainGeometry.attributes.position;
        for (let i = 0; i < rainCount; i++) {
          const yIndex = i * 3 + 1;
          rainPositions[yIndex] -= dt * 24;
          rainPositions[i * 3] -= dt * 3.5;
          if (rainPositions[yIndex] < 0) {
            rainPositions[yIndex] = 18 + Math.random() * 12;
            rainPositions[i * 3] = (Math.random() - 0.5) * 70;
            rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 70;
          }
        }
        rainAttr.needsUpdate = true;
        const weatherDim = rainAmount * 0.58;
        sun.intensity = Math.max(0, (k - 0.1) * 3.0) * (1 - weatherDim);
        const daylight = new THREE.Color().setHSL(0.56 - (1 - k) * 0.06, 0.48, (0.3 + k * 0.38) * (1 - weatherDim * 0.48));
        scene.fog.color.copy(daylight);
        // The Sky mesh owns the visible background, avoiding a flat-color conflict.
        scene.fog.near = 100 - rainAmount * 28;
        scene.fog.far = 450 - rainAmount * 110;
        sun.position.set(tractor.position.x - 55 + Math.sin(state.day * Math.PI * 2) * 18, tractor.position.y - 10 + k * 95, tractor.position.z + 40);
        sun.target.position.copy(tractor.position);
        sun.target.updateMatrixWorld();
        skySun.set(Math.sin(state.day * Math.PI * 2) * 0.22 - 0.5, -0.1 + k * 0.95, 0.42).normalize();
        skyU.sunPosition.value.copy(skySun);
        skyU.turbidity.value = 2 + k * 6 + rainAmount * 9;
        skyU.rayleigh.value = 1.0 + k * 2.0 - rainAmount * 0.45;
        const headlightIntensity = THREE.MathUtils.smoothstep(0.25 - k, 0, 0.15) * 4;
        headlights.forEach(light => { light.intensity = headlightIntensity; });
        const key = state.keys;
        const rawForward = state.throttle || (key.w || key.arrowup ? 1 : key.s || key.arrowdown ? -0.65 : 0);
        const steering = state.steer || ((key.a || key.arrowleft ? 1 : 0) - (key.d || key.arrowright ? 1 : 0));
        const braking = state.brake || key[" "];
        const clutchIn = state.clutch || key.shift;
        // Shift+W is a gear-up command, so it must not also count as throttle.
        const forward = (key.shift && key.w && !state.throttle) ? 0 : rawForward;
        const gearDirection = state.gear === "D" ? 1 : state.gear === "R" ? -1 : 0;
        const gearTop = GEAR_TOP[Math.min(GEAR_TOP.length, Math.max(1, state.manualGear)) - 1];
        if (state.fuel <= 0 && state.engineOn) { state.engineOn = false; notifyRef.current?.("Out of fuel — engine stopped"); }
        const ratio = Math.min(1, Math.abs(state.speed) / gearTop);
        const drivelineRPM = IDLE_RPM + ratio * (MAX_RPM - IDLE_RPM);
        let targetRPM = 0;
        if (state.engineOn) {
          targetRPM = clutchIn || gearDirection === 0
            ? IDLE_RPM + Math.abs(forward) * (MAX_RPM - IDLE_RPM) * 0.8
            : Math.max(IDLE_RPM, drivelineRPM);
        }
        state.engineRPM += (targetRPM - state.engineRPM) * Math.min(1, dt * 5);
        if (!state.engineOn && state.engineRPM < 5) state.engineRPM = 0;
        // Lugging: pulling away in a tall gear without the clutch stalls the engine.
        if (state.engineOn && !clutchIn && gearDirection !== 0 && state.manualGear >= 3 && ratio < 0.14 && Math.abs(state.speed) < gearTop * 0.14) {
          state.stallNotice += dt;
          if (state.stallNotice > 0.6 && (Math.abs(forward) > 0 || Math.abs(state.speed) < 0.3)) {
            state.engineOn = false; state.stallNotice = 0;
            notifyRef.current?.("Engine stalled — press E to restart, use a lower gear");
          }
        } else state.stallNotice = 0;
        const driveActive = state.engineOn && !clutchIn && gearDirection !== 0;
        const desired = driveActive ? forward * gearDirection * gearTop : 0;
        if (braking) state.speed *= Math.max(0, 1 - dt * 5.5);
        else if (driveActive && Math.abs(forward) > 0) {
          // Torque falls off at very low or very high RPM relative to the selected gear.
          const torque = ratio < 0.2 ? 0.45 + ratio * 2.7 : 1;
          state.speed += (desired - state.speed) * Math.min(1, dt * 1.7 * torque);
        } else {
          // Engine braking when the driveline is engaged, light rolling drag when not.
          const drag = driveActive || (state.engineOn === false && !clutchIn && gearDirection !== 0) ? 0.9 : 0.35;
          state.speed *= Math.max(0, 1 - dt * drag);
        }
        state.speed = THREE.MathUtils.clamp(state.speed, -5.5, 13);
        if (Math.abs(state.speed) < 0.025) state.speed = 0;
        const speedKmh = Math.abs(state.speed) * 1.8;
        state.telemetry.speedKmh = speedKmh;
        state.telemetry.engineRPM = Math.round(state.engineRPM);
        state.telemetry.currentGear = state.gear === "R" ? "R" : state.gear === "N" ? "N" : state.manualGear;
        state.telemetry.fuelLevel = state.fuel;
        if (audioContext && engineOsc && engineGain && engineFilter) {
          if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
          const engineLoad = state.engineOn ? Math.min(1, Math.max(0, (state.engineRPM - IDLE_RPM) / (MAX_RPM - IDLE_RPM))) : 0;
          const targetFrequency = 48 + engineLoad * 92 + (Math.abs(forward) > 0.1 ? 18 : 0);
          engineOsc.frequency.setTargetAtTime(targetFrequency, audioContext.currentTime, 0.12);
          engineFilter.frequency.setTargetAtTime(180 + engineLoad * 650, audioContext.currentTime, 0.14);
          engineGain.gain.setTargetAtTime(state.engineOn ? 0.006 + engineLoad * 0.035 : 0.0001, audioContext.currentTime, 0.18);
        }
        const steeringStrength = Math.min(1, Math.abs(state.speed) / 2.2);
        state.heading += steering * steeringStrength * dt * 1.15 * (state.speed >= 0 ? 1 : -1);
        tractor.rotation.y = state.heading;
        tractor.position.x += Math.sin(state.heading) * state.speed * dt;
        tractor.position.z += Math.cos(state.heading) * state.speed * dt;
        tractor.position.x = THREE.MathUtils.clamp(tractor.position.x, -125, 125);
        tractor.position.z = THREE.MathUtils.clamp(tractor.position.z, -125, 125);
        tractor.position.y = heightAt(tractor.position.x, tractor.position.z);
        wheels.forEach(w => {
          w.pivot.rotation.y = w.front ? steering * 0.35 : 0;
          w.pivot.rotation.x += state.speed * dt / w.radius;
        });
        plow.visible = state.tool === "PLOW" && state.plowAttached;
        seeder.visible = state.tool === "SEEDER";
        harvester.visible = state.tool === "HARVESTER";
        reel.rotation.x += dt * (state.tool === "HARVESTER" ? 5 + Math.abs(state.speed) : 0.5);

        const plowWorking = state.plowWorking = state.plowAttached && state.engineOn && state.speed > 0 && speedKmh > 5;
        if ((state.tool === "PLOW" || state.tool === "SEEDER") &&
            (state.tool === "SEEDER" ? Math.abs(state.speed) > 0.5 : plowWorking) &&
            tractor.position.x > -35 && tractor.position.x < 15 &&
            tractor.position.z > 3 && tractor.position.z < 58) {
          const cellX = Math.round((tractor.position.x + 35) / 1.25);
          const cellZ = Math.round((tractor.position.z - 3) / 1.25);
          const cell = `${cellX}:${cellZ}`;
          // Seeding is only valid on soil that has already been plowed.
          if (state.tool !== "SEEDER" || state.plowedCells.has(cell)) {
          const workedCells = state.tool === "SEEDER" ? state.seededCells : state.plowedCells;
          if (!workedCells.has(cell)) {
            workedCells.add(cell);
            if (state.tool === "PLOW") {
              state.plowedCells.add(cell);
              state.seededCells.delete(cell);
              fieldMapDirty = true;
            } else if (state.tool === "SEEDER") {
              fieldMapDirty = true;
            }
            const mark = new THREE.Mesh(
              state.tool === "SEEDER" ? seededMarkGeometry : plowedMarkGeometry,
              state.tool === "SEEDER" ? cropMaterial : mats.soil
            );
            mark.position.set(
              tractor.position.x - Math.sin(state.heading) * 2.5,
              state.tool === "SEEDER" ? 0.1 : 0.085,
              tractor.position.z - Math.cos(state.heading) * 2.5
            );
            mark.rotation.y = tractor.rotation.y;
            mark.receiveShadow = true;
            scene.add(mark);
            if (state.tool === "PLOW") {
              state.plowedMarks.set(cell, mark);
              // Keep a bounded visual history so long sessions don't retain unlimited meshes.
              if (state.plowedMarks.size > 2000) {
                const oldestKey = state.plowedMarks.keys().next().value;
                const oldestMark = state.plowedMarks.get(oldestKey);
                if (oldestMark) scene.remove(oldestMark);
                state.plowedMarks.delete(oldestKey);
                state.plowedCells.delete(oldestKey);
              }
              recordContractWork("PLOW");
            }
            if (state.tool === "SEEDER") {
              if (state.seedCount < MAX_SEEDS) {
                state.cropDummy.position.set(mark.position.x, 0.28, mark.position.z);
                state.cropDummy.rotation.set(0, tractor.rotation.y, 0);
                state.cropDummy.scale.setScalar(1);
                state.cropDummy.updateMatrix();
                state.seedHeads.setMatrixAt(state.seedCount, state.cropDummy.matrix);
                state.seedCount++;
                state.seedHeads.count = state.seedCount;
                state.seedHeads.instanceMatrix.needsUpdate = true;
                state.seedCapNotified = false;
                recordContractWork("SEEDER");
              } else if (!state.seedCapNotified) {
                notifyRef.current?.("Seed limit reached — no more planting available");
                state.seedCapNotified = true;
              }
            }
            }
          }
        }

        // Harvest each standing crop at most once as the header passes it.
        if (state.tool === "HARVESTER" && Math.abs(state.speed) > 0.5 &&
            tractor.position.x > 20 && tractor.position.x < 58 &&
            tractor.position.z > 4 && tractor.position.z < 57) {
          state.harvestTimer += dt;
          if (state.harvestTimer >= 0.08) {
            state.harvestTimer = 0;
            const headerX = tractor.position.x + Math.sin(state.heading) * 2.8;
            const headerZ = tractor.position.z + Math.cos(state.heading) * 2.8;
            let harvestedNow = false;
            for (const crop of cropPositions) {
              if (state.harvestedCropIndices.has(crop.index)) continue;
              const dx = crop.x - headerX;
              const dz = crop.z - headerZ;
              if (dx * dx + dz * dz > 1.35 * 1.35) continue;
              state.harvestedCropIndices.add(crop.index);
              fieldMapDirty = true;
              state.cropDummy.position.set(0, -100, 0);
              state.cropDummy.rotation.set(0, 0, 0);
              state.cropDummy.scale.setScalar(0);
              state.cropDummy.updateMatrix();
              cropStems.setMatrixAt(crop.index, state.cropDummy.matrix);
              cropHeads.setMatrixAt(crop.index, state.cropDummy.matrix);
              state.harvestCount++;
              recordContractWork("HARVESTER");
              harvestedNow = true;
            }
            if (harvestedNow) {
              cropStems.instanceMatrix.needsUpdate = true;
              cropHeads.instanceMatrix.needsUpdate = true;
              grain.scale.y = Math.max(0.01, Math.min(1, state.harvestCount / 40));
              grain.position.y = 0.54 + 0.36 * grain.scale.y;
            }
          }
        }
        if (state.engineOn) state.fuel = Math.max(0, state.fuel - (0.0004 + Math.abs(state.speed) * 0.0009) * dt);
        if (plowWorking && state.tool === "PLOW" && Math.random() < dt * 13) {
          const puff = dustPuffs[dustCursor++ % dustPuffs.length];
          puff.visible = true; puff.userData.life = 0.8;
          puff.position.set(tractor.position.x - Math.sin(state.heading) * 3.2 + (Math.random() - 0.5), 0.22, tractor.position.z - Math.cos(state.heading) * 3.2 + (Math.random() - 0.5));
          puff.scale.setScalar(0.7 + Math.random() * 0.9); puff.userData.vy = 0.35 + Math.random() * 0.45;
        }
      }
      dustPuffs.forEach(puff => {
        if (!puff.visible) return;
        puff.userData.life -= dt; puff.position.y += (puff.userData.vy || 0.4) * dt;
        puff.scale.multiplyScalar(1 + dt * 0.7);
        puff.material.opacity = Math.max(0, puff.userData.life / 0.8) * 0.32;
        if (puff.userData.life <= 0) puff.visible = false;
      });
      const follow = new THREE.Vector3(0, 4.7, -10.5);
      const close = new THREE.Vector3(0, 2.8, -5.6);
      const high = new THREE.Vector3(0, 12.5, -15);
      const cockpit = new THREE.Vector3(0, 2.35, 0.2);
      const offsets = [follow, close, high, cockpit];
      const offset = offsets[state.cameraMode];
      if (cockpitInterior) cockpitInterior.visible = state.cameraMode === 3;
      const worldOffset = offset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), tractor.rotation.y);
      const targetCamera = tractor.position.clone().add(worldOffset);
      camera.position.lerp(targetCamera, Math.min(1, dt * 4.5));
      const lookTarget = tractor.position.clone().add(new THREE.Vector3(0, state.cameraMode === 3 ? 2.8 : 1.6, 0));
      if (state.cameraMode === 3) lookTarget.add(new THREE.Vector3(Math.sin(state.heading) * 18, -0.5, Math.cos(state.heading) * 18));
      camera.lookAt(lookTarget);
      const pumpDistance = Math.hypot(tractor.position.x - (-13), tractor.position.z - 16);
      const isNearPump = statePumpReady && pumpDistance < 5.5;
      if (isNearPump !== state.pumpNear) state.pumpNear = isNearPump;
      if (state.elapsed - state.lastHud > 0.16) {
        state.lastHud = state.elapsed;
        const totalMinutes = Math.floor(state.day * 24 * 60);
        const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
        const mm = String(totalMinutes % 60).padStart(2, "0");
        const contract = activeContract();
        setHud({
          cash: state.cash,
          fuel: state.fuel,
          progress: state.progress,
          cropUnits: state.harvestCount,
          speed: Math.round(Math.abs(state.speed) * 1.8),
          gear: state.gear === "D" ? `D${state.manualGear}` : state.gear,
          engineOn: state.engineOn,
          rpm: Math.round(state.engineRPM / 10) * 10,
          hitched: state.plowAttached,
          clutch: !!(state.clutch || state.keys.shift),
          tool: state.tool,
          time: `${hh}:${mm}`,
          status: state.paused ? "Paused" : !state.engineOn ? "Engine OFF · press E / ENG to start" : state.tool === "PLOW" ? (state.plowAttached ? (state.plowWorking ? "Plow down · Working soil" : "Plow attached · Drive forward over 5 km/h") : "Plow detached · Press H to attach") : state.tool === "SEEDER" ? "Seeder attached · Planting mode" : "Harvester attached · Harvesting mode",
          contractTitle: contract ? contract.title : "ALL CONTRACTS COMPLETE",
          contractDescription: contract ? contract.description : "All three contracts are complete! Keep harvesting, sell your grain, and build the farm into a thriving business.",
          contractIndex: contract ? contract.id : CONTRACTS.length,
          contractCount: contract ? state.contractProgress : CONTRACTS.reduce((sum, item) => sum + item.target, 0),
          contractTarget: contract ? contract.target : CONTRACTS.reduce((sum, item) => sum + item.target, 0),
          contractReward: contract ? contract.reward : 0,
          contractsComplete: state.contractsComplete
        });
        drawMap(); updateMinimap();
      }
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(frame); clearTimeout(toastTimer.current);
      window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", onBlur);
      window.removeEventListener("pointerdown", audioGesture);
      document.removeEventListener("visibilitychange", onAudioVisibility);
      if (audioContext) audioContext.close().catch(() => {});
      rainGeometry.dispose(); rainMaterial.dispose();
      if (environmentTarget) environmentTarget.dispose();
      // Also cover unmount while the optional HDR request is still pending.
      disposePmrem();
      resizeObserver.disconnect();
      scene.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) (Array.isArray(obj.material) ? obj.material : [obj.material]).forEach(m => m.dispose());
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
      gameRef.current = null;
    };
  }, []);

  const haptic = () => { try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(14); } catch {} };
  const setDrive = (key, value) => {
    const state = gameRef.current;
    if (state) state[key] = value;
  };
  const setGear = (gear) => {
    if (gameRef.current) gameRef.current.gear = gear;
    setHud(old => ({ ...old, gear }));
    haptic();
  };
  const cycleCamera = () => {
    const state = gameRef.current;
    if (state) state.cameraMode = (state.cameraMode + 1) % 4;
    setCameraMode(state ? state.cameraMode : (cameraMode + 1) % 4);
    notify(["Chase camera", "Close camera", "High camera", "Cockpit view"][(state ? state.cameraMode : cameraMode) % 4]);
  };
  const advanceTool = () => {
    const state = gameRef.current;
    if (!state) return;
    advanceToolState(state);
    haptic();
    if (state.audioToolChange) state.audioToolChange();
    const status = state.tool === "PLOW" ? "Plow attached" : state.tool === "SEEDER" ? "Seeder selected" : "Harvester selected";
    setHud(old => ({ ...old, tool: state.tool, status }));
    notify(`${state.tool} selected`);
  };
  advanceToolRef.current = advanceTool;
  const toggleTool = advanceTool;
  const togglePause = () => {
    const next = !paused; setPaused(next); setDrive("paused", next); notify(next ? "Game paused" : "Back to the farm");
  };
  togglePauseRef.current = togglePause;
  const sellHarvest = () => {
    const state = gameRef.current;
    if (!state) return;
    const units = state.harvestCount;
    if (units === 0) {
      notify("No harvested crop to sell");
      return;
    }
    const pricePerUnit = 12 + state.contractIndex * 4;
    const revenue = units * pricePerUnit;
    if (state.audioSell) state.audioSell();
    state.cash += revenue;
    state.harvestCount = 0;
    state.grain.scale.y = 0.01;
    state.grain.position.y = 0.544;
    setHud(old => ({ ...old, cash: state.cash, cropUnits: 0 }));
    notify(`Sold ${units} harvested crop units for $${revenue}`);
  };
  const newGame = () => {
    const confirmed = window.confirm("Start a new farm? This will permanently erase the saved farm on this browser.");
    if (!confirmed) return;
    try {
      resettingRef.current = true; // stop autosave from rewriting the save during reload
      localStorage.removeItem("golden-field-save");
      window.location.reload();
    } catch {
      resettingRef.current = false;
      notify("Could not clear the saved farm in this browser");
    }
  };
  const saveGame = (silent = false) => {
    if (resettingRef.current) return;
    try {
      const s = gameRef.current;
      if (!s) return;
      localStorage.setItem("golden-field-save", JSON.stringify({ version: 2, cash: s.cash, fuel: s.fuel, gear: s.gear, tool: s.tool, harvestCount: s.harvestCount, contractIndex: s.contractIndex, contractProgress: s.contractProgress, contractsComplete: s.contractsComplete, harvestedCropIndices: Array.from(s.harvestedCropIndices), plowedCells: Array.from(s.plowedCells), seededCells: Array.from(s.seededCells) }));
      if (!silent) notify("Farm saved on this device");
    } catch { if (!silent) notify("Save is unavailable in this browser"); }
  };
  saveGameRef.current = saveGame;

  // Autosave: every 20s and whenever the app goes to the background (Android may kill it).
  useEffect(() => {
    const save = () => saveGameRef.current?.(true);
    const onVis = () => { if (document.visibilityState === "hidden") save(); };
    const id = setInterval(save, 20000);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", save);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("pagehide", save); };
  }, []);

  const holdControl = (key, value) => {
    const release = (e) => {
      e.currentTarget.classList.remove("active");
      setDrive(key, key === "brake" || key === "clutch" ? false : 0);
    };
    return {
      onPointerDown: (e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        e.currentTarget.classList.add("active");
        setDrive(key, value);
        haptic();
      },
      onPointerUp: release,
      onPointerCancel: release,
      onLostPointerCapture: release,
      onContextMenu: (e) => e.preventDefault()
    };
  };

  const steeringPointerDown = (e) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    steeringDragRef.current = { id: e.pointerId, startX: e.clientX, startAngle: steeringWheelAngle };
    haptic();
  };
  const steeringPointerMove = (e) => {
    const drag = steeringDragRef.current;
    if (!drag || drag.id !== e.pointerId) return;
    const angle = Math.max(-135, Math.min(135, drag.startAngle + (e.clientX - drag.startX) * 1.35));
    setSteeringWheelAngle(angle);
    setDrive("steer", -Math.max(-1, Math.min(1, angle / 135)));
  };
  const steeringPointerEnd = (e) => {
    if (steeringDragRef.current?.id !== e.pointerId) return;
    steeringDragRef.current = null;
    setDrive("steer", 0);
    setSteeringWheelAngle(0);
  };
  const throttleFromPointer = (e) => {
    const el = throttleTrackRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    setThrottleVisual(ratio);
    const reverseGear = gameRef.current?.gear === "R";
    if (ratio >= 0.12) {
      setDrive("brake", false);
      setDrive("throttle", reverseGear ? ratio : ratio);
    } else {
      setDrive("throttle", 0);
      setDrive("brake", true);
    }
  };
  const throttlePointerDown = (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); haptic(); throttleFromPointer(e); };
  const throttlePointerMove = (e) => { if (e.buttons || e.pointerType === "touch") throttleFromPointer(e); };
  const throttlePointerEnd = () => { setDrive("throttle", 0); setDrive("brake", false); setThrottleVisual(0); };

  return (
    <div className="gf-root">
      <style>{`
        .gf-root{position:fixed;inset:0;overflow:hidden;background:#8dbb8b;color:#fff;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;touch-action:none}
        .gf-world{position:absolute;inset:0}.gf-world canvas{display:block;width:100%;height:100%}
        .gf-panel{background:linear-gradient(145deg,rgba(18,33,27,.88),rgba(26,45,33,.73));border:1px solid #ffffff35;box-shadow:0 8px 28px #101b1938;backdrop-filter:blur(9px);border-radius:15px}
        .gf-top{position:absolute;left:14px;top:14px;width:260px;padding:12px 14px}.gf-brand{font-size:10px;letter-spacing:.18em;font-weight:900;color:#e6d38b}.gf-title{font-size:19px;font-weight:850;margin:3px 0 9px} .gf-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}.gf-stat{background:#ffffff0c;border-radius:9px;padding:7px}.gf-label{font-size:9px;color:#c6d0c7;text-transform:uppercase;letter-spacing:.08em}.gf-value{font-size:16px;font-weight:850}.gf-meter{height:4px;margin-top:5px;background:#ffffff20;border-radius:8px;overflow:hidden}.gf-meter span{display:block;height:100%;background:#e1c35f}.gf-status{font-size:10px;color:#d3dfd2;margin-top:8px}
        @media(max-width:700px){.gf-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.gf-value{font-size:14px}}
        .gf-map{position:absolute;left:16px;top:184px;width:112px;height:112px;border:3px solid #e0d8b9;border-radius:50%;overflow:hidden;box-shadow:0 5px 20px #0005;background:#547c3e}.gf-mapcanvas{width:100%;height:100%}
        .gf-topcenter{position:absolute;top:14px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center}.gf-pill{border-radius:12px;padding:9px 13px;background:#182a20d9;border:1px solid #ffffff3b;font-size:12px;font-weight:850;white-space:nowrap}.gf-speed{font-size:15px;font-variant-numeric:tabular-nums}
        .gf-mission{position:absolute;right:14px;top:14px;width:235px;padding:12px}.gf-mission h3{margin:0 0 6px;font-size:12px;color:#e9d28b;letter-spacing:.06em}.gf-mission p{margin:0;font-size:11px;line-height:1.45;color:#e2e8df}.gf-contract-progress{margin-top:9px;font-size:10px;color:#dbe4d3}.gf-contract-progress>div:first-child{display:flex;justify-content:space-between;gap:8px}.gf-contract-meter{height:5px;background:rgba(255,255,255,.12);border-radius:99px;overflow:hidden;margin-top:5px}.gf-contract-meter span{display:block;height:100%;background:#e9d28b;border-radius:99px;transition:width .15s}.gf-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
        .gf-root button{font:inherit;font-weight:800;cursor:pointer;touch-action:manipulation;border:1px solid #ffffff35;border-radius:10px;padding:9px 11px;background:#f1edda;color:#213127}.gf-root button:active{transform:scale(.96)}.gf-root button.gf-secondary{background:#ffffff12;color:#fff}.gf-gear{position:absolute;right:14px;bottom:114px;display:flex;flex-direction:column;gap:5px;padding:6px;border-radius:13px}.gf-gear button{min-width:42px;padding:10px}.gf-gear button.active{background:#e3c25d;color:#1c2b20}
        .gf-refuel-prompt{position:absolute;left:50%;bottom:116px;transform:translateX(-50%);z-index:8;border:1px solid #e4c76b;border-radius:14px;background:#173222ed;color:#fff5d4;padding:13px 17px;font-weight:900;font-size:12px;letter-spacing:.04em;box-shadow:0 5px 18px #0005;white-space:normal;max-width:calc(100% - 28px);cursor:pointer}.gf-refuel-prompt span{display:inline-block;margin-left:8px;padding:4px 7px;border-radius:6px;background:#e4c76b;color:#17271c;font-size:10px}.gf-refuel-prompt:disabled{opacity:.82;cursor:default}
        .gf-camera{position:absolute;right:14px;top:118px;width:47px;height:47px;border-radius:50%!important;background:#172920d9!important;color:#fff!important;font-size:19px!important}.gf-controls{position:absolute;bottom:16px;left:16px;right:16px;display:flex;justify-content:space-between;align-items:flex-end;pointer-events:none}.gf-controlgroup{display:flex;gap:8px;align-items:flex-end;pointer-events:auto}.gf-control.active{background:#e3c25d!important;color:#1c2b20!important}.gf-control{width:58px;height:58px;border-radius:18px!important;background:#172920bf!important;color:#fff!important;border:1px solid #ffffff55!important;display:grid;place-items:center;font-size:21px!important;box-shadow:0 4px 14px #0003}.gf-control.wide{width:68px;font-size:11px!important}.gf-hint{position:absolute;bottom:7px;left:50%;transform:translateX(-50%);font-size:10px;color:#fff;text-shadow:0 1px 4px #000;white-space:nowrap}
        .gf-toast{position:absolute;top:46%;left:50%;transform:translate(-50%,-50%);padding:12px 18px;border-radius:12px;background:#14261fe8;border:1px solid #ffffff40;font-weight:800;font-size:13px;pointer-events:none}
        @media(max-width:700px){.gf-top{left:8px;top:8px;width:225px;padding:9px}.gf-title{font-size:16px}.gf-value{font-size:13px}.gf-map{left:9px;top:155px;width:86px;height:86px}.gf-mission{top:auto;bottom:96px;right:8px;width:174px;padding:9px}.gf-mission p{font-size:10px}.gf-actions button{padding:7px 8px;font-size:10px}.gf-topcenter{top:8px;left:auto;right:58px;transform:none;gap:4px}.gf-pill{padding:7px 8px;font-size:10px}.gf-speed{font-size:12px}.gf-camera{top:88px;right:8px;width:42px;height:42px}.gf-gear{right:8px;bottom:91px}.gf-gear button{min-width:36px;padding:8px}.gf-controls{left:8px;right:8px;bottom:10px}.gf-control{width:48px;height:50px;border-radius:15px!important}.gf-control.wide{width:52px;font-size:9px!important}.gf-controlgroup{gap:5px}.gf-hint{display:none}}
        @media(orientation:portrait) and (max-width:700px){.gf-topcenter{top:103px;left:8px;right:auto}.gf-map{top:195px}.gf-mission{bottom:91px;width:158px}.gf-gear{bottom:158px}.gf-control{width:43px;height:45px}.gf-control.wide{width:47px}}
        /* Golden Field visual refresh: green-and-gold farming-simulator identity */
        .gf-root{background:#6f9a48;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .gf-panel{background:linear-gradient(145deg,rgba(8,38,25,.94),rgba(19,64,36,.86));border:1px solid rgba(238,213,119,.62);box-shadow:0 7px 22px rgba(10,28,16,.42),inset 0 1px 0 rgba(255,255,255,.12);backdrop-filter:blur(12px);border-radius:16px}
        .gf-top{width:280px;padding:13px 15px;border-top:3px solid #e8c54f}
        .gf-brand{font-size:10px;letter-spacing:.16em;font-weight:950;color:#f4d65f;text-shadow:0 1px 2px #000}
        .gf-title{font-size:22px;font-weight:950;letter-spacing:-.035em;margin:4px 0 10px;text-shadow:0 2px 5px #0008}
        .gf-stat{background:linear-gradient(145deg,rgba(255,255,255,.12),rgba(255,255,255,.045));border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:8px}
        .gf-label{font-size:9px;color:#dce8d8;font-weight:800;letter-spacing:.09em}
        .gf-value{font-size:16px;color:#fff4c6;font-variant-numeric:tabular-nums}
        .gf-meter{height:5px;background:#071b12;border:1px solid #ffffff20}
        .gf-meter span{background:linear-gradient(90deg,#f1d96d,#e7a92d)}
        .gf-status{color:#d8e9d4;font-size:10px;font-weight:650}
        .gf-pill{background:linear-gradient(135deg,rgba(7,39,24,.96),rgba(28,70,40,.93));border:1px solid #f0d56d8c;border-radius:12px;box-shadow:0 4px 12px #0003;color:#fff7d6}
        .gf-speed{font-size:15px}
        .gf-mission{width:245px;padding:13px;border-top:3px solid #e8c54f}
        .gf-mission h3{color:#f7dc70;font-size:12px;font-weight:950;letter-spacing:.055em}
        .gf-mission p{color:#eef4e8;font-size:11px}
        .gf-contract-progress{color:#e6efd9}
        .gf-contract-meter{height:6px;background:#061d12;border:1px solid #ffffff22}
        .gf-contract-meter span{background:linear-gradient(90deg,#b5df68,#f0d15a)}
        .gf-root button{border:1px solid rgba(255,255,255,.25);border-radius:10px;background:linear-gradient(180deg,#f5db68,#dba934);color:#17331e;box-shadow:0 3px 8px #0002;transition:filter .15s,transform .1s}
        .gf-root button:hover{filter:brightness(1.08)}
        .gf-root button.gf-secondary{background:linear-gradient(145deg,rgba(255,255,255,.15),rgba(255,255,255,.07));color:#fff;border-color:#ffffff38}
        .gf-gear{background:linear-gradient(145deg,rgba(8,38,25,.94),rgba(19,64,36,.86));border:1px solid #e8c54f8c}
        .gf-gear button{background:rgba(255,255,255,.1);color:#fff;border-color:#ffffff24}
        .gf-gear button.active{background:linear-gradient(180deg,#f5db68,#dba934);color:#17331e}
        .gf-camera{background:linear-gradient(145deg,#16452b,#092718)!important;border:1px solid #f0d56d!important;box-shadow:0 4px 14px #0005}
        .gf-control{background:linear-gradient(145deg,rgba(8,43,26,.94),rgba(22,67,39,.9))!important;border:1px solid rgba(245,220,120,.68)!important;box-shadow:0 5px 15px #0005,inset 0 1px 0 #ffffff20}
        .gf-control.active{background:linear-gradient(180deg,#f5db68,#dba934)!important;color:#17331e!important}
        .gf-toast{background:linear-gradient(145deg,#103c25f5,#1e5937f2);border:1px solid #f0d56d;font-weight:850;box-shadow:0 8px 25px #0005}
        @media(max-width:700px){.gf-top{width:220px;padding:9px}.gf-title{font-size:17px}.gf-stat{padding:6px}.gf-mission{width:178px;padding:9px}.gf-mission h3{font-size:10px}.gf-mission p{font-size:10px}}
        .gf-modal-backdrop{position:absolute;inset:0;z-index:30;display:grid;place-items:center;padding:18px;background:rgba(8,17,10,.72);backdrop-filter:blur(8px)}
        .gf-modal{position:relative;width:min(440px,100%);max-height:88%;overflow:auto;padding:24px;border:1px solid rgba(237,218,151,.35);border-radius:22px;background:linear-gradient(145deg,rgba(32,47,31,.98),rgba(13,25,18,.98));box-shadow:0 24px 80px #0009}
        .gf-modal h2{font-size:27px;margin:5px 0 8px;color:#f5f0dc}.gf-modal p{font-size:13px;color:#c6d0bf;margin:0 0 18px}.gf-modal-kicker{font-size:10px;letter-spacing:.18em;font-weight:900;color:#e9d28b}.gf-modal-close{position:absolute;right:14px;top:14px;border:1px solid #ffffff30;background:#ffffff12;color:#fff;border-radius:10px;width:36px;height:36px}.gf-modal-vehicle{font-size:70px;text-align:center;padding:12px;background:linear-gradient(120deg,#33482c,#18291b);border-radius:15px;margin-bottom:14px}.gf-modal-row,.gf-shop-balance{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid #ffffff18;color:#d9e2d3;font-size:12px}.gf-modal-row strong,.gf-shop-balance strong{color:#f2d56f}.gf-modal-primary{width:100%;margin-top:18px;padding:13px;border:0;border-radius:12px;background:#e8c64c;color:#172014;font-weight:900}.gf-shop-item{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 0;border-bottom:1px solid #ffffff18}.gf-shop-item strong,.gf-shop-item small{display:block}.gf-shop-item strong{font-size:13px;color:#f4f3e9}.gf-shop-item small{font-size:11px;color:#aebda9;margin-top:4px}.gf-shop-item button{border:1px solid #e8c64c70;background:#e8c64c;color:#172014;font-weight:900;border-radius:10px;padding:10px 14px}.gf-shop-item button:disabled{opacity:.4}.gf-shop-balance{margin-top:10px;border:0}
        /* Landscape phones: preserve a broad, unobstructed driving view. */
        @media (orientation:landscape) and (max-height:520px){
          .gf-top{left:10px;top:10px;width:clamp(210px,29vw,285px);padding:9px 11px}
          .gf-title{font-size:clamp(16px,2.5vw,22px);margin-bottom:7px}
          .gf-brand{font-size:8px;letter-spacing:.1em}
          .gf-stat{padding:5px}.gf-value{font-size:13px}.gf-label{font-size:8px}
          .gf-status{font-size:9px;margin-top:5px}
          .gf-mission{top:10px;right:10px;bottom:auto;width:clamp(190px,28vw,245px);padding:10px}
          .gf-mission h3{font-size:10px}.gf-mission p{font-size:10px}
          .gf-actions{gap:5px;margin-top:7px}.gf-actions button{padding:7px 8px;font-size:10px}
          .gf-map{top:auto;bottom:82px;left:10px;width:76px;height:76px}
          .gf-topcenter{top:10px;left:50%;right:auto;transform:translateX(-50%)}
          .gf-pill{padding:6px 8px;font-size:10px}.gf-speed{font-size:12px}
          .gf-camera{top:auto;right:10px;bottom:82px;width:38px;height:38px}
          .gf-gear{right:10px;bottom:126px;padding:4px;gap:3px}.gf-gear button{min-width:34px;padding:6px}
          .gf-controls{left:10px;right:10px;bottom:8px}
          .gf-control{width:44px;height:44px;border-radius:13px!important;font-size:17px!important}
          .gf-control.wide{width:58px;font-size:9px!important}.gf-controlgroup{gap:5px}
          .gf-hint{font-size:9px;bottom:3px}
        }

        /* Full-screen main menu redesign: game-first, cinematic farm identity */
        .gf-home{position:absolute;inset:0;z-index:25;overflow:auto;background:linear-gradient(90deg,rgba(4,20,12,.91) 0%,rgba(4,20,12,.67) 43%,rgba(4,20,12,.12) 100%),linear-gradient(0deg,rgba(3,15,8,.82),transparent 56%);display:flex;align-items:stretch;padding:clamp(22px,5vw,72px);touch-action:pan-y}
        .gf-home-inner{width:min(540px,100%);display:flex;flex-direction:column;justify-content:center;gap:18px}
        .gf-home-brand{font-size:clamp(11px,1.4vw,15px);font-weight:950;letter-spacing:.24em;color:#f4d45d;text-transform:uppercase}
        .gf-home-title{font-size:clamp(42px,7vw,86px);line-height:.91;font-weight:1000;letter-spacing:-.065em;text-shadow:0 6px 22px #0009;margin:0;color:#fff9e7}
        .gf-home-title span{color:#f0cf4f;display:block}
        .gf-home-sub{max-width:390px;color:#e2e9dc;font-size:clamp(13px,1.6vw,17px);line-height:1.6}
        .gf-home-actions{display:grid;grid-template-columns:1.3fr 1fr;gap:10px;max-width:430px}
        .gf-home-actions button{min-height:52px;border-radius:13px;font-size:14px;letter-spacing:.02em}
        .gf-home-actions .gf-play{grid-column:1/-1;min-height:64px;font-size:19px;background:linear-gradient(180deg,#ffe778,#d8a92c);border:1px solid #fff0a0;box-shadow:0 8px 24px #0005;color:#172b19}
        .gf-home-actions .gf-home-alt{background:rgba(11,43,27,.78);border:1px solid #e8d07199;color:#fff8df}
        .gf-home-foot{font-size:10px;letter-spacing:.14em;color:#d5dfcc;text-transform:uppercase;margin-top:6px}
        .gf-home-card{max-width:430px;padding:14px 16px;background:rgba(9,36,22,.75);border:1px solid #e8d0716b;border-radius:14px;backdrop-filter:blur(10px)}
        .gf-home-card strong{display:block;color:#f4d45d;font-size:11px;letter-spacing:.12em;margin-bottom:6px}.gf-home-card span{font-size:12px;color:#e3e9dc;line-height:1.5}
        .gf-home-close{position:absolute;top:20px;right:20px;background:#092719c9!important;color:#fff!important;border:1px solid #e8d07199!important}
        @media(max-width:650px){.gf-home{padding:28px 22px 35px;background:linear-gradient(90deg,rgba(4,20,12,.89),rgba(4,20,12,.5)),linear-gradient(0deg,rgba(3,15,8,.78),transparent)}.gf-home-inner{justify-content:flex-end;padding-bottom:8vh}.gf-home-title{font-size:clamp(46px,13vw,72px)}.gf-home-actions{max-width:none}.gf-home-actions button{min-height:48px}.gf-home-actions .gf-play{min-height:58px}.gf-home-foot{font-size:9px}}

        /* Portrait phone HUD: keep the tractor and field visible instead of stacking panels over them. */
        @media (orientation:portrait) and (max-width:700px){
          .gf-top{left:8px;right:8px;top:8px;width:auto;padding:8px 10px;border-radius:14px}
          .gf-brand{font-size:8px;letter-spacing:.11em}.gf-title{font-size:16px;margin:2px 0 6px}
          .gf-stats{grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}.gf-stat{padding:5px 4px;border-radius:8px}.gf-label{font-size:8px;letter-spacing:.04em}.gf-value{font-size:12px}.gf-meter{height:3px;margin-top:3px}.gf-status{font-size:9px;margin-top:5px}
          .gf-topcenter{top:118px;left:8px;right:auto;transform:none;gap:4px}.gf-pill{padding:6px 8px;font-size:10px}.gf-speed{font-size:11px}
          .gf-map{top:164px;left:8px;width:66px;height:66px;border-width:2px}
          .gf-mission{left:8px;right:8px;bottom:74px;top:auto;width:auto;max-height:31vh;overflow:auto;padding:9px 10px;border-radius:13px;background:linear-gradient(145deg,rgba(8,38,25,.92),rgba(19,64,36,.84))}
          .gf-mission h3{font-size:10px;margin-bottom:4px}.gf-mission p{font-size:10px;line-height:1.25}.gf-contract-progress{margin-top:5px;font-size:9px}.gf-contract-meter{margin-top:4px;height:4px}.gf-actions{display:flex;flex-wrap:nowrap;overflow-x:auto;gap:5px;margin-top:7px;padding-bottom:2px}.gf-actions button{flex:0 0 auto;padding:7px 9px;font-size:10px;white-space:nowrap}
          .gf-gear{right:8px;top:165px;bottom:auto;gap:4px;padding:4px}.gf-gear button{min-width:34px;padding:8px 6px;font-size:11px}
          .gf-camera{right:8px;top:236px;width:36px;height:36px;font-size:15px!important}
          .gf-controls{left:8px;right:8px;bottom:8px;justify-content:space-between;gap:5px}.gf-control{width:42px;height:44px;border-radius:13px!important;font-size:17px!important}.gf-control.wide{width:52px;font-size:9px!important}.gf-controlgroup{gap:5px}.gf-hint{display:none}
        }
        @media (orientation:portrait) and (max-width:390px){.gf-brand{font-size:7px}.gf-title{font-size:14px}.gf-value{font-size:11px}.gf-mission{bottom:70px;max-height:29vh}.gf-actions button{font-size:9px;padding:7px}.gf-control{width:38px;height:42px}.gf-control.wide{width:46px}}
        @media(max-width:560px){.gf-refuel-prompt{bottom:142px;font-size:11px;padding:11px 12px}.gf-refuel-prompt span{margin-left:4px}}
        /* Precision mobile driving HUD */
        .gf-root{--safe-top:env(safe-area-inset-top,0px);--safe-right:env(safe-area-inset-right,0px);--safe-bottom:env(safe-area-inset-bottom,0px);--safe-left:env(safe-area-inset-left,0px)}
        .gf-top{display:none}
        .gf-topcenter{top:calc(10px + var(--safe-top));left:auto;right:calc(64px + var(--safe-right));transform:none;z-index:12;gap:7px}
        .gf-cashbar{display:flex;align-items:center;gap:10px;padding:8px 10px 8px 15px;min-height:42px;border-radius:16px;background:linear-gradient(120deg,rgba(8,32,21,.91),rgba(20,57,35,.84));border:1px solid #e9c94f9c;box-shadow:0 5px 18px #0005;backdrop-filter:blur(12px);font-weight:950;font-variant-numeric:tabular-nums}
        .gf-cashbar .coin{font-size:20px;filter:drop-shadow(0 1px 3px #0008)}.gf-cashbar .cash-value{font-size:clamp(13px,2.1vw,18px);color:#ffe17a;white-space:nowrap}
        .gf-pause-top{width:43px;height:43px;padding:0!important;border-radius:12px!important;background:#15251feF!important;color:#fff!important;border:1px solid #e8ce71!important;font-size:21px!important;display:grid;place-items:center;box-shadow:0 4px 12px #0005}
        .gf-topcenter .gf-pill{display:none}
        .gf-map{left:calc(14px + var(--safe-left));top:calc(68px + var(--safe-top));width:clamp(84px,12vw,126px);height:clamp(84px,12vw,126px);border:3px solid #17271d;border-radius:50%;background:rgba(17,38,26,.75);box-shadow:0 5px 20px #0007,inset 0 0 0 2px #e4d8a1;z-index:8;backdrop-filter:blur(5px)}
        .gf-compass{position:absolute;top:3px;left:50%;transform:translateX(-50%);z-index:2;font-size:10px;font-weight:1000;color:#fff4b8;text-shadow:0 1px 3px #000;pointer-events:none}
        .gf-mission{top:calc(12px + var(--safe-top));right:calc(118px + var(--safe-right));width:clamp(175px,22vw,235px);padding:10px;z-index:7}
        .gf-driving-tools{position:absolute;right:calc(12px + var(--safe-right));bottom:calc(178px + var(--safe-bottom));z-index:14;display:flex;flex-direction:column;gap:9px;align-items:center;pointer-events:auto}
        .gf-round-action{width:48px;height:48px;padding:0!important;border-radius:50%!important;display:grid;place-items:center;font-size:20px!important;color:#fff!important;background:linear-gradient(145deg,#1a3b29ed,#0b2017ed)!important;border:1px solid #e8cc66!important;box-shadow:0 4px 14px #0006,inset 0 1px #ffffff30}
        .gf-round-action.active{color:#f8d95d!important;box-shadow:0 0 14px #c9a72b7d}
        .gf-gear{right:calc(12px + var(--safe-right));bottom:calc(70px + var(--safe-bottom));z-index:14;padding:6px;gap:5px;border-radius:16px}
        .gf-gear button{min-width:43px;min-height:39px;padding:8px;font-size:13px;border-radius:10px!important;background:#ffffff13;color:#fff;border-color:#ffffff30}
        .gf-gear button.active{background:linear-gradient(180deg,#dfff87,#74c64c)!important;color:#17331e!important;box-shadow:0 0 13px #7df34b6e}
        .gf-controls{left:calc(12px + var(--safe-left));right:calc(12px + var(--safe-right));bottom:calc(12px + var(--safe-bottom));z-index:13;align-items:flex-end;pointer-events:none}
        .gf-controlgroup{pointer-events:auto}.gf-control{touch-action:none!important;user-select:none;-webkit-user-select:none}
        .gf-steering-wheel{position:relative;width:clamp(112px,18vw,164px);height:clamp(112px,18vw,164px);border-radius:50%;padding:0!important;touch-action:none!important;background:radial-gradient(circle at 50% 50%,#34443b 0 16%,#111b17 17% 21%,transparent 22%),radial-gradient(circle,#28372f 0 55%,#0b120f 57% 64%,#59635b 65% 68%,#101713 70%)!important;border:5px solid #111a15!important;box-shadow:0 7px 18px #0008,inset 0 0 0 2px #899087;display:block;overflow:hidden}
        .gf-wheel-spoke{position:absolute;left:calc(50% - 5px);top:17%;width:10px;height:35%;border-radius:6px;background:linear-gradient(90deg,#151d18,#788278,#202a23);transform-origin:50% 100%;box-shadow:0 0 2px #000}.gf-wheel-spoke.left{transform:rotate(-120deg)}.gf-wheel-spoke.right{transform:rotate(120deg)}
        .gf-wheel-hub{position:absolute;left:50%;top:50%;width:26%;height:26%;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle at 35% 30%,#a7b19e,#28352c 55%,#101713);border:2px solid #080f0b;box-shadow:0 2px 5px #0009}
        .gf-throttle-panel{display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:auto;margin-right:2px}
        .gf-throttle-label{font-size:9px;font-weight:1000;letter-spacing:.12em;color:#fff4bc;text-shadow:0 2px 4px #000}
        .gf-throttle-track{position:relative;width:48px;height:clamp(140px,24vh,220px);border-radius:22px;border:2px solid #b8c5b2;background:linear-gradient(90deg,#101a14,#34473a 48%,#0d1711);box-shadow:0 5px 16px #0008,inset 0 0 0 2px #0008;touch-action:none;overflow:hidden}
        .gf-throttle-fill{position:absolute;left:7px;right:7px;bottom:7px;height:calc((100% - 14px) * var(--fill));border-radius:14px;background:linear-gradient(0deg,#4cae42,#e4d44b);box-shadow:0 0 12px #9fea50a0;pointer-events:none}
        .gf-throttle-thumb{position:absolute;left:2px;right:2px;bottom:calc(4px + (100% - 18px) * var(--fill));height:21px;border-radius:10px;background:linear-gradient(180deg,#f8e6a0,#bd9635);border:1px solid #fff0ae;box-shadow:0 2px 7px #0009;pointer-events:none;transform:translateY(50%)}
        .gf-pedals{display:flex;gap:7px;pointer-events:auto;margin:0 auto 0 12px;align-self:flex-end}
        .gf-pedal{min-width:clamp(62px,9vw,92px);height:48px;padding:5px 9px!important;border-radius:10px!important;background:linear-gradient(145deg,#172b20e8,#0d1c15e8)!important;color:#fff!important;border:1px solid #d9ca7b99!important;font-size:10px!important;letter-spacing:.05em;box-shadow:0 4px 12px #0005}
        .gf-pedal.active{background:linear-gradient(145deg,#e6c64f,#b48c25)!important;color:#18251a!important;box-shadow:0 0 12px #f4d34b80}
        .gf-hint{bottom:calc(4px + var(--safe-bottom));z-index:15}
        .gf-root button:focus-visible{outline:2px solid #ffe77b;outline-offset:2px}
        @media(max-width:700px){.gf-topcenter{right:calc(8px + var(--safe-right));top:calc(8px + var(--safe-top));}.gf-cashbar{gap:6px;padding:6px 7px 6px 9px;min-height:37px}.gf-cashbar .coin{font-size:16px}.gf-pause-top{width:38px;height:38px}.gf-mission{top:auto;bottom:calc(174px + var(--safe-bottom));right:calc(8px + var(--safe-right));width:150px;padding:8px;max-height:24vh;overflow:auto}.gf-mission .gf-actions{gap:4px}.gf-mission .gf-actions button{padding:6px;font-size:9px}.gf-map{left:calc(8px + var(--safe-left));top:calc(56px + var(--safe-top));width:80px;height:80px}.gf-driving-tools{right:calc(8px + var(--safe-right));bottom:calc(230px + var(--safe-bottom));gap:6px}.gf-round-action{width:40px;height:40px;font-size:17px!important}.gf-gear{right:calc(8px + var(--safe-right));bottom:calc(74px + var(--safe-bottom));}.gf-gear button{min-width:36px;min-height:34px;padding:5px}.gf-controls{left:calc(8px + var(--safe-left));right:calc(8px + var(--safe-right));bottom:calc(8px + var(--safe-bottom));gap:5px}.gf-steering-wheel{width:clamp(94px,27vw,130px);height:clamp(94px,27vw,130px)}.gf-throttle-track{width:38px;height:clamp(118px,19vh,165px)}.gf-pedals{gap:4px;margin-left:5px}.gf-pedal{min-width:48px;height:40px;padding:4px!important;font-size:8px!important}.gf-controls>.gf-controlgroup:last-child{display:none}.gf-hint{display:none}}
        @media(orientation:portrait) and (max-width:700px){.gf-mission{bottom:calc(165px + var(--safe-bottom));left:auto;right:calc(8px + var(--safe-right));width:145px}.gf-map{top:calc(56px + var(--safe-top))}.gf-driving-tools{bottom:calc(223px + var(--safe-bottom))}.gf-throttle-track{height:clamp(112px,16vh,145px)}.gf-pedals{flex-direction:column;margin-left:0}.gf-pedal{min-width:47px;width:54px;height:34px;font-size:8px!important}.gf-steering-wheel{width:100px;height:100px}}
        @media(max-height:520px) and (orientation:landscape){.gf-steering-wheel{width:94px;height:94px}.gf-throttle-track{height:115px}.gf-driving-tools{bottom:calc(145px + var(--safe-bottom))}.gf-mission{width:155px;max-height:35vh;overflow:auto}}
      `}</style>
      <div className="gf-world" ref={mountRef} />
      {showHome && <div className="gf-home">
        <button className="gf-home-close" onClick={() => setShowHome(false)}>SKIP MENU ✕</button>
        <div className="gf-home-inner">
          <div className="gf-home-brand">Golden Field Studios · Farming Simulator</div>
          <h1 className="gf-home-title">GOLDEN <span>FIELD 3D</span></h1>
          <div className="gf-home-sub">Build your farm. Work the land. Grow from a small tractor operation into a thriving countryside business.</div>
          <div className="gf-home-actions">
            <button className="gf-play" onClick={() => {setShowHome(false);setPaused(false);notify("Welcome back to the farm");}}>▶  START FARMING</button>
            <button className="gf-home-alt" onClick={() => {setShowHome(false);setShowGarage(true);}}>🚜  VEHICLE GARAGE</button>
            <button className="gf-home-alt" onClick={() => {setShowHome(false);setShowShop(true);}}>▣  FARM SHOP</button>
            <button className="gf-home-alt" onClick={() => {setHomeTab(homeTab === "contracts" ? "home" : "contracts");}}>▤  CONTRACTS</button>
            <button className="gf-home-alt" onClick={() => {saveGame();notify("Farm progress saved");}}>▣  SAVE GAME</button>
          </div>
          {homeTab === "contracts" && <div className="gf-home-card"><strong>AVAILABLE CONTRACTS</strong><span>01 · Plow Field A — $650 reward<br/>02 · Seed Field A — $480 reward<br/>03 · Harvest Field B — $720 reward</span></div>}
          <div className="gf-home-foot">Open world · Field work · Vehicles · Farm economy</div>
        </div>
      </div>}
      <div className="gf-top gf-panel">
        <div className="gf-brand">GOLDEN FIELD 3D  •  FARM · DRIVE · MANAGE</div>
        <div className="gf-title">Golden Field 3D</div>
        <div className="gf-stats">
          <div className="gf-stat"><div className="gf-label">Cash</div><div className="gf-value">${hud.cash.toLocaleString()}</div></div>
          <div className="gf-stat"><div className="gf-label">{hud.fuel < 15 ? "⚠ Fuel" : "Fuel"}</div><div className="gf-value" style={{color: hud.fuel < 15 ? "#ff9c77" : "inherit"}}>{Math.round(hud.fuel)}%</div><div className="gf-meter"><span style={{ width: `${hud.fuel}%` }} /></div></div>
          <div className="gf-stat"><div className="gf-label">Contract</div><div className="gf-value">{Math.floor(hud.progress)}%</div><div className="gf-meter"><span style={{ width: `${hud.progress}%` }} /></div></div>
          <div className="gf-stat"><div className="gf-label">Crops</div><div className="gf-value">{hud.cropUnits}</div></div>
        </div>
        <div className="gf-status">{hud.status}</div>
      </div>
      {hud.nearPump && !showHome && <button className="gf-refuel-prompt" onClick={refuelAtPump} disabled={hud.fuel >= 99.5 || hud.cash < 80}>
        ⛽ {hud.fuel >= 99.5 ? "TANK FULL" : hud.cash < 80 ? "NEED $80 TO REFUEL" : "REFUEL TRACTOR · $80"} <span>{hud.fuel >= 99.5 ? " " : "E / TAP"}</span>
      </button>}
      <div className="gf-topcenter"><div className="gf-cashbar"><span className="coin" aria-hidden="true">🪙</span><span className="cash-value">$ {hud.cash.toLocaleString()}</span></div><button className="gf-pause-top" aria-label={paused ? "Resume game" : "Pause game"} onClick={togglePause}>{paused ? "▶" : "Ⅱ"}</button><div className="gf-pill">☀ {hud.time}</div><div className="gf-pill gf-speed">{hud.speed} km/h · {hud.gear} · {hud.rpm || 0} rpm</div></div>
      <div className="gf-map gf-panel"><span className="gf-compass">N</span><canvas className="gf-mapcanvas" width="180" height="180" /></div>
      <div className="gf-mission gf-panel">
        <h3>{hud.contractsComplete ? "FARM PROGRESSION COMPLETE" : `CONTRACT ${String(hud.contractIndex).padStart(2, "0")} · ${hud.contractTitle}`}</h3>
        <p>{hud.contractDescription}</p>
        <div className="gf-contract-progress">
          <div><span>{hud.contractsComplete ? "All missions finished" : `${hud.contractCount} / ${hud.contractTarget} completed`}</span><span>{hud.contractReward ? `+$${hud.contractReward}` : "Free play"}</span></div>
          <div className="gf-contract-meter"><span style={{ width: `${hud.contractsComplete ? 100 : hud.contractTarget ? Math.min(100, hud.contractCount / hud.contractTarget * 100) : 0}%` }} /></div>
        </div>
        <div className="gf-actions">
          <button onClick={toggleTool}>{hud.tool === "PLOW" ? "⛏ PLOW" : hud.tool === "SEEDER" ? "🌱 SEEDER" : "🌾 HARVESTER"}</button>
          <button className="gf-secondary" onClick={sellHarvest}>Sell crop</button>
          <button className="gf-secondary" onClick={() => setShowGarage(true)}>🚜 Garage</button>
          <button className="gf-secondary" onClick={() => setShowShop(true)}>🛒 Farm shop</button>
          <button className="gf-secondary" onClick={() => saveGame()}>Save</button>
          <button className="gf-secondary" onClick={newGame}>New game</button>
          <button className="gf-secondary" onClick={togglePause}>{paused ? "Resume" : "Ⅱ Pause"}</button>
        </div>
      </div>
      <button className="gf-camera" onClick={cycleCamera} aria-label="Change camera">📷</button>
      <div className="gf-driving-tools">
        <button className={`gf-round-action ${hud.engineOn ? "active" : ""}`} aria-label="Toggle engine" title="Engine on/off" onClick={() => toggleEngineRef.current?.()}>⚡</button>
        <button className={`gf-round-action ${hud.hitched ? "active" : ""}`} aria-label="Raise or lower implement / hitch" title="Hitch implement" onClick={() => toggleHitchRef.current?.()}>⚒</button>
      </div>
      <div className="gf-gear gf-panel" aria-label="Gear selector">
        {["D", "N", "R"].map(gear => <button key={gear} className={hud.gear[0] === gear ? "active" : ""} onClick={() => setGear(gear)}>{gear}</button>)}
        <button aria-label="Shift up" onClick={() => { haptic(); shiftGearRef.current?.(1); }}>▲</button>
        <button aria-label="Shift down" onClick={() => { haptic(); shiftGearRef.current?.(-1); }}>▼</button>
      </div>
      <div className="gf-controls">
        <div className="gf-controlgroup">
          <button className="gf-steering-wheel" aria-label="Touch and drag to steer" onPointerDown={steeringPointerDown} onPointerMove={steeringPointerMove} onPointerUp={steeringPointerEnd} onPointerCancel={steeringPointerEnd} onLostPointerCapture={steeringPointerEnd}>
            <span style={{ position: "absolute", inset: 0, pointerEvents: "none", transform: `rotate(${steeringWheelAngle}deg)`, transition: steeringDragRef.current ? "none" : "transform .18s ease-out" }}><span className="gf-wheel-spoke" /><span className="gf-wheel-spoke left" /><span className="gf-wheel-spoke right" /><span className="gf-wheel-hub" /></span>
          </button>
        </div>
        <div className="gf-pedals">
          <button className="gf-pedal" {...holdControl("clutch", true)}>CLUTCH</button>
          <button className="gf-pedal" {...holdControl("brake", true)}>BRAKE</button>
          <button className="gf-pedal" onPointerDown={(e) => { e.preventDefault(); haptic(); setGear(gameRef.current?.gear === "R" ? "D" : "R"); }} aria-label="Toggle reverse and drive">{hud.gear === "R" ? "↻ DRIVE" : "↶ REV"}</button>
        </div>
        <div className="gf-throttle-panel">
          <div className="gf-throttle-label">THROTTLE</div>
          <div className="gf-throttle-track" ref={throttleTrackRef} role="slider" aria-label="Throttle and brake" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(throttleVisual*100)} style={{ "--fill": throttleVisual }} onPointerDown={throttlePointerDown} onPointerMove={throttlePointerMove} onPointerUp={throttlePointerEnd} onPointerCancel={throttlePointerEnd} onLostPointerCapture={throttlePointerEnd}>
            <div className="gf-throttle-fill" /><div className="gf-throttle-thumb" />
          </div>
        </div>
      </div>
      <div className="gf-hint">WASD drive · Shift = clutch (Shift+W up, Ctrl down) · E engine · H hitch · P tool · C to change camera · Touch controls supported</div>
      {showGarage && (
        <div className="gf-modal-backdrop" role="dialog" aria-modal="true" aria-label="Vehicle garage">
          <section className="gf-modal gf-panel">
            <button className="gf-modal-close" onClick={() => setShowGarage(false)} aria-label="Close garage">✕</button>
            <div className="gf-modal-kicker">VEHICLE WORKSHOP</div><h2>Farm Garage</h2>
            <p>Golden Field Utility Tractor</p><div className="gf-modal-vehicle">🚜</div>
            <div className="gf-modal-row"><span>Fuel tank</span><strong>{Math.round(hud.fuel)}%</strong></div>
            <div className="gf-modal-row"><span>Condition</span><strong>Ready for work</strong></div>
            <button className="gf-modal-primary" onClick={() => { setHud(v => ({...v, fuel: 100, cash: Math.max(0, v.cash - 120), status: "Garage service complete · Fuel tank filled"})); setShowGarage(false); notify("Service complete · $120 charged"); }}>Service &amp; refuel · $120</button>
          </section>
        </div>
      )}
      {showShop && (
        <div className="gf-modal-backdrop" role="dialog" aria-modal="true" aria-label="Farm shop">
          <section className="gf-modal gf-panel">
            <button className="gf-modal-close" onClick={() => setShowShop(false)} aria-label="Close farm shop">✕</button>
            <div className="gf-modal-kicker">SUPPLIES &amp; PRODUCE</div><h2>Farm Shop</h2>
            <p>Buy supplies for the next field contract.</p>
            <div className="gf-shop-item"><div><strong>Diesel refill</strong><small>Restore tractor fuel to 100%</small></div><button disabled={hud.cash < 80} onClick={() => { setHud(v => ({...v, fuel: 100, cash: v.cash - 80, status: "Diesel purchased · Ready to drive"})); setShowShop(false); notify("Fuel tank filled · $80"); }}> $80 </button></div>
            <div className="gf-shop-item"><div><strong>Seed pallet</strong><small>Prepare for seeding work</small></div><button disabled={hud.cash < 150} onClick={() => { setHud(v => ({...v, cash: v.cash - 150, status: "Seed pallet purchased · Seeding ready"})); setShowShop(false); notify("Seed pallet purchased · $150"); }}> $150 </button></div>
            <div className="gf-shop-balance">Available balance <strong>${hud.cash.toLocaleString()}</strong></div>
          </section>
        </div>
      )}
      {paused && (
        <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.45)",display:"grid",placeItems:"center",pointerEvents:"none",zIndex:10}}>
          <div style={{fontSize:32,fontWeight:900,letterSpacing:"0.1em"}}>PAUSED</div>
        </div>
      )}
      {toast && <div className="gf-toast">{toast}</div>}
    </div>
  );
}
