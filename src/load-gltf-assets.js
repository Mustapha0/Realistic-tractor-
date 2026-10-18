import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/**
 * Loads the supplied GLB assets. Returns the loaded glTF objects and scene roots.
 * Adjust scale/rotation/position for the coordinate conventions of your existing scene.
 */
const BASE = import.meta.env.BASE_URL;
export async function loadGoldenFieldAssets({ scene, tractorPosition = new THREE.Vector3(0, 0, 0) } = {}) {
  if (!scene) throw new Error('loadGoldenFieldAssets requires a THREE.Scene');
  const loader = new GLTFLoader();
  const load = (url) => new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
  const [tractorGltf, cockpitGltf, fieldGltf, farmsteadGltf] = await Promise.all([
    load(BASE + 'models/john_deere_6R110_reference_rebuild.glb'),
    load(BASE + 'models/tractor_cockpit_transparent_glass.glb'),
    load(BASE + 'models/plowed_farm_field_replica.glb'),
    load(BASE + 'models/vintage_farmstead_asset_pack.glb')
  ]);
  const tractorRoot = tractorGltf.scene;
  tractorRoot.name = 'GoldenField_Tractor_GLB';
  tractorRoot.position.copy(tractorPosition);
  const cockpitRoot = cockpitGltf.scene;
  cockpitRoot.name = 'GoldenField_CockpitAsset';
  // Keep cockpit asset available as a separate imported root until its hierarchy is inspected.
  // If this file is a separate interior model, position/parent it to the tractor cabin in your scene.
  const fieldRoot = fieldGltf.scene;
  fieldRoot.name = 'GoldenField_PlowedField';
  const farmsteadRoot = farmsteadGltf.scene;
  farmsteadRoot.name = 'GoldenField_Farmstead';
  scene.add(tractorRoot, fieldRoot, farmsteadRoot);
  return { tractorGltf, tractorRoot, cockpitGltf, cockpitRoot, fieldGltf, fieldRoot, farmsteadGltf, farmsteadRoot };
}
