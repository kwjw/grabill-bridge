// Shared materials, procedural textures and geometry helpers.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// deterministic RNG so every render (and the video) is identical
export function rng(seed = 1) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export const TEX = {};
export const M = {};
import { texture, uv, positionLocal, normalLocal, positionWorld, cameraPosition, select, float, vec2, vec3, mix, smoothstep, bumpMap, mx_noise_float, Fn, sin, length } from 'three/tsl';
const QS = new URLSearchParams(location.search); const ANISO = +(QS.get('aniso') || 16);
const loader = new THREE.TextureLoader();
export async function loadTex(url, srgb = false) { const t = await loader.loadAsync(url); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = ANISO; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; }
function meanLinear(img) { const c = document.createElement('canvas'); c.width = c.height = 24; const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, 24, 24); const d = g.getImageData(0, 0, 24, 24).data; const a = [0, 0, 0]; const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; for (let i = 0; i < d.length; i += 4) for (let k = 0; k < 3; k++) a[k] += lin(d[i + k]); return a.map((v) => Math.max(0.01, v / (d.length / 4))); }
/** load a Poly Haven texture set: diff (sRGB), rough, optional disp. `mean` is the average linear colour, used to normalise the scan to a chosen albedo. */
export async function loadSet(name, disp = false) { const [d, r, h] = await Promise.all([loadTex(`tex/${name}_diff.jpg`, true), loadTex(`tex/${name}_rough.jpg`), disp ? loadTex(`tex/${name}_disp.jpg`) : null]); return (TEX[name] = { diff: d, rough: r, disp: h, mean: meanLinear(d.image) }); }
/** scan detail around 1.0 (texture divided by its mean colour) */
export const detail = (set, uvn) => texture(TEX[set].diff, uvn).rgb.div(vec3(...TEX[set].mean));
/** box-projected coordinates in feet from the object-space position: stable under the build / explode animations */
export const boxCoord = Fn(() => { const n = normalLocal.abs(), p = positionLocal; return select(n.y.greaterThanEqual(n.x).and(n.y.greaterThanEqual(n.z)), p.xz, select(n.x.greaterThanEqual(n.z), p.zy, p.xy)); })();
const lumv = (c) => c.dot(vec3(0.3, 0.59, 0.11));
/** PBR material: `tint` is the target albedo (sRGB hex); the scanned texture only supplies detail, at two scales so tiling is not readable.
 *  o: size (ft per repeat), rough [min,max], bump, vary (large-scale variation), streak (vertical staining), contrast, desat, post(col) */
export function pbr(set, o = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ metalness: o.metal || 0 }); const T = TEX[set]; const size = o.size || 8; const u = boxCoord.div(size), u2 = boxCoord.div(size * 3.7).add(vec2(0.37, 0.11)); const P = positionLocal;
  let d = mix(detail(set, u), detail(set, u).mul(detail(set, u2)), o.blend2 ?? 0.35); if (o.desat) d = mix(d, vec3(lumv(d)), o.desat); d = mix(vec3(1), d, o.contrast ?? 1);
  const big = mx_noise_float(P.mul(0.035)).mul(0.5).add(0.5), mid = mx_noise_float(P.mul(0.21).add(7.3)).mul(0.5).add(0.5); const v = o.vary ?? 0.5;
  d = d.mul(mix(float(1), big.mul(0.36).add(0.82), v)).mul(mix(float(1), mid.mul(0.16).add(0.92), v));
  if (o.streak) { const vert = smoothstep(0.75, 0.35, normalLocal.y.abs()); const st = mx_noise_float(vec3(P.x.mul(0.9), P.y.mul(0.07), P.z.mul(0.9))).mul(0.5).add(0.5); const st2 = mx_noise_float(vec3(P.x.mul(0.25), P.y.mul(0.03), P.z.mul(0.25)).add(3.1)).mul(0.5).add(0.5);
    d = d.mul(mix(float(1), st.mul(st2).mul(1.5).add(0.42).min(1.05), vert.mul(o.streak))); }
  const a = new THREE.Color(o.tint ?? 0xb0b0b0); let col = d.mul(vec3(a.r, a.g, a.b)); if (o.post) col = o.post(col);
  m.colorNode = col; const r = o.rough || [0.6, 0.95]; m.roughnessNode = mix(float(r[0]), float(r[1]), texture(T.rough, u).g);
  if (o.bump !== 0) m.normalNode = bumpMap(texture(T.disp || T.diff, u).g, float(o.bump ?? 0.6));
  return m;
}
const flat = (color, rough, metal = 0, extra = {}) => new THREE.MeshStandardNodeMaterial({ color, roughness: rough, metalness: metal, ...extra });
/** transverse tining on the bridge deck roadway (3/4 in. grooves), fading to its average with distance */
const tining = (col) => { const dist = length(cameraPosition.sub(positionWorld)); const band = smoothstep(0.9, 0.98, normalLocal.y).mul(smoothstep(15.1, 14.7, positionLocal.z.abs())); const g = sin(positionLocal.x.mul(100.5)).mul(0.5).add(0.5); return col.mul(float(1).sub(band.mul(mix(float(0.07), g.mul(0.15), smoothstep(75, 12, dist))))); };
export async function initMaterials() {
  await Promise.all([loadSet('concrete_floor_worn_001'), loadSet('concrete_floor_02'), loadSet('concrete_layers_02', true), loadSet('clean_asphalt'), loadSet('asphalt_02'), loadSet('gray_rocks', true), loadSet('rock_boulder_dry', true), loadSet('brown_mud_dry'), loadSet('brown_mud_03', true), loadSet('leafy_grass'), loadSet('gravelly_sand'), loadSet('bark_brown_02'), loadSet('sparse_grass')]);
  // albedos chosen against July 2026 street-level photos: light, warm new concrete; mid-grey asphalt; whitish limestone
  const C = 'concrete_floor_worn_001';
  M.concrete = pbr(C, { size: 9, tint: 0xc3bdac, vary: 0.5, streak: 0.3, bump: 0.25, contrast: 0.8 });
  M.concreteNew = pbr(C, { size: 9, tint: 0xcdc6b3, vary: 0.4, streak: 0.18, bump: 0.25, contrast: 0.75 });
  M.deck = pbr(C, { size: 7, tint: 0xcfc7b2, vary: 0.45, bump: 0.3, rough: [0.8, 1], contrast: 0.8, post: tining });
  M.walk = pbr(C, { size: 6, tint: 0xd3ccb9, vary: 0.4, bump: 0.3, rough: [0.8, 1], contrast: 0.7 });
  M.beam = pbr(C, { size: 11, tint: 0xcfcabd, vary: 0.25, streak: 0.08, bump: 0.15, rough: [0.5, 0.85], contrast: 0.6 });
  M.concreteOld = pbr('concrete_layers_02', { size: 12, tint: 0xa59d8b, vary: 0.8, streak: 0.8, bump: 0.5, rough: [0.75, 1] });
  M.asphalt = pbr('clean_asphalt', { size: 7, tint: 0x6c6b6a, vary: 0.35, bump: 0.5, rough: [0.8, 1], blend2: 0.2, contrast: 0.8 });
  M.rock = pbr('gray_rocks', { size: 10, tint: 0xb4afa3, desat: 0.6, vary: 0.35, bump: 2.2, rough: [0.8, 1], blend2: 0.0 });
  M.causeway = pbr('gray_rocks', { size: 10, tint: 0xa9a498, desat: 0.6, vary: 0.4, bump: 2.2, rough: [0.8, 1], blend2: 0.0 }); M.causeway.side = THREE.DoubleSide;
  M.agg = pbr('gravelly_sand', { size: 6, tint: 0xb9b09c, vary: 0.4, bump: 0.6 });
  M.soil = pbr('brown_mud_dry', { size: 10, tint: 0x8a7860, vary: 0.5, bump: 0.8 });
  M.steel = flat(0x8f979e, 0.42, 0.85); M.galv = flat(0xb9bfc5, 0.46, 0.85); M.black = flat(0x141517, 0.45, 0.6); M.rebar = flat(0x2c9a55, 0.5, 0.2); M.strand = flat(0xd8a23a, 0.4, 0.8);
  M.elastomer = flat(0x1a1a1c, 0.9); M.pile = flat(0x6a5646, 0.75, 0.4); M.paintY = flat(0xe0b52a, 0.75); M.paintW = flat(0xe9e9e4, 0.75); M.sod = flat(0x6f8f4e, 1); M.brick = flat(0x9a4f3c, 0.9); M.orange = flat(0xf07818, 0.7);
  M.paintFade = new THREE.MeshStandardNodeMaterial({ color: 0xcf8f2a, roughness: 0.9, transparent: true, opacity: 0.42, depthWrite: false });
  M.craneY = flat(0xe2a90f, 0.45, 0.35); M.craneK = flat(0x202225, 0.55, 0.6); M.cable = flat(0x1b1c1e, 0.6, 0.7); M.timber = flat(0x8a6a45, 0.9); M.truck = flat(0xc9ccd0, 0.4, 0.5);
  M.ghost = new THREE.MeshStandardNodeMaterial({ color: 0x7fb4ff, transparent: true, opacity: 0.22, roughness: 1, depthWrite: false });
  M.hi = new THREE.MeshStandardNodeMaterial({ color: 0xffb020, emissive: 0xff8a00, emissiveIntensity: 0.55, roughness: 0.6 });
  M.glass = new THREE.MeshStandardNodeMaterial({ color: 0xfff6d8, emissive: 0xffe2a0, emissiveIntensity: 0.0, roughness: 0.3 });
  for (const k in M) M[k].name = k;
}

// ---------- geometry helpers ----------
/** box from min/max corners */
export function boxG(x0, x1, y0, y1, z0, z1) { const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return g; }
/** Prism: polygon outline in (z,y) extruded along x from x0 to x1. outline: array of [z,y] CCW or CW. */
export function prismX(outline, x0, x1) {
  const sh = new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: x1 - x0, bevelEnabled: false, steps: 1 });
  // Extrude builds (X=shape.x, Y=shape.y, Z=depth) -> map to (x=depth, y=shape.y, z=shape.x)
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) { const a = p.getX(i), b = p.getY(i), c = p.getZ(i); p.setXYZ(i, x0 + c, b, a); const nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i); n.setXYZ(i, nz, ny, nx); }
  flip(g); return g;
}
/** Prism: polygon in (x,y) extruded along z from z0 to z1 */
export function prismZ(outline, z0, z1) {
  const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: z1 - z0, bevelEnabled: false, steps: 1 }); g.translate(0, 0, z0); return g;
}
/** Prism: polygon in plan (x,z) extruded vertically y0..y1 */
export function prismY(outline, y0, y1) {
  const sh = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: y1 - y0, bevelEnabled: false, steps: 1 });
  g.rotateX(-Math.PI / 2); g.translate(0, y0, 0); return g;
}
function flip(g) { const idx = g.index; if (idx) { const a = idx.array; for (let i = 0; i < a.length; i += 3) { const t = a[i]; a[i] = a[i + 1]; a[i + 1] = t; } } else { const p = g.attributes.position.array, n = g.attributes.normal.array, u = g.attributes.uv ? g.attributes.uv.array : null; for (let i = 0; i < p.length; i += 9) { for (let k = 0; k < 3; k++) { const t = p[i + k]; p[i + k] = p[i + 3 + k]; p[i + 3 + k] = t; const m = n[i + k]; n[i + k] = n[i + 3 + k]; n[i + 3 + k] = m; } if (u) { const j = i / 9 * 6; for (let k = 0; k < 2; k++) { const t = u[j + k]; u[j + k] = u[j + 2 + k]; u[j + 2 + k] = t; } } } } }
/** cylinder between two points */
export function cylG(a, b, r, seg = 10) { const d = new THREE.Vector3().subVectors(b, a); const L = d.length(); const g = new THREE.CylinderGeometry(r, r, L, seg, 1); g.translate(0, L / 2, 0); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()); g.applyQuaternion(q); g.translate(a.x, a.y, a.z); return g; }
/** general lofted strip: rows of points (each row same count) -> surface (double sided optional via material) */
export function loft(rows, closed = false, uvScale = 0.1) {
  const nR = rows.length, nC = rows[0].length; const pos = new Float32Array(nR * nC * 3), uv = new Float32Array(nR * nC * 2); const idx = [];
  let vacc = 0;
  for (let r = 0; r < nR; r++) {
    if (r > 0) vacc += rows[r][0].distanceTo(rows[r - 1][0]);
    let uacc = 0;
    for (let c = 0; c < nC; c++) { const p = rows[r][c]; if (c > 0) uacc += p.distanceTo(rows[r][c - 1]); const i = r * nC + c; pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; uv[i * 2] = uacc * uvScale; uv[i * 2 + 1] = vacc * uvScale; }
  }
  for (let r = 0; r < nR - 1; r++) for (let c = 0; c < nC - 1; c++) { const a = r * nC + c, b = a + 1, d = a + nC, e = d + 1; idx.push(a, d, b, b, d, e); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
/** set world-scale box-projected UVs so textures don't stretch (scale = repeats per foot) */
export function boxUV(g, s = 0.12) {
  g = g.index ? g.toNonIndexed() : g; g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal; const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i)); let u, v; if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); } else if (ax >= az) { u = p.getZ(i); v = p.getY(i); } else { u = p.getX(i); v = p.getY(i); } uv[i * 2] = u * s; uv[i * 2 + 1] = v * s; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
export function merge(geoms, uvS = 0.12) { const list = geoms.filter(Boolean).map((g) => boxUV(g, uvS)); for (const g of list) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); } const m = mergeGeometries(list, false); list.forEach((g) => g.dispose()); return m; }
export function mesh(geom, mat, opts = {}) { const m = new THREE.Mesh(geom, mat); m.castShadow = opts.cast !== false; m.receiveShadow = opts.recv !== false; return m; }

// ---------- component registry ----------
export const REG = { list: [], byId: {} };
/** register a component group. info: {name, layer, desc, facts:[[k,v]], sheets:[..], pay:[lineNos], phase:[a,b]} */
export function comp(id, info, ...objs) {
  const g = new THREE.Group(); g.name = id; objs.flat().filter(Boolean).forEach((o) => g.add(o));
  g.userData = { id, ...info }; g.traverse((o) => { if (o.isMesh || o.isInstancedMesh || o.isLineSegments) o.userData.comp = id; });
  REG.list.push(g); REG.byId[id] = g; return g;
}

// ---------- sweeps along the alignment ----------
import { so as _so } from './project.js';
/** Sweep a closed section along Line "PR-A". stas: stations; secFn(sta) -> [[off, elev], ...] listed
 *  counter-clockwise looking up-station (off + = right). Faces get crisp edges. caps: close the ends. */
export function sweep(stas, secFn, caps = true) {
  const secs = stas.map((s) => secFn(s).map(([o, y]) => { const p = _so(s, o); return new THREE.Vector3(p.x, y, p.z); }));
  const n = secs[0].length; const geoms = [];
  for (let e = 0; e < n; e++) { const f = (e + 1) % n; geoms.push(loft(secs.map((sec) => [sec[e], sec[f]]))); }
  if (caps) for (const [sec, rev] of [[secs[0], false], [secs[secs.length - 1], true]]) {
    const s0 = stas[rev ? stas.length - 1 : 0]; const flat = secFn(s0).map(([o, y]) => new THREE.Vector2(o, y));
    const tris = THREE.ShapeUtils.triangulateShape(flat, []); const pos = [];
    if (!tris.length) continue;
    // orient: start cap faces down-station, end cap faces up-station
    const other = secs[rev ? secs.length - 2 : 1]; const want = new THREE.Vector3().subVectors(sec[0], other[0]);
    const t0 = tris[0]; const nn = new THREE.Vector3().subVectors(sec[t0[1]], sec[t0[0]]).cross(new THREE.Vector3().subVectors(sec[t0[2]], sec[t0[0]]));
    const fl = nn.dot(want) < 0;
    for (const t of tris) { const order = fl ? [t[0], t[2], t[1]] : [t[0], t[1], t[2]]; for (const i of order) pos.push(sec[i].x, sec[i].y, sec[i].z); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); geoms.push(g);
  }
  return merge(geoms);
}
/** station list from a to b with max step, always including extra break stations */
export function stations(a, b, step = 10, extra = []) { const out = new Set([a, b]); const n = Math.max(1, Math.ceil((b - a) / step)); for (let i = 0; i <= n; i++) out.add(a + (b - a) * i / n); extra.forEach((s) => { if (s > a && s < b) out.add(s); }); return [...out].sort((p, q) => p - q); }
/** simple rectangular section helper: offsets o0<o1, top elevations fn, thickness */
export const rectSec = (o0, o1, topFn, t) => (s) => [[o0, topFn(s, o0) - t], [o1, topFn(s, o1) - t], [o1, topFn(s, o1)], [o0, topFn(s, o0)]];
