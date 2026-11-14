// The 1964 bridge (superstructure removed by this contract). Geometry from the 1964 plans
// (Zurbuch Engineers, Project S-192(2)) and the General Removal Plan (sheet 31).
import * as THREE from 'three';
import { P, FT } from './project.js';
import { M, boxG, prismX, merge, mesh, comp, cylG } from './kit.js';

export function buildOldBridge(scene) {
  const zE = P.zExist, E = P.existing; const xs = [-110, -64, 0, 64, 110]; const top = E.deckEl; const out = [];
  const add = (c) => { scene.add(c); out.push(c); return c; };
  const crown = (z) => top - Math.abs(z - zE) * (1 / 8 / 12);
  // AASHTO Type III I-beams, 7 lines at 6'-0"
  {
    const half = [[11, 0], [11, 7], [3.5, 14.5], [3.5, 33.5], [8, 38], [8, 45]].map(([w, h]) => [w / 12, h / 12]); const o = half.map((p) => [p[0], p[1]]); for (let i = half.length - 1; i >= 0; i--) o.push([-half[i][0], half[i][1]]);
    const g = []; const yb = 786.42;
    for (let s = 0; s < 4; s++) for (let k = 0; k < 7; k++) { const a = xs[s] + (s === 0 ? -0.4 : 0.1), b = xs[s + 1] - (s === 3 ? -0.4 : 0.1); const bg = merge([prismX(o, a, b)], 0.2); const cx = (a + b) / 2, cz = zE - 18 + k * 6; bg.translate(-cx, 0, 0); const bm = mesh(bg, M.concreteOld); bm.position.set(cx, yb, cz); bm.userData.liftInfo = { span: s, k, len: b - a }; g.push(bm); }
    add(comp('oldBeams', { name: '1964 prestressed I-beams (removed)', layer: 'Existing 1964 bridge', phase: [0, 2], sub: 2,
      desc: 'The original superstructure: seven lines of prestressed concrete I-beams (AASHTO Type III, 45" deep) at 6\'-0" centers in four simple spans, designed for HS20-44 loading under the 1961 AASHO specifications. This contract removed all 28 beams and replaced them with 16 wider, shallower bulb-tees.',
      facts: [['Beams', '7 lines x 4 spans = 28'], ['Spacing', '6 spaces at 6\'-0" = 36\'-0"'], ['Spans', '46\'-0", 64\'-0", 64\'-0", 46\'-0"'], ['1964 design loading', 'HS20-44'], ['Removal bid', '$360,000 lump sum (with deck and caps)']], sheets: ['B31', 'X06', 'X10'], pay: ['0015'] }, ...g));
  }
  // deck 220'-10" x 40'-10", 6-3/4" slab, raised 4' sidewalks each side
  {
    const hw = E.w / 2, L = E.len / 2; const g = []; const st = [-L, -64, 0, 64, L];
    for (let i = 0; i < 4; i++) g.push(prismX([[zE - hw, top - 0.2 - E.deckT], [zE + hw, top - 0.2 - E.deckT], [zE + hw, top + 0.55], [zE + 15, top + 0.5], [zE + 15, crown(zE + 15)], [zE, top], [zE - 15, crown(zE - 15)], [zE - 15, top + 0.5], [zE - hw, top + 0.55]], st[i] + 0.04, st[i + 1] - 0.04));
    // approach slabs 20'-6"
    for (const [a, b] of [[-L - 20.5, -L], [L, L + 20.5]]) g.push(boxG(a, b, top - 1.0, top - 0.02, zE - 15, zE + 15));
    add(comp('oldDeck', { name: '1964 deck and sidewalks (removed)', layer: 'Existing 1964 bridge', phase: [0, 2], sub: 1,
      desc: 'The original 6-3/4" deck was 220\'-10" long and 40\'-10" wide: a 30-foot roadway with a 4-foot raised sidewalk on each side, built level. The new deck is one foot wider, trades the two narrow walks for a single 10-foot barrier-protected path on the north side, and rides about 1.4 feet higher at mid-bridge.',
      facts: [['Out to out', '220\'-10" x 40\'-10"'], ['Roadway', '30\'-0" clear'], ['Sidewalks', '4\'-0" each side'], ['Slab', '6-3/4"'], ['Existing deck elevation', '≈ El. 791.0 (level)']], sheets: ['B31', 'X06', 'X07'], pay: ['0015', '0014'] }, mesh(merge(g, 0.1), M.concreteOld)));
  }
  // railing: aluminum two-rail on posts (1964 "Railing Type G or H")
  {
    const g = []; const hw = E.w / 2 - 0.7, L = E.len / 2;
    for (const sg of [-1, 1]) { const z = zE + sg * hw; for (let x = -L + 1; x <= L - 1; x += 6.14) g.push(boxG(x - 0.12, x + 0.12, top + 0.55, top + 3.3, z - 0.12, z + 0.12));
      for (const h of [1.7, 3.2]) g.push(boxG(-L, L, top + h, top + h + 0.2, z - 0.1, z + 0.1)); }
    add(comp('oldRail', { name: '1964 railing (removed)', layer: 'Existing 1964 bridge', phase: [0, 2], sub: 1, desc: 'Post-and-rail bridge railing from the 1964 plans, on the outside of each raised sidewalk.', facts: [['Type', '1964 standard railing "Type G or H"']], sheets: ['X06', 'B31'] }, mesh(merge(g), M.galv)));
  }
  // end bent caps (removed and replaced)
  {
    const g = []; for (const [x, d] of [[-110, 1], [110, -1]]) { g.push(boxG(x - 1.5, x + 1.5, 784.0, 786.6, zE - 21, zE + 21)); g.push(boxG(x - d * 1.5, x - d * 0.6, 786.6, top - 0.9, zE - 21, zE + 21)); }
    add(comp('oldCaps', { name: '1964 end bent caps (removed)', layer: 'Existing 1964 bridge', phase: [0, 3], sub: 3, desc: 'The original pile-cap end bents. The caps were removed down to the pile heads and recast as semi-integral bents; the piles stayed.', facts: [['Work item', 'Present Structure, Remove Portions']], sheets: ['B31', 'X08'], pay: ['0015'] }, mesh(merge(g), M.concreteOld)));
  }
  return out;
}
