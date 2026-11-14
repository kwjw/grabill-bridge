// Panels: layers, tools, cost, project facts, selection details, plan-sheet viewer.
import * as THREE from 'three';
import { REG } from './kit.js';
import { P, fmtSta, pgAt } from './project.js';
import { STEPS } from './main.js';
import { setLabelGroups } from './annot.js';

let A; const $ = (s) => document.querySelector(s); const money = (v, d = 0) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const LAYER_ORDER = ['Superstructure', 'Reinforcement', 'Substructure (new)', 'Substructure (1964, reused)', 'Railings', 'Approaches', 'Lighting', 'Drainage', 'Construction staging', 'Existing 1964 bridge', 'Site'];
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

export function initUI(app) {
  A = app;
  // tabs
  document.querySelectorAll('.tabs button').forEach((b) => b.onclick = () => { document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b)); document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.id === 'tab-' + b.dataset.tab)); });
  // views
  const vb = $('#views'); for (const k in A.VIEWS) { const b = document.createElement('button'); b.textContent = A.VIEWS[k].name; b.onclick = () => A.flyTo(A.VIEWS[k]); vb.appendChild(b); }
  buildLayers(); buildCost(); buildProject();
  // tools
  const w = $('#water'); w.oninput = () => { A.setWater(+w.value); $('#waterOut').textContent = 'El. ' + (+w.value).toFixed(1); };
  const chips = [['Flow line', P.water.flowline], ['Low pool', P.water.low], ['Causeway top', 772], ['Normal pool', P.water.normal], ['Q100', P.water.q100]]; for (const [n, v] of chips) { const b = document.createElement('button'); b.textContent = n; b.onclick = () => { w.value = v; w.oninput(); }; $('#waterChips').appendChild(b); }
  const ex = $('#explode'); ex.oninput = () => { A.setExplode(+ex.value); $('#explodeOut').textContent = Math.round(ex.value * 100) + '%'; };
  const cx = $('#cutX'), cxv = $('#cutXv'), cz = $('#cutZ'), czv = $('#cutZv');
  const upCut = () => { A.setCut('x', cx.checked ? +cxv.value : null); A.setCut('z', cz.checked ? +czv.value : null); $('#cutXo').textContent = 'Sta. ' + fmtSta(+cxv.value + P.staPier3); $('#cutZo').textContent = (+czv.value >= 0 ? (+czv.value).toFixed(1) + "' Rt." : (-czv.value).toFixed(1) + "' Lt."); };
  cx.onchange = () => { upCut(); if (cx.checked) A.flyTo({ p: [+cxv.value - 95, 800, -4], t: [+cxv.value, 787, -4.9] }); }; cz.onchange = () => { upCut(); if (cz.checked) A.flyTo(A.VIEWS.south); }; cxv.oninput = czv.oninput = upCut; upCut();
  const sn = $('#sun'); const sunTxt = (h) => { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'am' : 'pm'}`; }; sn.oninput = () => { A.setSun(+sn.value); A.applyState(); $('#sunOut').textContent = sunTxt(+sn.value); }; $('#sunOut').textContent = sunTxt(+sn.value);
  $('#btnLabels').onclick = (e) => { A.labels = !A.labels; e.target.classList.toggle('on', A.labels); setLabelGroups(); };
  $('#btnXray').onclick = (e) => { A.setXray(!A.xray); e.target.classList.toggle('on', A.xray); };
  $('#btnDocs').onclick = showSources; $('#btnTour').onclick = () => A.startTour();
  // measure
  let mPts = [], mLine = null; const mb = $('#btnMeasure');
  mb.onclick = () => { A.measuring = !A.measuring; mb.classList.toggle('on', A.measuring); mPts = []; if (!A.measuring && mLine) { A.scene.remove(mLine); mLine = null; $('#measureOut').textContent = ''; } };
  A.onMeasurePoint = (p) => { mPts.push(p); if (mPts.length > 2) mPts = [p]; if (mLine) { A.scene.remove(mLine); mLine = null; }
    if (mPts.length === 2) { const g = new THREE.BufferGeometry().setFromPoints(mPts); mLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xff4fd8, depthTest: false })); mLine.renderOrder = 99; A.scene.add(mLine); const d = mPts[0].distanceTo(mPts[1]), h = Math.hypot(mPts[1].x - mPts[0].x, mPts[1].z - mPts[0].z); $('#measureOut').textContent = `${d.toFixed(2)} ft (horiz. ${h.toFixed(2)}, vert. ${(mPts[1].y - mPts[0].y).toFixed(2)})`; } else $('#measureOut').textContent = `El. ${p.y.toFixed(2)} …`; };
  // timeline
  const tl = $('#tl'); tl.oninput = () => { A.playing = false; A.setT(+tl.value, true); };
  const tk = $('#tlTicks'); STEPS.forEach((s, i) => { const sp = document.createElement('span'); sp.textContent = i; sp.title = s.title; sp.onclick = () => { A.playing = false; A.setT(i, true); }; tk.appendChild(sp); });
  $('#tlPrev').onclick = () => { A.playing = false; A.setT(Math.max(0, Math.ceil(A.t - 1)), true); }; $('#tlNext').onclick = () => { A.playing = false; A.setT(Math.min(9, Math.floor(A.t + 1)), true); };
  $('#tlPlay').onclick = (e) => { A.playing = !A.playing; if (A.playing && A.t >= 8.99) A.setT(0, true); e.target.textContent = A.playing ? '❚❚ Pause' : '▶ Play sequence'; };
  // modal
  $('#modal .mclose').onclick = () => $('#modal').classList.add('hidden'); $('#modal').onclick = (e) => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); };
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') { $('#modal').classList.add('hidden'); if (A.tourActive) A.stopTour(); } });
}
export function setTimelineUI(t) {
  const i = Math.min(9, Math.floor(t + 1e-6)); const s = STEPS[i]; const tl = $('#tl'); if (!tl) return; if (document.activeElement !== tl) tl.value = t;
  $('#tlTitle').textContent = `${i}. ${s.title}`; $('#tlDate').textContent = s.date; $('#tlNote').textContent = s.note + '  (Sequence reconstructed from the contract documents; only the letting, the closure limit and the reopening date are documented.)';
  document.querySelectorAll('#tlTicks span').forEach((x, k) => x.classList.toggle('on', k === i));
}

// ---------------- layers ----------------
function buildLayers() {
  const box = $('#tab-layers'); box.innerHTML = ''; const groups = {};
  for (const c of REG.list) (groups[c.userData.layer || 'Other'] ||= []).push(c);
  for (const name of [...LAYER_ORDER, ...Object.keys(groups).filter((k) => !LAYER_ORDER.includes(k))]) {
    const list = groups[name]; if (!list) continue; const g = document.createElement('div'); g.className = 'lgroup';
    const head = document.createElement('div'); head.className = 'lhead'; head.innerHTML = `<input type="checkbox" checked> <span>${esc(name)}</span><span class="cnt">${list.length}</span>`; g.appendChild(head);
    const hc = head.querySelector('input'); hc.onclick = (e) => { e.stopPropagation(); for (const c of list) { if (hc.checked) A.layerOff.delete(c.name); else A.layerOff.add(c.name); } A.applyState(); };
    for (const c of list) { const it = document.createElement('div'); it.className = 'litem'; it.dataset.id = c.name; it.innerHTML = `<input type="checkbox" id="lc_${c.name}"><label for="lc_${c.name}" title="${esc(c.userData.name)}">${esc(c.userData.name)}</label><button class="ib" title="Details">i</button>`;
      it.querySelector('input').onchange = (e) => { if (e.target.checked) A.layerOff.delete(c.name); else A.layerOff.add(c.name); if (c.name === 'rebarDeck') A.userRebarOff = !e.target.checked; A.applyState(); };
      it.querySelector('.ib').onclick = () => A.select(c.name); g.appendChild(it); }
    box.appendChild(g);
  }
  const n = document.createElement('p'); n.className = 'muted small'; n.textContent = 'Dimmed rows are not present at the current step of the construction sequence.'; box.appendChild(n);
}
export function refreshLayers() {
  document.querySelectorAll('.litem').forEach((it) => { const c = REG.byId[it.dataset.id]; if (!c) return; const on = !A.layerOff.has(c.name); it.querySelector('input').checked = on; it.classList.toggle('off', !on); const ph = c.userData.phase || [0, 99]; it.classList.toggle('dim', !(A.t >= ph[0] && A.t < ph[1])); });
}

// ---------------- selection info ----------------
export function showInfo(c) {
  const box = $('#info'); if (!c) { box.classList.add('hidden'); return; } const u = c.userData; box.classList.remove('hidden');
  const items = (u.pay || []).map((l) => A.content.items.find((i) => i.line === l)).filter(Boolean);
  box.innerHTML = `<button class="x">✕</button><div class="lay">${esc(u.layer || '')}</div><h3>${esc(u.name)}</h3><p>${esc(u.desc || '')}</p>` +
    (u.facts && u.facts.length ? `<table class="facts">${u.facts.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>` : '') +
    (items.length ? `<div class="pay"><div class="muted small" style="border:0">Contract pay items (Miller Bros. bid)</div>${items.map((i) => `<div><span>${esc(titleCase(i.desc))}<br><span class="muted">${i.qty.toLocaleString()} ${i.unit} at ${money(i.price, 2)}</span></span><b>${money(i.ext)}</b></div>`).join('')}</div>` : '') +
    (u.sheets && u.sheets.length ? `<div class="muted small" style="margin-top:10px">Source plan sheets</div><div class="sheets">${u.sheets.map((s) => `<button data-s="${s}">${sheetName(s, true)}</button>`).join('')}</div>` : '');
  box.querySelector('.x').onclick = () => A.select(null); box.querySelectorAll('.sheets button').forEach((b) => b.onclick = () => openSheet(b.dataset.s));
}
const titleCase = (s) => s.toLowerCase().replace(/(^|[\s,(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bHma\b/g, 'HMA').replace(/\bPccp\b/g, 'PCCP').replace(/\bQc\/Qa\b/gi, 'QC/QA').replace(/\bPf-1\b/gi, 'PF-1').replace(/\bLed\b/g, 'LED').replace(/\bIn\./g, 'in.').replace(/ X /g, ' x ');
function sheetName(s, short) { const m = A.sheets[s]; const pre = s[0] === 'B' ? `Sheet ${+s.slice(1)}` : s[0] === 'R' ? `Road sheet ${+s.slice(1)}` : `1964 sheet ${+s.slice(1)}`; return m ? (short ? `${pre} · ${m}` : `${pre} of ${s[0] === 'B' ? 81 : s[0] === 'R' ? 26 : 28} — ${m}`) : pre; }
export function openSheet(s) {
  const mb = $('#modal .mbody'); $('#modal').classList.remove('hidden'); mb.style.padding = '0';
  const keys = Object.keys(A.sheets); const idx = keys.indexOf(s);
  mb.innerHTML = `<div class="sheetbar"><button id="shPrev">◀</button><b>${esc(sheetName(s))}</b><button id="shNext">▶</button><span class="muted small">${s[0] === 'X' ? '1964 plans, Zurbuch Engineers (Project S-192(2))' : 'INDOT Contract B-42165 plans, Engineering Resources, Inc., April 2024'} · drag to pan, wheel to zoom</span></div><div class="sheetview"><img src="sheets/${s}.jpg" draggable="false"></div>`;
  const view = mb.querySelector('.sheetview'), img = mb.querySelector('img'); let sc = 1, ox = 0, oy = 0; const ap = () => { img.style.transform = `translate(${ox}px,${oy}px) scale(${sc})`; };
  img.onload = () => { sc = Math.min(view.clientWidth / img.naturalWidth, view.clientHeight / img.naturalHeight); ox = (view.clientWidth - img.naturalWidth * sc) / 2; oy = 0; ap(); };
  view.onwheel = (e) => { e.preventDefault(); const r = view.getBoundingClientRect(); const mx = e.clientX - r.left, my = e.clientY - r.top; const k = Math.exp(-e.deltaY * 0.0015); const ns = Math.max(0.1, Math.min(6, sc * k)); ox = mx - (mx - ox) * ns / sc; oy = my - (my - oy) * ns / sc; sc = ns; ap(); };
  let drag = null; view.onpointerdown = (e) => { drag = [e.clientX - ox, e.clientY - oy]; view.setPointerCapture(e.pointerId); }; view.onpointermove = (e) => { if (drag) { ox = e.clientX - drag[0]; oy = e.clientY - drag[1]; ap(); } }; view.onpointerup = () => { drag = null; };
  mb.querySelector('#shPrev').onclick = () => openSheet(keys[(idx - 1 + keys.length) % keys.length]); mb.querySelector('#shNext').onclick = () => openSheet(keys[(idx + 1) % keys.length]);
}

// ---------------- cost ----------------
function buildCost() {
  const C = A.content; const box = $('#tab-cost'); const cats = {}; for (const i of C.items) cats[i.cat] = (cats[i.cat] || 0) + i.ext; const order = Object.entries(cats).sort((a, b) => b[1] - a[1]); const max = order[0][1];
  box.innerHTML = `<h4>Awarded contract</h4><div class="kv"><div>Low bid</div><div><b>${money(C.bidTotal, 2)}</b></div><div>Contractor</div><div>${esc(C.contractor)}</div><div>Engineer's estimate</div><div>${money(C.engEst, 2)} (bid is ${Math.round((1 - C.bidTotal / C.engEst) * 100)}% under)</div><div>Second bid</div><div>${money(C.secondBid, 2)}</div><div>Letting</div><div>August 14, 2024 · Call 321</div><div>Pay items</div><div>${C.items.length}</div></div>
  <h4>Where the money goes</h4><div id="costBars"></div><h4 id="costHead">Largest items</h4><div id="costTable"></div><p><button id="costAll">Full schedule of pay items</button></p><p class="muted small">Prices are the unit prices bid by the awarded contractor, from the executed contract. Both projects (bridge Des. 1901712 and the SR 1 / Clay Street signal, Des. 2200137) are in this one schedule.</p>`;
  const bars = box.querySelector('#costBars'); const table = (list) => `<table class="items"><tr><th>Item</th><th class="r">Qty</th><th class="r">Amount</th></tr>${list.map((i) => `<tr><td>${esc(titleCase(i.desc))}</td><td class="r">${i.qty.toLocaleString()} ${i.unit}</td><td class="r">${money(i.ext)}</td></tr>`).join('')}</table>`;
  const top = () => { box.querySelector('#costHead').textContent = 'Largest items'; box.querySelector('#costTable').innerHTML = table([...C.items].sort((a, b) => b.ext - a.ext).slice(0, 12)); };
  for (const [name, amt] of order) { const d = document.createElement('div'); d.className = 'cost-bar'; d.innerHTML = `<span class="nm">${esc(name)}</span><span class="br"><i style="width:${(amt / max * 100).toFixed(1)}%"></i></span><span class="am">${money(amt)}</span>`;
    d.onclick = () => { const was = d.classList.contains('on'); bars.querySelectorAll('.cost-bar').forEach((x) => x.classList.remove('on')); if (was) { top(); return; } d.classList.add('on'); box.querySelector('#costHead').textContent = `${name} · ${(amt / C.bidTotal * 100).toFixed(1)}% of the bid`; box.querySelector('#costTable').innerHTML = table(C.items.filter((i) => i.cat === name).sort((a, b) => b.ext - a.ext)); };
    bars.appendChild(d); }
  top();
  box.querySelector('#costAll').onclick = () => { const mb = $('#modal .mbody'); mb.style.padding = ''; $('#modal').classList.remove('hidden'); mb.innerHTML = `<h2>Schedule of pay items, Contract B-42165-A</h2><p class="muted">Unit prices bid by ${esc(C.contractor)} · total ${money(C.bidTotal, 2)}</p><table class="items"><tr><th>Line</th><th>Item no.</th><th>Description</th><th>Category</th><th class="r">Quantity</th><th class="r">Unit price</th><th class="r">Amount</th></tr>${C.items.map((i) => `<tr><td>${i.line}</td><td>${i.item}</td><td>${esc(titleCase(i.desc))}</td><td class="muted">${esc(i.cat)}</td><td class="r">${i.qty.toLocaleString()} ${i.unit}</td><td class="r">${money(i.price, 2)}</td><td class="r">${money(i.ext, 2)}</td></tr>`).join('')}</table>`; };
}

// ---------------- project ----------------
function buildProject() {
  const box = $('#tab-project'); const kv = (rows) => `<div class="kv">${rows.map(([k, v]) => `<div>${k}</div><div>${v}</div>`).join('')}</div>`;
  box.innerHTML = `<h4>The project</h4><p>Allen County replaced the superstructure of its Bridge No. 29, which carries Grabill Road across the Cedarville Reservoir at Leo-Cedarville, and kept the 1964 piers and piles. The new deck trades two 4-foot sidewalks for one 10-foot barrier-protected walk. Federal-aid local project let by INDOT.</p>
  ${kv([['Owner', 'Allen County Highway Department'], ['Designer', 'Engineering Resources, Inc., Fort Wayne (piers and detour: Kimley-Horn; survey: SJCA)'], ['Contractor', 'Miller Bros. Const., Inc.'], ['Structure', 'Continuous composite prestressed concrete bulb-tee beam bridge'], ['Spans', '46\' · 64\' · 64\' · 46\', no skew'], ['Clear roadway', '30\'-0"'], ['Location', 'Sta. 19+44.85, Line "PR-A" · 41°13\'22" N, 85°00\'28" W'], ['Original bridge', '1964, Zurbuch Engineers, Project S-192(2)']])}
  <h4>Contract dates</h4>${kv([['Plans signed', 'April 10, 2024'], ['Letting', 'August 14, 2024'], ['Revision 1', 'August 5, 2024: more time after a bidder\'s question'], ['Closure allowed', '200 calendar days'], ['Intermediate completion', 'October 10, 2025'], ['Reopened', 'October 31, 2025'], ['Completion date', 'June 1, 2026'], ['Liquidated damages', '$3,000 per day']])}
  <h4>Design data (sheet 30)</h4>${kv([['Live load', 'HL-93, AASHTO LRFD 9th Edition (2020)'], ['Dead load', 'actual + 35 psf future wearing surface + 15 psf deck forms'], ['Concrete', "Class C 4,000 psi · Class A 3,500 psi · Class B 3,000 psi"], ['Beam concrete', "f'c 8,000 psi (7,000 at release)"], ['Reinforcing', 'Grade 60, epoxy coated'], ['Wind', '70 mph (LRFD 3.8.1)'], ['Traffic', 'AADT 7,540 (2025) · 8,990 (2045) · 2.6% trucks'], ['Design speed', '35 mph']])}
  <h4>Companion project</h4><p>Des. 2200137 adds a traffic signal and turn-lane widening at SR 1 and Clay Street, 1.3 miles south-west, on the signed detour route. It shares this contract; its 26 plan sheets are in the sheet viewer. It is outside the 3D model.</p><p><button id="pjDetour">Detour plan (sheet 10)</button> <button id="pjRoad">SR 1 / Clay St. plans</button></p>
  <h4>Environmental commitments</h4><p>${A.content.commitments.length} commitments carried into the contract: bats and migratory birds on the structure, the park and trails, two nearby fuel-tank sites, water quality (the reservoir is listed for E. coli and PCBs), waterway traffic. <button id="pjCom">Read all</button></p>
  <h4>Permits</h4><p>IDEM construction stormwater general permit · IDEM Section 401 water quality certification · USACE Section 404 nationwide permit · Indiana DNR Construction in a Floodway FW-32288.</p>
  <h4>Pre-bid questions</h4><p class="small">Bidders asked for the 1964 plans (posted), asked for more time (granted in Revision 1), and asked why the causeway top (El. 772) is below normal pool (answer: the reservoir will be lowered). Two plan details were corrected: bearing welds on both sides of each beam, and the 2-inch square tube stays on the modified railing.</p>
  <p><button id="pjSrc">Sources and accuracy</button></p>`;
  box.querySelector('#pjDetour').onclick = () => openSheet('B10'); box.querySelector('#pjRoad').onclick = () => openSheet('R01'); box.querySelector('#pjSrc').onclick = showSources;
  box.querySelector('#pjCom').onclick = () => { const mb = $('#modal .mbody'); mb.style.padding = ''; $('#modal').classList.remove('hidden'); mb.innerHTML = `<h2>Environmental commitments, Des. 1901712</h2><p class="muted">From INDOT's All Commitments Report dated May 9, 2024, with how the contract addresses each.</p><table class="items"><tr><th>#</th><th>Commitment</th><th>How it is addressed</th></tr>${A.content.commitments.map((c) => `<tr><td>${c.n}</td><td>${esc(c.text)}<br><span class="tag">${esc(c.kind)}</span></td><td class="muted">${esc(c.how)}</td></tr>`).join('')}</table>`; };
}
function showSources() {
  const mb = $('#modal .mbody'); mb.style.padding = ''; $('#modal').classList.remove('hidden');
  mb.innerHTML = `<h2>Sources and accuracy</h2>
  <p>This model was assembled by an AI system from public records. Nothing in it comes from the designer's CAD files; every dimension was read off the plan sheets.</p>
  <h3>Documents</h3><ul class="doclist"><li>INDOT Contract B-42165 bridge plans, 81 sheets, Engineering Resources, Inc., signed April 10, 2024 (with pier and detour sheets by Kimley-Horn and survey by SJCA)</li><li>Road plans for Des. 2200137, 26 sheets</li><li>1964 bridge plans, 28 sheets, Zurbuch Engineers, Indiana State Highway Commission Project S-192(2)</li><li>Contract Information Book, Revision 1, pre-bid Q&A, executed highway contract with unit prices, permits, All Commitments Report</li><li>INDOT letting notice and bid tabulation, August 14, 2024</li></ul>
  <h3>Site data</h3><ul class="doclist"><li>Elevation: USGS 3D Elevation Program 1-meter lidar DEM</li><li>Aerial photo: State of Indiana orthophotography, spring 2024, 3-inch pixels (public domain)</li><li>Buildings: IndianaMap building footprints (lidar-derived, 2016-2020)</li><li>Tree cover: classified from USDA NAIP near-infrared imagery; tree shapes grown with ez-tree (MIT)</li><li>Sky and ambient light: Poly Haven HDR panoramas (CC0)</li><li>Surface materials: Poly Haven scanned textures (CC0)</li><li>Street-level appearance (railings, lighting, pavement markings, riprap) checked against July 2026 street-level photos</li></ul>
  <h3>What is exact, and what is not</h3><ul><li><b>From the plans, to the dimension:</b> alignment and profile of Line "PR-A", span lengths, stations and elevations of bents and piers, beam seat elevations, beam section and lengths, bearing layout, deck width and thickness, pour sequence, bar spacing, railing lengths and post spacing, stair geometry, light pole locations, causeway top elevation and width, water surface elevations.</li><li><b>From the 1964 plans:</b> pier stems, footings and pile layout. Elevations were shifted to match the surveyed cap elevations on the 2024 plans.</li><li><b>Simplified:</b> strand pattern, railing hardware, curb and drive details, guardrail, riprap limits, the trail alignment.</li><li><b>Estimated:</b> reservoir bed away from the bridge, building heights, tree sizes, the routes of the temporary causeways beyond what sheets 14 and 15 show.</li><li><b>Illustrative:</b> the cranes, their working pads and lift paths, and the barricades.</li><li><b>Construction sequence:</b> the order of work follows the plans and special provisions. Dates between the letting (Aug. 14, 2024) and the reopening (Oct. 31, 2025) are not in the documents.</li></ul>
  <p class="muted">Model position was fixed by matching the 1964 deck in the 2024 aerial photo; agreement is about one foot. Not for construction.</p>`;
}
