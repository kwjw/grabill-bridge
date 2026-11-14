// Crawler cranes and the lifts they make. Each beam is its own object; a lift moves it along a crane-like path
// (hoist, slew + luff, lower) with the hook, hoist line and slings attached. Equipment is illustrative: the
// contract documents do not specify the contractor's cranes or lift plan.
import * as THREE from 'three';
import { M, comp, mesh, merge, boxG, cylG } from './kit.js';

const L = 122, FOOT_X = 4.5, UP_Y = 4.6, FOOT_Y = 2.4, CARRY = 0.74, YC = 808;
export const CRANES = { A: { x: -50, z: -70, base: 772, park: [-2.75, 62] }, B: { x: 50, z: -70, base: 772, park: [-0.4, 62] } };
export const STAGE = { A: { x: -128, z: -86.5, y: 773.0, yaw: 0.02 }, B: { x: 102, z: -67.5, y: 773.0, yaw: -0.03 } };
const cranes = {}; const jobs = []; const Y = new THREE.Vector3(0, 1, 0); const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function lineMesh(mat) { const g = new THREE.CylinderGeometry(1, 1, 1, 6); g.translate(0, 0.5, 0); const m = new THREE.Mesh(g, mat); m.castShadow = true; return m; }
function setLine(m, a, b, r) { const d = new THREE.Vector3().subVectors(b, a); const len = d.length(); m.position.copy(a); m.scale.set(r, Math.max(0.01, len), r); m.quaternion.setFromUnitVectors(Y, d.normalize()); }

function buildCrane(key, scene, phase) {
  const C = CRANES[key]; const root = new THREE.Group(); root.position.set(C.x, C.base, C.z);
  // lower works: two crawler tracks and the carbody
  const k = [], yel = [];
  for (const s of [-1, 1]) { k.push(boxG(-9.5, 9.5, 0.35, 3.3, s * 6 - 1.5, s * 6 + 1.5)); for (const e of [-9.5, 9.5]) { const c = new THREE.CylinderGeometry(1.48, 1.48, 3, 14); c.rotateX(Math.PI / 2); c.translate(e, 1.83, s * 6); k.push(c); } for (let i = -4; i <= 4; i++) { const w = new THREE.CylinderGeometry(0.55, 0.55, 3.1, 8); w.rotateX(Math.PI / 2); w.translate(i * 2, 0.9, s * 6); k.push(w); } }
  k.push(boxG(-4.2, 4.2, 1.4, 4.0, -4.5, 4.5)); const ring = new THREE.CylinderGeometry(3.2, 3.2, 0.7, 20); ring.translate(0, 4.3, 0); k.push(ring);
  root.add(mesh(merge(k), M.craneK));
  // upper works (slew about Y)
  const up = new THREE.Group(); up.position.y = UP_Y; root.add(up); const uk = [];
  yel.push(boxG(-10, 5.2, 0.2, 6.6, -5, 5)); yel.push(boxG(1.6, 6.6, 0.6, 7.0, 5, 8.3)); uk.push(boxG(-14, -10, 0, 5.8, -5.6, 5.6)); uk.push(boxG(2.2, 6.7, 3.4, 6.6, 5.2, 8.36));
  for (const s of [-1, 1]) { uk.push(cylG(V(-9, 6.6, s * 3.2), V(-11.5, 21, s * 0.6), 0.22, 6)); uk.push(cylG(V(-3, 6.6, s * 3.2), V(-11.5, 21, s * 0.6), 0.2, 6)); }
  up.add(mesh(merge(yel), M.craneY), mesh(merge(uk), M.craneK));
  // lattice boom along +X, luffed about Z
  const boom = new THREE.Group(); boom.position.set(FOOT_X, FOOT_Y, 0); up.add(boom); const bg = []; const half = (x) => 1.7 * Math.min(1, x / 12, (L - x) / 14) + 0.25;
  const N = 20; for (let i = 0; i < N; i++) { const x0 = i * L / N, x1 = (i + 1) * L / N, h0 = half(x0), h1 = half(x1); for (const [sy, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) bg.push(cylG(V(x0, sy * h0, sz * h0), V(x1, sy * h1, sz * h1), 0.2, 5));
    const zig = i % 2 ? 1 : -1; bg.push(cylG(V(x0, zig * h0, h0), V(x1, -zig * h1, h1), 0.08, 4), cylG(V(x0, zig * h0, -h0), V(x1, -zig * h1, -h1), 0.08, 4), cylG(V(x0, h0, zig * h0), V(x1, h1, -zig * h1), 0.08, 4), cylG(V(x0, -h0, zig * h0), V(x1, -h1, -zig * h1), 0.08, 4)); }
  const sh = new THREE.CylinderGeometry(1.1, 1.1, 0.8, 14); sh.rotateX(Math.PI / 2); sh.translate(L, 0, 0); bg.push(sh); boom.add(mesh(merge(bg), M.craneY));
  // lines (world frame): two boom pendants, hoist line, two slings, hook block, spreader
  const lines = new THREE.Group(); const pend = [lineMesh(M.cable), lineMesh(M.cable)], hoist = lineMesh(M.cable), sl = [lineMesh(M.cable), lineMesh(M.cable)]; const hb = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.2, 0.9), M.craneY); hb.castShadow = true;
  const hookG = new THREE.TorusGeometry(0.42, 0.13, 6, 12, Math.PI * 1.4); const hook = new THREE.Mesh(hookG, M.craneK); hook.position.y = -1.5; hb.add(hook); lines.add(...pend, hoist, ...sl, hb);
  const c = comp('crane' + key, { name: `Crawler crane ${key} (illustrative)`, layer: 'Construction staging', phase, pick: true, desc: 'A generic lattice-boom crawler crane on a widened working pad of the temporary causeway, shown to make the lifts legible. The contract documents do not specify the contractor\'s equipment, crane positions or lift plan; all of that is assumed here.', facts: [['Status', 'illustrative, not from the plans'], ['Boom drawn', '122 ft'], ['Working pad', '42 ft x 40 ft at El. 772']], sheets: ['B14', 'B15'] }, root, lines);
  scene.add(c); cranes[key] = { C, root, up, boom, pend, hoist, sl, hb, comp: c, th: C.park[0], r: C.park[1] }; return c;
}

/** register a lift. kind 'set' (staging -> rest) or 'remove' (rest -> staging). mesh must have its pivot at bottom mid-length. */
export function addLift(m, crane, kind, t0, t1, opt = {}) { jobs.push({ m, crane, kind, t0, t1, rest: m.position.clone(), h: opt.h || 3, half: (opt.len || 60) * 0.3 }); }

export function buildCranes(scene) { buildCrane('A', scene, [1.55, 7.0]); buildCrane('B', scene, [1.75, 7.0]); }

function polar(C, p) { return [Math.hypot(p.x - C.x, p.z - C.z), Math.atan2(p.z - C.z, p.x - C.x)]; }
function pose(job, s) {   // s: 0 at staging, 1 at rest
  const cr = cranes[job.crane], C = cr.C, S = STAGE[job.crane]; const [rs, ts] = polar(C, S), [rr, tr0] = polar(C, job.rest); let tr = tr0; while (tr - ts > Math.PI) tr -= 2 * Math.PI; while (tr - ts < -Math.PI) tr += 2 * Math.PI;
  let r, th, y, yaw;
  if (s < 0.22) { r = rs; th = ts; y = S.y + (YC - S.y) * ease(s / 0.22); yaw = S.yaw; }
  else if (s < 0.74) { const e = ease((s - 0.22) / 0.52); r = rs + (rr - rs) * e; th = ts + (tr - ts) * e; y = YC; yaw = S.yaw * (1 - e); }
  else { r = rr; th = tr; y = YC + (job.rest.y - YC) * ease((s - 0.74) / 0.26); yaw = 0; }
  return { x: C.x + r * Math.cos(th), z: C.z + r * Math.sin(th), y, yaw, r, th };
}
function aimCrane(cr, r, th, hookY, load) {
  cr.up.rotation.y = -th; const phi = Math.acos(Math.max(-0.2, Math.min(0.995, (r - FOOT_X) / L))); cr.boom.rotation.z = phi; cr.root.updateMatrixWorld(true);
  const tip = cr.boom.localToWorld(V(L, 0, 0)), gant = [cr.up.localToWorld(V(-11.5, 21, 0.6)), cr.up.localToWorld(V(-11.5, 21, -0.6))]; const tl = [cr.boom.localToWorld(V(L - 2, 0, 1.2)), cr.boom.localToWorld(V(L - 2, 0, -1.2))];
  setLine(cr.pend[0], gant[0], tl[0], 0.07); setLine(cr.pend[1], gant[1], tl[1], 0.07);
  const hy = Math.min(hookY, tip.y - 6); cr.hb.position.set(tip.x, hy, tip.z); cr.hb.rotation.y = load ? -load.yaw : -th; setLine(cr.hoist, V(tip.x, hy + 1.1, tip.z), V(tip.x, tip.y - 1, tip.z), 0.07);
  for (let i = 0; i < 2; i++) { cr.sl[i].visible = !!load; if (load) { const sgn = i ? 1 : -1; setLine(cr.sl[i], V(load.x + sgn * load.half * Math.cos(load.yaw), load.top, load.z + sgn * load.half * Math.sin(load.yaw)), V(tip.x, hy - 1.6, tip.z), 0.055); } }
}
export function updateLifts(t) {
  const act = {};
  for (const j of jobs) { const u = (t - j.t0) / (j.t1 - j.t0); const m = j.m;
    if (j.kind === 'set') { if (u < 0) { m.visible = false; continue; } m.visible = true; if (u >= CARRY) { m.position.copy(j.rest); m.rotation.y = 0; if (u < 1) act[j.crane] = { j, u, p: null }; continue; } const p = pose(j, u / CARRY); m.position.set(p.x, p.y, p.z); m.rotation.y = -p.yaw; act[j.crane] = { j, u, p }; }
    else { if (u < 0) { m.visible = true; m.position.copy(j.rest); m.rotation.y = 0; continue; } if (u >= CARRY) { m.visible = false; if (u < 1) act[j.crane] = { j, u, p: null }; continue; } m.visible = true; const p = pose(j, 1 - u / CARRY); m.position.set(p.x, p.y, p.z); m.rotation.y = -p.yaw; act[j.crane] = { j, u, p }; } }
  for (const key in cranes) { const cr = cranes[key]; if (!cr.comp.visible) continue; const a = act[key];
    if (a && a.p) { cr.r = a.p.r; cr.th = a.p.th; aimCrane(cr, a.p.r, a.p.th, a.p.y + a.j.h + 8.5, { x: a.p.x, z: a.p.z, yaw: a.p.yaw, top: a.p.y + a.j.h, half: a.j.half }); }
    else if (a) { // returning empty to the next pick
      const j = a.j, e = ease((a.u - CARRY) / (1 - CARRY)); const from = pose(j, j.kind === 'set' ? 1 : 0), to = pose(j, j.kind === 'set' ? 0 : 1); let dth = to.th - from.th; aimCrane(cr, from.r + (to.r - from.r) * e, from.th + dth * e, YC + 10, null); cr.r = to.r; cr.th = to.th; }
    else { const first = jobs.filter((j) => j.crane === key).sort((p, q) => p.t0 - q.t0)[0]; const before = first && t < first.t0 && t > first.t0 - 0.25; if (before) { const p = pose(first, first.kind === 'set' ? 0 : 1); const e = ease((t - (first.t0 - 0.25)) / 0.25); aimCrane(cr, cr.C.park[1] + (p.r - cr.C.park[1]) * e, cr.C.park[0] + (p.th - cr.C.park[0]) * e, YC + 10, null); } else aimCrane(cr, cr.C.park[1], cr.C.park[0], 800, null); } }
}
