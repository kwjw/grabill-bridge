// Terrain (USGS 3DEP lidar DEM), aerial drape (Indiana 2024 orthophoto), reservoir water,
// building massing (Indiana building footprints) and trees (canopy classified from NAIP).
import * as THREE from 'three';
import { P, P as P_, toSO, pgAt, so } from './project.js';
import { M, TEX, rng, mesh, comp, loadTex as loadTile, detail } from './kit.js';
import { texture, uv, positionWorld, positionView, normalView, normalWorld, attribute, uniform, float, vec2, vec3, vec4, mix, smoothstep, clamp, dot, max, min, cameraPosition, mx_noise_float, mx_worley_noise_float, Fn, reflector, positionLocal, normalize, pow, exp, transformNormalToView, faceDirection, length } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildTrees } from './trees.js';

export const GEO = { outer: [-2400, 2400, -1700, 1700], inner: [-1000, 800, -450, 450], fine: [-420, 420, -180, 180], ro: 8, ri: 2, lidarWL: 777.06 };
export const T = { existing: null, proposed: null, outer: null, wetI: null, wetO: null, nxI: 901, nzI: 451, nxO: 601, nzO: 426 };

// ---- corridor (paved / walk limits) as offsets from Line "PR-A": [sta, north(-), south(+)]
const COR = [
  [1119.85, -25.0, 13.6], [1160, -25.6, 13.6], [1359, -25.6, 13.6], [1400, -30.0, 16.7], [1450, -27.5, 16.7], [1500, -25.83, 16.7],
  [1833.85, -25.83, 16.7], [1834, -25.83, 16.0], [2055.85, -25.83, 16.0], [2056, -25.83, 16.7], [2078, -26.5, 16.7], [2092, -29.0, 16.0],
  [2302, -29.0, 15.0], [2312, -15.0, 15.0], [2500, -15.0, 13.6],
];
export function corridor(sta) {
  if (sta <= COR[0][0]) return [COR[0][1], COR[0][2]]; const n = COR.length; if (sta >= COR[n - 1][0]) return [COR[n - 1][1], COR[n - 1][2]];
  let i = 0; while (sta > COR[i + 1][0]) i++; const t = (sta - COR[i][0]) / (COR[i + 1][0] - COR[i][0]);
  return [COR[i][1] + t * (COR[i + 1][1] - COR[i][1]), COR[i][2] + t * (COR[i + 1][2] - COR[i][2])];
}
/** finished surface elevation in the corridor (2% crown about PR-A) */
export const designEl = (sta, off) => pgAt(sta) - P.crown * Math.abs(off);

async function f32(url) { return new Float32Array(await (await fetch(url)).arrayBuffer()); }
async function u8(url) { return new Uint8Array(await (await fetch(url)).arrayBuffer()); }
const ANISO = +(new URLSearchParams(location.search).get('aniso') || 8);
async function loadTex(url) { const t = await new THREE.TextureLoader().loadAsync(url); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO; t.flipY = true; return t; }

function bil(a, nx, nz, x0, z0, res, x, z) {
  let fx = (x - x0) / res, fz = (z - z0) / res; fx = Math.max(0, Math.min(nx - 1.001, fx)); fz = Math.max(0, Math.min(nz - 1.001, fz));
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j; const k = j * nx + i;
  return a[k] * (1 - tx) * (1 - tz) + a[k + 1] * tx * (1 - tz) + a[k + nx] * (1 - tx) * tz + a[k + nx + 1] * tx * tz;
}
export function inInner(x, z, pad = 0) { const e = GEO.inner; return x >= e[0] + pad && x <= e[1] - pad && z >= e[2] + pad && z <= e[3] - pad; }
/** ground elevation; which = 'existing' | 'proposed' */
export function groundAt(x, z, which = 'proposed') {
  if (inInner(x, z)) return bil(T[which], T.nxI, T.nzI, GEO.inner[0], GEO.inner[2], GEO.ri, x, z);
  return bil(T.outer, T.nxO, T.nzO, GEO.outer[0], GEO.outer[2], GEO.ro, x, z);
}
export function isWet(x, z) {
  if (inInner(x, z)) { const i = Math.round((x - GEO.inner[0]) / GEO.ri), j = Math.round((z - GEO.inner[2]) / GEO.ri); return T.wetI[j * T.nxI + i] > 0; }
  const i = Math.round((x - GEO.outer[0]) / GEO.ro), j = Math.round((z - GEO.outer[2]) / GEO.ro); return T.wetO[Math.max(0, Math.min(T.nzO - 1, j)) * T.nxO + Math.max(0, Math.min(T.nxO - 1, i))] > 0;
}

/** Proposed grading: lay the design corridor into the lidar surface with 2:1 / 3:1 side slopes. Also riprap zones. */
function gradeProposed(ex) {
  const { nxI: nx, nzI: nz } = T; const out = new Float32Array(ex); const mix = new Float32Array(nx * nz * 4); // wet, revetment, class1, grouted
  const [x0, , z0] = GEO.inner; const res = GEO.ri; const zE = P.zExist;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i; const x = x0 + i * res, z = z0 + j * res; const wet = T.wetI[k] > 0;
    const underDeck = Math.abs(x) <= 133 && z >= -27 && z <= 17.5;
    mix[k * 4] = wet || underDeck ? 1 : 0;
    const s = toSO(x, z); const sta = s.sta, off = s.off;
    let h = ex[k];
    if (sta > 1119.85 && sta < 2500 && !(sta > 1836.5 && sta < 2053.2)) {
      const [n, so_] = corridor(sta); const rip = sta > 1405 && sta < 2075; const sl = rip ? 2.0 : 3.0;
      const taper = Math.min(1, (sta - 1119.85) / 30, (2500 - sta) / 30);       // feather into existing at the project limits
      if (off >= n && off <= so_) h = ex[k] + taper * ((designEl(sta, off) - 0.45) - ex[k]);
      else {
        const edge = off < n ? n : so_; const d = Math.abs(off - edge); const eEl = designEl(sta, edge) - 0.45;
        const fill = eEl - Math.max(0, d - 1.5) / sl, cut = eEl + Math.max(0, d - 1.5) / 3;
        let hh = ex[k]; if (fill > hh) hh = fill; else if (cut < hh) hh = cut;
        if (rip && sta < 1850 && hh > fill) { const w = Math.min(1, Math.max(0, (24 - d) / 14)); hh += (fill - hh) * w * w * (3 - 2 * w); }   // dress the old shoulder to the 2:1 riprap slope
        h = ex[k] + taper * (hh - ex[k]);
        // revetment riprap on the reservoir slopes of the west causeway (sheets 11-12)
        if (rip && sta < 1850 && d > 1.0 && d < 95 && (h < eEl - 0.4 || d < 16)) mix[k * 4 + 1] = 1;
        if (h > 778.6 && !underDeck) mix[k * 4] = 0;
      }
    }
    // spill slopes at the end bents (revetment riprap over geotextile, sheet 30)
    if (x > -113 && x < -66 && z > -44 && z < 34 && h > 766.5 && h < 787) mix[k * 4 + 1] = 1;
    if (x > 72 && x < 83.5 && z > -40 && z < 30 && h > 766.5 && h < 779) mix[k * 4 + 1] = 0.85;
    if (x > 96 && x < 112 && z > -40 && z < 30 && h > 779 && h < 787) mix[k * 4 + 1] = 0.85;
    // cut the bank for the north-east staircase (sheets 18-19): keep the ground just below the stair surface
    if (x > 97 && x < 131 && z > -50 && z < -25.5) {
      let ys = 1e9;
      if (x > 119.4 && x < 128.6) { if (z > -31.83) ys = 790.2; else if (z > -38.25) ys = 791.4 + (z + 31.83) * 0.636 - 1.2; else ys = 785.5; }
      else if (x <= 119.4 && z < -39 && z > -46.6) { ys = x > 109.3 ? 786.73 - (120.3 - x) * 0.636 - 1.2 : 778.3; }
      else if (x <= 119.4 && z >= -39 && z > -50) { const zz = -39 - z; ys = (x > 109.3 ? 786.73 - (120.3 - x) * 0.636 : 779.15) + 0.2 + (-zz) * 0.5; }
      if (z <= -46.6) ys = Math.min(ys, (x > 109.3 ? 786.73 - Math.max(0, 120.3 - x) * 0.636 : 779.15) + (-46.6 - z) * 0.5);
      if (ys < h) h = ys;
    }
    // grouted riprap at the north-east corner (130 SYS, sheet 12)
    if (x > 96 && x < 119 && z > -39.5 && z < -26 && h < 790 && h > 778.6) { mix[k * 4 + 3] = 1; mix[k * 4 + 1] = 0; }
    // Class 1 riprap scour protection at the piers (14'-6" x ~60', sheet 30)
    for (const px of [-64, 0, 64]) if (Math.abs(x - px) <= 7.25 && Math.abs(z - zE) <= 31) mix[k * 4 + 2] = 1;
    out[k] = h;
  }
  return { out, mix };
}

export const WATER = { uLevel: uniform(777.7), uTime: uniform(0) };
/** perturb the shading normal from a procedural height (screen-space derivatives) */
const bumpH = (h, scale) => Fn(() => { const dH = vec2(h.dFdx(), h.dFdy()).mul(scale); const sx = positionView.dFdx().normalize(), sy = positionView.dFdy().normalize(); const R1 = sy.cross(normalView), R2 = normalView.cross(sx); const det = sx.dot(R1).mul(faceDirection); const grad = det.sign().mul(dH.x.mul(R1).add(dH.y.mul(R2))); return det.abs().mul(normalView).sub(grad).normalize(); })();
const lum = (c) => dot(c, vec3(0.3, 0.59, 0.11));
function terrainMaterial(maps) {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0 }); const P = positionWorld; const mx = attribute('aMix', 'vec4');
  // ground footprint of one screen pixel, in feet. Where it is finer than the aerial photo can resolve (3 in. pixels), the photo is
  // used only as a blurred colour reference and scanned ground materials supply all the detail, so nothing is ever magnified.
  const fp = max(length(P.xz.dFdx()), length(P.xz.dFdy())); const near = smoothstep(0.75, 0.16, fp), nearFine = smoothstep(0.12, 0.03, fp);
  const grade = (c) => { const L = lum(c); const blue = clamp(c.b.sub(max(c.r, c.g)).mul(9), 0, 1); const g = mix(vec3(L), c, 1.2).max(0).mul(vec3(1.04, 1.0, 0.9)); return mix(g, vec3(L).mul(vec3(1.22, 1.18, 1.06)), blue.mul(0.85)).mul(0.46); };
  let sharp = texture(maps.main, uv()).rgb, soft = texture(maps.main, uv()).bias(2.5).rgb;
  if (maps.fine) { const e = maps.fineExt; const fuv = vec2(P.x.sub(e[0]).div(e[2] - e[0]), float(1).sub(P.z.sub(e[1]).div(e[3] - e[1]))); const edge = smoothstep(0.0, 0.04, min(min(fuv.x, fuv.x.oneMinus()), min(fuv.y, fuv.y.oneMinus()))); const fc = fuv.clamp(0, 1);
    sharp = mix(sharp, texture(maps.fine, fc).rgb, edge); soft = mix(soft, texture(maps.fine, fc).bias(4.5).rgb, edge); }
  let col = mix(grade(sharp), grade(soft), near);
  // summer: where the leaf-on NAIP image shows vegetation or soil rather than pavement, tint the ground to July grass, part green, part dry
  let grassAmt = float(0.5);
  if (maps.summer) { const [ox0, ox1, oz0, oz1] = GEO.outer; const sm = texture(maps.summer, vec2(P.x.sub(ox0).div(ox1 - ox0), float(1).sub(P.z.sub(oz0).div(oz1 - oz0)))).rgb; const sS = max(sm.r, max(sm.g, sm.b)).sub(min(sm.r, min(sm.g, sm.b))); const sm2 = texture(maps.summer, vec2(P.x.sub(ox0).div(ox1 - ox0), float(1).sub(P.z.sub(oz0).div(oz1 - oz0)))).bias(3).rgb; const sS2 = max(sm2.r, max(sm2.g, sm2.b)).sub(min(sm2.r, min(sm2.g, sm2.b))); grassAmt = smoothstep(0.02, 0.07, mix(sS, sS2, 0.7)); }
  const Lc = lum(col); const dry = mx_noise_float(vec3(P.x.mul(0.004), P.z.mul(0.004), 3.3)).mul(0.5).add(0.5);
  col = mix(col, vec3(Lc).mul(1.12).mul(mix(vec3(0.6, 1.3, 0.28), vec3(1.1, 1.1, 0.4), dry.mul(0.5))), grassAmt.mul(0.9));
  // scanned detail at three scales (so neither tiling nor blur is visible at any zoom): turf, or pavement
  const gD = detail('leafy_grass', P.xz.div(6.5)).mul(detail('leafy_grass', P.xz.div(27).add(0.3))), gF = detail('leafy_grass', P.xz.div(1.9).add(0.17));
  const pD = detail('asphalt_02', P.xz.div(8)).mul(detail('asphalt_02', P.xz.div(33).add(0.6))), pF = detail('asphalt_02', P.xz.div(2.3).add(0.41));
  const det = mix(pD.mul(mix(vec3(1), pF, nearFine)), gD.mul(mix(vec3(1), gF, nearFine)), grassAmt); const detL = lum(det);
  col = mix(col, col.mul(det), near);
  // exposed reservoir bed: silt and mud, darker and glossy where wet near the waterline
  const mudD = detail('brown_mud_dry', P.xz.div(13)).mul(detail('brown_mud_dry', P.xz.div(57).add(0.21))).mul(mix(vec3(1), detail('brown_mud_dry', P.xz.div(3.1).add(0.53)), nearFine));
  const big = mx_noise_float(vec3(P.x.mul(0.006), P.z.mul(0.006), 1.7)).mul(0.5).add(0.5); const deep = smoothstep(778, 764, P.y);
  const ch = mx_noise_float(vec3(P.x.mul(0.0017), P.z.mul(0.0017), 8.4)).mul(0.5).add(0.5), pat = mx_noise_float(vec3(P.x.mul(0.021), P.z.mul(0.021), 2.2)).mul(0.5).add(0.5);
  let mud = mix(vec3(lum(mudD)), mudD, 0.6).mul(mix(vec3(0.2, 0.172, 0.125), vec3(0.15, 0.15, 0.115), smoothstep(0.45, 0.7, ch))).mul(mix(float(1.12), float(0.72), deep)).mul(big.mul(0.5).add(0.75)).mul(pat.mul(0.3).add(0.85));
  const wet = smoothstep(WATER.uLevel.add(3.0), WATER.uLevel.add(0.15), P.y).mul(mx.x); mud = mud.mul(mix(float(1), float(0.5), wet));
  col = mix(col, mud, mx.x);
  // riprap under the stones: revetment (y), class 1 at the piers (z), grouted (w)
  const rU = vec2(P.x.add(P.y.mul(0.83)), P.z.add(P.y.mul(0.57))); const rd = detail('gray_rocks', rU.div(8)); const rk = mix(vec3(lum(rd)), rd, 0.35).mul(vec3(0.6, 0.585, 0.55)).mul(mx_noise_float(vec3(P.x.mul(0.05), P.z.mul(0.05), 5.0)).mul(0.14).add(1));
  const rkH = texture(TEX.gray_rocks.disp, rU.div(8)).r; const wR = smoothstep(0.35, 0.65, mx.y), wC = smoothstep(0.35, 0.65, mx.z), wG = smoothstep(0.35, 0.65, mx.w); const wRock = max(wR, max(wC, wG));
  col = mix(col, rk, wR); col = mix(col, rk.mul(0.8), wC); col = mix(col, mix(rk, vec3(0.5, 0.49, 0.46), 0.55), wG);
  col = col.mul(mix(float(1), float(0.55), smoothstep(WATER.uLevel.add(1.2), WATER.uLevel.add(0.1), P.y).mul(wRock)));
  m.colorNode = col;
  m.roughnessNode = mix(float(0.96), float(0.32), wet.mul(0.9)).mul(mix(float(1), float(0.9), wRock));
  const h = lum(mudD).mul(mx.x).mul(0.4).add(rkH.mul(wRock).mul(7)).add(detL.mul(near).mul(0.45).mul(mx.x.oneMinus()).mul(wRock.oneMinus()));
  m.normalNode = bumpH(h, 0.3);
  return m;
}

/** Regular grid mesh over lattice range [i0..i1] x [j0..j1] taking every `st`-th sample; hole = [i0,i1,j0,j1] left open; skirt hides LOD cracks. */
function gridGeom(h, nx, nz, x0, z0, res, ext, mix, o = {}) {
  const st = o.st || 1, i0 = o.i0 || 0, j0 = o.j0 || 0, i1 = o.i1 ?? nx - 1, j1 = o.j1 ?? nz - 1; const mx = Math.floor((i1 - i0) / st) + 1, mz = Math.floor((j1 - j0) / st) + 1;
  const sk = o.skirt ? 2 * (mx + mz) : 0; const nv = mx * mz + sk; const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), mxa = new Float32Array(nv * 4);
  const sk_ = o.sink; const put = (v, i, j, dy) => { const k = j * nx + i; const X = x0 + i * res, Z = z0 + j * res; if (sk_ && X > sk_[0] + 0.01 && X < sk_[1] - 0.01 && Z > sk_[2] + 0.01 && Z < sk_[3] - 0.01) dy += sk_[4]; pos[v * 3] = X; pos[v * 3 + 1] = h[k] - dy; pos[v * 3 + 2] = Z; uv[v * 2] = (pos[v * 3] - ext[0]) / (ext[1] - ext[0]); uv[v * 2 + 1] = 1 - (pos[v * 3 + 2] - ext[2]) / (ext[3] - ext[2]); if (mix) for (let c = 0; c < 4; c++) mxa[v * 4 + c] = mix[k * 4 + c]; };
  for (let b = 0; b < mz; b++) for (let a = 0; a < mx; a++) put(b * mx + a, i0 + a * st, j0 + b * st, 0);
  const idx = []; const hr = o.holeRect;
  for (let b = 0; b < mz - 1; b++) for (let a = 0; a < mx - 1; a++) { const i = i0 + a * st, j = j0 + b * st; if (hr) { const xa = x0 + i * res, xb = xa + st * res, za = z0 + j * res, zb = za + st * res; if (xa >= hr[0] && xb <= hr[1] && za >= hr[2] && zb <= hr[3]) continue; } const p = b * mx + a, q = p + 1, r = p + mx, t = r + 1; idx.push(p, r, q, q, r, t); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('aMix', new THREE.BufferAttribute(mxa, 4)); g.setIndex(idx.slice()); g.computeVertexNormals();
  if (o.skirt) { let v = mx * mz; const ring = []; for (let a = 0; a < mx; a++) ring.push([a, 0]); for (let b = 1; b < mz; b++) ring.push([mx - 1, b]); for (let a = mx - 2; a >= 0; a--) ring.push([a, mz - 1]); for (let b = mz - 2; b >= 1; b--) ring.push([0, b]);
    const base = v, n = g.attributes.normal; for (const [a, b] of ring) { put(v, i0 + a * st, j0 + b * st, o.skirt); const src = b * mx + a; n.setXYZ(v, n.getX(src), n.getY(src), n.getZ(src)); v++; }
    for (let k = 0; k < ring.length; k++) { const m = (k + 1) % ring.length; const A = ring[k][1] * mx + ring[k][0], B = ring[m][1] * mx + ring[m][0], C = base + k, Dd = base + m; idx.push(A, B, C, B, Dd, C, A, C, B, B, C, Dd); }
    g.setIndex(idx); g.attributes.position.needsUpdate = true; }
  return g;
}

export async function buildTerrain(scene) {
  const [hi, ho, wi, wo, tO, tI, tF, tS] = await Promise.all([f32('data/terrain_inner.f32'), f32('data/terrain_outer.f32'), u8('data/water_inner.u8'), u8('data/water_outer.u8'), loadTex('data/ortho_outer.jpg'), loadTex('data/ortho_inner.jpg'), loadTex('data/ortho_fine.jpg'), loadTex('data/naip_outer.jpg')]);
  T.existing = hi; T.outer = ho; T.wetI = wi; T.wetO = wo;
  const gp = gradeProposed(hi); T.proposed = gp.out; T.mixProposed = gp.mix;
  // existing-condition mix: wet + under-deck only
  const mixE = new Float32Array(gp.mix.length); for (let k = 0; k < mixE.length; k += 4) mixE[k] = gp.mix[k];
  const mixO = new Float32Array(T.nxO * T.nzO * 4); for (let k = 0; k < wo.length; k++) mixO[k * 4] = wo[k] ? 1 : 0;
  const [ox0, , oz0] = GEO.outer, [ix0, ix1, iz0, iz1] = GEO.inner;
  // three levels of detail: 16 ft far field, 4 ft around the project, 2 ft core along the roadway and bridge
  const gO = gridGeom(ho, T.nxO, T.nzO, ox0, oz0, GEO.ro, GEO.outer, mixO, { st: 2, holeRect: GEO.inner, sink: [...GEO.inner, 2.5] });
  const matO = terrainMaterial({ main: tO, mix: true, summer: tS }), matI = terrainMaterial({ main: tI, summer: tS, fine: tF, fineExt: [GEO.fine[0], GEO.fine[2], GEO.fine[1], GEO.fine[3]], mix: true });
  const outer = mesh(gO, matO, { cast: false });
  const CR = [-560, 300, -138, 122]; const ci = [(CR[0] - ix0) / GEO.ri, (CR[1] - ix0) / GEO.ri, (CR[2] - iz0) / GEO.ri, (CR[3] - iz0) / GEO.ri];
  const lod = (h, mix) => { const g = new THREE.Group(); g.add(mesh(gridGeom(h, T.nxI, T.nzI, ix0, iz0, GEO.ri, GEO.inner, mix, { st: 2, holeRect: CR, sink: [...CR, 1.2], skirt: 4 }), matI, { cast: false })); g.add(mesh(gridGeom(h, T.nxI, T.nzI, ix0, iz0, GEO.ri, GEO.inner, mix, { i0: ci[0], i1: ci[1], j0: ci[2], j1: ci[3], skirt: 2.5 }), matI, { cast: false })); return g; };
  const innerE = lod(hi, mixE), innerP = lod(gp.out, gp.mix);
  innerE.name = 'terrainExisting'; innerP.name = 'terrainProposed'; innerE.visible = false;
  T.meshE = innerE; T.meshP = innerP; T.meshO = outer; T.orthoOuter = tO;
  const g = comp('terrain', { name: 'Terrain and aerial photo', layer: 'Site', pick: false,
    desc: 'Ground surface from the USGS 3DEP lidar elevation model, draped with the State of Indiana 2024 orthophoto (3-inch pixels, flown before construction). The reservoir bed is not in the lidar; under the bridge it follows the plan elevation view, elsewhere it is an estimate.',
    facts: [['Elevation source', 'USGS 3DEP 1 m DEM'], ['Imagery', 'Indiana orthophotography, spring 2024'], ['Bed under water', 'approximate']], sheets: ['B11', 'B12', 'B13'] }, outer, innerE, innerP);
  scene.add(g); return g;
}
export function setTerrainState(which) { if (!T.meshE) return; T.meshE.visible = which === 'existing'; T.meshP.visible = which !== 'existing'; T.current = which === 'existing' ? 'existing' : 'proposed'; }

// ---------------- water ----------------
// Planar-reflection water with depth-based absorption. Lit (so it takes the bridge's shadow and the sun glint);
// the sky / bridge reflection comes from a mirrored render of the scene.
let water = null;
function bedTexture(which) {
  const res = 5, [x0, x1, z0, z1] = GEO.outer; const nx = Math.round((x1 - x0) / res) + 1, nz = Math.round((z1 - z0) / res) + 1; const a = new Uint16Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = x0 + i * res, z = z0 + j * res; const wetc = isWet(x, z) || (Math.abs(x) < 140 && Math.abs(z) < 60); const gh = groundAt(x, z, which); a[j * nx + i] = THREE.DataUtils.toHalfFloat(wetc || gh < 776.6 ? gh - 760 : 40); }
  const t = new THREE.DataTexture(a, nx, nz, THREE.RedFormat, THREE.HalfFloatType); t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
export async function buildWater(scene, Q = {}) {
  const res = 10, [x0, x1, z0, z1] = GEO.outer; const nx = Math.round((x1 - x0) / res) + 1, nz = Math.round((z1 - z0) / res) + 1;
  const pos = new Float32Array(nx * nz * 3), wetv = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; const x = x0 + i * res, z = z0 + j * res; pos[k * 3] = x; pos[k * 3 + 2] = z; wetv[k] = isWet(x, z) || (Math.abs(x) < 140 && Math.abs(z) < 60) || groundAt(x, z, 'existing') < 776.6 ? 1 : 0; }
  const idx = []; for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1; let any = 0; for (let dj = -1; dj <= 2 && !any; dj++) for (let di = -1; di <= 2; di++) { const jj = j + dj, ii = i + di; if (jj >= 0 && jj < nz && ii >= 0 && ii < nx && wetv[jj * nx + ii]) { any = 1; break; } } if (!any) continue; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); const nrm = new Float32Array(nx * nz * 3); for (let k = 0; k < nx * nz; k++) nrm[k * 3 + 1] = 1; g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  const beds = { existing: bedTexture('existing'), proposed: bedTexture('proposed') }; const bedTex = texture(beds.proposed);
  const wn = await loadTile('tex/waternormals.jpg'); const N = texture(wn);
  const P = positionWorld, t = WATER.uTime; const [ox0, ox1, oz0, oz1] = GEO.outer;
  const bed = bedTex.sample(vec2(P.x.sub(ox0).div(ox1 - ox0), P.z.sub(oz0).div(oz1 - oz0))).r.add(760); const d = WATER.uLevel.sub(bed).max(0);
  const s0 = N.sample(P.xz.div(19).add(vec2(t.div(31), t.div(47)))), s1 = N.sample(P.xz.div(27).sub(vec2(t.div(41), t.div(-53)))), s2 = N.sample(P.xz.div(173).add(vec2(t.div(160), t.div(140)))), s3 = N.sample(P.xz.div(611).sub(vec2(t.div(300), t.div(-340))));
  const noise = s0.add(s1).add(s2.mul(1.3)).add(s3.mul(0.7)).mul(0.5).sub(1); const chop = uniform(Q.chop ?? 0.9);
  const nW = normalize(vec3(noise.x.mul(chop), 1.0, noise.y.mul(chop)));
  const eye = normalize(cameraPosition.sub(P)); const dist = length(cameraPosition.sub(P));
  const theta = max(dot(eye, nW), 0.0); const fres = pow(theta.oneMinus(), 5.0).mul(0.98).add(0.02);
  const m = new THREE.MeshStandardNodeMaterial({ transparent: true, roughness: 0.08, metalness: 0, depthWrite: false });
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.mapping = THREE.EquirectangularReflectionMapping; black.needsUpdate = true; m.envMap = black;   // sky reflection comes from the mirror, not the PMREM
  // body colour: silty green-brown lake water; light is absorbed with depth
  const absorb = exp(d.mul(-0.9)); const shallow = vec3(0.15, 0.14, 0.07), deepC = vec3(0.07, 0.074, 0.04);
  // lily-pad mats on the shallow south side of the causeway (seen in aerial and street-level photos); they go when the pool is drawn down
  const padZone = smoothstep(-80, -200, P.x).mul(smoothstep(-1000, -820, P.x)).mul(smoothstep(45, 110, P.z)).mul(smoothstep(640, 420, P.z)).mul(smoothstep(0.6, 1.6, d)).mul(smoothstep(11, 7, d)).mul(smoothstep(776.2, 777.4, WATER.uLevel));
  const patch = smoothstep(-0.12, 0.22, mx_noise_float(vec3(P.x.mul(0.011), P.z.mul(0.011), 4.2)).add(mx_noise_float(vec3(P.x.mul(0.05), P.z.mul(0.05), 9.1)).mul(0.45))).mul(padZone);
  const cell = mx_worley_noise_float(vec3(P.x.mul(0.62), P.z.mul(0.62), 0.0)); const pad = smoothstep(0.52, 0.4, cell).mul(patch).mul(smoothstep(170, 60, dist).mul(0.5).add(0.5)); const padFar = patch.mul(smoothstep(60, 220, dist)).mul(0.6); const pads = max(pad, padFar);
  const padCol = mix(vec3(0.1, 0.2, 0.035), vec3(0.2, 0.3, 0.06), mx_noise_float(vec3(P.x.mul(1.7), P.z.mul(1.7), 2.0)).mul(0.5).add(0.5));
  m.colorNode = mix(mix(deepC, shallow, absorb).mul(fres.oneMinus()), padCol, pads);
  m.roughnessNode = mix(float(0.08), float(0.7), pads);
  m.normalNode = transformNormalToView(normalize(mix(nW, vec3(0, 1, 0), pads.mul(0.85))));
  let refl; if (Q.reflect !== false) { const mir = reflector({ resolutionScale: Q.reflRes || 0.5 }); mir.target.rotation.x = -Math.PI / 2; const distort = nW.xz.mul(float(0.004).add(float(7).div(dist.add(60)))).mul(Q.distort ?? 1.0); mir.uvNode = mir.uvNode.add(distort); refl = mir.rgb; water = { mirTarget: mir.target }; }
  else { refl = vec3(0.55, 0.68, 0.85).mul(4.0); water = {}; }
  m.emissiveNode = refl.mul(fres).mul(0.82).mul(pads.oneMinus());
  const edge = smoothstep(0.0, 0.35, d); m.opacityNode = max(mix(float(1).sub(exp(d.mul(-2.6))).mul(0.985), float(1), fres), pads).mul(edge);
  const mesh_ = new THREE.Mesh(g, m); mesh_.renderOrder = 5; mesh_.receiveShadow = true; mesh_.frustumCulled = false; if (water.mirTarget) mesh_.add(water.mirTarget);
  Object.assign(water, { m: mesh_, level: P_.water.normal, bedTex, beds });
  const c = comp('water', { name: 'Cedarville Reservoir (St. Joseph River)', layer: 'Site', pick: false,
    desc: 'The bridge crosses the Cedarville Reservoir, a Fort Wayne City Utilities water-supply impoundment of the St. Joseph River. The contract required coordination with the utility to lower the pool so the temporary causeway (top elevation 772.0) could be built in the dry.',
    facts: [['Normal pool', 'El. 777.7 ±'], ['Q100', 'El. 780.31'], ['Low pool (lowered)', 'El. 764.2 ±'], ['Flow line', 'El. 762.66'], ['Low structure', 'El. 787.55']], sheets: ['B30', 'B14'] }, mesh_);
  scene.add(c); setWaterLevel(P_.water.normal); return c;
}
export function setWaterLevel(L) { if (!water) return; water.level = L; water.m.position.y = L; WATER.uLevel.value = L; const want = water.beds[T.current === 'existing' ? 'existing' : 'proposed']; if (water.bedTex.value !== want) water.bedTex.value = want; }
export const getWaterLevel = () => (water ? water.level : P_.water.normal);
export function animateWater(t) { WATER.uTime.value = t; }

// ---------------- buildings & trees ----------------
function leafTexture() {
  // a spray of small leaves with gaps between them, so each card reads as a twig cluster rather than a flat patch
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); const r = rng(31);
  for (let i = 0; i < 520; i++) { const a = r() * 6.283, rad = Math.pow(r(), 0.75) * S * 0.47; const x = S / 2 + Math.cos(a) * rad, y = S / 2 + Math.sin(a) * rad; const L = 9 + r() * 13, W = L * (0.36 + r() * 0.2);
    g.save(); g.translate(x, y); g.rotate(r() * 6.283); const hue = 76 + r() * 30, li = 26 + r() * 24; const gr = g.createLinearGradient(-L, 0, L, 0); gr.addColorStop(0, `hsl(${hue},${42 + r() * 18}%,${li}%)`); gr.addColorStop(1, `hsl(${hue + 8},${46 + r() * 18}%,${li + 10}%)`);
    g.fillStyle = gr; g.beginPath(); g.moveTo(-L, 0); g.quadraticCurveTo(0, -W * 1.5, L, 0); g.quadraticCurveTo(0, W * 1.5, -L, 0); g.fill(); g.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function canopyGeometry(K, seed) {
  const r = rng(seed); const lobes = []; for (let i = 0; i < 9; i++) lobes.push([(r() - 0.5) * 1.0, (r() - 0.4) * 0.8, (r() - 0.5) * 1.0, 0.36 + r() * 0.3]); lobes.push([0, 0, 0, 0.6]); lobes.push([0, 0.35, 0, 0.45]);
  const pos = [], nor = [], uv = [], idx = []; const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), cN = new THREE.Vector3(); const szK = Math.min(1.5, Math.sqrt(150 / K));
  for (let k = 0; k < K; k++) { const L = lobes[k % lobes.length]; const u = r() * 2 - 1, th = r() * 6.283, sr = Math.sqrt(1 - u * u); const rad = L[3] * (0.55 + r() * 0.5); const cx = L[0] + sr * Math.cos(th) * rad, cy = L[1] + u * rad * 0.85, cz = L[2] + sr * Math.sin(th) * rad;
    const sz = (0.16 + r() * 0.15) * szK; e.set((r() - 0.5) * 2.6, r() * 6.283, (r() - 0.5) * 2.6); q.setFromEuler(e); cN.set(cx, cy + 0.3, cz).normalize(); const b = pos.length / 3;
    for (const [px, py] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { v.set(px * sz, py * sz, 0).applyQuaternion(q); pos.push(cx + v.x, cy + v.y, cz + v.z); const nn = new THREE.Vector3(cx + v.x * 0.5, cy + v.y * 0.5 + 0.4, cz + v.z * 0.5).normalize().lerp(cN, 0.6).normalize(); nor.push(nn.x, nn.y, nn.z); uv.push(px * 0.5 + 0.5, py * 0.5 + 0.5); }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
}
function trunkGeometry(seed) {
  const r = rng(seed); const parts = []; const cyl = (a, b, r0, r1) => { const d = new THREE.Vector3().subVectors(b, a), L = d.length(); const g = new THREE.CylinderGeometry(r1, r0, L, 7, 1, true); g.translate(0, L / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate(a.x, a.y, a.z); return g; };
  parts.push(cyl(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.02, 0.62, 0), 0.05, 0.032));
  for (let i = 0; i < 5; i++) { const a = r() * 6.283, y0 = 0.42 + r() * 0.22; parts.push(cyl(new THREE.Vector3(0, y0 - 0.08, 0), new THREE.Vector3(Math.cos(a) * (0.18 + r() * 0.14), y0 + 0.1 + r() * 0.14, Math.sin(a) * (0.18 + r() * 0.14)), 0.022, 0.008)); }
  return mergeGeometries(parts);
}
function minRect(pts) { let best = null; for (let i = 0; i < pts.length; i++) { const [xa, za] = pts[i], [xb, zb] = pts[(i + 1) % pts.length]; const L = Math.hypot(xb - xa, zb - za); if (L < 3) continue; const ux = (xb - xa) / L, uz = (zb - za) / L; let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const [x, z] of pts) { const u = x * ux + z * uz, v = -x * uz + z * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); } const A = (u1 - u0) * (v1 - v0); if (!best || A < best.A) best = { A, ux, uz, u0, u1, v0, v1 }; } return best; }
export async function buildContext(scene) {
  const [bl, tr] = await Promise.all([fetch('data/buildings.json').then((r) => r.json()), fetch('data/trees.json').then((r) => r.json())]);
  const pos = [], col = [], nor = []; const r = rng(4); const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const tri = (a, b, c, cl) => { const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize(); for (const p of [a, b, c]) { pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); col.push(...cl); } };
  const quad = (a, b, c, d, cl) => { tri(a, b, c, cl); tri(a, c, d, cl); };
  const WALLS = [[0.78, 0.76, 0.7], [0.7, 0.66, 0.58], [0.62, 0.63, 0.64], [0.74, 0.7, 0.56], [0.55, 0.6, 0.64], [0.5, 0.26, 0.2], [0.8, 0.8, 0.78], [0.45, 0.42, 0.38]], ROOFS = [[0.16, 0.16, 0.17], [0.22, 0.2, 0.18], [0.28, 0.27, 0.27], [0.2, 0.17, 0.14], [0.3, 0.22, 0.18], [0.12, 0.13, 0.14]];
  for (const b of bl) {
    let pts = b.p.slice(0, -1); if (pts.length < 3) continue; let area = 0; for (let i = 0; i < pts.length; i++) { const [xa, za] = pts[i], [xb, zb] = pts[(i + 1) % pts.length]; area += xa * zb - xb * za; }
    if (area > 0) pts = pts.reverse(); const A = Math.abs(area) / 2; if (A < 120) continue; const R = minRect(pts); if (!R) continue;
    const gs = pts.map(([x, z]) => groundAt(x, z, 'existing')); const base = Math.min(...gs) - 1, g1 = Math.max(...gs); const big = A > 7000; const eave = g1 + (big ? 16 + r() * 6 : A > 2600 ? 15 + r() * 4 : A < 500 ? 8 : 9.5 + r() * 2.5);
    const wall = WALLS[Math.floor(r() * WALLS.length)].map((v) => v * (0.85 + r() * 0.2)), roof = ROOFS[Math.floor(r() * ROOFS.length)].map((v) => v * (0.8 + r() * 0.5));
    for (let i = 0; i < pts.length; i++) { const [xa, za] = pts[i], [xb, zb] = pts[(i + 1) % pts.length]; quad(V3(xa, base, za), V3(xb, base, zb), V3(xb, eave, zb), V3(xa, eave, za), wall); }
    const W2 = (u, v, y) => V3(u * R.ux - v * R.uz, y, u * R.uz + v * R.ux); let { u0, u1, v0, v1 } = R;
    if (big) { const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, z]) => new THREE.Vector2(x, z)), []); const rc = roof.map((v) => v * 1.6 + 0.1); for (const t of tris) tri(V3(pts[t[0]][0], eave, pts[t[0]][1]), V3(pts[t[2]][0], eave, pts[t[2]][1]), V3(pts[t[1]][0], eave, pts[t[1]][1]), rc); continue; }
    const oh = 1.2; let long = u1 - u0 >= v1 - v0; u0 -= oh; u1 += oh; v0 -= oh; v1 += oh; const span = long ? v1 - v0 : u1 - u0; const rise = span * 0.5 * (0.38 + r() * 0.22); const ridge = eave + rise;
    if (long) { const vm = (v0 + v1) / 2; const a = W2(u0, v0, eave), b2 = W2(u1, v0, eave), c = W2(u1, v1, eave), d = W2(u0, v1, eave), e1 = W2(u0, vm, ridge), e2 = W2(u1, vm, ridge); quad(a, e1, e2, b2, roof); quad(c, e2, e1, d, roof); tri(a, d, e1, wall); tri(c, b2, e2, wall); }
    else { const um = (u0 + u1) / 2; const a = W2(u0, v0, eave), b2 = W2(u1, v0, eave), c = W2(u1, v1, eave), d = W2(u0, v1, eave), e1 = W2(um, v0, ridge), e2 = W2(um, v1, ridge); quad(a, d, e2, e1, roof); quad(b2, e1, e2, c, roof); tri(a, e1, b2, wall); tri(c, e2, d, wall); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const bm = mesh(g, new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  const cb = comp('buildings', { name: 'Buildings (massing)', layer: 'Site', pick: false, desc: 'Building massing extruded from the State of Indiana building-footprint layer, with assumed heights, roof shapes and colors. Context only.', facts: [['Footprints', String(bl.length)], ['Source', 'IndianaMap building footprints (lidar-derived)']] }, bm);
  scene.add(cb);
  await buildTrees(scene, tr, new URLSearchParams(location.search).has('soft'));
}
/** hide trees that would sit in front of a camera path: pts = [Vector3] */
export function cullTreesNear(pts, r = 70) {
  if (!T.trees) return 0; const z = new THREE.Matrix4().makeScale(0, 0, 0); let n = 0;
  for (const { keep, trunks, crowns } of T.trees) { keep.forEach(([x, zz, h], i) => { const g = groundAt(x, zz, 'existing'); for (const p of pts) { if (p.y < g + h + 30 && Math.hypot(p.x - x, p.z - zz) < r) { trunks.setMatrixAt(i, z); crowns.setMatrixAt(i, z); n++; break; } } }); trunks.instanceMatrix.needsUpdate = true; crowns.instanceMatrix.needsUpdate = true; }
  return n;
}

// ---------------- riprap stones (instanced), placed on the zones graded for riprap ----------------
export function buildRiprap(scene) {
  const PREVIEW = new URLSearchParams(location.search).has('soft') || new URLSearchParams(location.search).get('rip') === 'low';   // reduced detail only for software-rendered previews; real GPUs get everything
  const { nxI: nx, nzI: nz } = T; const [x0, , z0] = GEO.inner; const res = GEO.ri; const mixA = T.mixProposed, h = T.proposed; const r = rng(77);
  const rockG = (seed, det) => { const g = new THREE.IcosahedronGeometry(1, det); const rr = rng(seed); const p = g.attributes.position; const cache = {}; for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; const f = cache[k] ??= 0.72 + rr() * 0.5; p.setXYZ(i, p.getX(i) * f, p.getY(i) * f * 0.72, p.getZ(i) * f); } g.computeVertexNormals(); return g; };
  const near = [], mid = [], far = [];
  for (let j = 1; j < nz - 1; j++) for (let i = 1; i < nx - 1; i++) { const k = j * nx + i; const w = Math.max(mixA[k * 4 + 1], mixA[k * 4 + 2]); if (w < 0.5) continue; const x = x0 + i * res, z = z0 + j * res; const isNear = Math.abs(x) < 190 && Math.abs(z) < 110, isMid = !isNear && x > -640 && x < 190 && Math.abs(z) < 130; const cls1 = mixA[k * 4 + 2] > 0.5;
    const n = isNear ? (r() < 0.9 ? 3 : 2) : isMid ? (PREVIEW ? 2 : 3) : (PREVIEW ? (r() < 0.42 ? 1 : 0) : 2); for (let q = 0; q < n; q++) { const px = x + (r() - 0.5) * res, pz = z + (r() - 0.5) * res; const sc = (cls1 ? 0.95 : 0.52) * (0.7 + r() * 0.75) * (isNear || isMid || !PREVIEW ? 1 : 1.35); (isNear ? near : isMid ? mid : far).push([px, groundAt(px, pz, 'proposed') + sc * 0.22, pz, sc, r(), r(), r()]); } }
  const mat = new THREE.MeshStandardNodeMaterial({ metalness: 0 }); const u = positionLocal.xz.add(positionLocal.y.mul(0.7)).mul(0.45);
  { const rd = detail('rock_boulder_dry', u); mat.colorNode = mix(vec3(lum(rd)), rd, 0.4).mul(vec3(0.66, 0.645, 0.61)); } mat.roughnessNode = float(0.92);
  const objs = []; const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), c3 = new THREE.Color();
  for (const [list, det, cast] of [[near, 1, true], [mid, PREVIEW ? 0 : 1, !PREVIEW], [far, 0, !PREVIEW]]) for (let v = 0; v < 3; v++) { const sub = list.filter((_, i) => i % 3 === v); if (!sub.length) continue; const im = new THREE.InstancedMesh(rockG(500 + v + det * 10, det), mat, sub.length);
    sub.forEach(([x, y, z, sc, a, b, c], i) => { q4.setFromEuler(new THREE.Euler(a * 6.283, b * 6.283, (c - 0.5) * 1.2)); m4.compose(new THREE.Vector3(x, y, z), q4, new THREE.Vector3(sc * (0.8 + a * 0.5), sc * (0.7 + b * 0.4), sc * (0.8 + c * 0.5))); im.setMatrixAt(i, m4); c3.setScalar(0.74 + c * 0.3); im.setColorAt(i, c3); });
    im.castShadow = cast; im.receiveShadow = true; im.frustumCulled = false; objs.push(im); }
  const cp = comp('riprap', { name: 'Riprap stones', layer: 'Site', pick: false, phase: [7, 99], desc: 'Revetment riprap on the causeway and spill slopes and Class 1 riprap around the piers, drawn as individual stones over the graded surface. Stone sizes and placement are illustrative; the limits follow the plan sheets approximately.', facts: [['Revetment riprap', '3,463 tons'], ['Class 1 riprap', '258 tons'], ['Stones drawn', String(near.length + mid.length + far.length)]], sheets: ['B11', 'B12', 'B30'] }, ...objs);
  scene.add(cp); return cp;
}

// ---------------- far field: real terrain and summer imagery out to 14,000 ft, fading into haze ----------------
export async function buildFar(scene) {
  const n = 281, R = 14000; const [h, tex] = await Promise.all([f32('data/terrain_far.f32'), loadTex('data/naip_far.jpg')]); const [x0, x1, z0, z1] = GEO.outer;
  const pos = new Float32Array(n * n * 3), uvs = new Float32Array(n * n * 2); const st = 2 * R / (n - 1);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * n + i, x = -R + i * st, z = -R + j * st; const inside = x > x0 - 1 && x < x1 + 1 && z > z0 - 1 && z < z1 + 1; pos[k * 3] = x; pos[k * 3 + 1] = h[k] - (inside ? 14 : 0); pos[k * 3 + 2] = z; uvs[k * 2] = (x + R) / (2 * R); uvs[k * 2 + 1] = 1 - (z + R) / (2 * R); }
  const idx = []; for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) { const xa = -R + i * st, za = -R + j * st; if (xa >= x0 && xa + st <= x1 && za >= z0 && za + st <= z1) continue; const a = j * n + i, b = a + 1, c = a + n, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.MeshStandardNodeMaterial({ metalness: 0, roughness: 1 }); const c = texture(tex, uv()).rgb; const L = lum(c); m.colorNode = mix(vec3(L), c, 1.25).max(0).mul(vec3(0.5, 0.56, 0.4));
  const me = new THREE.Mesh(g, m); me.receiveShadow = false; me.frustumCulled = false;
  const cp = comp('far', { name: 'Surrounding country', layer: 'Site', pick: false, desc: 'Terrain (USGS 3DEP) and summer aerial imagery (USDA NAIP) out to about 2.6 miles, at reduced resolution, so the horizon is real ground.', facts: [['Extent', '±14,000 ft'], ['Grid', '100 ft']] }, me); scene.add(cp); return cp;
}
