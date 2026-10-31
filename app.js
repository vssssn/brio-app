'use strict';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
let S = null, TF = 'live', seenActs = null, curView = 'home', curMint = null, tokTimer = null, lastBalStr = '';
const COLORS = ['#34F07A','#FF9F0A','#30D5C8','#8E6CFF','#FF453A','#3D8BFF','#FFD60A','#FF6BD6'];
const hash = s => { let h = 0; for (const c of String(s||'?')) h = (h*31 + c.charCodeAt(0))|0; return Math.abs(h); };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const _h = new Map(); function setHTML(el, html){ if (_h.get(el)!==html){ el.innerHTML=html; _h.set(el,html); } }
const ccy = () => (S && S.ccy) || 'EUR';
function money(v, sign=false, dec=2){ if (v==null||isNaN(v)) return '—';
  const s = new Intl.NumberFormat('fr-FR',{style:'currency',currency:ccy(),minimumFractionDigits:dec,maximumFractionDigits:dec}).format(Math.abs(v));
  return (sign ? (v>=0?'+':'−') : (v<0?'−':'')) + s; }
function pct(v, sign=true){ if (v==null||isNaN(v)) return '—'; return (sign&&v>=0?'+':v<0?'−':'') + Math.abs(v).toLocaleString('fr-FR',{maximumFractionDigits: Math.abs(v)>=100?0:2}) + ' %'; }
function sol(v){ return v==null?'—':(v.toLocaleString('fr-FR',{maximumFractionDigits:4})+' SOL'); }
function px(v){ if (v==null) return '—'; if (v===0) return '0'; const a=Math.abs(v);
  if (a>=1) return v.toLocaleString('fr-FR',{maximumFractionDigits:4});
  const z = Math.floor(-Math.log10(a)); return v.toFixed(Math.min(z+4, 14)).replace('.',','); }
function cmoney(v){ if (v==null) return '—'; return new Intl.NumberFormat('fr-FR',{style:'currency',currency:ccy(),notation:'compact',maximumFractionDigits:1}).format(v); }
function compact(v){ if (v==null) return '—'; return new Intl.NumberFormat('fr-FR',{notation:'compact',maximumFractionDigits:1}).format(v); }
function hm(ts){ if(!ts) return ''; return new Date(ts*1000).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
function ago(ts){ if(!ts) return ''; const d = Date.now()/1000 - ts; if (d<60) return Math.max(0,d|0)+' s'; if (d<3600) return (d/60|0)+' min'; if (d<86400) return (d/3600|0)+' h'; return (d/86400|0)+' j'; }
function av(sym, img){ const c = COLORS[hash(sym)%COLORS.length];
  return `<div class="mini-av" style="background:${img?`url('${esc(img)}') center/cover,`:''}${c}">${img?'':esc((sym||'?').slice(0,2))}</div>`; }
const ICON = {
  scan:'<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/></svg>',
  warn:'<svg viewBox="0 0 24 24"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.01"/></svg>',
  bot:'<svg viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 4v4M9 13v1M15 13v1"/></svg>',
  shield:'<svg viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/></svg>',
  up:'<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
  cyc:'<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 0114-5l2 2M20 12a8 8 0 01-14 5l-2-2M20 4v5h-5M4 20v-5h5"/></svg>',
  minus:'<svg viewBox="0 0 24 24"><path d="M6 12h12"/></svg>',
};

/* ---------- rolling balance ---------- */
function renderBalance(v){
  const el = $('#balance');
  if (v == null){ el.innerHTML = '<span class="muted-big">—</span>'; lastBalStr=''; return; }
  const str = money(v);
  if (str === lastBalStr) return;
  const dec = str.search(/,\d\d/);
  if (el.children.length !== str.length || !el.querySelector('.dg')) {
    el.innerHTML = [...str].map((c,i)=>{
      const cls = (dec>=0 && i>dec) ? ' cents' : '';
      return /\d/.test(c) ? `<span class="dg${cls}"><span class="strip">${'0123456789'.split('').map(d=>`<span>${d}</span>`).join('')}</span></span>` : `<span class="ch${cls}">${c===' '||c===' '?'&nbsp;':esc(c)}</span>`;
    }).join('');
    // start from 0 so it rolls in
    requestAnimationFrame(()=>requestAnimationFrame(()=>setDigits(el,str)));
  } else setDigits(el,str);
  lastBalStr = str;
}
function setDigits(el,str){ [...str].forEach((c,i)=>{ const n=el.children[i]; if(!n) return; const s=n.querySelector('.strip'); if(s) s.style.transform=`translateY(-${(+c)*1.05}em)`; }); }

/* ---------- balance chart ---------- */
let lastSeriesKey = '';
function renderChart(){
  const svg = $('#chart'), tags = $('#chart-tags'), empty = $('#chart-empty');
  const W=430,H=190,PT=34,PB=12;
  let ser = (S.series||[]).slice();
  const now = S.server_time;
  const win = {live:1800,'1h':3600,'4h':14400,'1d':86400,'1w':604800,all:1e12}[TF];
  let pts = ser.filter(p=>p.ts >= now-win);
  if (TF==='live' && pts.length<2) pts = ser.slice(-200);
  if (pts.length && pts.length<2) pts = [pts[0], {...pts[0], ts: now}];
  if (pts.length<2){ svg.innerHTML=''; tags.innerHTML=''; empty.textContent = S.start_balance==null ? 'En attente de données — aucun solde trouvé dans les logs ni la config.' : 'En attente des premiers trades…'; return; }
  const noTrades = !(S.markers||[]).length && pts.length<3;
  empty.textContent = noTrades ? 'En attente des premiers trades…' : '';
  const t0=pts[0].ts, t1=Math.max(pts[pts.length-1].ts, t0+1);
  let lo=Math.min(...pts.map(p=>p.v)), hi=Math.max(...pts.map(p=>p.v)); if (hi-lo < 1e-9){ hi+=Math.max(.01,Math.abs(hi)*.01); lo-=Math.max(.01,Math.abs(lo)*.01); }
  { const pad=(hi-lo)*.15; hi+=pad; lo-=pad; }
  const X=t=>(t-t0)/(t1-t0)*W, Y=v=>PT+(1-(v-lo)/(hi-lo))*(H-PT-PB);
  // step-ish smooth path
  let d = '';
  pts.forEach((p,i)=>{ const x=X(p.ts), y=Y(p.v); if(!i) d+=`M${x.toFixed(1)},${y.toFixed(1)}`; else { const pp=pts[i-1], px_=X(pp.ts), py=Y(pp.v); if (Math.abs(y-py)<0.01){ d+=` L${x.toFixed(1)},${y.toFixed(1)}`; return; } const hx=Math.max(px_, x-Math.min(14,(x-px_)*.6)), mx=(hx+x)/2; d+=` L${hx.toFixed(1)},${py.toFixed(1)} C${mx.toFixed(1)},${py.toFixed(1)} ${mx.toFixed(1)},${y.toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`; }});
  const last = pts[pts.length-1], lx=X(last.ts), ly=Y(last.v);
  const key = TF+'|'+pts.length+'|'+t0;
  const redraw = key.split('|')[0]!==lastSeriesKey.split('|')[0] || !lastSeriesKey;
  svg.innerHTML = `<defs><linearGradient id="gf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34F07A" stop-opacity=".35"/><stop offset="1" stop-color="#34F07A" stop-opacity="0"/></linearGradient>
  <clipPath id="clipL"><rect x="0" y="0" width="${redraw?0:W}" height="${H}">${redraw?`<animate attributeName="width" from="0" to="${W}" dur="1.6s" fill="freeze"/>`:''}</rect></clipPath></defs>
  <path d="${d} L${lx},${H} L0,${H} Z" fill="url(#gf)" clip-path="url(#clipL)"/>
  <path d="${d}" class="line" clip-path="url(#clipL)"/>
  <circle cx="${lx}" cy="${ly}" r="4" class="endpulse"/><circle cx="${lx}" cy="${ly}" r="4.5" class="end"/>`;
  lastSeriesKey = key;
  const mk = (S.markers||[]).filter(m=>m.ts>=t0 && m.ts<=t1).slice(-4);
  const rect = svg.getBoundingClientRect(), sx = rect.width/W, sy = rect.height/H;
  setHTML(tags, mk.map(m=>{ const p = pts.reduce((a,b)=>Math.abs(b.ts-m.ts)<Math.abs(a.ts-m.ts)?b:a); 
    return `<div class="tag ${m.pnl>=0?'up':'down'}" style="left:${Math.min(Math.max(X(m.ts)*sx,30),rect.width-30)}px;top:${Y(p.v)*sy}px">${esc(m.symbol||'')} ${money(m.pnl,true)}</div>`; }).join(''));
}

/* ---------- agents ---------- */
function scoreColor(s){ if (s==null) return '#636366'; const h = Math.max(0,Math.min(120, s*1.2)); return `hsl(${h},90%,55%)`; }
function agentCards(){
  const M = S.modules, R = M.risk;
  const sc = M.scanner, an = M.analyst, ex = M.executor;
  const wait = t=>`<div class="a-wait">${t}</div>`;
  const scan = `<div class="agent"><div class="a-h"><div class="a-ic teal">${ICON.scan}</div><div><div class="a-name">Scanner</div><div class="a-sub ${sc.active?'teal':''}"><i class="d"></i>${sc.has_data? compact(sc.pools)+' pools':'en attente'}</div></div></div>
    ${sc.recent.length? sc.recent.map(r=>{ const t = r.passed===true||r.forwarded ? '<span class="rtag g">+ analyst</span>' : r.reasons.length? `<span class="rtag r">${esc(r.reasons[0])}</span>` : r.passed===false?'<span class="rtag r">rejeté</span>':'<span class="rtag n">vu</span>';
      return `<div class="sc-row" data-mint="${esc(r.mint)}"><b>${esc(r.symbol)}</b>${t}</div>`; }).join('') : wait('En attente des premiers pools pump.fun…')}</div>`;
  const L = an.last, sv = L&&L.score!=null ? Math.round(L.score) : null, circ = 2*Math.PI*26;
  const anal = `<div class="agent"><div class="a-h"><div class="a-ic red">${ICON.warn}</div><div><div class="a-name">Analyst</div><div class="a-sub ${an.has_data?'orange':''}"><i class="d"></i>${an.has_data?'Scoring':'en attente'}</div></div></div>
    ${L? `<div class="gauge-row"><div class="gauge"><svg viewBox="0 0 62 62"><circle cx="31" cy="31" r="26" class="g-bg"/><circle cx="31" cy="31" r="26" class="g-fg" stroke="${scoreColor(sv)}" stroke-dasharray="${circ}" stroke-dashoffset="${circ*(1-(sv??0)/100)}"/></svg><b>${sv??'…'}</b></div>
      <div class="g-txt"><b>${esc(L.symbol)}</b><span style="color:${L.passed===true?'var(--green)':L.passed===false?'var(--red)':'var(--sub)'}">${L.passed===true?'passed':L.passed===false?'rejeté':'scoring…'}</span>${an.min_score!=null?`<div style="color:var(--sub2);font-size:10px">seuil ${an.min_score}</div>`:''}</div></div>` : wait('Aucun score pour l’instant.'+(an.min_score!=null?`<br>Seuil config : ${an.min_score}`:''))}</div>`;
  const E = ex.last;
  let bar = '';
  if (E){ const age = S.server_time - (E.ts||0), lat = E.latency_ms;
    if (age*1000 < (lat||1200)+800 && !document.hidden) bar = `<div class="pbar exec" style="--dur:${((lat||1200)/1000).toFixed(2)}s"><div class="fill"></div><span>Executing…</span></div>`;
    else bar = `<div class="pbar done"><span>✓ Filled${lat!=null?' · '+(lat/1000).toLocaleString('fr-FR',{maximumFractionDigits:2})+' s':''}</span></div>`; }
  const exe = `<div class="agent"><div class="a-h"><div class="a-ic purple">${ICON.bot}</div><div><div class="a-name">Executor</div><div class="a-sub ${ex.has_data?'purple':''}"><i class="d"></i>${ex.has_data? ex.trades+' trades':'en attente'}</div></div></div>
    ${E? `<div class="ex-tok" data-mint="${esc(E.mint)}">${av(E.symbol)}${esc(E.symbol||'?')}</div><div class="ex-sub">${E.usd!=null?money(E.usd):sol(E.sol)}${E.stack_pct!=null?' · '+E.stack_pct.toLocaleString('fr-FR',{maximumFractionDigits:1})+' % du stack':''}</div>${bar}` : wait('Aucun ordre exécuté.')}</div>`;
  const X = R.last;
  const st = X ? X.label || (/trail/i.test(X.reason||'') ? 'Trailed out' : X.kind==='stop' || /stop/i.test(X.reason||'') ? 'Stopped' : /take|tp|cap/i.test(X.reason||'') ? 'Take profit' : /time|hold|stale/i.test(X.reason||'') ? 'Timeout' : 'Vendu') : null;
  const risk = `<div class="agent"><div class="a-h"><div class="a-ic orange">${ICON.shield}</div><div><div class="a-name">Risk</div><div class="a-sub ${R.active||R.open?'green':''}"><i class="d"></i>${R.open? 'Guarding · '+R.open+' pos.' : 'Guarding'}</div></div></div>
    ${X? `<div class="rk-st">${st}</div><div class="rk-tok" data-mint="${esc(X.mint)}">${esc(X.symbol||'')} <span style="color:${(X.pnl??0)>=0?'var(--green)':'var(--red)'}">${X.pnl!=null?money(X.pnl,true):pct(X.pct)}</span></div>` : wait('Aucune sortie pour l’instant.')}
    <div class="pills">${R.stop_pct!=null?`<span class="pill r">stop −${R.stop_pct} %</span>`:''}${R.trail_pct!=null?`<span class="pill g">trail ${R.trail_pct} %</span>`:''}</div></div>`;
  return [scan, anal, exe, risk];
}

/* ---------- trades: one row per position (buy + sell grouped) ---------- */
// exit reasons emitted by bot.py (request_exit / request_partial_exit) -> plain French
const REASON_FR = {
  stop_loss:'Stop loss touché', trailing_stop:'Stop suiveur déclenché', take_profit_cap:'Objectif de gain atteint', max_hold:'Durée max atteinte',
  stale_no_trades:'Plus aucune transaction sur le token', migrated:'Token migré (fin de la courbe pump.fun)',
  rug_shield_whale_dump:'Sortie anti-rug (gros vendeur)', rug_shield_dev_sell:'Sortie anti-rug (le dev vend)',
  rug_shield_bundle_sell:'Sortie anti-rug (un bundle vend)', rug_shield_dev_new_launch:'Sortie anti-rug (le dev lance un autre token)',
  rugger_dump_trigger:'Rugger : vente sur gros achat', rugger_hard_stop:'Rugger : stop loss touché', rugger_tp_100:'Rugger : objectif +100 % atteint',
  rugger_trail_after_tp:'Rugger : stop suiveur après objectif', rugger_max_hold:'Rugger : durée max atteinte', rugger_stale_no_trades:'Rugger : plus aucune transaction',
  copy_leader_sell:'Copie : le leader a vendu', copy_multi_leader_sell:'Copie : plusieurs leaders ont vendu', copy_leader_partial_sell:'Copie : le leader a vendu une partie',
  copy_hard_stop:'Copie : stop loss touché', copy_max_hold:'Copie : durée max atteinte', copy_stale_no_trades:'Copie : plus aucune transaction',
  // labels already translated by older snapshots
  'Stopped':'Stop loss touché', 'Trailed out':'Stop suiveur déclenché', 'Take profit':'Objectif de gain atteint', 'Max hold':'Durée max atteinte', 'Sans trades':'Plus aucune transaction sur le token', 'Migré':'Token migré (fin de la courbe pump.fun)',
};
function reasonFr(r){ if (!r) return ''; return REASON_FR[r] || String(r).replace(/_/g,' '); }
function dur(s){ if (s==null||isNaN(s)) return '—'; s=Math.max(0,s);
  if (s<60) return (s<10 ? s.toLocaleString('fr-FR',{maximumFractionDigits:1}) : Math.round(s))+' s';
  if (s<3600){ const m=Math.floor(s/60), r=Math.floor(s%60); return m+' min'+(r?' '+String(r).padStart(2,'0')+' s':''); }
  const h=Math.floor(s/3600), m=Math.floor(s%3600/60); return h+' h '+String(m).padStart(2,'0'); }
const nowS = () => Math.max(Date.now()/1000, S?.server_time||0);
function modeChip(t){ const md = t.md||'normal'; return `<span class="mode ${esc(md)}">${md==='copy' ? 'copy'+(t.ld?' · '+esc(t.ld):'') : esc(md)}</span>`; }
function stBadge(t){
  const b = t.st==='open' ? (t.x ? '<span class="st exit">SORTIE…</span>' : '<span class="st open"><i></i>EN COURS</span>')
          : t.st==='closed' ? '<span class="st closed">FERMÉE</span>' : '<span class="st unk">INCONNUE</span>';
  return b + (t.pt?.length ? '<span class="st part">PARTIELLE</span>' : ''); }
// older relay snapshots have no `trades`: rebuild them from the buy (o:Pxxxxx) / sell (c:Pxxxxx) activity rows
function deriveTrades(){
  const G = new Map(), openM = new Set((S.positions||[]).map(p=>p.mint));
  for (const a of [...(S.activity||[])].sort((x,y)=>(x.ts||0)-(y.ts||0))){
    const m = /^([oc]):(.+)$/.exec(a.id||''); const id = m ? m[2] : a.id;
    let g = G.get(id); if (!g){ g = {id, s:a.symbol, m:a.mint, md:'normal', st:'unknown'}; G.set(id, g); }
    if (a.kind==='buy'){ g.o=a.ts; g.sz=a.usd; if (g.st==='unknown') g.st='buy'; }
    else Object.assign(g, {st:'closed', c:a.ts, pnl:a.pnl, pct:a.pct, r:a.reason, h: g.o ? a.ts-g.o : null});
  }
  for (const g of G.values()) if (g.st==='buy') g.st = openM.has(g.m) ? 'open' : 'unknown';
  for (const p of S.positions||[]){ let g = [...G.values()].find(x=>x.m===p.mint && x.st==='open');
    if (!g){ g = {id:'pos:'+p.mint, s:p.symbol, m:p.mint, md:'normal', st:'open', o:p.entry_ts, sz:p.usd}; G.set(g.id, g); }
    Object.assign(g, {upnl:p.upnl, upct:p.pct, v:p.value}); }
  return [...G.values()];
}
function sortTrades(T){ return T.sort((a,b)=> (b.st==='open')-(a.st==='open') || ((b.st==='open'?b.o:(b.c||b.o))||0) - ((a.st==='open'?a.o:(a.c||a.o))||0)); }
function getTrades(){
  const T = Array.isArray(S.trades) ? S.trades.map(t=>({...t})) : deriveTrades();
  const buys = new Map((S.activity||[]).filter(a=>a.kind==='buy').map(a=>[String(a.id).replace(/^o:/,''), a]));
  for (const t of T){ const b = buys.get(t.id); if (b && b.stack_pct!=null) t.stack = b.stack_pct; }
  return sortTrades(T);
}
const sign = v => (v??0)>=0 ? 'up' : 'down';
function tradeRow(t, isNew){
  const open = t.st==='open', img = S.tokens?.[t.m]?.image;
  const badge = open ? `<div class="badge buy">${ICON.up}</div>` : t.st==='closed' ? ((t.pnl??t.pct??0)>=0 ? `<div class="badge sell">${ICON.cyc}</div>` : `<div class="badge stop">${ICON.minus}</div>`) : '';
  const stake = t.sz!=null ? `<div class="r-p">sur ${money(t.sz)}</div>` : '';
  let sub, why = '', right;
  if (open){
    sub = `${modeChip(t)} · depuis ${hm(t.o)} (<span data-since="${t.o||''}">${dur(nowS()-(t.o||nowS()))}</span>)`;
    if (t.pt?.length) why = `<div class="r-why">${t.pt.length} vente(s) partielle(s)${t.rp!=null?' · réalisé <b>'+money(t.rp,true)+'</b>':''}</div>`;
    right = t.upnl!=null ? `<div class="r-a ${sign(t.upnl)}">${money(t.upnl,true)}</div><div class="r-p">${pct(t.upct)} latent</div>${stake}` : `<div class="r-a">—</div><div class="r-p">latent n/d</div>${stake}`;
  } else {
    sub = `${modeChip(t)} · ${hm(t.o)}${t.c?' → '+hm(t.c):''}${t.h!=null?' ('+dur(t.h)+')':''}`;
    const parts = t.pt?.length ? ` · dont ${t.pt.length} vente(s) partielle(s)` : '';
    why = t.st==='closed' ? `<div class="r-why">${t.r?'<b>'+esc(reasonFr(t.r))+'</b>':'Sortie'}${parts}</div>` : `<div class="r-why">Statut inconnu (bot redémarré pendant la position ?)</div>`;
    right = t.st==='closed' ? `<div class="r-a ${sign(t.pnl??t.pct)}">${t.pnl!=null?money(t.pnl,true):pct(t.pct)}</div><div class="r-p">${t.pnl!=null?pct(t.pct):''}</div>${stake}` : `<div class="r-a">—</div>${stake}`;
  }
  return `<div class="row trow ${open?'open':'closed'}${isNew?' new':''}" data-mint="${esc(t.m)}"><div class="r-ic">${av(t.s,img)}${badge}</div><div class="r-mid"><div class="r-t">${esc(t.s||(t.m||'?').slice(0,6))}${stBadge(t)}</div><div class="r-s">${sub}</div>${why}</div><div class="r-right">${right}</div></div>`;
}
let AF = 'all', seenTrades = null;
function renderActivity(){
  const acts = S.activity||[], T = getTrades();
  const first = seenActs===null; const prev = seenActs||new Set();
  const key = t => t.id+':'+t.st;
  const pt = seenTrades||new Set();
  const empty = `<div class="empty"><b>Aucune activité</b>${S.files.length||S.files_n? 'Le bot n’a encore ouvert aucune position.' : 'En attente des données du bot…'}</div>`;
  const html = (list, el) => setHTML(el, list.length ? list.map(t=>tradeRow(t, seenTrades!==null && !pt.has(key(t)))).join('') : empty);
  html(T.slice(0,8), $('#activity'));
  const F = AF==='open' ? T.filter(t=>t.st==='open') : AF==='closed' ? T.filter(t=>t.st!=='open') : T;
  html(F, $('#activity-full'));
  const cl = T.filter(t=>t.st==='closed'), no = T.filter(t=>t.st==='open').length, rp = cl.reduce((a,t)=>a+(t.pnl||0),0);
  $('#act-summary').innerHTML = T.length ? `${no} en cours · ${cl.length} fermée(s)${cl.length?` · P&L réalisé <span style="color:${rp>=0?'var(--green)':'var(--red)'}">${money(rp,true)}</span>`:''}` : '';
  seenTrades = new Set(T.map(key));
  // notification on new sells / buys
  if (!first){ const ns = acts.filter(a=>a.kind!=='buy' && !prev.has(a.id)); if (ns.length) notify(ns[0]);
    const nb = acts.find(a=>a.kind==='buy' && !prev.has(a.id)); if (!ns.length && nb) notify(nb); }
  seenActs = new Set(acts.map(a=>a.id));
}
$('#act-filter').addEventListener('click', e=>{ const b=e.target.closest('button'); if(!b) return; AF=b.dataset.f; $$('#act-filter button').forEach(x=>x.classList.toggle('on',x===b)); if (S) renderActivity(); });
setInterval(()=>{ const n=nowS(); $$('[data-since]').forEach(el=>{ const t=+el.dataset.since; if (t) el.textContent = dur(n-t); }); }, 1000);
let nT=null;
function notify(a){
  const t = a.kind==='buy' ? `Position ouverte ${a.symbol} • ${a.usd!=null?money(a.usd):sol(a.sol)}` : `Fermée ${a.symbol} • ${a.pnl!=null?money(a.pnl,true):''} (${pct(a.pct)})${a.reason?' · '+reasonFr(a.reason):''}`;
  $('#notif-text').textContent = t; const n=$('#notif'); n.classList.add('show'); clearTimeout(nT); nT=setTimeout(()=>n.classList.remove('show'),4200);
  if (a.kind!=='buy' && (a.pnl??a.pct??0)>0) confetti(60);
}
function confetti(n=90){ const c=$('#confetti'); for(let i=0;i<n;i++){ const d=document.createElement('i'); d.className='cf'; d.style.left=Math.random()*100+'%'; d.style.background=COLORS[i%COLORS.length]; d.style.animationDuration=(1.8+Math.random()*1.8)+'s'; d.style.animationDelay=(Math.random()*.5)+'s'; d.style.transform=`rotate(${Math.random()*360}deg)`; c.appendChild(d); setTimeout(()=>d.remove(),4500);} }

/* ---------- positions / account ---------- */
function renderPositions(){
  const P = getTrades().filter(t=>t.st==='open');
  const c = $('#pos-count'); c.textContent = P.length; c.classList.toggle('on', P.length>0);
  const up = P.reduce((a,t)=>a+(t.upnl||0),0), known = P.some(t=>t.upnl!=null);
  $('#pos-note').innerHTML = P.length && known ? `latent <span style="color:${up>=0?'var(--green)':'var(--red)'}">${money(up,true)}</span>` : '';
  const k = (a,b)=>`<div><div class="k">${a}</div><div class="v">${b}</div></div>`;
  setHTML($('#positions'), P.length ? P.map(t=>`<div class="pos-card" data-mint="${esc(t.m)}">
    <div class="pc-top"><div class="r-ic">${av(t.s, S.tokens?.[t.m]?.image)}<div class="badge buy">${ICON.up}</div></div>
      <div class="r-mid"><div class="r-t">${esc(t.s||(t.m||'?').slice(0,6))}${stBadge(t)}</div><div class="r-s">${modeChip(t)} · entrée ${hm(t.o)}</div></div>
      <div class="r-right">${t.upnl!=null?`<div class="r-a ${sign(t.upnl)}">${money(t.upnl,true)}</div><div class="r-p" style="color:${(t.upct??0)>=0?'var(--green)':'var(--red)'}">${pct(t.upct)}</div>`:`<div class="r-a">—</div><div class="r-p">P&L latent n/d</div>`}</div></div>
    <div class="pc-grid">${k('Mise', t.sz!=null?money(t.sz):'—')}${k('Valeur actuelle', t.v!=null?money(t.v):'—')}${k('Durée', `<span data-since="${t.o||''}">${dur(nowS()-(t.o||nowS()))}</span>`)}</div>
    ${t.pt?.length?`<div class="r-why" style="margin-top:8px">${t.pt.length} vente(s) partielle(s)${t.rp!=null?' · réalisé <b>'+money(t.rp,true)+'</b>':''}</div>`:''}</div>`).join('')
    : `<div class="empty" style="padding:14px"><b style="margin:0">Aucune position ouverte</b></div>`);
}
function renderAccount(){
  const c = S.config||{};
  const kv = (rows)=>`<div class="kv">${rows.map(([k,v])=>`<div><span>${k}</span><b>${v}</b></div>`).join('')}</div>`;
  $('#account').innerHTML = `<div class="kv-h">Portefeuille simulé</div>`+kv([['Mode',esc(S.mode||'—')],['Solde de départ',money(S.start_balance)],['Solde actuel',money(S.balance)],['P&L réalisé',money(S.realized,true)],['P&L latent',money(S.unrealized,true)],['Source du solde',esc(S.series_src||'—')],['SOL → '+ccy(), S.sol_fx!=null?money(S.sol_fx):'— (pas encore logué)']])
   + `<div class="kv-h">Seuils Risk (config)</div>`+kv([['Stop dur','−'+(S.modules.risk.stop_pct??'—')+' %'],['Trailing (distance)',(S.modules.risk.trail_pct??'—')+' %'],['Activation trailing','+'+(S.modules.risk.trail_act??'—')+' %'],['Take profit cap','+'+(S.modules.risk.tp_pct??'—')+' %'],['Durée max',(S.modules.risk.max_hold_s??'—')+' s'],['Score analyst min',S.modules.analyst.min_score??'—'],['Taille position',(S.size_pct??'—')+' % du stack']])
   + `<div class="kv-h">Relais</div>`+kv([['Transport',esc(R.via||'—')],['Dernière donnée',S.server_time?hm(S.server_time)+' · il y a '+ago(S.server_time):'—'],['Chiffrement','AES-256-GCM · PBKDF2-SHA256']])
   + `<div class="kv-h">Fichiers lus</div>`+kv(S.files.length? S.files.map(f=>[esc(f.name), f.rows+' lignes · '+hm(f.mtime)]) : [['Fichiers', S.files_n? S.files_n+' fichier(s)' : 'aucun pour l’instant']])
   + `<div class="foot">Lecture seule — le dashboard ne modifie jamais le bot.<br><br><a id="forget" style="color:var(--red);text-decoration:none;font-size:14px;cursor:pointer">Oublier le code sur cet appareil</a></div>`;
  $('#forget').onclick = ()=>{ if (confirm('Oublier le code d’accès sur cet appareil ?')) { localStorage.removeItem(LS_CODE); localStorage.removeItem(LS_LAST); location.reload(); } };
}

/* ---------- main render ---------- */
function render(){
  if (!S) return;
  const live = String(S.mode||'').toLowerCase()==='live';
  $$('.sim').forEach(e=>{ e.textContent = live ? 'LIVE' : 'SIMULATION'; e.style.color = live?'var(--red)':''; e.style.borderColor = live?'var(--red)':''; });
  renderBalance(S.balance);
  const sb = S.start_balance, b = S.balance;
  if (b!=null && sb){ const d=S.pnl_abs??(b-sb), p=S.pnl_pct??(d/sb*100), cls=d>0?'up':d<0?'down':'flat';
    $('#pnl').className='pnl '+cls; $('#pnl').textContent = `${d>=0?'▲':'▼'} ${money(d,true)} (${pct(p)})`;
    const m=$('#mult'); m.classList.remove('hidden'); m.classList.toggle('down', b<sb); m.querySelector('b').textContent = (S.mult??(b/sb)).toLocaleString('fr-FR',{maximumFractionDigits:2})+'x';
  } else { $('#pnl').textContent=''; $('#mult').classList.add('hidden'); }
  $('#bal-sub').innerHTML = b==null ? 'En attente de données du bot…' : (S.schema==='v1' ? `${S.alive?'<span style="color:var(--green)">● bot actif</span>':'<span style="color:var(--red)">● bot arrêté</span>'} · départ ${money(sb)} · ${S.counts.closed} trade(s) clôturé(s)${S.sol_fx?` · 1 SOL = ${money(S.sol_fx)}`:''}` : (S.counts.trades ? `Départ ${money(sb)} · ${S.counts.closed} trade(s) clôturé(s)` : `Solde de départ (config) · en attente des premiers trades`));
  renderChart();
  const cards = agentCards();
  setHTML($('#agents'), cards.join('')); setHTML($('#agents-full'), cards.join(''));
  const n = ['scanner','analyst','executor','risk'].filter(k=>S.modules[k].active).length;
  $('#running').textContent = `${n} running`; $('#running2').textContent = `${n} running`;
  renderPositions(); renderActivity(); if (curView==='account') renderAccount();
  $('#foot').innerHTML = `Données du ${hm(S.server_time)} · ${S.files_n??S.files.length} fichier(s) · ${S.counts.events} évènement(s)<br>Paper trading — aucun fonds réel engagé`;
  renderDecisions();
  if (curView==='token') loadToken(curMint, false);
}
$('#agents').addEventListener('scroll', e=>{ const el=e.target, i=Math.round(el.scrollLeft/(188)); $$('#agent-dots i').forEach((d,j)=>d.classList.toggle('on', j===Math.min(3,i))); });
$('#tf').addEventListener('click', e=>{ const b=e.target.closest('button'); if(!b) return; TF=b.dataset.tf; $$('#tf button').forEach(x=>x.classList.toggle('on',x===b)); lastSeriesKey=''; renderChart(); });
function go(v){ curView=v; $$('.view').forEach(x=>x.classList.toggle('active', x.id==='view-'+v)); $$('.tabbar a').forEach(a=>a.classList.toggle('on', a.dataset.go===v)); if(v==='account') renderAccount(); if (v!=='token'){ clearInterval(tokTimer); curMint=null; } window.scrollTo(0,0); }
document.addEventListener('click', e=>{ const g=e.target.closest('[data-go]'); if(g){ go(g.dataset.go); return; }
  const m=e.target.closest('[data-mint]'); if(m && m.dataset.mint && m.dataset.mint!=='null'){ openToken(m.dataset.mint); } });
$('#back').onclick = ()=>go('home');

/* ---------- token detail ---------- */
function openToken(mint){ curMint=mint; go('token'); curMint=mint; $('#token').innerHTML='<div class="empty">Chargement…</div>'; loadToken(mint, true); clearInterval(tokTimer); }
let tokConfettiDone = {};
async function loadToken(mint, first){
  if (!mint) return; const T = tokenFromRelay(mint); if (mint!==curMint) return;
  const md = T.meta||{}, sym = md.symbol || T.position?.symbol || T.closed?.symbol || mint.slice(0,6);
  const ticks = T.ticks||[]; const last = ticks.length? ticks[ticks.length-1].p : null;
  const entry = T.position?.entry_price ?? T.closed?.entry_price ?? null;
  const ref = T.closed ? T.closed.exit_price : last;
  const chg = entry && ref ? (ref/entry-1)*100 : null;
  const sinceBuy = T.position?.entry_ts || T.buy?.ts;
  // trailing stop line = peak since entry * (1 - trail)
  let peak = null; if (entry) for (const t of ticks) if (!sinceBuy || t.ts>=sinceBuy) peak = Math.max(peak??0, t.h??t.p);
  const trail = T.trail_pct, stopP = T.stop_pct;
  let stopPrice = null, stopLabel = 'Risk trailing stop';
  const lastStop = [...ticks].reverse().find(t=>t.stop!=null);
  if (lastStop){ stopPrice = lastStop.stop; stopLabel = lastStop.trail===false ? 'Risk stop loss' : 'Risk trailing stop'; }
  else if (entry && peak && trail!=null && S?.modules?.risk?.trail_act!=null && (peak/entry-1)*100 >= S.modules.risk.trail_act) stopPrice = peak*(1-trail/100);
  else if (entry && stopP!=null){ stopPrice = entry*(1-stopP/100); stopLabel='Risk stop loss'; }
  const closedUp = T.closed && (T.closed.pnl ?? T.closed.pct ?? 0) > 0;
  const g = (k,v)=>`<div><div class="k">${k}</div><div class="v">${v}</div></div>`;
  $('#token').innerHTML = `<div class="tk-h">${av(sym, md.image)}<div><div class="tk-name">${esc(md.name||sym)}</div><div class="tk-meta">${esc(sym)} • Solana${md.created? ' • '+ago(md.created): md.first_ts?' • vu il y a '+ago(md.first_ts):''}</div></div></div>
   <div class="tk-price">${px(ref)} <span style="font-size:20px;color:var(--sub)">${T.ccy==='EUR'?'€':''}</span></div><div class="tk-chg" style="color:${(chg??0)>=0?'var(--green)':'var(--red)'}">${chg!=null?(chg>=0?'▲ ':'▼ ')+pct(chg)+' depuis l’entrée':'<span style="color:var(--sub)">—</span>'}</div>
   ${T.closed? (closedUp? `<div class="success"><div style="font-size:30px">🎉</div><div><div class="big">${T.closed.pnl!=null?money(T.closed.pnl,true):pct(T.closed.pct)}</div><div class="c-s" style="color:var(--sub)">Position fermée en profit · ${esc(reasonFr(T.closed.reason))} · ${pct(T.closed.pct)}</div></div></div>` : `<div class="fail"><b style="color:var(--red)">${T.closed.pnl!=null?money(T.closed.pnl,true):pct(T.closed.pct)}</b> <span style="color:var(--sub);font-size:13px">· fermée${T.closed.reason?' · '+esc(reasonFr(T.closed.reason)):''}</span></div>`) : ''}
   <div class="candles">${candleSVG(ticks, entry, stopPrice, stopLabel)}</div>
   <div class="grid4">${g('Market cap'+(md.mcap_note?' <small style="color:#555">(calc.)</small>':''), cmoney(md.mcap))}${g('Liquidité', cmoney(md.liquidity))}${g('Holders', md.holders!=null?compact(md.holders):'—')}${g('Volume 24h', md.volume!=null?compact(md.volume):'—')}</div>
   ${T.position? `<div class="card"><div class="a-ic purple">${ICON.bot}</div><div class="c-mid"><div class="c-t">Ta position</div><div class="c-s">${T.position.usd!=null?money(T.position.usd):sol(T.position.sol)} · Executor</div></div><div class="c-r"><b>${T.position.value!=null?money(T.position.value):'—'}</b><span style="color:${(T.position.upnl??0)>=0?'var(--green)':'var(--red)'};font-size:13px">${T.position.upnl!=null?money(T.position.upnl,true):''}</span></div></div>`
     : T.closed? `<div class="card"><div class="a-ic purple">${ICON.bot}</div><div class="c-mid"><div class="c-t">Ta position (fermée)</div><div class="c-s">${T.closed.cost!=null?money(T.closed.cost):''} · Executor → Risk</div></div><div class="c-r"><b style="color:${closedUp?'var(--green)':'var(--red)'}">${T.closed.pnl!=null?money(T.closed.pnl,true):'—'}</b></div></div>` : ''}
   <div class="card"><div class="a-ic orange">${ICON.shield}</div><div class="c-mid"><div class="c-t">Risk · ${stopLabel==='Risk stop loss'?'stop loss':'trailing stop'}</div><div class="c-s">${trail!=null?`sortie si −${trail} % depuis le sommet${T.trail_act!=null?` (actif après +${T.trail_act} %)`:''}`:''}${stopP!=null?` · stop dur −${stopP} %`:''}</div></div><div class="c-r"><b style="color:var(--orange);font-size:14px">${px(stopPrice)}</b></div></div>
   ${!ticks.length?'<div class="empty">Aucun tick de prix enregistré pour ce token.</div>':''}`;
  if (first && closedUp && !tokConfettiDone[mint]){ tokConfettiDone[mint]=1; confetti(110); }
}
function candleSVG(ticks, entry, stopPrice, stopLabel){
  const W=430,H=260,VH=50,PT=14;
  if (ticks.length<2) return '';
  const N = ticks.length<=48 ? ticks.length : Math.min(60, Math.ceil(ticks.length/3));
  const t0=ticks[0].ts, t1=ticks[ticks.length-1].ts+1e-6, bw=(t1-t0)/N;
  const C=[]; for (const [k,t] of ticks.entries()){ const i= ticks.length<=48 ? k : Math.min(N-1, Math.floor((t.ts-t0)/bw)); const o=t.o??t.p, h=t.h??t.p, l=t.l??t.p, c=t.c??t.p;
    if(!C[i]) C[i]={o,h,l,c,v:0,c0:o}; else { C[i].h=Math.max(C[i].h,h); C[i].l=Math.min(C[i].l,l); C[i].c=c; } C[i].v += t.vol||0; }
  const cs=[]; let prev=null; for(let i=0;i<N;i++){ if(C[i]){ if(prev && C[i].o===C[i].c0) C[i].o = prev.c; C[i].h=Math.max(C[i].h,C[i].o); C[i].l=Math.min(C[i].l,C[i].o); cs.push({...C[i],i}); prev=C[i]; } }
  const all = cs.flatMap(c=>[c.h,c.l]).concat([entry,stopPrice].filter(x=>x!=null));
  let lo=Math.min(...all), hi=Math.max(...all); if(hi===lo){hi*=1.01;lo*=.99;}
  const Y=v=>PT+(1-(v-lo)/(hi-lo))*(H-VH-PT-10), cw=W/N, vmax=Math.max(...cs.map(c=>c.v))||0;
  let s = cs.map(c=>{ const up=c.c>=c.o, col=up?'#34F07A':'#FF453A', x=c.i*cw+cw/2;
    return `<line x1="${x}" x2="${x}" y1="${Y(c.h)}" y2="${Y(c.l)}" stroke="${col}" stroke-width="1"/><rect x="${x-cw*.32}" y="${Math.min(Y(c.o),Y(c.c))}" width="${cw*.64}" height="${Math.max(1.5,Math.abs(Y(c.o)-Y(c.c)))}" fill="${col}" stroke="none" rx="1"/>`
     + (vmax? `<rect x="${x-cw*.32}" y="${H-(c.v/vmax)*VH}" width="${cw*.64}" height="${(c.v/vmax)*VH}" fill="${col}" opacity=".35" stroke="none"/>`:''); }).join('');
  const hline=(v,col,lab,below)=>v==null?'':`<line x1="0" x2="${W}" y1="${Y(v)}" y2="${Y(v)}" stroke="${col}" stroke-width="1.2" stroke-dasharray="2 4"/><rect x="${below?W-96:6}" y="${Y(v)+(below?4:-18)}" width="90" height="14" rx="4" fill="${col}" opacity=".9" stroke="none"/><text x="${below?W-51:51}" y="${Y(v)+(below?14:-8)}" fill="#000" font-size="9" font-weight="700" text-anchor="middle" stroke="none">${lab}</text>`;
  const lc=cs[cs.length-1];
  s += hline(entry,'#34F07A','Executor buy',true) + hline(stopPrice,'#FF453A',stopLabel,false)
    + `<rect x="${W-62}" y="${Y(lc.c)-8}" width="58" height="16" rx="4" fill="#34F07A" stroke="none"/><text x="${W-33}" y="${Y(lc.c)+4}" fill="#000" font-size="9" font-weight="700" text-anchor="middle" stroke="none">${px(lc.c).slice(0,9)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${s}</svg>`;
}

/* ---------- decisions (scanner activity) ---------- */
function renderDecisions(){
  const el = $('#decisions'); if (!el) return;
  const D = S.decisions||[], sc = S.scan||{};
  $('#dec-note').textContent = sc.pools!=null ? `${compact(sc.pools)} pools · ${compact(sc.tokens_tracked)} suivis · ${compact(sc.rugs)} rugs` : '';
  setHTML(el, D.length ? D.map(d=>{ const ok=d.result==='buy', exp=d.result==='expired';
    const tag = ok?'<span class="rtag g">buy</span>':exp?'<span class="rtag n">expiré</span>':`<span class="rtag r">${esc(d.reason||d.module||'rejeté')}</span>`;
    return `<div class="row" data-mint="${esc(d.mint)}"><div class="r-ic">${av(d.symbol)}</div><div class="r-mid"><div class="r-t">${esc(d.symbol)}</div><div class="r-s">${esc(d.module||'')}${d.mode&&d.mode!=='normal'?' · '+esc(d.mode):''} · ${hm(d.ts)}</div></div><div class="r-right">${tag}${d.score!=null?`<div class="r-p">score ${Math.round(d.score)}</div>`:''}</div></div>`; }).join('')
    : '<div class="empty"><b>Aucune décision</b>Le scanner n’a encore évalué aucun token.</div>');
}

/* ---------- token detail from relay cache ---------- */
function tokenFromRelay(mint){
  const T0 = (R.live?.tok||{})[mint] || (R.hist?.tok||{})[mint];
  if (T0) return {...T0, ticks:(T0.t||[]).map(([ts,p,stop,tr])=>({ts,p,stop,trail:!!tr}))};
  const pos = (S.positions||[]).find(p=>p.mint===mint), act = (S.activity||[]).find(a=>a.mint===mint), dec=(S.decisions||[]).find(d=>d.mint===mint);
  const cl = act && act.kind!=='buy' ? {pnl:act.pnl, pct:act.pct, reason:act.reason, symbol:act.symbol} : null;
  return {mint, meta:{symbol:pos?.symbol||act?.symbol||dec?.symbol||mint.slice(0,6), name:pos?.name}, ticks:[], position: pos?{...pos}:null, closed: pos?null:cl,
          stop_pct:S.modules?.risk?.stop_pct, trail_pct:S.modules?.risk?.trail_pct, trail_act:S.modules?.risk?.trail_act, ccy:'EUR'};
}

/* ---------- relay transport (encrypted snapshots, see relay.js) ---------- */
const LS_CODE='brio.code', LS_LAST='brio.last';
const R = {live:null, hist:null, via:null, rxAt:0, conn:'init', key:null};
function mergeById(a,b){ const m=new Map(); for (const x of [...(b||[]),...(a||[])]) if (x && !m.has(x.id)) m.set(x.id,x); return [...m.values()].sort((x,y)=>(y.ts||0)-(x.ts||0)); }
function mergeTrades(L, H){ if (!Array.isArray(L) && !Array.isArray(H)) return null;
  const m = new Map(); for (const t of (L||[])) m.set(t.id, t);
  for (const t of (H||[])) if (!m.has(t.id) && (t.st!=='open' || !Array.isArray(L))) m.set(t.id, t);
  return [...m.values()]; }
function compose(){
  const L = R.live; if (!L) return;
  const pts = new Map(); for (const [ts,v] of [...(R.hist?.series||[]), ...(L.series||[])]) pts.set(ts, v);
  const series = [...pts.entries()].sort((a,b)=>a[0]-b[0]).map(([ts,v])=>({ts,v}));
  const mk = new Map(); for (const m of [...(R.hist?.markers||[]), ...(L.markers||[])]) mk.set(m.id||m.ts, m);
  S = {...L, series, markers:[...mk.values()].sort((a,b)=>a.ts-b.ts), activity: mergeById(L.activity, R.hist?.activity), trades: mergeTrades(L.trades, R.hist?.trades),
       files: R.hist?.files||[], tokens:{}, config:{}, data_dir:'', data_dir_exists:true};
  render(); tickStatus();
}
function saveLast(kind, raw){ try { const o = JSON.parse(localStorage.getItem(LS_LAST)||'{}'); o[kind]=raw; localStorage.setItem(LS_LAST, JSON.stringify(o)); } catch(e){} }
function onData(kind, obj, via, raw){
  if (kind==='L' || kind==='F'){ if (R.live && (obj.server_time||0) <= (R.live.server_time||0)) return; R.live = obj; }
  else if (kind==='H'){ if (R.hist && (obj.server_time||0) < (R.hist.server_time||0)) return; R.hist = obj; }
  if (via !== 'cache'){ R.via = via==='mqtt' ? 'MQTT (live)' : 'ntfy (secours)'; R.rxAt = Date.now(); saveLast(kind==='F'?'L':kind, raw); unlockOk(); }
  compose();
}
function tickStatus(){
  const el = $('#relay'); if (!el) return;
  const cfg = window.BRIO_CFG, now = Date.now()/1000, age = S?.server_time ? Math.max(0, now - S.server_time) : null;
  const a = age==null ? '' : age<60 ? `${age|0} s` : age<3600 ? `${(age/60)|0} min` : age<86400 ? `${(age/3600)|0} h` : `${(age/86400)|0} j`;
  let cls, txt;
  if (age==null){ cls='wait'; txt = R.conn==='mqtt-up' ? 'Connecté · en attente des données…' : 'Connexion au relais…'; }
  else if (!navigator.onLine){ cls='off'; txt=`Hors ligne · dernières données il y a ${a}`; }
  else if (age < cfg.staleAfter){ cls='live'; txt=`Live · mis à jour il y a ${a}`; }
  else if (age < cfg.offlineAfter){ cls='stale'; txt=`En retard · mis à jour il y a ${a}`; }
  else { cls='off'; txt=`Données figées · dernière mise à jour il y a ${a}`+(R.conn==='mqtt-up'?' (bot ou relais arrêté ?)':' (relais injoignable)'); }
  el.className = 'relay '+cls; el.innerHTML = `<i></i>${txt}`;
  if (cls==='off' && S){ const sp = $('#bal-sub span'); if (sp && !sp.dataset.stale){ sp.dataset.stale='1'; sp.style.color='var(--sub)'; sp.textContent='● état du bot inconnu'; } }
  document.body.classList.toggle('is-stale', cls==='off');
}
setInterval(tickStatus, 1000);

/* ---------- lock screen ---------- */
let unlockPending = null;
function showLock(msg){ $('#lock').classList.remove('hidden'); $('#lock-err').textContent = msg||''; $('#lock-btn').disabled=false; $('#lock-btn').textContent='Déverrouiller'; setTimeout(()=>$('#lock-code').focus(),50); }
function hideLock(){ $('#lock').classList.add('hidden'); }
function unlockOk(){ if (unlockPending){ localStorage.setItem(LS_CODE, unlockPending); unlockPending=null; hideLock(); } }
function wrongKey(){
  Relay.stop(); R.live=R.hist=null; S=null; localStorage.removeItem(LS_LAST);
  const had = !!localStorage.getItem(LS_CODE) && !unlockPending; localStorage.removeItem(LS_CODE); unlockPending=null;
  $('#lock-code').value=''; showLock(had ? 'Le code a changé — entre le nouveau code.' : 'Code incorrect.');
}
async function unlock(code, fromStorage){
  $('#lock-btn').disabled=true; $('#lock-btn').textContent='Déverrouillage…'; $('#lock-err').textContent='';
  try {
    R.key = await Relay.deriveKey(code);
    // instant start from the last snapshot cached on this device (also validates the code offline)
    const last = JSON.parse(localStorage.getItem(LS_LAST)||'{}');
    for (const k of ['H','L']) if (last[k]) { let r = null; try { r = await Relay.open(last[k], R.key); } catch(e){ return wrongKey(); }
      if (r) { onData(r.kind, r.obj, 'cache'); if (!fromStorage){ unlockPending=code; unlockOk(); } } }
    if (!fromStorage) unlockPending = code; else hideLock();
    Relay.start(R.key, {data:onData, wrong:wrongKey, status:s=>{ R.conn=s; tickStatus(); }});
    if (!fromStorage) setTimeout(()=>{ if (unlockPending===code){ // relay silent: keep the code, show offline state; a later bad decrypt re-locks
      unlockOk(); } }, 15000);
  } catch(e){ showLock('Erreur de chiffrement sur cet appareil ('+(e&&e.name||e)+').'); }
}
$('#lock-form').addEventListener('submit', e=>{ e.preventDefault(); const c=$('#lock-code').value.trim(); if (!c) return; unlock(c, false); });
if (!window.crypto?.subtle || !window.DecompressionStream) showLock('Navigateur trop ancien (iOS 16.4+ requis).');
else { const saved = localStorage.getItem(LS_CODE); if (saved) unlock(saved, true); else showLock(''); }
window.addEventListener('resize', ()=>S&&renderChart());
