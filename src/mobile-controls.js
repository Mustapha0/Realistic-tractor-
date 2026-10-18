const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const GEAR_ORDER=['D','N','R'];
export class MobileControls{
  constructor({root=document,onGearChange=()=>{},onClutchChange=()=>{},onReverseToggle=()=>{},onPlowToggle=()=>{},onSteeringVisual=()=>{}}={}){
    this.root=root;this.onGearChange=onGearChange;this.onClutchChange=onClutchChange;this.onReverseToggle=onReverseToggle;this.onPlowToggle=onPlowToggle;this.onSteeringVisual=onSteeringVisual;
    this.input={steer:0,throttle:0,brake:0,gear:'D',clutch:false,reverseEnabled:false,plowEnabled:false};
    this.maxWheelAngle=Math.PI*.72;this.deadZonePx=5;this.drag=null;this.wheel=this.q('#steering-wheel');this.throttle=this.q('#throttle-pedal');this.brake=this.q('#brake-pedal');this.gearButton=this.q('#gear-selector');this.bind();
  }
  q(sel){return this.root.querySelector(sel)}
  bind(){
    if(this.wheel){this.wheel.addEventListener('pointerdown',e=>this.startSteering(e));this.wheel.addEventListener('pointermove',e=>this.moveSteering(e));this.wheel.addEventListener('pointerup',e=>this.endSteering(e));this.wheel.addEventListener('pointercancel',e=>this.endSteering(e));this.wheel.addEventListener('lostpointercapture',e=>this.endSteering(e,false));}
    this.bindHold(this.throttle,()=>this.input.throttle=1,()=>this.input.throttle=0);
    this.bindHold(this.brake,()=>this.input.brake=1,()=>this.input.brake=0);
    this.q('#gear-up')?.addEventListener('click',()=>this.stepGear(1));this.q('#gear-down')?.addEventListener('click',()=>this.stepGear(-1));this.gearButton?.addEventListener('click',()=>this.stepGear(1));
    this.q('#clutch-button')?.addEventListener('click',e=>{this.input.clutch=!this.input.clutch;e.currentTarget.classList.toggle('is-active',this.input.clutch);this.onClutchChange(this.input.clutch)});
    this.q('#reverse-button')?.addEventListener('click',e=>{this.input.reverseEnabled=!this.input.reverseEnabled;e.currentTarget.classList.toggle('is-active',this.input.reverseEnabled);this.onReverseToggle(this.input.reverseEnabled);if(this.input.reverseEnabled)this.setGear('R')});
    this.q('#plow-button')?.addEventListener('click',e=>{this.input.plowEnabled=!this.input.plowEnabled;e.currentTarget.classList.toggle('is-active',this.input.plowEnabled);this.onPlowToggle(this.input.plowEnabled)});
    this.root.querySelectorAll('.mobile-controls button,.steering-wheel').forEach(el=>el.addEventListener('contextmenu',e=>e.preventDefault()));
    window.addEventListener('blur',()=>this.releaseAll());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.releaseAll()});
  }
  bindHold(el,onDown,onUp){if(!el)return;el.addEventListener('pointerdown',e=>{e.preventDefault();try{el.setPointerCapture(e.pointerId)}catch{}onDown();el.classList.add('is-pressed')});const release=()=>{onUp();el.classList.remove('is-pressed')};el.addEventListener('pointerup',release);el.addEventListener('pointercancel',release);el.addEventListener('lostpointercapture',release);el.addEventListener('pointerleave',e=>{if(e.buttons===0)release()})}
  startSteering(e){e.preventDefault();const rect=this.wheel.getBoundingClientRect();this.drag={pointerId:e.pointerId,cx:rect.left+rect.width/2,cy:rect.top+rect.height/2,startAngle:Math.atan2(e.clientY-(rect.top+rect.height/2),e.clientX-(rect.left+rect.width/2)),lastX:e.clientX,lastY:e.clientY,angle:0};try{this.wheel.setPointerCapture(e.pointerId)}catch{}}
  moveSteering(e){if(!this.drag||e.pointerId!==this.drag.pointerId)return;e.preventDefault();if(Math.hypot(e.clientX-this.drag.lastX,e.clientY-this.drag.lastY)<this.deadZonePx)return;this.drag.lastX=e.clientX;this.drag.lastY=e.clientY;const rect=this.wheel.getBoundingClientRect();const a=Math.atan2(e.clientY-(rect.top+rect.height/2),e.clientX-(rect.left+rect.width/2));let d=a-this.drag.startAngle;while(d>Math.PI)d-=2*Math.PI;while(d< -Math.PI)d+=2*Math.PI;this.drag.angle=clamp(d,-this.maxWheelAngle,this.maxWheelAngle);this.input.steer=this.drag.angle/this.maxWheelAngle;this.wheel.style.transform=`rotate(${this.drag.angle}rad)`;this.onSteeringVisual(this.drag.angle);this.wheel.setAttribute('aria-valuenow',this.input.steer.toFixed(2))}
  endSteering(e,releaseCapture=true){if(!this.drag||(e?.pointerId!==undefined&&e.pointerId!==this.drag.pointerId))return;const id=this.drag.pointerId;this.drag=null;if(releaseCapture){try{if(this.wheel.hasPointerCapture(id))this.wheel.releasePointerCapture(id)}catch{}}this.centerSteering()}
  centerSteering(){this.input.steer=0;if(this.wheel){this.wheel.style.transition='transform 180ms ease-out';this.wheel.style.transform='rotate(0rad)';this.wheel.setAttribute('aria-valuenow','0');setTimeout(()=>{if(this.wheel)this.wheel.style.transition=''},200)}this.onSteeringVisual(0)}
  setGear(gear){if(!GEAR_ORDER.includes(gear))return;this.input.gear=gear;if(this.gearButton)this.gearButton.textContent=gear;this.onGearChange(gear);if(gear!=='R'&&this.input.reverseEnabled){this.input.reverseEnabled=false;this.q('#reverse-button')?.classList.remove('is-active');this.onReverseToggle(false)}}
  stepGear(dir){this.setGear(GEAR_ORDER[(GEAR_ORDER.indexOf(this.input.gear)+dir+GEAR_ORDER.length)%GEAR_ORDER.length])}
  releaseAll(){this.input.throttle=0;this.input.brake=0;this.throttle?.classList.remove('is-pressed');this.brake?.classList.remove('is-pressed');this.centerSteering()}
}
