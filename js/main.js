// Grabill Road over St. Joseph River — interactive 3D project model.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ENV, initEnv, setSunDir, renderFrame } from './env.js';
import { P, so, pgAt, fmtSta, deckTop, alignAt } from './project.js';
import { initMaterials, M, REG } from './kit.js';
import { buildRiprap, buildFar } from './terrain.js';
import { buildTerrain, buildWater, buildContext, setTerrainState, setWaterLevel, getWaterLevel, animateWater, groundAt, T } from './terrain.js';
import { buildNewBridge, setSectionCaps } from './bridge_new.js';
import { buildOldBridge } from './bridge_old.js';
import { buildSite } from './site.js';
import { buildCranes, addLift, updateLifts } from './lifts.js';
import { buildAnnotations, updateLabels, setLabelGroups, LABELS } from './annot.js';
import { initUI, showInfo, refreshLayers, setTimelineUI } from './ui.js';
import { initTour } from './tour.js';

export const APP = { t: 9, explode: 0, xray: false, labels: true, layerOff: new Set(), forceShow: new Set(), cut: { x: null, z: null }, sun: 15.2, waterOverride: null, selected: null, content: null, tourActive: false, clock: 0 };
const qs = new URLSearchParams(location.search); APP.capture = qs.has('capture');
if (APP.capture) document.body.classList.add('capture');

export const STEPS = [
  { title: 'The 1964 bridge', date: 'Existing conditions · aerial photo from spring 2024', note: 'Seven I-beam lines, four spans, two 4-ft sidewalks.' },
  { title: 'Road closed, reservoir lowered, causeway Phase 1', date: 'Start of the 200-day closure', note: 'Fort Wayne City Utilities lowers the pool to about El. 764.' },
  { title: 'Old superstructure removed', date: 'Present structure, remove portions', note: 'Deck, railings and 28 beams come off; piers and piles stay.' },
  { title: 'Substructure rebuilt on 1964 piles and piers', date: 'New end-bent caps, wingwalls and pier cap extensions', note: 'Causeway Phase 2 reaches Span C from the east.' },
  { title: 'Bearings and 16 bulb-tee beams set', date: 'BT 36x61 at 11\'-0" centers', note: '32 elastomeric bearings; beams cast 90 days ahead.' },
  { title: 'Diaphragms and deck reinforcing', date: 'C10x30 steel diaphragms, two mats of epoxy bar', note: '84,656 lb of deck steel at 8-inch centers.' },
  { title: 'Deck placed in three pours', date: 'Pour 1 end spans · Pour 2 interior spans · Pour 3 over piers', note: '290.9 CYS of Class C concrete.' },
  { title: 'Railings, approach slabs, moment slab, lighting', date: 'PF-1 railing, 675 ft of pedestrian railing', note: 'Barrier-separated 10-ft walk from Leo to the park.' },
  { title: 'Paving, walks, stairs and riprap; reservoir refilled', date: 'Causeways removed, pool restored to El. 777.7', note: '3,463 tons of revetment riprap.' },
  { title: 'Open to traffic', date: 'Reopened October 31, 2025', note: 'Contract completion date: June 1, 2026.' },
];
const PHASE_OVERRIDE = { oldRail: [0, 1.98], oldDeck: [0, 2.06], oldBeams: [0, 2.8], oldCaps: [0, 2.95], deck1: [6.0, 99], deck2: [6.34, 99], deck3: [6.67, 99], diaPier: [6.67, 99], diaEnd: [6.0, 99], beamsA: [4.0, 99], beamsB: [4.0, 99], beamsC: [4.0, 99], beamsD: [4.0, 99], strandsA: [4.45, 99], strandsB: [4.9, 99], strandsC: [4.9, 99], strandsD: [4.45, 99], bearings: [3.85, 99], diaSteel: [5.0, 99], rebarDeck: [5.3, 99], causeway2: [1.35, 8.2], causeway1: [1.0, 8.2], craneA: [1.55, 7.0], craneB: [1.75, 7.0], rcba: [7.0, 99], momentSlab: [7.15, 99], railS: [7.35, 99], railN: [7.45, 99], pedRail: [7.6, 99], lights: [7.8, 99], pavement: [7.25, 99], markings: [8.7, 99], sidewalk: [8.4, 99], stairs: [8.5, 99], guardrail: [8.6, 99], closure: [0.5, 8.95], pierCaps: [3.1, 99], endBents: [3.4, 99], riprap: [7.0, 99] };
const DROP = {}; const LIFT = {};
const FADE = new Set(['deck1', 'deck2', 'deck3', 'diaPier', 'diaEnd', 'pierCaps', 'endBents', 'rcba', 'momentSlab', 'pavement', 'sidewalk', 'stairs', 'causeway1', 'causeway2', 'markings', 'guardrail', 'closure', 'lights', 'craneA', 'craneB', 'oldDeck', 'oldRail', 'oldCaps', 'bearings', 'diaSteel', 'rebarDeck', 'railS', 'railN', 'pedRail']);
function scheduleLifts() {
  const sched = (list, crane, kind, t0, dt, h) => list.forEach((m, i) => addLift(m, crane, kind, t0 + i * dt, t0 + (i + 1) * dt, { h, len: m.userData.liftInfo.len }));
  const nb = (s) => REG.byId['beams' + 'ABCD'[s]].children.filter((c) => c.userData.liftInfo).reverse(), ob = (s) => REG.byId.oldBeams.children.filter((c) => c.userData.liftInfo && c.userData.liftInfo.span === s);
  sched([...ob(1), ...ob(0)], 'A', 'remove', 2.08, 0.66 / 14, 3.75); sched([...ob(2), ...ob(3)], 'B', 'remove', 2.08, 0.66 / 14, 3.75);   // two cranes work the two halves of the bridge in parallel
  sched([...nb(0), ...nb(1)], 'A', 'set', 4.0, 0.9 / 8, 3); sched([...nb(3), ...nb(2)], 'B', 'set', 4.0, 0.9 / 8, 3);
}
const EXPLODE = { deck1: 16, deck2: 16, deck3: 16, rebarDeck: 11, railS: 25, railN: 25, pedRail: 25, lights: 25, beamsA: 6, beamsB: 6, beamsC: 6, beamsD: 6, strandsA: 6, strandsB: 6, strandsC: 6, strandsD: 6, diaSteel: 6, diaPier: 9.5, diaEnd: 9.5, bearings: 3, pierCaps: 1.2, endBents: 0, rcba: 16, momentSlab: 0 };

let renderer, scene, camera, controls, hiGroup, bridgeRoot, siteRoot;
const ld = (p, m) => { const b = document.getElementById('ldbar'); if (b) { b.style.width = p + '%'; document.getElementById('ldmsg').textContent = m; } };
const nextFrame = () => new Promise((r) => setTimeout(r, 0));

async function boot() {
  const canvas = document.getElementById('gl');
  // ask for more texture slots than WebGPU's default 16, but never more than this GPU offers (a request above the limit fails)
  let lim = {}; try { const ad = !qs.has('webgl') && navigator.gpu ? await navigator.gpu.requestAdapter() : null; if (ad) lim = { maxSampledTexturesPerShaderStage: Math.min(32, ad.limits.maxSampledTexturesPerShaderStage) }; } catch (e) { /* falls back to WebGL 2 */ }
  renderer = new THREE.WebGPURenderer({ canvas, antialias: qs.has('notraa'), forceWebGL: qs.has('webgl'), requiredLimits: lim });
  renderer.setPixelRatio(APP.capture ? +(qs.get('pr') || 1) : Math.min(+(qs.get('ipr') || 1.25), window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true; renderer.toneMapping = qs.has('neutral') ? THREE.NeutralToneMapping : qs.has('aces') ? THREE.ACESFilmicToneMapping : THREE.AgXToneMapping; renderer.toneMappingExposure = +(qs.get('exp') || 0.17);
  await renderer.init(); APP.backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(38, 2, 2, 60000); camera.position.set(-560, 1010, 620);
  controls = new OrbitControls(camera, canvas); controls.target.set(0, 786, -4); controls.enableDamping = true; controls.dampingFactor = 0.08; controls.maxPolarAngle = Math.PI * 0.497; controls.minDistance = 6; controls.maxDistance = 5200; controls.zoomSpeed = 0.9;
  APP.renderer = renderer; APP.scene = scene; APP.camera = camera;
  await initEnv(APP, qs);
  bridgeRoot = new THREE.ClippingGroup(); bridgeRoot.name = 'bridgeRoot'; scene.add(bridgeRoot);
  await initMaterials(); ld(12, 'terrain and aerial imagery'); await nextFrame();
  siteRoot = new THREE.ClippingGroup(); siteRoot.name = 'siteRoot'; scene.add(siteRoot);
  await buildTerrain(siteRoot); ld(38, 'reservoir'); await nextFrame();
  await buildWater(siteRoot, { reflect: ENV.q.reflect, reflRes: +(qs.get('reflres') || (ENV.q.soft ? 0.35 : 1)) }); ld(44, 'buildings and trees'); await nextFrame();
  await buildContext(siteRoot); buildRiprap(siteRoot); await buildFar(scene); ld(55, '1964 bridge'); await nextFrame();
  buildOldBridge(bridgeRoot); ld(62, 'new structure'); await nextFrame();
  buildNewBridge(bridgeRoot); ld(82, 'roadway, railings, lighting'); await nextFrame();
  buildSite(bridgeRoot); buildCranes(bridgeRoot); scheduleLifts(); ld(92, 'annotations'); await nextFrame();
  for (const c of REG.list) if (PHASE_OVERRIDE[c.name]) c.userData.phase = PHASE_OVERRIDE[c.name];
  for (const c of REG.list) if (c.userData.hidden) APP.layerOff.add(c.name);
  hiGroup = new THREE.Group(); scene.add(hiGroup);
  buildAnnotations(scene);
  APP.content = await fetch('data/content.json').then((r) => r.json());
  APP.sheets = await fetch('data/sheets.json').then((r) => r.json()).catch(() => ({}));
  APP.clipPlanes = []; Object.assign(APP, { renderer, scene, camera, controls, ENV, setT, setExplode, setXray, setCut, setSun, setWater, select, flyTo, applyState, render, resize, VIEWS });
  setSun(APP.sun); initUI(APP); initTour(APP);
  resize(); window.addEventListener('resize', resize);
  setT(9); flyTo(VIEWS.overview, 0);
  canvas.addEventListener('pointerdown', onDown); canvas.addEventListener('pointerup', onUp);
  ld(100, 'ready'); document.getElementById('loading').classList.add('hidden');
  window.APP = APP; window.__ready = true;
  if (window.__clean) history.replaceState(null, '', window.__clean);
  { const sel = document.getElementById('selQ'); if (sel) { sel.value = qs.get('q') || 'med'; sel.onchange = () => { localStorage.setItem('gbq', sel.value); location.href = location.pathname + '?q=' + sel.value; }; } }
  if (qs.has('tour')) APP.startTour();
  if (!APP.capture) renderer.setAnimationLoop(loop);
}

// ---------------- state ----------------
const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
function waterFor(t) { const N = P.water.normal, L = P.water.low; if (t < 0.45) return N; if (t < 1.0) return N + (L - N) * ease((t - 0.45) / 0.55); if (t < 7.9) return L; if (t < 8.5) return L + (N - L) * ease((t - 7.9) / 0.6); return N; }
function setT(t, fromUI = false) { APP.t = Math.max(0, Math.min(9, t)); if (fromUI) APP.waterOverride = null; applyState(); setTimelineUI(APP.t); }
function setExplode(v) { APP.explode = v; applyState(); }
function setWater(L) { APP.waterOverride = L; applyState(); }
function setXray(on) {
  APP.xray = on; for (const k of ['deck', 'beam', 'concreteNew', 'concrete']) { const m = M[k]; m.transparent = on; m.opacity = on ? (k === 'beam' ? 0.3 : 0.22) : 1; m.depthWrite = !on; m.needsUpdate = true; }
  applyState();
}
const planes = { x: new THREE.Plane(new THREE.Vector3(1, 0, 0), 0), z: new THREE.Plane(new THREE.Vector3(0, 0, -1), 0) };
function setCut(axis, v) { APP.cut[axis] = v; const list = []; if (APP.cut.x !== null) { planes.x.constant = -APP.cut.x; list.push(planes.x); } if (APP.cut.z !== null) { planes.z.constant = APP.cut.z; list.push(planes.z); } bridgeRoot.clippingPlanes = list; siteRoot.clippingPlanes = list; APP.clipPlanes = list;
  const ds = list.length > 0; for (const k of ['deck', 'beam', 'concreteNew', 'concrete', 'concreteOld', 'asphalt']) { const sd = ds ? THREE.DoubleSide : THREE.FrontSide; if (M[k].side !== sd) { M[k].side = sd; M[k].needsUpdate = true; } } if (scene && APP.applyState) setSectionCaps(bridgeRoot, APP.cut.x, APP.t, APP.explode); setLabelGroups(); }
function setSun(h) { APP.sun = h; setSunDir(h); }

function applyState() {
  const t = APP.t;
  setTerrainState(t < 7 ? 'existing' : 'proposed');
  setWaterLevel(APP.waterOverride !== null ? APP.waterOverride : waterFor(t));
  for (const c of REG.list) {
    const u = c.userData, ph = u.phase || [0, 99]; const id = c.name;
    let vis = t >= ph[0] && t < ph[1] + (LIFT[id] ? 0.3 : 0);
    const off = APP.layerOff.has(id) && !(APP.forceShow.has(id));
    const auto = (id === 'rebarDeck' && t >= 5.3 && t < 6.67 && !APP.userRebarOff) || (APP.xray && u.layer === 'Reinforcement');
    c.visible = vis && (!off || auto);
    let y = 0; const a = ease((t - ph[0]) / 0.22);
    if (DROP[id] && ph[0] > 0) y += (1 - a) * DROP[id];
    if (LIFT[id]) { const b = ease((t - ph[1]) / 0.3); y += b * LIFT[id]; }
    y += APP.explode * (EXPLODE[id] || 0);
    c.position.y = y;
    if (FADE.has(id)) { const o = ph[0] > 0 ? a : 1; const o2 = ph[1] < 90 ? 1 - ease((t - (ph[1] - 0.2)) / 0.2) : 1; setFade(c, Math.min(o, o2)); }
  }
  updateLifts(t);
  M.glass.emissiveIntensity = APP.sun > 19.2 || APP.sun < 6.6 ? 60 : 0.0;
  setSectionCaps(bridgeRoot, APP.cut.x, t, APP.explode);
  refreshLayers(); setLabelGroups(); updateHi();
}
function setFade(c, o) {
  c.traverse((m) => { if (!m.isMesh) return; if (o >= 0.999) { if (m.userData.base) { m.material = m.userData.base; } return; }
    if (!m.userData.fadeMat) { m.userData.base = m.material; m.userData.fadeMat = m.material.clone(); m.userData.fadeMat.transparent = true; }
    m.userData.fadeMat.opacity = o * (m.userData.base.opacity ?? 1); m.material = m.userData.fadeMat; });
}

// ---------------- selection ----------------
function select(id, opts = {}) {
  APP.selected = id || null; updateHi(); if (!opts.silent) showInfo(id ? REG.byId[id] : null);
}
function updateHi() {
  hiGroup.clear(); const c = APP.selected && REG.byId[APP.selected]; if (!c || !c.visible) return;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffa51f, transparent: true, opacity: 0.2, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }); mat.color.multiplyScalar(2.5);   // unlit colours are in scene-linear units; exposure is about 0.17
  c.traverse((m) => { if (m.isInstancedMesh) { const k = new THREE.InstancedMesh(m.geometry, mat, m.count); k.instanceMatrix = m.instanceMatrix; hiGroup.add(k); } else if (m.isMesh && m.parent === c) { const k = new THREE.Mesh(m.geometry, mat); k.position.copy(m.position); k.quaternion.copy(m.quaternion); k.visible = m.visible; hiGroup.add(k); } });
  hiGroup.position.copy(c.position);
}
let downAt = null; const ray = new THREE.Raycaster(); let measure = null;
function hit(ev, all = false) {
  const r = renderer.domElement.getBoundingClientRect(); const v = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(v, camera);
  const objs = []; for (const c of REG.list) if (c.visible && (all || c.userData.pick !== false)) c.traverse((m) => { if (m.isMesh || m.isInstancedMesh) objs.push(m); });
  const hs = ray.intersectObjects(objs, false).filter((h) => (APP.clipPlanes || []).every((pl) => pl.distanceToPoint(h.point) >= 0)); return hs[0] || null;
}
function onDown(e) { downAt = [e.clientX, e.clientY]; }
function onUp(e) {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || APP.tourActive) return;
  if (APP.measuring) { const h = hit(e, true); if (h) APP.onMeasurePoint(h.point.clone()); return; }
  const h = hit(e); select(h ? h.object.userData.comp : null);
}

// ---------------- camera ----------------
const VIEWS = {
  overview: { name: 'Overview', p: [-560, 1010, 620], t: [0, 786, -4] },
  south: { name: 'South elevation', p: [8, 801, 300], t: [0, 779, 0] },
  north: { name: 'North side', p: [-150, 822, -235], t: [-10, 783, 0] },
  deck: { name: 'On the deck', p: [-150, 797.6, 6], t: [60, 794, -3] },
  walk: { name: 'On the walk', p: [-128, 797.2, -20.5], t: [40, 794.5, -21] },
  under: { name: 'Under Span B', p: [-52, 771.5, 34], t: [-30, 786.5, -6] },
  pier: { name: 'Pier 3', p: [34, 781, 52], t: [0, 784.5, 4] },
  bent: { name: 'Bent 1', p: [-78, 783, 44], t: [-109, 786, -2] },
  causeway: { name: 'West causeway', p: [-640, 870, -150], t: [-330, 786, 25] },
  stairs: { name: 'Stairs', p: [150, 806, -98], t: [112, 786, -38] },
  plan: { name: 'Plan', p: [0, 1500, 6], t: [0, 786, 0] },
};
let fly = null;
function flyTo(v, dur = 1.3) {
  const p = new THREE.Vector3(...v.p), t = new THREE.Vector3(...v.t);
  if (!dur) { camera.position.copy(p); controls.target.copy(t); controls.update(); return; }
  fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: p, t1: t, s: performance.now(), dur: dur * 1000 };
}
function resize() { const w = window.innerWidth, h = window.innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
function render() { camera.updateMatrixWorld(); camera.matrixWorldInverse.copy(camera.matrixWorld).invert(); updateLabels(camera, renderer); renderFrame(); }
function loop(now) {
  if (APP.tourActive) { APP.tourTick(now); return; }
  if (fly) { const k = Math.min(1, (now - fly.s) / fly.dur), e = ease(k); camera.position.lerpVectors(fly.p0, fly.p1, e); controls.target.lerpVectors(fly.t0, fly.t1, e); if (k >= 1) fly = null; }
  if (APP.playing) { const dt = Math.min(0.1, (now - (APP.lastNow || now)) / 1000); const nt = APP.t + dt * 0.42; if (nt >= 9) { APP.playing = false; setT(9, true); document.getElementById('tlPlay').textContent = '▶ Play sequence'; } else setT(nt, true); }
  APP.lastNow = now; controls.update(); animateWater(now / 1000); render();
}
boot().catch((e) => { console.error(e); document.getElementById('ldmsg').textContent = 'Error: ' + e.message; window.__error = String(e && e.stack || e); });
