(() => {
"use strict";
const DB_NAME = "debo-fit-tracker";
const DB_VERSION = 1;
const STORE = "state";
const KEY = "main";
const $ = id => document.getElementById(id);
const today = () => new Date().toLocaleDateString("en-CA");
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const defaultSchedule = [
  {day:"Tuesday", session:"Push Day"},
  {day:"Wednesday", session:"Pull Day"},
  {day:"Thursday", session:"Legs Day"},
  {day:"Friday", session:"Rest"},
  {day:"Saturday", session:"Arms & Accessories"},
  {day:"Sunday", session:"Rest"},
  {day:"Monday", session:"Rest"}
];
const defaultState = () => ({
  version: 1, settings: {startWeight:47,targetWeight:52, nutritionGoal:"gain",targetCalories:2300,targetProtein:100,targetCarbs:300,targetFat:70}, schedule: structuredClone(defaultSchedule),
  weights: [], sessions: [], photos: [], activeSession: null, foodEntries: []
});
let state = defaultState();
let db;
let deferredInstallPrompt = null;
let toastTimer;
let pendingFoods = [];
const FOOD_DB = [
 {id:"rice-cooked",name:"Rice, white, cooked",aliases:["rice","cooked rice","white rice","boiled rice"],kcal:130,protein:2.7,carbs:28.2,fat:0.3,fibre:0.4,portion:100},
 {id:"egg",name:"Egg, whole, cooked",aliases:["egg","eggs","boiled egg","boiled eggs","omelette","omelet"],kcal:155,protein:12.6,carbs:1.1,fat:10.6,fibre:0,portion:50},
 {id:"ghee",name:"Ghee",aliases:["ghee","clarified butter"],kcal:900,protein:0,carbs:0,fat:100,fibre:0,portion:10},
 {id:"banana",name:"Banana, raw",aliases:["banana","bananas"],kcal:89,protein:1.1,carbs:22.8,fat:0.3,fibre:2.6,portion:100},
 {id:"bread",name:"White bread",aliases:["bread","white bread","slice bread"],kcal:266,protein:8.9,carbs:49.4,fat:3.2,fibre:2.7,portion:30},
 {id:"peanut-butter",name:"Peanut butter",aliases:["peanut butter","pb"],kcal:588,protein:25,carbs:20,fat:50,fibre:6,portion:20},
 {id:"peanuts",name:"Peanuts",aliases:["peanut","peanuts","groundnut","groundnuts"],kcal:567,protein:25.8,carbs:16.1,fat:49.2,fibre:8.5,portion:25},
 {id:"chana-boiled",name:"Chickpeas / kala chana, boiled",aliases:["chana","black chana","kala chana","boiled chana","chickpeas","chickpea"],kcal:164,protein:8.9,carbs:27.4,fat:2.6,fibre:7.6,portion:100},
 {id:"dal",name:"Dal, cooked (generic estimate)",aliases:["dal","daal","lentils","cooked dal","masoor dal","moong dal"],kcal:116,protein:9,carbs:20.1,fat:0.4,fibre:7.9,portion:100},
 {id:"milk",name:"Milk, whole",aliases:["milk","whole milk","full cream milk"],kcal:61,protein:3.2,carbs:4.8,fat:3.3,fibre:0,portion:100},
 {id:"oats",name:"Oats, dry",aliases:["oats","oatmeal","dry oats"],kcal:389,protein:16.9,carbs:66.3,fat:6.9,fibre:10.6,portion:40},
 {id:"paneer",name:"Paneer (generic estimate)",aliases:["paneer","cottage cheese indian"],kcal:265,protein:18.3,carbs:1.2,fat:20.8,fibre:0,portion:100},
 {id:"roti",name:"Roti / chapati (no added ghee; estimate)",aliases:["roti","chapati","chapatti","phulka"],kcal:297,protein:9.8,carbs:55.7,fat:3.7,fibre:8,portion:40},
 {id:"potato",name:"Potato, boiled",aliases:["potato","boiled potato","aloo"],kcal:87,protein:1.9,carbs:20.1,fat:0.1,fibre:1.8,portion:100},
 {id:"chicken",name:"Chicken breast, cooked",aliases:["chicken","chicken breast","cooked chicken"],kcal:165,protein:31,carbs:0,fat:3.6,fibre:0,portion:100},
 {id:"curd",name:"Plain curd / yogurt (generic estimate)",aliases:["curd","dahi","yogurt","plain yogurt"],kcal:61,protein:3.5,carbs:4.7,fat:3.3,fibre:0,portion:100}
];
function openDB() {
  return new Promise((resolve,reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function readState() {
  return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE,"readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result || defaultState());
    req.onerror = () => reject(req.error);
  });
}
function writeState() {
  return new Promise((resolve,reject) => {
    const tx = db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put(state,KEY);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
function toast(message) {
  const t = $("toast"); t.textContent = message; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(()=>t.classList.remove("show"),2800);
}
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function fmtDate(d) {
  if (!d) return "—";
  const x = new Date(d+"T12:00:00");
  return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"});
}
function getCurrentWeight() {
  const sorted = [...state.weights].sort((a,b)=>b.date.localeCompare(a.date) || b.createdAt-a.createdAt);
  return sorted.length ? Number(sorted[0].weight) : Number(state.settings.startWeight || 47);
}
function allSets() { return state.sessions.flatMap(s=>(s.exercises||[]).flatMap(e=>(e.sets||[]).map(set=>({...set,exercise:e.name,sessionDate:s.date,sessionId:s.id,bodyweight:e.bodyweight})))); }
function bests() {
  const map = {};
  for (const x of allSets()) {
    const load = Number(x.weight)||0, reps = Number(x.reps)||0;
    if (!x.exercise || reps<=0) continue;
    if (!map[x.exercise]) map[x.exercise] = {name:x.exercise, bestLoad:0,bestReps:0,bestVolume:0,latestDate:x.sessionDate,bodyweight:!!x.bodyweight};
    const b = map[x.exercise];
    if (load>b.bestLoad || (load===b.bestLoad && reps>b.bestReps)) { b.bestLoad=load; b.bestReps=reps; b.latestDate=x.sessionDate; }
    if (reps>b.bestReps) b.bestReps=reps;
    b.bestVolume=Math.max(b.bestVolume,load*reps);
    b.bodyweight = b.bodyweight || !!x.bodyweight;
  }
  return Object.values(map).sort((a,b)=>a.name.localeCompare(b.name));
}
function currentSession() { return state.activeSession; }
function avgRating(r) {
  const vals = ["energy","performance","form","recovery","nutrition"].map(k=>Number(r?.[k])).filter(n=>n>0);
  return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
}
function setView(view) {
  document.querySelectorAll(".view").forEach(el=>el.classList.toggle("active",el.id===view));
  document.querySelectorAll(".tab").forEach(el=>el.classList.toggle("active",el.dataset.view===view));
  window.scrollTo({top:0,behavior:"smooth"});
  render();
}
function saveAndRender(message) {
  writeState().then(()=>{render();if(message)toast(message)}).catch(e=>{console.error(e);toast("Could not save. Export/refresh after checking storage.")});
}
function drawLineChart(canvas, items, emptyId) {
  if (!canvas) return;
  const ctx=canvas.getContext("2d"), rect=canvas.getBoundingClientRect(), w=Math.max(280,rect.width||600), h=Number(canvas.getAttribute("height"))||200, dpr=window.devicePixelRatio||1;
  canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.height=h+"px";ctx.scale(dpr,dpr);ctx.clearRect(0,0,w,h);
  const pad={l:42,r:14,t:18,b:30}, cw=w-pad.l-pad.r,ch=h-pad.t-pad.b;
  ctx.font="11px system-ui";ctx.fillStyle="#66766e";ctx.strokeStyle="#e4ebe6";ctx.lineWidth=1;
  for(let i=0;i<4;i++){let y=pad.t+ch*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();}
  if(!items.length){if(emptyId)$(emptyId).classList.remove("hidden");return}
  if(emptyId)$(emptyId).classList.add("hidden");
  const vals=items.map(x=>Number(x.weight)), min=Math.min(...vals)-0.5,max=Math.max(...vals)+0.5, span=Math.max(1,max-min);
  ctx.textAlign="right";ctx.textBaseline="middle";
  for(let i=0;i<4;i++){let v=max-(span*i/3),y=pad.t+ch*i/3;ctx.fillText(v.toFixed(1),pad.l-8,y);}
  const points=items.map((it,i)=>({x:items.length===1?pad.l+cw/2:pad.l+cw*i/(items.length-1),y:pad.t+ch*(max-Number(it.weight))/span,it}));
  ctx.strokeStyle="#27734e";ctx.lineWidth=2.5;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();
  points.forEach(p=>{ctx.beginPath();ctx.fillStyle="#27734e";ctx.arc(p.x,p.y,3.5,0,Math.PI*2);ctx.fill()});
  ctx.textAlign="center";ctx.textBaseline="top";
  const labelPoints=[points[0],points[Math.floor((points.length-1)/2)],points[points.length-1]].filter((p,i,a)=>a.findIndex(q=>q.x===p.x)===i);
  labelPoints.forEach(p=>ctx.fillText(p.it.date.slice(5),p.x,h-22));
}
function renderDashboard() {
  const weight=getCurrentWeight(), start=Number(state.settings.startWeight)||47, target=Number(state.settings.targetWeight)||52;
  $("dashWeight").textContent=weight.toFixed(1);$("dashGoal").textContent=target.toFixed(1)+" kg";
  const pct=target===start?100:Math.max(0,Math.min(100,Math.round((weight-start)/(target-start)*100)));
  $("goalPercent").textContent=pct;$("goalBar").style.width=pct+"%";$("remainingWeight").textContent=weight>=target?"Goal reached — nice work!":Math.max(0,target-weight).toFixed(1)+" kg to go";
  $("workoutCount").textContent=state.sessions.length;$("prCount").textContent=bests().length;
  $("todayLabel").textContent=new Date().toLocaleDateString(undefined,{weekday:"long",day:"numeric",month:"long"}).toUpperCase();
  const day=new Date().toLocaleDateString("en-US",{weekday:"long"});
  const plan=state.schedule.find(x=>x.day===day);
  $("todayWorkoutTitle").textContent=plan?.session && plan.session!=="Rest"?plan.session:"Rest / flexible day";
  $("todayWorkoutTag").textContent=plan?.session==="Rest"?"Rest day":"Flexible";
  $("todayWorkoutText").textContent=plan?.session==="Rest"?"Rest is part of progress. Move a session here if your week changes.":"Start this session when you're ready, or choose another workout.";
  const latest=[...state.sessions].filter(s=>s.ratings).sort((a,b)=>(b.endAt||"").localeCompare(a.endAt||""))[0];
  const ar=latest?avgRating(latest.ratings):null;$("latestRecovery").textContent=ar?ar.toFixed(1):"—";$("latestRecoveryText").textContent=latest?`Latest ${latest.name} · recovery ${latest.ratings.recovery}/5 · ${fmtDate(latest.date)}`:"Add a workout rating to see your latest check-in.";
  const w=state.weights.slice().sort((a,b)=>a.date.localeCompare(b.date)).slice(-10);drawLineChart($("dashWeightChart"),w,"dashChartEmpty");
  $("schedulePreview").innerHTML=state.schedule.map(x=>`<div class="schedule-day"><strong>${esc(x.day.slice(0,3))}</strong><span>${esc(x.session)}</span></div>`).join("");
}
function renderScheduleEditor() {
  $("scheduleEditor").innerHTML=state.schedule.map((x,i)=>`<div class="schedule-editor-row"><strong>${esc(x.day.slice(0,3))}</strong><input aria-label="${esc(x.day)} workout" data-schedule-index="${i}" value="${esc(x.session)}" maxlength="80"></div>`).join("");
}
function renderActiveSession() {
  const active=currentSession(), box=$("activeSession");
  if(!active){box.classList.add("hidden");$("activeStatus").textContent="No active session";$("exerciseLog").innerHTML='<p class="empty-hint">Start a session, then add exercises.</p>';return}
  box.classList.remove("hidden");$("activeStatus").textContent="Session in progress";
  box.innerHTML=`<strong>${esc(active.name)}</strong><span>Started ${new Date(active.startAt).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} · ${fmtDate(active.date)}</span><div class="button-row"><button class="secondary" id="discardSessionBtn" type="button">Discard session</button></div>`;
  $("discardSessionBtn").onclick=()=>{if(confirm("Discard this active session? Unsaved set data will be lost.")){state.activeSession=null;saveAndRender("Active session discarded.")}};
  const exercises=active.exercises||[];
  $("exerciseLog").innerHTML=exercises.length?exercises.map((e,ei)=>`
    <div class="exercise-card" data-exercise-id="${esc(e.id)}">
      <div class="exercise-card-head"><div><h4>${esc(e.name)}</h4><p class="small muted">${e.bodyweight?"Bodyweight movement · external load recorded separately":"Resistance exercise"}</p></div><button class="text-button remove-exercise" data-ei="${ei}" type="button">Remove</button></div>
      <div style="overflow-x:auto"><table class="set-table"><thead><tr><th>Set</th><th>Load (kg)</th><th>Reps</th><th>RIR</th><th>✓</th><th></th></tr></thead><tbody>
      ${e.sets.map((s,si)=>`<tr><td>${si+1}</td><td><input type="number" min="0" max="1000" step="0.25" value="${esc(s.weight)}" data-ei="${ei}" data-si="${si}" data-field="weight" aria-label="Set ${si+1} load"></td><td><input type="number" min="0" max="1000" step="1" value="${esc(s.reps)}" data-ei="${ei}" data-si="${si}" data-field="reps" aria-label="Set ${si+1} reps"></td><td><input type="number" min="0" max="10" step="1" value="${esc(s.rir??"")}" data-ei="${ei}" data-si="${si}" data-field="rir" aria-label="Set ${si+1} reps in reserve"></td><td><input type="checkbox" ${s.done?"checked":""} data-ei="${ei}" data-si="${si}" data-field="done" aria-label="Set completed" style="width:18px"></td><td><button class="text-button remove-set" data-ei="${ei}" data-si="${si}" type="button">×</button></td></tr>`).join("")}
      </tbody></table></div>
      <div class="set-actions"><button class="secondary add-set" data-ei="${ei}" type="button">+ Add set</button><button class="secondary copy-previous" data-ei="${ei}" type="button">Compare last session</button></div>
      <p class="muted small" id="compare-${ei}">${compareExercise(e.name)}</p>
    </div>`).join(""):'<p class="empty-hint">Add your first exercise above.</p>';
  $("exerciseLog").querySelectorAll("[data-field]").forEach(inp=>inp.addEventListener("change",()=>{
    const {ei,si,field}=inp.dataset;const s=state.activeSession.exercises[Number(ei)].sets[Number(si)];
    s[field]=field==="done"?inp.checked:(inp.value===""?"":Number(inp.value));writeState().catch(()=>toast("Save failed"));
  }));
  $("exerciseLog").querySelectorAll(".remove-exercise").forEach(btn=>btn.onclick=()=>{state.activeSession.exercises.splice(Number(btn.dataset.ei),1);saveAndRender("Exercise removed.")});
  $("exerciseLog").querySelectorAll(".add-set").forEach(btn=>btn.onclick=()=>{const e=state.activeSession.exercises[Number(btn.dataset.ei)];const last=e.sets[e.sets.length-1]||{weight:0,reps:0,rir:"",done:false};e.sets.push({...last,done:false});saveAndRender("Set added.")});
  $("exerciseLog").querySelectorAll(".remove-set").forEach(btn=>btn.onclick=()=>{const e=state.activeSession.exercises[Number(btn.dataset.ei)];e.sets.splice(Number(btn.dataset.si),1);saveAndRender("Set removed.")});
  $("exerciseLog").querySelectorAll(".copy-previous").forEach(btn=>btn.onclick=()=>toast(compareExercise(state.activeSession.exercises[Number(btn.dataset.ei)].name)));
}
function compareExercise(name) {
  const prior=state.sessions.filter(s=>s.exercises?.some(e=>e.name.toLowerCase()===name.toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date))[0];
  if(!prior)return "No previous session logged for this exercise yet.";
  const ex=prior.exercises.find(e=>e.name.toLowerCase()===name.toLowerCase());
  const top=(ex.sets||[]).reduce((b,s)=>Number(s.weight)>Number(b.weight)|| (Number(s.weight)===Number(b.weight)&&Number(s.reps)>Number(b.reps))?s:b,{weight:0,reps:0});
  return `Last logged ${fmtDate(prior.date)}: top set ${Number(top.weight)||0} kg × ${Number(top.reps)||0} reps. Add reps with clean form before considering a small load increase.`;
}
function renderHistory() {
  const sorted=[...state.sessions].sort((a,b)=>b.date.localeCompare(a.date)||(b.startAt||"").localeCompare(a.startAt||""));
  $("historyCount").textContent=`${sorted.length} session${sorted.length===1?"":"s"}`;
  $("sessionHistory").innerHTML=sorted.length?sorted.slice(0,30).map(s=>{
    const sets=(s.exercises||[]).reduce((n,e)=>n+(e.sets||[]).length,0), dur=s.startAt&&s.endAt?Math.max(0,Math.round((new Date(s.endAt)-new Date(s.startAt))/60000)):null, r=avgRating(s.ratings);
    return `<div class="history-row"><div><strong>${esc(s.name)}</strong><p>${fmtDate(s.date)} · ${(s.exercises||[]).length} exercises · ${sets} sets${dur!==null?" · "+dur+" min":""}</p>${s.notes?`<p>${esc(s.notes)}</p>`:""}${s.painLocation&&s.painLocation.toLowerCase()!=="none"&&Number(s.painSeverity)>0?`<p style="color:#a63b3b">Pain: ${esc(s.painLocation)} (${esc(s.painSeverity)}/10)</p>`:""}</div><div class="right"><strong>${r?r.toFixed(1)+"/5":"—"}</strong><p>rating</p><button class="text-button delete-session" data-id="${esc(s.id)}">Delete</button></div></div>`;
  }).join(""):'<p class="empty-hint">Your saved sessions will show up here.</p>';
  $("sessionHistory").querySelectorAll(".delete-session").forEach(b=>b.onclick=()=>{if(confirm("Delete this session?")){state.sessions=state.sessions.filter(s=>s.id!==b.dataset.id);saveAndRender("Session deleted.")}});
}
function renderWeight() {
  const start=Number(state.settings.startWeight)||47,target=Number(state.settings.targetWeight)||52;
  $("startWeight").value=start;$("targetWeight").value=target;$("weightValue").value=getCurrentWeight();$("weightDate").value=today();
  const sorted=[...state.weights].sort((a,b)=>a.date.localeCompare(b.date));
  $("weightCount").textContent=`${sorted.length} entr${sorted.length===1?"y":"ies"}`;
  drawLineChart($("weightChart"),sorted,null);
  $("weightHistory").innerHTML=sorted.length?sorted.slice().reverse().map(w=>`<div class="history-row"><div><strong>${Number(w.weight).toFixed(1)} kg</strong><p>${fmtDate(w.date)}${w.note?" · "+esc(w.note):""}</p></div><button class="text-button delete-weight" data-id="${esc(w.id)}">Delete</button></div>`).join(""):'<p class="empty-hint">No weigh-ins yet. Add your first entry above.</p>';
  $("weightHistory").querySelectorAll(".delete-weight").forEach(b=>b.onclick=()=>{if(confirm("Delete this weigh-in?")){state.weights=state.weights.filter(w=>w.id!==b.dataset.id);saveAndRender("Weigh-in deleted.")}});
}
function renderProgress() {
  const sets=allSets(), rated=state.sessions.filter(s=>s.ratings), last=rated.length?avgRating(rated.slice().sort((a,b)=>(b.endAt||"").localeCompare(a.endAt||""))[0].ratings):null;
  $("progressSessions").textContent=state.sessions.length;$("progressSets").textContent=sets.length;$("progressRated").textContent=rated.length;$("progressRating").textContent=last?last.toFixed(1)+"/5":"—";
  const ps=bests();
  $("prList").innerHTML=ps.length?ps.map(p=>`<div class="history-row"><div><strong>${esc(p.name)}</strong><p>Best logged load: ${p.bestLoad} kg · best reps: ${p.bestReps} · max set volume: ${p.bestVolume} kg-reps</p></div><div class="right"><strong>${p.bestLoad} kg</strong><p>${fmtDate(p.latestDate)}</p></div></div>`).join(""):'<p class="empty-hint">Log some sets to see your exercise bests.</p>';
  $("photoGallery").innerHTML=state.photos.length?state.photos.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(p=>`<div class="photo-card"><img src="${p.dataUrl}" alt="Progress photo ${esc(p.date)}" loading="lazy"><div class="photo-meta"><strong>${fmtDate(p.date)}</strong><div>${esc(p.note||"Progress photo")}</div></div><button data-photo-id="${esc(p.id)}" class="delete-photo">Delete photo</button></div>`).join(""):'<p class="empty-hint">No progress photos yet.</p>';
  $("photoGallery").querySelectorAll(".delete-photo").forEach(b=>b.onclick=()=>{if(confirm("Delete this photo?")){state.photos=state.photos.filter(p=>p.id!==b.dataset.photoId);saveAndRender("Photo deleted.")}});
}
function renderSuggestions() {
  const names=new Set(["Weighted parallel dips","Machine flies","Incline dumbbell press","Incline barbell press","Lateral raises","Weighted pull-ups","Barbell row","Barbell shrugs","Back extension","Close-grip pulldown","Rear-delt fly","Belt squat","Romanian deadlift","Leg extension","Leg curl","Calf raises","Triceps extension","Preacher curl","Triceps pushdown","Hammer curl","Neck work","Forearm curls"]);
  state.sessions.forEach(s=>(s.exercises||[]).forEach(e=>names.add(e.name)));
  $("exerciseSuggestions").innerHTML=[...names].sort().map(n=>`<option value="${esc(n)}"></option>`).join("");
}
function foodNutrients(food, grams) {
  const factor = Number(grams || 0) / 100;
  return {kcal:Math.round((Number(food.kcal)||0)*factor),protein:+((Number(food.protein)||0)*factor).toFixed(1),carbs:+((Number(food.carbs)||0)*factor).toFixed(1),fat:+((Number(food.fat)||0)*factor).toFixed(1),fibre:+((Number(food.fibre)||0)*factor).toFixed(1)};
}
function foodMatches(query) {
  const q=String(query||"").toLowerCase().trim();
  return FOOD_DB.filter(f=>f.name.toLowerCase().includes(q)||f.aliases.some(a=>a.includes(q)||q.includes(a))).slice(0,8);
}
function renderFoodResults(items, targetId="foodSearchResults") {
  const el=$(targetId); if(!el)return;
  if(!items.length){el.innerHTML='<p class="empty-hint">No exact local match. Try a simpler name or search packaged foods online.</p>';return;}
  el.innerHTML=items.map((f,i)=>`<div class="food-result"><div><strong>${esc(f.name)}</strong><p>Per 100 g · ${Math.round(f.kcal)} kcal · P ${f.protein} g · C ${f.carbs} g · F ${f.fat} g</p></div><button class="secondary" type="button" data-select-food="${esc(f.id)}" data-food-index="${i}">Add</button></div>`).join("");
}
function foodById(id){return FOOD_DB.find(f=>f.id===id)||null;}
function renderPendingFoods(){
 const el=$("parsedFoods"); if(!pendingFoods.length){el.innerHTML="";return;}
 el.innerHTML=pendingFoods.map((p,i)=>`<div class="food-result"><div><strong>${esc(p.food.name)}</strong><p>${p.grams} g · about ${foodNutrients(p.food,p.grams).kcal} kcal</p></div><button class="food-delete" type="button" data-remove-pending="${i}">Remove</button></div>`).join("")+`<button class="primary" id="saveParsedFoods" type="button">Add ${pendingFoods.length} item(s) to diary</button>`;
}
function parseFoodText(text){
 const parts=String(text).split(/[,;+\n]+/).map(x=>x.trim()).filter(Boolean), out=[];
 for(const part of parts){
  let m=part.match(/^(\d+(?:\.\d+)?)\s*(g|gm|gram|grams|kg)\s+(?:of\s+)?(.+)$/i), grams, name;
  if(m){grams=Number(m[1])*(/^kg$/i.test(m[2])?1000:1);name=m[3].trim();}
  else {m=part.match(/^(\d+(?:\.\d+)?)\s+(.+)$/i); if(m){const qty=Number(m[1]);name=m[2].trim();const normalized=name.toLowerCase();const f=FOOD_DB.find(x=>x.aliases.some(a=>a===normalized)||x.name.toLowerCase()===normalized);grams=qty*(f?.portion||100);}else{grams=100;name=part;}}
  const f=FOOD_DB.find(x=>x.aliases.some(a=>a===name.toLowerCase())||x.name.toLowerCase()===name.toLowerCase())||foodMatches(name)[0];
  if(f)out.push({food:f,grams:Math.max(1,Math.round(grams))});
 }
 return out;
}
function renderNutrition(){
 if(!$('foodDate'))return;
 const date=$('foodDate').value||today();const entries=(state.foodEntries||[]).filter(x=>x.date===date);
 const total={kcal:0,protein:0,carbs:0,fat:0,fibre:0};entries.forEach(e=>{const n=foodNutrients(e.food,e.grams);Object.keys(total).forEach(k=>total[k]+=n[k]);});
 const cfg=state.settings;const targets={kcal:Number(cfg.targetCalories)||2300,protein:Number(cfg.targetProtein)||100,carbs:Number(cfg.targetCarbs)||300,fat:Number(cfg.targetFat)||70};
 $('nutritionDateTitle').textContent=date===today()?"Today's food diary":`Food diary · ${fmtDate(date)}`;
 $('foodCalories').textContent=Math.round(total.kcal).toLocaleString();$('foodTargetLabel').textContent=`Target ${targets.kcal} kcal`;$('foodRemaining').textContent=total.kcal>=targets.kcal?`${Math.round(total.kcal-targets.kcal)} kcal over target`:`${Math.round(targets.kcal-total.kcal)} kcal left`;$('foodProgress').style.width=Math.min(100,total.kcal/targets.kcal*100)+"%";
 [['Protein','protein',targets.protein],['Carbs','carbs',targets.carbs],['Fat','fat',targets.fat]].forEach(([label,key,t])=>{$('food'+label).textContent=total[key].toFixed(1)+' g';$(key+'Target').textContent=`Target ${t} g`;$(key+'Progress').style.width=(t?Math.min(100,total[key]/t*100):0)+'%';});
 $('foodFibre').textContent=total.fibre.toFixed(1)+' g';$('fibreProgress').style.width=Math.min(100,total.fibre/30*100)+'%';
 $('foodEntryCount').textContent=`${entries.length} item${entries.length===1?'':'s'}`;
 const meals=[...new Set(entries.map(e=>e.meal||'Snack'))];
 $('foodDiary').innerHTML=entries.length?meals.map(meal=>`<div class="food-group-title">${esc(meal)}</div>`+entries.filter(e=>(e.meal||'Snack')===meal).map(e=>{const n=foodNutrients(e.food,e.grams);return `<div class="food-entry"><div><strong>${esc(e.food.name)}</strong><p>${e.grams} g · P ${n.protein} g · C ${n.carbs} g · F ${n.fat} g</p></div><div class="food-entry-right"><strong>${n.kcal} kcal</strong><button class="food-delete" data-delete-food="${esc(e.id)}" type="button">Delete</button></div></div>`}).join('')).join(''):'<p class="empty-hint">No foods logged for this date yet.</p>';
 $('nutritionGoal').value=cfg.nutritionGoal||'gain';$('targetCalories').value=targets.kcal;$('targetProtein').value=targets.protein;$('targetCarbs').value=targets.carbs;$('targetFat').value=targets.fat;
}
function render() {
  renderDashboard();renderScheduleEditor();renderActiveSession();renderHistory();renderWeight();renderProgress();renderSuggestions();renderNutrition();
}
function download(filename,blob) {
  const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
function downloadJSON() {
  const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:"application/json"});
  download("debos-fit-backup-"+today()+".json",blob);toast("JSON backup downloaded.");
}
function csvEscape(value) { const s=String(value??"");return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s; }
function downloadCSV(type) {
  let rows;
  if(type==="weight") {
    rows=[["date","weight_kg","note"],...state.weights.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(w=>[w.date,w.weight,w.note||""])];
  } else if(type==="food") {
    rows=[["date","meal","food","quantity_g","calories_kcal","protein_g","carbs_g","fat_g","fibre_g","source"],...(state.foodEntries||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)).map(e=>{const n=foodNutrients(e.food,e.grams);return [e.date,e.meal,e.food.name,e.grams,n.kcal,n.protein,n.carbs,n.fat,n.fibre,e.food.source||"Built-in estimate"]})];
  } else {
    rows=[["date","session","start_at","end_at","duration_minutes","exercise","bodyweight_movement","set_number","load_kg","reps","rir","completed","energy","performance","form","recovery","nutrition","sleep_hours","notes","pain_location","pain_severity"]];
    state.sessions.forEach(s=>(s.exercises||[]).forEach(e=>(e.sets||[]).forEach((x,i)=>{
      const dur=s.startAt&&s.endAt?Math.round((new Date(s.endAt)-new Date(s.startAt))/60000):"";
      rows.push([s.date,s.name,s.startAt||"",s.endAt||"",dur,e.name,!!e.bodyweight,i+1,x.weight,x.reps,x.rir??"",!!x.done,s.ratings?.energy??"",s.ratings?.performance??"",s.ratings?.form??"",s.ratings?.recovery??"",s.ratings?.nutrition??"",s.ratings?.sleep??"",s.notes||"",s.painLocation||"",s.painSeverity??""]);
    })));
  }
  const csv="\ufeff"+rows.map(r=>r.map(csvEscape).join(",")).join("\r\n");
  download(type==="weight"?"debos-weight-log.csv":type==="food"?"debos-food-diary.csv":"debos-workout-log.csv",new Blob([csv],{type:"text/csv;charset=utf-8"}));toast("CSV exported.");
}
function validBackup(obj) {
  return obj && typeof obj==="object" && obj.version===1 && obj.settings && Array.isArray(obj.schedule) && Array.isArray(obj.weights) && Array.isArray(obj.sessions) && Array.isArray(obj.photos);
}
function safeRestore(obj) {
  const clean=defaultState();
  clean.settings={...clean.settings,...obj.settings,startWeight:Number(obj.settings.startWeight)||47,targetWeight:Number(obj.settings.targetWeight)||52};
  clean.schedule=defaultSchedule.map(d=>({...d,session:String(obj.schedule.find(x=>x.day===d.day)?.session ?? d.session).slice(0,80)}));
  clean.weights=obj.weights.filter(w=>w&&w.date&&Number.isFinite(Number(w.weight))).map(w=>({id:String(w.id||uid()),date:String(w.date),weight:Number(w.weight),note:String(w.note||""),createdAt:Number(w.createdAt)||Date.now()}));
  clean.sessions=obj.sessions.filter(s=>s&&typeof s.name==="string"&&Array.isArray(s.exercises)).map(s=>({...s,id:String(s.id||uid()),exercises:s.exercises.map(e=>({...e,id:String(e.id||uid()),name:String(e.name||"Exercise").slice(0,100),bodyweight:!!e.bodyweight,sets:(Array.isArray(e.sets)?e.sets:[]).map(x=>({weight:Number(x.weight)||0,reps:Number(x.reps)||0,rir:x.rir===""||x.rir==null?"":Number(x.rir),done:!!x.done}))}))}));
  clean.photos=obj.photos.filter(p=>p&&p.id&&p.dataUrl&&p.date).map(p=>({id:String(p.id),date:String(p.date),note:String(p.note||""),dataUrl:String(p.dataUrl)}));
  clean.activeSession=obj.activeSession&&Array.isArray(obj.activeSession.exercises)?obj.activeSession:null;
  clean.foodEntries=Array.isArray(obj.foodEntries)?obj.foodEntries.filter(x=>x&&x.id&&x.date&&x.food&&Number(x.grams)>0).map(x=>({...x,grams:Number(x.grams),meal:String(x.meal||"Snack")})):[];
  return clean;
}
function bindEvents() {
  document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
  document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.go)));
  $("sessionDate").value=today();$("weightDate").value=today();$("photoDate").value=today();$("foodDate").value=today();
  $("foodDate").addEventListener("change",renderNutrition);
  $("foodSearchForm").addEventListener("submit",async e=>{
    e.preventDefault();const q=$("foodSearchQuery").value.trim();if(!q)return;
    const local=foodMatches(q);renderFoodResults(local);
    try{
      const url="https://world.openfoodfacts.org/cgi/search.pl?search_terms="+encodeURIComponent(q)+"&search_simple=1&action=process&json=1&page_size=8&fields=product_name,brands,nutriments,code";
      const res=await fetch(url,{headers:{Accept:"application/json"}});if(!res.ok)throw new Error("Search unavailable");const data=await res.json();
      const remote=(data.products||[]).filter(x=>x.product_name&&x.nutriments&&Number.isFinite(Number(x.nutriments['energy-kcal_100g']??x.nutriments['energy-kcal']))).map((x,i)=>({id:"off-"+(x.code||i),name:x.product_name+(x.brands?" · "+x.brands:""),kcal:Number(x.nutriments['energy-kcal_100g']??x.nutriments['energy-kcal'])||0,protein:Number(x.nutriments.proteins_100g)||0,carbs:Number(x.nutriments.carbohydrates_100g)||0,fat:Number(x.nutriments.fat_100g)||0,fibre:Number(x.nutriments.fiber_100g)||0,portion:100,source:"Open Food Facts"}));
      if(remote.length)renderFoodResults([...local,...remote].slice(0,12));
    }catch(err){console.info("External food search unavailable; using offline food list.",err)}
  });
  $("foodSearchResults").addEventListener("click",e=>{const b=e.target.closest("[data-select-food]");if(!b)return;const id=b.dataset.selectFood;let food=foodById(id);if(!food){const row=b.closest(".food-result");const name=row?.querySelector("strong")?.textContent||"Food";const txt=row?.querySelector("p")?.textContent||"";const m=txt.match(/([0-9.]+) kcal · P ([0-9.]+) g · C ([0-9.]+) g · F ([0-9.]+) g/);if(m)food={id,name,kcal:Number(m[1]),protein:Number(m[2]),carbs:Number(m[3]),fat:Number(m[4]),fibre:0,portion:100,source:"Open Food Facts"};}
    if(!food){toast("Could not read that food result.");return;}const grams=prompt(`Quantity in grams for ${food.name}:`,String(food.portion||100));if(grams===null)return;const g=Number(grams);if(!Number.isFinite(g)||g<=0||g>5000){toast("Enter a valid quantity in grams.");return;}const meal=$("naturalMeal").value;state.foodEntries.push({id:uid(),date:$("foodDate").value||today(),meal,food,grams:g,createdAt:Date.now()});saveAndRender("Food added to diary.");
  });
  $("naturalFoodForm").addEventListener("submit",e=>{e.preventDefault();pendingFoods=parseFoodText($("naturalFoodInput").value);renderPendingFoods();if(!pendingFoods.length)toast("Couldn't match those foods yet. Try names like rice, egg, ghee, banana, dal or oats.");else toast(`Found ${pendingFoods.length} food item(s). Review before saving.`)});
  $("parsedFoods").addEventListener("click",e=>{const del=e.target.closest("[data-remove-pending]");if(del){pendingFoods.splice(Number(del.dataset.removePending),1);renderPendingFoods();return;}if(e.target.id==="saveParsedFoods"){const date=$("foodDate").value||today(),meal=$("naturalMeal").value;pendingFoods.forEach(p=>state.foodEntries.push({id:uid(),date,meal,food:p.food,grams:p.grams,createdAt:Date.now()}));const count=pendingFoods.length;pendingFoods=[];$("naturalFoodInput").value="";renderPendingFoods();saveAndRender(`${count} food item(s) added.`)}});
  $("foodDiary").addEventListener("click",e=>{const b=e.target.closest("[data-delete-food]");if(!b)return;state.foodEntries=state.foodEntries.filter(x=>x.id!==b.dataset.deleteFood);saveAndRender("Food entry deleted.")});
  $("nutritionGoalsForm").addEventListener("submit",e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const vals={targetCalories:Number(fd.get("targetCalories"))||2300,targetProtein:Number(fd.get("targetProtein"))||0,targetCarbs:Number(fd.get("targetCarbs"))||0,targetFat:Number(fd.get("targetFat"))||0};if(vals.targetCalories<500||vals.targetCalories>10000){toast("Calories target must be between 500 and 10,000.");return;}state.settings={...state.settings,...vals,nutritionGoal:$("nutritionGoal").value};saveAndRender("Nutrition targets saved.")});
  $("sessionForm").addEventListener("submit",e=>{
    e.preventDefault();if(state.activeSession){toast("Finish or discard the active session first.");return}
    const name=$("sessionName").value.trim();if(!name)return;
    state.activeSession={id:uid(),name,date:$("sessionDate").value||today(),startAt:new Date().toISOString(),endAt:null,exercises:[],ratings:null,notes:"",painLocation:"",painSeverity:0};
    saveAndRender("Session started. Let's work.");
  });
  $("quickPlanBtn").addEventListener("click",()=>{
    const d=new Date().toLocaleDateString("en-US",{weekday:"long"}),p=state.schedule.find(x=>x.day===d);
    if(p&&p.session!=="Rest")$("sessionName").value=p.session;
    else toast("Today's plan is rest. Pick any session you want.");
  });
  $("scheduleForm").addEventListener("submit",e=>{
    e.preventDefault();document.querySelectorAll("[data-schedule-index]").forEach(inp=>{state.schedule[Number(inp.dataset.scheduleIndex)].session=inp.value.trim()||"Rest"});
    saveAndRender("Weekly plan saved.");
  });
  $("addExerciseForm").addEventListener("submit",e=>{
    e.preventDefault();if(!state.activeSession){toast("Start a session first.");return}
    const name=$("exerciseName").value.trim();if(!name)return;
    state.activeSession.exercises.push({id:uid(),name,bodyweight:$("bodyweightExercise").value==="yes",sets:[{weight:0,reps:0,rir:"",done:false},{weight:0,reps:0,rir:"",done:false},{weight:0,reps:0,rir:"",done:false}]});
    $("exerciseName").value="";saveAndRender("Exercise added with 3 starter sets.");
  });
  $("finishForm").addEventListener("submit",e=>{
    e.preventDefault();if(!state.activeSession){toast("Start a session first.");return}
    const fd=new FormData(e.currentTarget),ratings={};
    ["energy","performance","form","recovery","nutrition"].forEach(k=>ratings[k]=Number(fd.get(k)));
    ratings.sleep=fd.get("sleep")===""?null:Number(fd.get("sleep"));
    const s=state.activeSession;s.endAt=new Date().toISOString();s.ratings=ratings;s.notes=String(fd.get("notes")||"").trim();s.painLocation=String(fd.get("painLocation")||"").trim();s.painSeverity=Number(fd.get("painSeverity"))||0;
    state.sessions.push(s);state.activeSession=null;e.currentTarget.reset();saveAndRender("Workout saved. Nice work.");
  });
  $("weightForm").addEventListener("submit",e=>{
    e.preventDefault();const weight=Number($("weightValue").value);if(!Number.isFinite(weight)||weight<20||weight>350){toast("Enter a valid weight.");return}
    const date=$("weightDate").value||today();const existing=state.weights.find(w=>w.date===date);
    if(existing){existing.weight=weight;existing.note=$("weightNote").value.trim();existing.createdAt=Date.now()}
    else state.weights.push({id:uid(),date,weight,note:$("weightNote").value.trim(),createdAt:Date.now()});
    saveAndRender("Weight saved.");
  });
  $("goalForm").addEventListener("submit",e=>{
    e.preventDefault();const start=Number($("startWeight").value),target=Number($("targetWeight").value);
    if(start<20||target<20||start>350||target>350){toast("Enter valid goal weights.");return}
    state.settings.startWeight=start;state.settings.targetWeight=target;saveAndRender("Goals saved.");
  });
  $("photoForm").addEventListener("submit",async e=>{
    e.preventDefault();const file=$("photoFile").files[0];if(!file)return;
    if(!file.type.startsWith("image/")){toast("Choose an image file.");return}
    if(file.size>8*1024*1024){toast("Please choose a photo under 8 MB.");return}
    try{
      const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});
      state.photos.push({id:uid(),date:$("photoDate").value||today(),note:$("photoNote").value.trim(),dataUrl});
      e.currentTarget.reset();$("photoDate").value=today();saveAndRender("Progress photo saved locally.");
    }catch(err){console.error(err);toast("Could not read that image.")}
  });
  $("backupBtn").addEventListener("click",downloadJSON);
  $("csvBtn").addEventListener("click",()=>downloadCSV("workout"));
  $("weightCsvBtn").addEventListener("click",()=>downloadCSV("weight"));
  $("foodCsvBtn").addEventListener("click",()=>downloadCSV("food"));
  $("restoreFile").addEventListener("change",async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      const obj=JSON.parse(await file.text());
      if(!validBackup(obj)){toast("That file doesn't look like a valid DEBO FIT backup.");return}
      if(!confirm("Restore will replace current tracker data. Export current data first if needed. Continue?"))return;
      state=safeRestore(obj);await writeState();render();toast("Backup restored.");
    }catch(err){console.error(err);toast("Could not restore. Check the JSON file.");}
    finally{e.target.value=""}
  });
  $("clearBtn").addEventListener("click",async()=>{
    if(!confirm("Delete ALL local weights, workouts, ratings, schedule and photos from this browser? This cannot be undone unless you have a backup."))return;
    state=defaultState();await writeState();render();toast("Local tracker data deleted.");
  });
  window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstallPrompt=e;$("installBtn").classList.remove("hidden")});
  $("installBtn").addEventListener("click",async()=>{
    if(!deferredInstallPrompt){toast("Open this HTTPS app in Chrome and use the menu → Install app / Add to Home screen.");return}
    deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$("installBtn").classList.add("hidden");
  });
  window.addEventListener("resize",()=>{const sorted=state.weights.slice().sort((a,b)=>a.date.localeCompare(b.date));drawLineChart($("weightChart"),sorted,null);drawLineChart($("dashWeightChart"),sorted.slice(-10),"dashChartEmpty")});
}
async function init() {
  try{db=await openDB();state=await readState();if(!state.version)state=defaultState();state.settings={...defaultState().settings,...(state.settings||{})};if(!Array.isArray(state.foodEntries))state.foodEntries=[]}
  catch(err){console.error(err);alert("Could not open local storage. Try opening this app in a current browser (not private mode).");state=defaultState()}
  bindEvents();
  if("serviceWorker" in navigator && (location.protocol==="https:"||location.hostname==="localhost")) {
    navigator.serviceWorker.register("./sw.js").catch(err=>console.warn("Service worker registration failed",err));
  }
  render();
}
init();
})();