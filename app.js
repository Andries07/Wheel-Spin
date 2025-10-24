/***** 1) CONFIG — paste your Apps Script Web App URL here *****/
const API_URL = 'https://script.google.com/macros/s/AKfycbznV0gUxynfHEVrkfcoc3zipjNeJ3nBuXVepnnUuJgoPzdKewQILzINfiVM7LS1Zyw/exec'; // e.g., https://script.google.com/macros/s/AKfycb.../exec
/**************************************************************/

let CFG = { campaignId:'', stores:[] };
let currentStore = null;
let verifiedForSpin = false;
let spinDeg = 0;

function $(id){ return document.getElementById(id); }
function panel(id){ return document.getElementById('panel-'+id); }

async function apiPost(payload){
  const res = await fetch(API_URL, {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  });
  return await res.json();
}

function deviceId(){
  let v = localStorage.getItem('cl_device_id');
  if(!v){ v='TAB-'+Math.random().toString(36).slice(2,10).toUpperCase(); localStorage.setItem('cl_device_id',v); }
  return v;
}

function showPanel(which){
  $('home').classList.add('hidden');
  ['review','wheel'].forEach(p=>panel(p).classList.add('hidden'));
  panel(which).classList.remove('hidden');
  if(which==='wheel'){ verifiedForSpin=false; $('spinBtn').disabled=true; $('wheelMsg').textContent=''; }
}
function goHome(){ $('home').classList.remove('hidden'); ['review','wheel'].forEach(p=>panel(p).classList.add('hidden')); }

function toast(title, body){
  $('mTitle').innerText = title||'Note';
  $('mBody').innerText = body||'';
  $('modal').classList.remove('hidden');
}
function closeModal(){ $('modal').classList.add('hidden'); }

/** -------- INIT -------- **/
document.addEventListener('DOMContentLoaded', async ()=>{
  try{
    const cfg = await apiPost({action:'getConfig', deviceId: deviceId()});
    if(!cfg.ok){
      toast('Config failed', JSON.stringify(cfg));
      return;
    }
    CFG = cfg;
    const sel = $('storeSelect'); sel.innerHTML='';
    if(!CFG.stores || CFG.stores.length === 0){
      toast('No stores found', 'Check your "Stores" sheet: headers & TRUE in Active column.');
      return;
    }
    CFG.stores.forEach(s=>{
      const opt = document.createElement('option');
      opt.value = s.StoreID; opt.textContent = `${s.StoreName} (Target R${s.QualifyAmount})`;
      sel.appendChild(opt);
    });
    sel.value = CFG.stores[0].StoreID;
    updateStoreHint();
    sel.addEventListener('change', updateStoreHint);
  }catch(e){
    toast('Setup error', String(e));
  }
});


/** -------- REVIEWS -------- **/
async function submitReview(){
  const store = getSelectedStore();
  if(!store){ toast('Pick store','Please select a store first.'); return; }
  const payload = {
    action: 'feedback',
    storeId: store.StoreID,
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
}

/** -------- WHEEL -------- **/
function checkSpinEligibility(){
  const store = getSelectedStore();
  if(!store){ $('wheelMsg').textContent='Pick a store'; return false; }
  const amount = Number($('wAmount').value||0);
  if(amount < Number(store.QualifyAmount||0)){
    $('wheelMsg').textContent = `Basket below store target (R${store.QualifyAmount}).`;
    return false;
  }
  const required = ['wName','wSurname','wEmail','wPhone','wOrder','wAmount','wPin'];
  for(const id of required){ if(!$(id).value.trim()){ $('wheelMsg').textContent='Complete all fields.'; return false; } }
  if(!$('wPopia').checked || !$('wMarketing').checked){
    $('wheelMsg').textContent='POPIA + Marketing consent required.';
    return false;
  }
  $('wheelMsg').textContent='';
  return true;
}

['wName','wSurname','wEmail','wPhone','wOrder','wAmount','wPin','wPopia','wMarketing'].forEach(id=>{
  const el = $(id);
  (el.type==='checkbox' ? 'change' : 'input');
  el.addEventListener(el.type==='checkbox' ? 'change' : 'input', ()=>{
    verifiedForSpin = checkSpinEligibility();
    $('spinBtn').disabled = !verifiedForSpin;
  });
});

async function spin(){
  if(!checkSpinEligibility()){ toast('Not ready','Please complete details & meet basket target.'); return; }
  const store = getSelectedStore();
  $('spinBtn').disabled = true;

  // Eye-candy spin
  const turns = 4 + Math.random()*2;
  spinDeg += turns*360;
  $('wheel').style.transform = `rotate(${spinDeg}deg)`;

  // Server result
  const res = await apiPost({
    action:'spin',
    deviceId: deviceId(),
    storeId: store.StoreID,
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

  setTimeout(()=> showSpinResult(res, store), 3300);
}

function showSpinResult(res, store){
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
    toast('🎉 You WON!', `Prize: ${res.prizeName}\nYour code: ${res.prizeCode}\n(We also emailed it to you.)\nShow with your receipt to claim at ${store.StoreName}.`);
  } else if(res.result==='GrandEntry'){
    toast('🎟️ You’re In!', `You earned an entry into the grand draw.\nConfirmation code: ${res.prizeCode}\n(We also emailed it to you.)`);
  } else {
    toast('So close! 💥', 'Thanks for being a valued Chicken Licken customer.\nYou did not win a prize this time. Try again next visit! 🍗✨');
  }
  setTimeout(()=>{ $('spinBtn').disabled=false; }, 500);
}
