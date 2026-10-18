export class MissionSystem {
  constructor({onReward=()=>{},onRefuel=()=>{},getState=()=>({})}={}) {
    this.onReward=onReward; this.onRefuel=onRefuel; this.getState=getState; this.tab='available';
    this.jobs=[
      {id:'plow',title:'First Furrows',desc:'Lower the plow and work the marked field.',objective:'Plow 25 seconds of valid field work',reward:850,status:'available',progress:0,target:25},
      {id:'fuel',title:'Fuel Up',desc:'Drive to the farmstead fuel area and refuel.',objective:'Reach the pump area and tap REFUEL',reward:350,status:'available',progress:0,target:1},
      {id:'delivery',title:'Farm Delivery',desc:'Drive to the farmstead delivery marker.',objective:'Reach the delivery area at low speed',reward:1200,status:'available',progress:0,target:1},
      {id:'reverse',title:'Reverse Like a Pro',desc:'Practice careful reversing in an open area.',objective:'Reverse for 8 seconds while moving slowly',reward:500,status:'available',progress:0,target:8},
      {id:'roadtrip',title:'Explore the Farm',desc:'Take your tractor on a drive around the property.',objective:'Travel 250 metres with the plow raised',reward:700,status:'available',progress:0,target:250},
      {id:'fieldhand',title:'Field Hand',desc:'Work more of the field after your first furrows.',objective:'Plow for 60 seconds on the field',reward:1500,status:'available',progress:0,target:60},
      {id:'careful',title:'Careful Driver',desc:'Bring the tractor to a controlled stop.',objective:'Brake to a stop from a moving speed',reward:400,status:'available',progress:0,target:1},
      {id:'fuelconserve',title:'Save the Diesel',desc:'Drive without using the plow and keep fuel above 50%.',objective:'Drive for 45 seconds with plow raised and fuel above 50%',reward:650,status:'available',progress:0,target:45}
    ];
    try { const saved = JSON.parse(localStorage.getItem('golden-field-missions') || '{}'); this.jobs.forEach(j => { if (saved[j.id]) { j.status = saved[j.id].status || j.status; j.progress = Number(saved[j.id].progress) || 0; } }); } catch {}
    this.panel=document.querySelector('#mission-panel'); this.cards=document.querySelector('#mission-cards'); this.msg=document.querySelector('#mission-message');
    document.querySelector('#mission-open')?.addEventListener('click',()=>{this.panel.hidden=false;this.render()});
    document.querySelector('#mission-close')?.addEventListener('click',()=>this.panel.hidden=true);
    this.panel?.addEventListener('click',e=>{if(e.target===this.panel)this.panel.hidden=true});
    this.panel?.querySelectorAll('[data-mission-tab]').forEach(b=>b.addEventListener('click',()=>{this.tab=b.dataset.missionTab;this.panel.querySelectorAll('[data-mission-tab]').forEach(x=>x.classList.toggle('active',x===b));this.render()}));
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.panel)this.panel.hidden=true});
    this.render();
  }
  save(){ try { const data = {}; this.jobs.forEach(j => { data[j.id] = { status: j.status, progress: j.progress }; }); localStorage.setItem('golden-field-missions', JSON.stringify(data)); } catch {} }
  accept(job){job.status='active';this.tab='active';this.panel?.querySelectorAll('[data-mission-tab]').forEach(x=>{x.classList.toggle('active',x.dataset.missionTab==='active')});this.msg.textContent=`Accepted: ${job.title}. Complete it by playing.`;this.save();this.render()}
  complete(job){if(job.status!=='active')return;job.status='completed';this.onReward(job.reward);this.msg.textContent=`Completed ${job.title}! You earned $${job.reward.toLocaleString()}.`;this.save();this.render()}
  update(dt,state){
    for(const j of this.jobs){
      if(j.status!=='active')continue;
      if(j.id==='plow' && state.inField && state.plowEnabled && state.speedKmh>=2 && state.speedKmh<=28 && state.gear==='D'){
        j.progress+=dt; if(j.progress>=j.target)this.complete(j);
      }
      if(j.id==='delivery' && state.nearFarm && state.speedKmh<8)this.complete(j);
      if(j.id==='reverse' && state.gear==='R' && state.speedKmh>=1 && state.speedKmh<12) { j.progress+=dt; if(j.progress>=j.target)this.complete(j); }
      if(j.id==='roadtrip' && !state.plowEnabled && state.speedKmh>3) { j.progress+=state.distanceDelta||0; if(j.progress>=j.target)this.complete(j); }
      if(j.id==='fieldhand' && state.inField && state.plowEnabled && state.speedKmh>=2 && state.speedKmh<=28 && state.gear==='D') { j.progress+=dt; if(j.progress>=j.target)this.complete(j); }
      if(j.id==='careful'){ if(state.brakePressed && state.speedKmh>3) j.armed=true; else if(!state.brakePressed) j.armed=false; if(j.armed && state.speedKmh<0.5) this.complete(j); }
      if(j.id==='fuelconserve' && !state.plowEnabled && state.speedKmh>2 && state.fuelPercent>50) { j.progress+=dt; if(j.progress>=j.target)this.complete(j); }
    }
    this.state=state;
    if(!this.panel?.hidden)this.renderProgress();
  }
  renderProgress(){
    this.jobs.filter(j=>j.status==='active').forEach(j=>{
      const el=this.cards?.querySelector(`[data-progress="${j.id}"]`);
      if(el)el.textContent=['plow','fieldhand','reverse','fuelconserve'].includes(j.id)?`Progress: ${Math.min(j.progress/j.target*100,100).toFixed(0)}%`:j.id==='roadtrip'?`Distance: ${Math.min(j.progress,j.target).toFixed(0)} / ${j.target} m`:j.id==='fuel'?(this.state?.nearFuel?'At pump: tap REFUEL to complete':'Drive to the orange marker at the fuel pump'):j.id==='careful'?'Brake hard from above 3 km/h until you stop':'Drive to the blue marker at the barn';
    });
  }
  render(){
    if(!this.cards)return; this.cards.innerHTML='';
    const list=this.jobs.filter(j=>j.status===this.tab);
    if(!list.length){this.cards.innerHTML=`<div class="mission-card"><p>No ${this.tab} missions yet.</p></div>`;return}
    for(const j of list){
      const el=document.createElement('article');el.className='mission-card';
      const h=document.createElement('h3');h.textContent=j.title;el.append(h);
      const d=document.createElement('p');d.textContent=j.desc;el.append(d);
      const o=document.createElement('p');o.innerHTML='<b>Objective:</b> ';o.append(document.createTextNode(j.objective));el.append(o);
      const r=document.createElement('p');r.className='mission-reward';r.textContent=`🟡 Reward: $${j.reward.toLocaleString()}`;el.append(r);
      if(j.status==='available'){const b=document.createElement('button');b.className='mission-action';b.textContent='Accept mission';b.addEventListener('click',()=>this.accept(j));el.append(b)}
      else if(j.status==='active'){
        const progress=document.createElement('p');progress.dataset.progress=j.id;progress.className='mission-progress';el.append(progress);
        if(j.id==='fuel'){const b=document.createElement('button');b.className='mission-action';b.textContent='REFUEL';b.addEventListener('click',()=>{const s=this.getState();if(!s.nearFuel){this.msg.textContent='Drive closer to the fuel pump first.';return}this.onRefuel();this.complete(j)});el.append(b)}
      } else {const done=document.createElement('p');done.textContent='✓ Completed';el.append(done)}
      this.cards.append(el);
    }
    this.renderProgress();
  }
}
