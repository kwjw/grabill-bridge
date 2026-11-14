// Guided tour: a deterministic timeline (camera, model state, captions). The same code plays
// live in the browser and is stepped frame by frame to render the video (?capture=1).
import * as THREE from 'three';
import { P, so, pgAt } from './project.js';
import { label, LABELS, setLabelGroups } from './annot.js';
import { animateWater, cullTreesNear } from './terrain.js';

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
/** camera key by station / offset / height above profile grade */
const K = (sta, off, h) => { const p = so(sta, off); return [p.x, pgAt(sta) + h, p.z]; };
const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const lin = (keys, t) => { if (t <= keys[0][0]) return keys[0][1]; for (let i = 0; i < keys.length - 1; i++) { const [t0, v0] = keys[i], [t1, v1] = keys[i + 1]; if (t <= t1) return v0 + (v1 - v0) * (t1 > t0 ? (t - t0) / (t1 - t0) : 1); } return keys[keys.length - 1][1]; };

// ------------------------------------------------------------------ script
// Each shot: a..b seconds, keys {t (0..1 within shot), p: camera, l: look-at, f: fov}
const SHOTS = [
  { a: 0, b: 24, k: [{ t: 0, p: [-1750, 1560, 1250], l: [-60, 770, 20], f: 34 }, { t: 0.4, p: [-1180, 1210, 980], l: [-40, 772, 10], f: 34 }, { t: 1, p: [-330, 1010, 880], l: [-10, 776, 0], f: 36 }] },
  { a: 24, b: 44, k: [{ t: 0, p: [-250, 868, 250], l: [-10, 784, 0], f: 36 }, { t: 0.4, p: [-90, 815, 170], l: [0, 783, -4], f: 38 }, { t: 0.72, p: [-10, 787, 96], l: [-6, 781, -6], f: 40 }, { t: 1, p: [-78, 783.5, 62], l: [-32, 780.5, -8], f: 40 }] },
  { a: 44, b: 62, k: [{ t: 0, p: [-760, 1010, -520], l: [-260, 770, -30], f: 36 }, { t: 0.55, p: [-420, 900, -400], l: [-120, 770, -40], f: 36 }, { t: 1, p: [-150, 838, -250], l: [-30, 772, -30], f: 38 }] },
  { a: 62, b: 74, k: [{ t: 0, p: [-190, 846, 200], l: [-5, 788, -4], f: 36 }, { t: 1, p: [-120, 832, 222], l: [5, 788, -4], f: 36 }] },
  { a: 74, b: 96, k: [{ t: 0, p: [78, 797, 66], l: [0, 785.5, -4], f: 38 }, { t: 0.42, p: [50, 801, 42], l: [0, 787, -4], f: 38 }, { t: 0.6, p: [-6, 806, 62], l: [-60, 786, -4], f: 38 }, { t: 0.82, p: [-52, 803, 44], l: [-106, 786, -4], f: 38 }, { t: 1, p: [-70, 799, 30], l: [-110, 786, -5], f: 38 }] },
  { a: 96, b: 110, k: [{ t: 0, p: [-205, 842, 150], l: [-70, 788, -4], f: 36 }, { t: 1, p: [95, 838, 165], l: [20, 788, -4], f: 36 }] },
  { a: 110, b: 124, k: [{ t: 0, p: [-72, 793.5, 14], l: [-32, 789.4, -2.5], f: 22 }, { t: 1, p: [-54, 791.2, 5.5], l: [-32, 789.5, 0.4], f: 22 }] },
  { a: 124, b: 156, k: [{ t: 0, p: [-150, 812, 62], l: [-40, 790, -6], f: 38 }, { t: 0.3, p: [-60, 815, 70], l: [-5, 790, -6], f: 38 }, { t: 0.45, p: [-175, 880, 150], l: [-5, 788, -6], f: 36 }, { t: 1, p: [140, 874, 170], l: [5, 788, -6], f: 36 }] },
  { a: 156, b: 182, k: [{ t: 0, p: K(1490, -20.6, 6.2), l: K(1620, -20, 3.5), f: 46 }, { t: 0.4, p: K(1700, -20.8, 6.2), l: K(1830, -20.6, 3.8), f: 46 }, { t: 0.75, p: K(1880, -20.8, 6.2), l: K(2010, -20.8, 3.8), f: 46 }, { t: 1, p: K(1990, -20.8, 6.4), l: K(2120, -22, 3.5), f: 46 }] },
  { a: 182, b: 198, k: [{ t: 0, p: [250, 858, -190], l: [100, 784, -30], f: 36 }, { t: 0.5, p: [182, 822, -122], l: [108, 785, -36], f: 36 }, { t: 1, p: [158, 809, -104], l: [108, 785, -38], f: 36 }] },
  { a: 198, b: 216, k: [{ t: 0, p: [-430, 800, -4.9], l: [-32, 789.2, -4.9], f: 5.5 }, { t: 1, p: [-400, 798, -4.9], l: [-32, 789.2, -4.9], f: 5.5 }] },
  { a: 216, b: 232, k: [{ t: 0, p: [-120, 812, 110], l: [-20, 792, -4], f: 36 }, { t: 1, p: [-40, 824, 132], l: [0, 796, -4], f: 36 }] },
  { a: 232, b: 247, k: [{ t: 0, p: [-190, 806, -110], l: [-10, 786, -4], f: 36 }, { t: 1, p: [-95, 803, -160], l: [0, 786, -4], f: 36 }] },
  { a: 247, b: 256, k: [{ t: 0, p: K(1700, 6, 5.2), l: K(1850, 5, 2.5), f: 46 }, { t: 1, p: K(1990, 6, 5.2), l: K(2140, 5, 2.2), f: 46 }] },
  { a: 256, b: 266, k: [{ t: 0, p: [-400, 930, 430], l: [0, 782, 0], f: 36 }, { t: 1, p: [-640, 1070, 620], l: [-20, 778, 10], f: 36 }] },
];
const END = 266;
// construction-time parameter (0..9) against tour seconds
const T_TRACK = [[0, 9], [23.6, 9], [24, 0], [44, 0], [50, 1.02], [58, 1.75], [62, 1.9], [63.6, 2.08], [73, 2.76], [74, 2.95], [78, 3.3], [86, 3.55], [96, 3.97], [96.6, 4.0], [109.2, 4.9], [110, 4.95], [124, 4.95], [128, 5.25], [134, 5.55], [138, 5.95], [142, 6.25], [147, 6.55], [151, 6.92], [155.6, 7.88], [156, 7.9], [166, 7.98], [182, 8.0], [186, 8.35], [194, 8.95], [198, 9], [END, 9]];
const EXPLODE = [[0, 0], [217, 0], [222, 1], [229.5, 1], [231.5, 0]];
const SUN = [[0, 15.2], [231.9, 15.2], [232, 19.0], [246.9, 19.0], [247, 19.3], [END, 19.3]];
const CUTX = [[198, 216, -32], [110, 124, -32]];
const XRAY = [];
const WATER = [[198, 216, P.water.normal]];   // hold normal pool during the section view
const SELECT = [];
const LABEL_EVENTS = [[6, 23.6, 'places'], [198.6, 216, 'section'], [111.5, 124, 'beam']];
const HIDE = [[110, 124, ['bearings', 'diaSteel', 'craneA', 'craneB', 'causeway1', 'causeway2']], [198, 216, ['lights', 'stairs', 'guardrail', 'utility', 'trees', 'buildings']], [216, 232, ['pedRail', 'lights', 'momentSlab', 'rcba', 'railN', 'markings', 'pavement', 'guardrail', 'sidewalk', 'stairs']]];
const TITLE = [0.6, 9.2, `<h1>Grabill Road over the St. Joseph River</h1><div class="rule"></div><h2>Allen County Bridge No. 29 · Leo-Cedarville, Indiana</h2><h3 style="margin-top:1.2vw">Superstructure replacement · INDOT Contract B-42165-A · 2024 to 2025</h3>`];
const ENDCARD = [257, 265.4, `<h1>Open to traffic · October 31, 2025</h1><div class="rule"></div><h2>Every dimension in this model was read from the public bid documents by an AI system.<br>No CAD files were used.</h2><h3 style="margin-top:1.4vw;text-transform:none;letter-spacing:.02em;line-height:1.6">Plans: Engineering Resources, Inc. with Kimley-Horn and SJCA (2024) · Zurbuch Engineers (1964)<br>Terrain: USGS 3DEP lidar · Aerial photo: State of Indiana, 2024 · Bid prices: executed contract, Miller Bros. Const., Inc.</h3>`];
const CAPS = [
  { a: 10, b: 23.4, k: 'The site', h: 'A causeway and a four-span bridge across the Cedarville Reservoir', t: 'Grabill Road crosses a water-supply reservoir on the St. Joseph River at the east edge of Leo-Cedarville. The terrain here is USGS lidar; the photo is the State of Indiana\'s 2024 aerial, flown before construction.', s: [['Project length', '0.261 mile'], ['Bridge', '222 ft, 4 spans'], ['Traffic (2025)', '7,540 vehicles a day'], ['Low bid', '$4,986,702']] },
  { a: 24.6, b: 43.6, k: 'Before · built 1964', h: 'Seven beam lines, two 4-foot sidewalks', t: 'The 1964 bridge: four simple spans of prestressed I-beams at 6\'-0" centers under a 30-foot roadway, with a narrow raised walk on each side. The piers and piles were kept. The superstructure was replaced.', s: [['Spans', '46 · 64 · 64 · 46 ft'], ['Out to out', '40\'-10"'], ['Beams', '28 AASHTO Type III'], ['1964 design load', 'HS20-44']] },
  { a: 44.6, b: 61.6, k: 'Step 1', h: 'Lower the reservoir, build a causeway', t: 'Fort Wayne City Utilities drew the pool down about 13 feet. Temporary rock causeways, top at El. 772.0, reach under the bridge from each bank. Grabill Road closes, with a signed detour around the reservoir.', s: [['Normal pool', 'El. 777.7'], ['Low pool', 'El. 764.2'], ['Causeway top', 'El. 772.0, 20 ft wide'], ['Closure allowed', '200 days · $3,000/day after']] },
  { a: 62.5, b: 73.6, k: 'Step 2', h: 'Remove the old superstructure', t: 'Deck, railings, 28 beams and the end-bent caps come off. Three piers, their footings and 26 steel pipe piles stay in place.', s: [['Present structure, remove portions', '$360,000 lump sum']] },
  { a: 74.6, b: 95.6, k: 'Step 3', h: 'New seats on the 1964 substructure', t: 'New concrete is doweled onto each pier cap through 120 field-drilled holes and stepped to seat four beam lines on a 2% crown. At each end a new cap is cast around the 13 existing piles to make a semi-integral end bent.', s: [['Existing pier cap', 'El. 786.3'], ['New seats, Pier 3', 'El. 787.77 to 788.18'], ['Bottom of new bent cap', 'El. 782.45'], ['Pile embedment', '1\'-0"']] },
  { a: 96.5, b: 109.6, k: 'Step 4', h: 'Sixteen bulb-tee beams', t: 'Precast, prestressed BT 36x61 beams at 11\'-0" centers, each on steel-reinforced elastomeric bearings: 46\'-3" long in the end spans, 63\'-6" in the interior spans.', s: [['Beams', '16 · 880 LFT'], ['Bid price', '$675 per foot'], ['Bearings', '32 at $1,400'], ['Cast before deck pour', '90 days minimum']] },
  { a: 110.6, b: 123.6, k: 'Inside a beam', h: '36 inches deep, 61 inches across the top', t: 'Each interior-span beam holds 20 bottom strands and 2 top strands of 0.6-inch, 270 ksi low-relaxation strand, each pulled to 43.94 kips. The strand pattern shown is simplified from sheet 42.', s: [['Concrete at 28 days', '8,000 psi'], ['At release', '7,000 psi'], ['Web', '8 in.'], ['Bottom flange', '40 in.']] },
  { a: 124.6, b: 137.4, k: 'Step 5', h: 'Brace, then reinforce', t: 'C10x30 steel diaphragms bolt between the beams at mid-span. Then two mats of epoxy-coated bar go down at 8 inches each way.', s: [['Deck reinforcing', '84,656 lb'], ['Bar spacing', '8 in. each way, 2 mats'], ['All bars', 'epoxy coated, Grade 60']] },
  { a: 138.2, b: 155.6, k: 'Step 6', h: 'Three pours, in a set order', t: 'Pour 1, the end spans. Pour 2, the interior spans. Pour 3, a 5-foot strip over each pier together with the continuity diaphragm, placed last so slab weight stays out of the negative-moment zone.', s: [['Deck', '8 in. · 41\'-10" x 222\'-0"'], ['Class C concrete', '290.9 CYS at $985'], ['Design live load', 'HL-93']] },
  { a: 156.6, b: 181.6, k: 'Step 7', h: 'A protected 10-foot walk', t: 'A PF-1 barrier separates the walk from traffic for 600 feet, across the bridge and west along the causeway on a reinforced moment slab. On the outside edge: 675 feet of curved, galvanized picket railing.', s: [['Concrete railing PF-1', '817 LFT'], ['Pedestrian railing', '675 LFT at $348'], ['Moment slab', '566 SYS, 12 in.'], ['Light standards', '7 · 30 ft']] },
  { a: 182.6, b: 197.6, k: 'Step 8', h: 'Pave, protect, refill', t: 'Asphalt approaches on a profile raised 1.4 feet at mid-bridge, revetment riprap on the causeway slopes, and a staircase down to the river trail that passes under Span D. The causeways come out and the pool returns to El. 777.7.', s: [['Revetment riprap', '3,463 tons'], ['Stairs', '8 + 13 risers, 12.3 ft drop'], ['HMA surface', '496 tons']] },
  { a: 198.6, b: 215.6, k: 'Typical section', h: '41\'-10" out to out of coping', t: 'Two 12-foot lanes with 3-foot shoulders on a 2% crown; an 8-inch deck on four beams at 11 feet. The roadway centerline moved 4\'-4" south so the walk fits on the old piers.', s: [['Clear roadway', '30\'-0"'], ['Walk', '10\'-0"'], ['Overhangs', '4\'-5"']] },
  { a: 216.6, b: 231.4, k: 'New and reused', h: 'Everything above the bearing seats is new', t: 'Reused from 1964: three hammerhead piers, their spread footings, and the piles under both end bents. New: cap extensions, end bents, bearings, beams, diaphragms, deck, railings.', s: [] },
  { a: 232.6, b: 246.6, k: 'The bid · August 14, 2024', h: '$4,986,702.26', t: 'Low bid by Miller Bros. Const., Inc., 24% under the engineer\'s estimate of $6.55 million. Largest items:', s: [['Bulb-tee beams', '$594,000'], ['Remove old structure', '$360,000'], ['Deck concrete', '$286,537'], ['Revetment riprap', '$259,725'], ['Mobilization', '$245,100'], ['Pedestrian railing', '$234,900']] },
];
// 3D callouts: [a, b, html, [x,y,z], class]
const CALL = [
  [33, 43.5, '<b>Stays</b><br>3 hammerhead piers (1964)', [0, 781.5, 22], 'call'],
  [51, 61.5, 'Temporary causeway', [-150, 778, -100], 'call'], [53, 61.5, 'Exposed reservoir bed', [-330, 772, -260], 'big'],
  [79, 88, 'El. 787.77', [0, 789.2, -21.4], 'dim'], [79.4, 88, 'El. 787.99', [0, 789.4, -10.4], 'dim'], [79.8, 88, 'El. 788.18', [0, 789.6, 0.6], 'dim'], [80.2, 88, 'El. 787.96', [0, 789.4, 11.6], 'dim'], [81, 88, 'Existing cap El. 786.33', [0, 784.6, 19.5], 'big'],
  [88.5, 95.5, '<b>New end-bent cap</b><br>cast around 13 existing piles', [-109, 791.5, -4], 'call'],
  [103.4, 109.5, 'Span A', [-87, 796, -4.9], 'big'], [103.4, 109.5, 'Span D', [87, 796, -4.9], 'big'],
  [139, 155.5, 'Pour 1', [-88, 797, -4.9], 'call'], [139, 155.5, 'Pour 1', [88, 797, -4.9], 'call'], [143, 155.5, 'Pour 2', [-32, 797, -4.9], 'call'], [143, 155.5, 'Pour 2', [32, 797, -4.9], 'call'], [148, 155.5, 'Pour 3', [-64, 799, -4.9], 'dim'], [148, 155.5, 'Pour 3', [0, 799, -4.9], 'dim'], [148, 155.5, 'Pour 3', [64, 799, -4.9], 'dim'],
  [187, 197.5, 'Staircase to the river trail', [112, 793, -36], 'call'],
  [223, 231, '8-inch deck', [28, 811, -4.9], 'call'], [223, 231, 'PF-1 railing', [-58, 821.5, 15.4], 'call'], [223, 231, 'BT 36x61 beams', [40, 798, 14], 'call'], [223.5, 231, 'Bearings', [-64, 791.7, 14.5], 'big'], [223.5, 231, 'Pier cap extension (new)', [0, 788.6, 23.5], 'big'], [224, 231, '1964 pier (reused)', [0, 777, 23], 'big'], [224, 231, 'Continuity diaphragm', [-64, 799.5, -30], 'big'],
];

export function initTour(A) {
  const ui = document.getElementById('tourUI'), elT = document.getElementById('tTitle'), elK = document.getElementById('tKicker'), elH = document.getElementById('tHead'), elB = document.getElementById('tBody'), elS = document.getElementById('tStats'), elP = document.querySelector('#tProgress i'), elCap = document.getElementById('tCaption');
  const fade = document.createElement('div'); fade.style.cssText = 'position:absolute;inset:0;background:#05080a;opacity:0;z-index:1;pointer-events:none'; ui.appendChild(fade);
  for (const s of SHOTS) { s.cp = new THREE.CatmullRomCurve3(s.k.map((k) => V(k.p)), false, 'centripetal'); s.cl = new THREE.CatmullRomCurve3(s.k.map((k) => V(k.l)), false, 'centripetal'); }
  { const pts = []; for (const sh of SHOTS) for (let i = 0; i <= 60; i++) pts.push(sh.cp.getPoint(i / 60)); cullTreesNear(pts, 75); }
  const calls = CALL.map(([a, b, html, pos, cls]) => { const L = label(html, V(pos), 'tourcall', cls, {}); L.occl = false; L.a = a; L.b = b; L.on = false; return L; });
  // beam section dimensions (interior-span beam 3 at x = -32)
  { const x = -32.3, z = P.beamZ[2], yb = 788.06 + 0.34; const mk = (t, y, zz) => { const L = label(t, new THREE.Vector3(x, y, zz), 'beam', 'dim', {}); L.occl = false; return L; };
    mk('5\'-1" top flange', yb + 3.75, z); mk('3\'-0"', yb + 1.5, z + 3.25); mk('8" web', yb + 1.62, z - 1.25); mk('3\'-4" bottom flange', yb - 0.62, z); }
  let saved = null, lastCap = -1, lastSun = null, t0 = 0, playing = false, lastSel;
  const active = (list, t) => list.find((e) => t >= e[0] && t < e[1]);

  function seek(t) {
    t = Math.max(0, Math.min(END, t)); A.tourTime = t;
    // camera
    const s = SHOTS.find((q) => t >= q.a && t < q.b) || SHOTS[SHOTS.length - 1]; const u = (t - s.a) / (s.b - s.a);
    let i = 0; while (i < s.k.length - 2 && u > s.k[i + 1].t) i++; const k0 = s.k[i], k1 = s.k[i + 1]; const lu = Math.max(0, Math.min(1, (u - k0.t) / (k1.t - k0.t))); const g = (i + lu) / (s.k.length - 1);
    s.cp.getPoint(g, A.camera.position); const lk = s.cl.getPoint(g); A.controls.target.copy(lk); A.camera.fov = k0.f + (k1.f - k0.f) * lu; A.camera.updateProjectionMatrix(); A.camera.lookAt(lk);
    // fades at cuts
    let f = 0; for (const q of SHOTS) for (const e of [q.a, q.b]) { const d = Math.abs(t - e); if (d < 0.45 && e > 0.01 && e < END - 0.01) f = Math.max(f, 1 - d / 0.45); } if (t < 0.8) f = Math.max(f, 1 - t / 0.8); if (t > END - 1.2) f = Math.max(f, (t - (END - 1.2)) / 1.1);
    for (const c of [TITLE, ENDCARD]) if (t >= c[0] && t < c[1]) f = Math.max(f, 0.42 * Math.max(0, Math.min(1, (t - c[0]) / 1.0, (c[1] - t) / 0.8)));
    fade.style.opacity = Math.min(1, f).toFixed(3);
    // state
    A.t = lin(T_TRACK, t); A.explode = ease(lin(EXPLODE, t)); const sn = lin(SUN, t); if (sn !== lastSun) { A.setSun(sn); lastSun = sn; }
    const cx = active(CUTX, t); A.setCut('x', cx ? cx[2] : null); const xr = !!active(XRAY, t); if (xr !== A.xray) A.setXray(xr);
    const w = active(WATER, t); A.waterOverride = w ? w[2] : null;
    const sel = active(SELECT, t); const sid = sel ? sel[2] : null; if (sid !== lastSel) { A.selected = sid; lastSel = sid; }
    const tl = { structure: false, spans: false, stations: false, water: false, places: false, section: false, beam: false, tourcall: true };
    for (const [a, b, gname] of LABEL_EVENTS) if (t >= a && t < b) tl[gname] = true;
    A.tourLabels = tl; A.applyState(); for (const h of HIDE) if (t >= h[0] && t < h[1]) for (const id of h[2]) { const c = A.scene.getObjectByName(id); if (c) c.visible = false; }
    for (const L of calls) { const o = Math.min(1, (t - L.a) / 0.5, (L.b - t) / 0.5); L.on = o > 0; L.opacity = Math.max(0, o); }
    // captions
    const ci = CAPS.findIndex((c) => t >= c.a && t < c.b); if (ci !== lastCap) { lastCap = ci; if (ci >= 0) { const c = CAPS[ci]; elK.textContent = c.k; elH.textContent = c.h; elB.textContent = c.t; elS.innerHTML = c.s.map(([k, v]) => `<div class="st"><span>${k}</span><b>${v}</b></div>`).join(''); } else elS.innerHTML = ''; }
    if (ci >= 0) { const c = CAPS[ci]; const o = Math.max(0, Math.min(1, (t - c.a) / 0.6, (c.b - t) / 0.6)); elCap.style.opacity = o; elCap.style.transform = `translateY(${((1 - ease(Math.min(1, (t - c.a) / 0.6))) * 14).toFixed(1)}px)`;
      [...elS.children].forEach((d, n) => { d.style.opacity = Math.max(0, Math.min(1, (t - c.a - 0.5 - n * 0.28) / 0.45, (c.b - t) / 0.5)); }); } else elCap.style.opacity = 0;
    let tt = null; for (const c of [TITLE, ENDCARD]) if (t >= c[0] && t < c[1]) tt = c; if (tt) { if (elT.dataset.k !== String(tt[0])) { elT.innerHTML = tt[2]; elT.dataset.k = String(tt[0]); } elT.style.opacity = Math.max(0, Math.min(1, (t - tt[0]) / 1.0, (tt[1] - t) / 0.8)); elT.style.top = tt === ENDCARD ? '27%' : '30%'; } else elT.style.opacity = 0;
    elP.style.width = (t / END * 100).toFixed(2) + '%';
    animateWater(t); A.render();
  }
  A.tourSeek = seek; A.tourEnd = END;
  const enter = () => { A.tourActive = true; document.body.classList.add('tour'); ui.classList.remove('hidden'); A.controls.enabled = false; A.playing = false; lastCap = -1; lastSel = undefined; lastSun = null; document.getElementById('info').classList.add('hidden'); };
  A.startTour = (from = 0) => {
    saved = { p: A.camera.position.clone(), tg: A.controls.target.clone(), fov: A.camera.fov, t: A.t, explode: A.explode, sun: A.sun, xray: A.xray, cut: { ...A.cut }, sel: A.selected, wo: A.waterOverride };
    enter(); t0 = performance.now() - from * 1000; playing = true; seek(from);
  };
  A.stopTour = () => {
    if (!A.tourActive) return; A.tourActive = false; playing = false; document.body.classList.remove('tour'); ui.classList.add('hidden'); A.controls.enabled = true; A.tourLabels = null;
    for (const L of calls) L.on = false; if (saved) { A.camera.position.copy(saved.p); A.controls.target.copy(saved.tg); A.camera.fov = saved.fov; A.camera.updateProjectionMatrix(); A.explode = saved.explode; A.setSun(saved.sun); A.setXray(saved.xray); A.setCut('x', saved.cut.x); A.setCut('z', saved.cut.z); A.selected = saved.sel; A.waterOverride = saved.wo; A.setT(saved.t); }
    setLabelGroups();
  };
  A.tourTick = (now) => { if (!playing) return; const t = (now - t0) / 1000; if (t >= END) { A.stopTour(); return; } seek(t); };
  document.getElementById('tExit').onclick = () => A.stopTour();
  // capture hooks (used by tools/render.js)
  window.__seek = (t) => { if (!A.tourActive) enter(); seek(t); return true; };
  window.__tourEnd = END;
}
