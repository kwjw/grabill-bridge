// Labels, dimension lines and callouts.
import * as THREE from 'three';
import { P, so, pgAt, fmtSta, deckTop, alignAt } from './project.js';
import { groundAt } from './terrain.js';

export const LABELS = { list: [], groups: { structure: true, spans: true, stations: true, water: true, places: true, section: false, beam: false, tour: true }, lines: {} };
let root, lineMat, lineMatBlue, APPref = null;
const el = () => document.getElementById('labels');

/** add a text label at a 3D point */
export function label(text, pos, group, cls = '', opts = {}) {
  const d = document.createElement('div'); d.className = 'lbl ' + cls; d.innerHTML = text; d.style.display = 'none'; el().appendChild(d);
  const L = { d, pos: pos.clone(), group, max: opts.max || 1e9, min: opts.min || 0, on: true, opacity: 1 }; LABELS.list.push(L); return L;
}
function addLine(group, pts, mat) { (LABELS.lines[group] ||= { pts: [], mat }).pts.push(...pts); }
/** dimension between two points with end ticks; label at mid (offset up by lift) */
export function dim(a, b, text, group, opts = {}) {
  const dir = new THREE.Vector3().subVectors(b, a).normalize(); const up = opts.tick || new THREE.Vector3(0, 1, 0); const k = opts.tickLen || 0.9;
  addLine(group, [a, b, a.clone().addScaledVector(up, k), a.clone().addScaledVector(up, -k), b.clone().addScaledVector(up, k), b.clone().addScaledVector(up, -k)], lineMat);
  if (opts.from) for (const [p, q] of opts.from) addLine(group, [p, q], lineMat);
  return label(text, a.clone().lerp(b, 0.5).add(opts.lift || new THREE.Vector3(0, 0, 0)), group, 'dim', opts);
}

export function buildAnnotations(scene) {
  root = new THREE.Group(); scene.add(root);
  lineMat = new THREE.LineBasicMaterial({ color: 0xffb020, depthTest: false, transparent: true, opacity: 0.95 });
  lineMatBlue = new THREE.LineBasicMaterial({ color: 0x58b7ff, depthTest: false, transparent: true, opacity: 0.9 });
  const V = (x, y, z) => new THREE.Vector3(x, y, z); const xs = [-110, -64, 0, 64, 110]; const S0 = P.staPier3;
  // bents / piers
  P.bents.forEach((b, i) => label(`<b>${b.id}</b><br><span style="opacity:.8">Sta. ${fmtSta(b.sta)}</span>`, V(xs[i], 772.5 - (b.type === 'bent' ? -9 : 0), 21), 'structure', '', { max: 520 }));
  // span dimensions along the south coping
  const yD = 798.5, zD = 17.5;
  for (let i = 0; i < 4; i++) dim(V(xs[i], yD, zD), V(xs[i + 1], yD, zD), `${P.spans[i]}'-0"`, 'spans', { max: 620, from: [[V(xs[i], yD, zD), V(xs[i], 792.5, zD)], [V(xs[i + 1], yD, zD), V(xs[i + 1], 792.5, zD)]] });
  dim(V(-111, yD + 7, zD), V(111, yD + 7, zD), `222'-0" out to out of bridge floor`, 'spans', { max: 700, from: [[V(-111, yD + 7, zD), V(-111, 792.5, zD)], [V(111, yD + 7, zD), V(111, 792.5, zD)]] });
  // stations
  for (let s = 1200; s <= 2500; s += 100) { const a = so(s, 18), b = so(s, 24); const y = pgAt(s) + 0.4; addLine('stations', [V(a.x, y, a.z), V(b.x, y, b.z)], lineMatBlue); label(fmtSta(s).replace('.00', ''), V(b.x, y + 1.5, b.z + 4), 'stations', 'sta', { max: 1000 }); }
  // water levels (tags on the south face of Pier 3)
  const W = P.water; for (const [e, name] of [[W.q100, 'Q100 El. 780.31'], [W.normal, 'Normal pool El. 777.7'], [W.low, 'Low pool El. 764.2'], [W.lowStruct, 'Low structure El. 787.55']]) { const lx = name.startsWith('Q100') ? 12 : 52; addLine('water', [V(24, e, 22), V(40, e, 22)], lineMatBlue); label(name, V(lx, e + 0.4, 22), 'water', 'wl', { max: 380 }); }
  // places
  const pl = (t, x, z, dy = 60) => label(t, V(x, groundAt(x, z, 'existing') + dy, z), 'places', 'place', { min: 500 });
  pl('Leo-Cedarville', -1250, -150, 110); pl('Cedarville Reservoir', -120, 620, 40); pl('St. Joseph River', 150, -480, 40); pl('Riverside Gardens Park', 520, 330, 70); pl('SR 1 · Leo Road', -905, 330, 60); pl('Grabill Road', 900, 40, 60); pl('Leo Cemetery', -640, 420, 60);
  // typical-section dimensions (shown with the cross-section cut), at x = xc
  buildSection(-32);
  for (const k in LABELS.lines) { const g = new THREE.BufferGeometry().setFromPoints(LABELS.lines[k].pts); const ls = new THREE.LineSegments(g, LABELS.lines[k].mat); ls.renderOrder = 50; ls.frustumCulled = false; LABELS.lines[k].obj = ls; root.add(ls); }
  setLabelGroups();
}
function buildSection(xc) {
  const V = (y, z) => new THREE.Vector3(xc + 0.06, y, z); const D = P.deck; const tk = new THREE.Vector3(0, 1, 0); const y0 = deckTop(xc, 0);
  const d = (za, zb, y, text) => dim(V(y, za), V(y, zb), text, 'section', { tickLen: 0.6 });
  d(D.zN, D.zS, y0 + 12.5, `41'-10" out to out of coping`); d(-15, 15, y0 + 9.5, `30'-0" clear roadway`); d(-25.83, -15.83, y0 + 9.5, `10'-0" walk`);
  d(-12, 0, y0 + 6.6, `12'-0" lane`); d(0, 12, y0 + 6.6, `12'-0" lane`); d(-15, -12, y0 + 6.6, `3'`); d(12, 15, y0 + 6.6, `3'`);
  const yb = y0 - 6.2; for (let k = 0; k < 3; k++) d(P.beamZ[k], P.beamZ[k + 1], yb, `11'-0"`); d(D.zN, P.beamZ[0], yb, `4'-5"`); d(P.beamZ[3], D.zS, yb, `4'-5"`);
  label('2.0%', V(y0 + 1.6, -7), 'section', '', {}); label('2.0%', V(y0 + 1.6, 7), 'section', '', {}); label('Line "PR-A" · profile grade', V(y0 + 3.6, 0), 'section', '', {});
  label('BT 36x61 (typ.)', V(y0 - 2.6, P.beamZ[2] + 3.6), 'section', '', {}); label('8" deck', V(y0 + 1.4, 13.2), 'section', '', {});
  label('PF-1 railing', V(y0 + 4.6, 17.6), 'section', '', {}); label('PF-1 Modified', V(y0 + 4.6, -13.2), 'section', '', {}); label('Pedestrian railing', V(y0 + 5.6, -29.5), 'section', '', {});
}
export function setLabelGroups() {
  const A = window.APP; const G = LABELS.groups; const on = A ? A.labels : true; const tour = A && A.tourActive;
  const t = A ? A.t : 9; const show = { structure: on, spans: on && t >= 6, stations: on && !tour, water: on, places: on, section: (A && A.cut.x !== null) || G.section, beam: G.beam, tour: true };
  if (tour) Object.assign(show, A.tourLabels || {});
  for (const L of LABELS.list) L.on = !!show[L.group];
  for (const k in LABELS.lines) if (LABELS.lines[k].obj) LABELS.lines[k].obj.visible = !!show[k];
}
const v = new THREE.Vector3(), rc = new THREE.Raycaster(), dv = new THREE.Vector3();
const OCC = ['deck1', 'deck2', 'deck3', 'rcba', 'pavement', 'momentSlab', 'oldDeck', 'beamsA', 'beamsB', 'beamsC', 'beamsD'];
export function updateLabels(camera, renderer) {
  const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight; const A = window.APP; let occ = null;
  for (const L of LABELS.list) {
    if (!L.on || L.opacity <= 0.01) { if (L.d.style.display !== 'none') L.d.style.display = 'none'; continue; }
    v.copy(L.pos).project(camera); const dist = camera.position.distanceTo(L.pos);
    let hide = v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.15 || Math.abs(v.y) > 1.15 || dist > L.max || dist < L.min;
    if (!hide && L.occl !== false && dist < 900 && A) {
      if (!occ) { occ = []; for (const id of OCC) { const c = A.scene.getObjectByName(id); if (c && c.visible) c.traverse((m) => { if (m.isMesh) occ.push(m); }); } }
      dv.subVectors(L.pos, camera.position).normalize(); rc.set(camera.position, dv); rc.far = dist - 1.5; if (occ.length && rc.intersectObjects(occ, false).length) hide = true;
    }
    if (hide) { if (L.d.style.display !== 'none') L.d.style.display = 'none'; continue; }
    L.d.style.display = ''; L.d.style.left = ((v.x * 0.5 + 0.5) * w).toFixed(1) + 'px'; L.d.style.top = ((-v.y * 0.5 + 0.5) * h).toFixed(1) + 'px'; L.d.style.opacity = L.opacity;
  }
}
/** temporary callouts used by the tour */
export function removeLabels(group) { for (let i = LABELS.list.length - 1; i >= 0; i--) if (LABELS.list[i].group === group) { LABELS.list[i].d.remove(); LABELS.list.splice(i, 1); } }
