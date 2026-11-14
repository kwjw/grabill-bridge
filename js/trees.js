// Trees: procedurally grown with ez-tree (MIT, Daniel Greenheck) — trunk, limbs, twigs and leaf cards with photographed
// leaf and bark textures — in several species and seeds, instanced where summer aerial imagery shows canopy.
import * as THREE from 'three';
import { Tree } from '../vendor/eztree/ez-tree.es.js';
import { rng, comp, loadTex } from './kit.js';
import { toSO } from './project.js';
import { groundAt, isWet, T } from './terrain.js';

const SPEC = [['Oak Medium', 11], ['Oak Large', 23], ['Ash Medium', 37], ['Ash Large', 41], ['Aspen Medium', 53], ['Aspen Large', 67], ['Oak Medium', 79], ['Ash Medium', 97], ['Oak Large', 101], ['Aspen Large', 113]];
let soft_ = false;
function grow(name, seed, lod) {
  const t = new Tree(); t.loadPreset(name); const o = t.options; o.seed = seed;
  if (lod) { const k = soft_ ? 0.18 : 0.4; o.leaves.count = Math.max(2, Math.round(o.leaves.count * k)); o.leaves.size *= soft_ ? 2.3 : 1.6; for (const k in o.branch.segments) o.branch.segments[k] = Math.max(3, Math.round(o.branch.segments[k] * 0.6)); for (const k in o.branch.sections) o.branch.sections[k] = Math.max(1, Math.round(o.branch.sections[k] * 0.6)); }
  t.generate(); const bg = t.branchesMesh.geometry, lg = t.leavesMesh.geometry; bg.computeBoundingBox(); lg.computeBoundingBox();
  const bb = bg.boundingBox.clone().union(lg.boundingBox); const hgt = bb.max.y - Math.min(0, bb.min.y); const c = lg.boundingBox.getCenter(new THREE.Vector3()); c.y -= (lg.boundingBox.max.y - lg.boundingBox.min.y) * 0.15;
  // soften canopy shading: bend each leaf card's normal toward "outward from the crown"
  const p = lg.attributes.position, n = lg.attributes.normal, v = new THREE.Vector3(), q = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).sub(c).normalize(); q.fromBufferAttribute(n, i); if (q.dot(v) < 0) q.negate(); q.lerp(v, 0.65).normalize(); n.setXYZ(i, q.x, q.y, q.z); }
  const width = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);
  return { bg, lg, hgt, width, leaf: o.leaves.type, bark: o.bark.type, tris: (bg.index.count + lg.index.count) / 3 };
}

export async function buildTrees(scene, tr, soft) {
  if (soft) tr = tr.filter(([x, z]) => Math.hypot(x, z) < 1500);   // software-rendered previews only
  const keep = tr.filter(([x, z]) => { if (isWet(x, z)) return false; const s = toSO(x, z); if (s.sta > 1090 && s.sta < 2530 && Math.abs(s.off) < 46) return false; if (Math.abs(x) < 200 && Math.abs(z) < 75) return false; return true; });
  soft_ = soft; const leafTex = {}, barkTex = {}; for (const k of ['oak', 'ash', 'aspen']) { leafTex[k] = await loadTex(`tex/tree/${k}_color.png`, true); leafTex[k].wrapS = leafTex[k].wrapT = THREE.ClampToEdgeWrapping; }
  for (const k of ['oak', 'birch']) barkTex[k] = await loadTex(`tex/tree/${k}_color_1k.jpg`, true);
  const leafMat = {}, barkMat = {}; for (const k in leafTex) leafMat[k] = new THREE.MeshStandardNodeMaterial({ map: leafTex[k], alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.62, metalness: 0 });
  for (const k in barkTex) barkMat[k] = new THREE.MeshStandardNodeMaterial({ map: barkTex[k], roughness: 0.95, color: k === 'oak' ? 0x9a8a78 : 0xcfcabd });
  const NEAR = soft ? 260 : +(new URLSearchParams(location.search).get('treenear') || 1500); const sets = [], objs = []; let tris = 0; const rr = rng(8); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), c3 = new THREE.Color(), V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const pick = keep.map(() => Math.floor(rr() * SPEC.length));
  for (let v = 0; v < SPEC.length; v++) for (const near of [true, false]) {
    const list = keep.filter(([x, z], i) => pick[i] === v && (Math.hypot(x, z) < NEAR) === near); if (!list.length) continue;
    const g = grow(SPEC[v][0], SPEC[v][1], !near); const bm = barkMat[g.bark === 'birch' ? 'birch' : 'oak'], lm = leafMat[g.leaf] || leafMat.oak;
    const trunks = new THREE.InstancedMesh(g.bg, bm, list.length), crowns = new THREE.InstancedMesh(g.lg, lm, list.length);
    list.forEach(([x, z, h, rad], i) => { const y = groundAt(x, z, 'existing'); const s = (h * (1.0 + rr() * 0.35)) / g.hgt; q.setFromEuler(new THREE.Euler(0, rr() * 6.283, 0)); m4.compose(V3(x, y - 0.8, z), q, V3(s, s, s)); trunks.setMatrixAt(i, m4); crowns.setMatrixAt(i, m4);
      c3.setHSL(0.2 + rr() * 0.08, 0.3 + rr() * 0.2, 0.55 + rr() * 0.2); crowns.setColorAt(i, c3); });
    trunks.castShadow = crowns.castShadow = near || !soft; trunks.receiveShadow = crowns.receiveShadow = true; trunks.frustumCulled = crowns.frustumCulled = false; trunks.instanceMatrix.needsUpdate = true;
    sets.push({ keep: list, trunks, crowns }); objs.push(trunks, crowns); tris += g.tris * list.length;
  }
  T.trees = sets; console.log(`trees: ${keep.length} instances, ${(tris / 1e6).toFixed(1)} M triangles`);
  const ct = comp('trees', { name: 'Trees', layer: 'Site', pick: false, desc: 'Trees are grown procedurally (oak, ash and aspen forms) and placed where summer near-infrared aerial imagery (USDA NAIP) shows canopy. Positions are real; species, shape and size of each tree are assumed.', facts: [['Trees shown', String(keep.length)], ['Generator', 'ez-tree (MIT)']] }, ...objs);
  scene.add(ct); return ct;
}
