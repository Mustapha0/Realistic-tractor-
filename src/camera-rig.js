import * as THREE from 'three';

/**
 * Camera rig for a tractor whose root is a THREE.Object3D.
 * `cabinAnchor` must be parented under the actual tractor GLB at driver's eye position.
 */
export class CameraRig {
  constructor({camera,tractorRoot,cabinAnchor,thirdPersonOffset=new THREE.Vector3(0,4.5,-8),firstPersonOffset=new THREE.Vector3(0,0,0),lookAhead=5,smoothness=5,storageKey=null,onModeChange=()=>{}}={}){
    if(!camera||!tractorRoot)throw new Error('CameraRig requires camera and tractorRoot');
    this.camera=camera;this.tractorRoot=tractorRoot;this.cabinAnchor=cabinAnchor||tractorRoot;this.thirdPersonOffset=thirdPersonOffset.clone();this.firstPersonOffset=firstPersonOffset.clone();this.lookAhead=lookAhead;this.smoothness=smoothness;this.storageKey=storageKey;this.onModeChange=onModeChange;this.mode='thirdPerson';this.targetPosition=new THREE.Vector3();this.lookTarget=new THREE.Vector3();this.temp=new THREE.Vector3();
    if(storageKey&&localStorage.getItem(storageKey)==='firstPerson')this.mode='firstPerson';
    this.cameraModeChanged();
  }
  toggle(){this.mode=this.mode==='thirdPerson'?'firstPerson':'thirdPerson';this.cameraModeChanged();return this.mode}
  setMode(mode){if(mode!=='firstPerson'&&mode!=='thirdPerson')throw new Error('Unknown camera mode');this.mode=mode;this.cameraModeChanged()}
  cameraModeChanged(){if(this.storageKey)localStorage.setItem(this.storageKey,this.mode);this.onModeChange(this.mode)}
  update(dt=1/60){
    if(this.mode==='firstPerson'){
      this.cabinAnchor.getWorldPosition(this.targetPosition);
      // Use the vehicle's world orientation, but explicitly aim through its forward
      // windshield. Some imported GLBs have a different local up/forward axis.
      const q = this.tractorRoot.getWorldQuaternion(new THREE.Quaternion());
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      const desired = this.targetPosition.clone().add(this.firstPersonOffset.clone().applyQuaternion(q));
      this.camera.position.lerp(desired, 1 - Math.exp(-this.smoothness * dt));
      this.lookTarget.copy(this.camera.position).add(forward.multiplyScalar(this.lookAhead));
      this.lookTarget.y = this.camera.position.y + (this.lookTarget.y - this.camera.position.y) * 0.35;
      this.camera.lookAt(this.lookTarget);
      return;
    }
    const worldQuat=this.tractorRoot.getWorldQuaternion(new THREE.Quaternion());
    this.targetPosition.copy(this.thirdPersonOffset).applyQuaternion(worldQuat).add(this.tractorRoot.getWorldPosition(new THREE.Vector3()));
    this.camera.position.lerp(this.targetPosition,1-Math.exp(-this.smoothness*dt));
    this.lookTarget.copy(this.tractorRoot.position);this.lookTarget.y+=1.2;this.camera.lookAt(this.lookTarget);
  }
}
