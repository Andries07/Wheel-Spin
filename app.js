/***** 1) CONFIG — paste your Apps Script Web App URL *****/
const API_URL = 'PASTE_YOUR_APPS_SCRIPT_WEB_APP_URL_HERE'; // e.g. https://script.google.com/macros/s/AKfycb.../exec

/***** 2) STORE ID — choose ONE method *****/
// (A) Pass per-store via URL, like ?store=CL-001
function getStoreFromQuery(){
  const m = /[?&]store=([^&]+)/i.exec(location.search);
  return m ? decodeURIComponent(m[1]) : null;
}
let STORE_ID = getStoreFromQuery();

// (B) OR hardcode it here (uncomment next line and set your store):
// let STORE_ID = 'CL-001';

/*****************************************************/
let CFG = { campaignId:'', store:{ id:'', name:'', qualifyAmount:0 } };
let spinDeg = 0;

function $(id){ return document.getElementById(id); }
function showPanel(which){
  $('home').classList.add('hidden');
  ['review','wheel'].forEach(p => $('panel-'+p).classList.add('hidden'));
  $('panel-'+which).classList.remove('hidden');
}
function goHome(){
  $('home').classList.remove('hidden');
  ['review','wheel'].forEach(p => $('panel-'+p).classList.add('hidden'));
}
function toast(title, body){
  $('mTitle').innerText = title||'Note';
  $('mBody').innerText  = body||'';
  $('modal').classList.remove('hidden');
}
function closeModal(){ $('modal').classList.add('hidden'); }
function deviceId(){
  let v = localStorage.getItem('cl_device_id');
  if(!v){ v='TAB-'+Math.random().toString(36).slice(2,10).toUpperCase(); localStorage.setItem('cl_device_id',v); }
  return v;
}

async function apiPost(payload){
  const controller = new AbortController();
  const t = setTimeout(()=>controller.abort(), 12000); // 12s safety
  try{
    const res = await fetch(API_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(t);
    return await res.json();
  }catch(e){
    throw new Error('Failed to reach API: '+e.message);
  }
}

/** -------- INIT (per-store config) -------- **/
document.addEventListener('DOMContentLoaded', async ()=>{
  try{
    if(!STORE_ID){ toast('Missing store','Add ?store=CL-001 to the URL or hardcode STORE_ID in app.js'); return; }
    const cfg = await apiPost({ action:'getConfig', storeId: STORE_ID, deviceId: deviceId() });
    if(!cfg.ok){ toast('Config error', JSON.stringify(cfg)); return; }
    CFG = cfg;
    $('storeName').innerText  = CFG.store.name || STORE_ID;
    $('storeTarget').innerText= `Target: R${CFG.store.qualifyAmount}`;
  }catch(e){
    toast('Setup error', e.message + '\nCheck API_URL and deployment access.');
  }
});

/** -------- REVIEWS -------- **/
async function submitReview(){
  try{
    const payload = {
      action: 'feedback',
      storeId: STORE_ID,
      foodFresh: $('rvFresh').value,
      service: $('rvService').value,
      speed: $('rvSpeed').value,
      cleanliness: $('rvClean').value,
      friendliness: $('rvFriendly').value,
      comment: $('rvComment').value,
      name: $('rvName').value,
      phone: $('rvPhone').value,
      deviceId: deviceId()
    };
    const res = await apiPost(payload);
    if(res.ok){
      $('rvMsg').textContent = 'Thanks! Your feedback helps us get soul better.';
      setTimeout(()=>{ $('rvMsg').textContent=''; goHome(); }, 1500);
    } else {
      toast('Error','Could not submit review.');
    }
  }catch(e){ toast('Network', e.message); }
}

/** -------- WHEEL -------- **/
function eligible(){
  const q = CFG.store.qualifyAmount||0;
  const val = Number($('wAmount').value||0);
  if(val < q){ $('wheelMsg').textContent = `Basket below target (R${q}).`; return false; }
  const req = ['wName','wSurname','wEmail','wPhone','wOrder','wAmount','wPin'];
  for(const id of req){ if(!$(id).value.trim()){ $('wheelMsg').textContent='Complete all fields.'; return false; } }
  if(!$('wPopia').checked || !$('wMarketing').checked){ $('wheelMsg').textContent='POPIA + Marketing consent required.'; return false; }
  $('wheelMsg').textContent=''; return true;
}
['wName','wSurname','wEmail','wPhone','wOrder','wAmount','wPin','wPopia','wMarketing'].forEach(id=>{
  const el = $(id);
  el.addEventListener(el.type==='checkbox' ? 'change' : 'input', ()=>{
    $('spinBtn').disabled = !eligible();
  });
});

async function spin(){
  if(!eligible()){ toast('Not ready','Please complete details & meet basket target.'); return; }
  $('spinBtn').disabled = true;

  // Eye-candy spin
  const turns = 4 + Math.random()*2;
  spinDeg += turns*360;
  $('wheel').style.transform = `rotate(${spinDeg}deg)`;

  // Server result
  try{
    const res = await apiPost({
      action:'spin',
      storeId: STORE_ID,
      deviceId: deviceId(),
      name: $('wName').value.trim(),
      surname: $('wSurname').value.trim(),
      email: $('wEmail').value.trim(),
      phone: $('wPhone').value.trim().replace(/\s+/g,''),
      popia: $('wPopia').checked,
      marketing: $('wMarketing').checked,
      orderNumber: $('wOrder').value.trim(),
      basketAmount: Number($('wAmount').value||0),
      cashierPin: $('wPin').value.trim()
    });

    setTimeout(()=> showSpinResult(res), 3300);
  }catch(e){
    setTimeout(()=>{ toast('Network', e.message); $('spinBtn').disabled=false; }, 3300);
  }
}

function showSpinResult(res){
  if(!res || !res.ok){
    let msg = 'Something went wrong.';
    if(res && res.error){
      const map = {
        rate_limit:'Too many attempts — wait a minute.',
        missing_fields:'Please complete all required fields.',
        consent_required:'POPIA + Marketing consent required.',
        bad_pin:'Cashier PIN incorrect.',
        store_not_found:'Store not found.'
      };
      msg = map[res.error] || res.error;
    }
    toast('Oops…', msg);
    $('spinBtn').disabled = false;
    return;
  }
  if(res.result==='Win'){
    toast('🎉 You WON!', `Prize: ${res.prizeName}\nYour code: ${res.prizeCode}\n(We also emailed it to you.)\nShow with your receipt to claim at ${CFG.store.name}.`);
  } else if(res.result==='GrandEntry'){
    toast('🎟️ You’re In!', `You earned an entry into the grand draw.\nConfirmation code: ${res.prizeCode}\n(We also emailed it to you.)`);
  } else {
    toast('So close! 💥', 'Thanks for being a valued Chicken Licken customer.\nYou did not win a prize this time. Try again next visit! 🍗✨');
  }
  setTimeout(()=>{ $('spinBtn').disabled=false; }, 500);
}
