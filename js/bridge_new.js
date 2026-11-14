// Proposed structure: superstructure replacement on the 1964 substructure (sheets 30-63).
import * as THREE from 'three';
import { P, FT, deckTop, pgX, bentX } from './project.js';
import { groundAt, getWaterLevel } from './terrain.js';
import { M, boxG, prismX, prismY, prismZ, cylG, merge, mesh, comp, sweep, stations, rng } from './kit.js';

const S0 = P.staPier3; const D = P.deck; const zE = P.zExist, zS = P.zStruct;
const BH = P.bearing.pad + P.bearing.plate;          // bearing assembly height
const slabBot = (x, z) => deckTop(x, z) - D.t;
const BENT_Y0 = 782.45;                              // bottom of new end-bent concrete (sheet 33)
const xs = P.bents.map((b) => b.sta - S0);           // -110, -64, 0, 64, 110
const seat = (i, b) => P.seats[P.bents[i].id][b];

// bearing centerlines for each span (x at left end, x at right end)
const SPANS = [0, 1, 2, 3].map((s) => {
  const a = xs[s], b = xs[s + 1];
  const bl = s === 0 ? a + 0.25 : a + 0.75, br = s === 3 ? b - 0.25 : b - 0.75;      // CL bearing (sheets 39, 44)
  const el = s === 0 ? a - 0.5 : a + 0.25, er = s === 3 ? b + 0.5 : b - 0.25;        // beam ends
  return { s, a, b, bl, br, el, er, name: 'ABCD'[s] };
});
/** underside-of-beam elevation for beam b in span s at x */
function beamBot(s, b, x) { const sp = SPANS[s]; const y0 = seat(s, b) + BH, y1 = seat(s + 1, b) + BH; return y0 + (y1 - y0) * (x - sp.bl) / (sp.br - sp.bl); }

function btOutline(half) { const pts = half.map(([w, h]) => [w / 12, h / 12]); const o = pts.map(([w, h]) => [w, h]); for (let i = pts.length - 1; i >= 0; i--) o.push([-pts[i][0], pts[i][1]]); return o; }

export function buildNewBridge(scene) {
  const out = [];
  const add = (c) => { scene.add(c); out.push(c); return c; };

  // ---------- existing piles at the end bents (to remain) ----------
  {
    const g = []; const r = FT(0, 7);
    for (const [bi, dir] of [[0, 1], [4, -1]]) for (let k = 0; k < 13; k++) {
      const z = zE - 18 + k * 3; const top = new THREE.Vector3(xs[bi], BENT_Y0 + 1.0, z);
      const batter = k % 2 === 1 ? dir * 0.25 : (k % 4 === 0 ? -dir * 0.0 : 0);
      const tip = new THREE.Vector3(xs[bi] + batter * (top.y - 749.0), 749.0, z); g.push(cylG(tip, top, r, 12));
    }
    add(comp('piles', { name: 'Existing 14" piles (to remain)', layer: 'Substructure (1964, reused)', phase: [0, 99],
      desc: 'Each end bent stands on thirteen 14-inch concrete-filled steel pipe piles driven in 1964 (minimum bearing 40 tons). The new end-bent caps are cast around the existing pile heads with 1\'-0" embedment, so no new piling was driven.',
      facts: [['Piles per bent', '13 at 3\'-0" centers'], ['Type', '14" concrete-filled steel, alternate piles battered'], ['1964 tip elevation', '≈ El. 749'], ['New-cap embedment', '1\'-0"']], sheets: ['B32', 'B35', 'X06'] }, mesh(merge(g), M.pile)));
  }

  // ---------- existing piers (to remain) ----------
  {
    const g = [];
    for (const i of [1, 2, 3]) {
      const x = xs[i], top = P.existCapTop[P.bents[i].id];
      g.push(boxG(x - 6, x + 6, 757.53, 760.53, zE - FT(13, 10), zE + FT(13, 10)));          // footing 12' x 27'-8" x 3'
      const hw = FT(12, 10) - 1.25, rr = 1.25; const o = []; for (let a = 0; a <= 12; a++) { const t = -Math.PI / 2 + a * Math.PI / 12; o.push([x + rr * Math.cos(t), zE + hw + rr * Math.sin(t) + 0]); }
      const st = [];  // rounded-end stem outline in plan (x,z)
      for (let a = 0; a <= 12; a++) { const t = a * Math.PI / 12; st.push([x + rr * Math.cos(t), zE + hw + rr * Math.sin(t)]); }
      for (let a = 0; a <= 12; a++) { const t = Math.PI + a * Math.PI / 12; st.push([x + rr * Math.cos(t), zE - hw + rr * Math.sin(t)]); }
      g.push(prismY(st, 760.53, top - 8.63));
      const c = FT(23, 1), s = FT(12, 10);                                                      // hammerhead cap 46'-2" x 3'-0"
      g.push(prismX([[zE - c, top], [zE - c, top - 1.5], [zE - s, top - 8.63], [zE + s, top - 8.63], [zE + c, top - 1.5], [zE + c, top]], x - 1.5, x + 1.5));
    }
    add(comp('piersOld', { name: 'Existing piers 2, 3 and 4 (to remain)', layer: 'Substructure (1964, reused)', phase: [0, 99],
      desc: 'The three hammerhead river piers from the 1964 bridge were kept. Each has a 46\'-2" cap on a 2\'-6" wall stem with rounded ends, on a 12\' x 27\'-8" spread footing. Stem and footing dimensions come from the 1964 plans; the as-built top-of-cap elevations were field surveyed for the new plans.',
      facts: [['Cap', '46\'-2" x 3\'-0"'], ['Stem', '25\'-8" x 2\'-6", rounded ends'], ['Footing', '12\'-0" x 27\'-8" x 3\'-0"'], ['Existing top of cap', 'El. 786.27 to 786.38'], ['1964 design soil pressure', '3 tons / sq ft']], sheets: ['X09', 'X06', 'B37'] }, mesh(merge(g), M.concreteOld)));
  }

  // ---------- pier cap extensions (new) ----------
  {
    const g = []; const zN = zE - FT(23, 1), zSo = zE + FT(23, 1); const steps = [zN, zN + 15, zN + 26, zN + 30, zSo];
    for (const i of [1, 2, 3]) {
      const x = xs[i], base = P.existCapTop[P.bents[i].id];
      for (let b = 0; b < 4; b++) g.push(boxG(x - 1.5, x + 1.5, base, seat(i, b), steps[b], steps[b + 1]));
    }
    // light pedestal on Pier 3 (sheet 38)
    const ped = new THREE.CylinderGeometry(1.0, 1.0, 2.5, 20); ped.translate(xs[2], seat(2, 3) + 1.25, 17.3);
    const pedBase = new THREE.CylinderGeometry(1.5, 1.5, seat(2, 3) - P.existCapTop['Pier 3'], 20); pedBase.translate(xs[2], (seat(2, 3) + P.existCapTop['Pier 3']) / 2, 17.25);
    g.push(ped, pedBase);
    add(comp('pierCaps', { name: 'Pier cap extensions (new)', layer: 'Substructure (new)', phase: [3, 99],
      desc: 'New concrete was doweled onto the top of each existing pier cap to raise and re-step the beam seats for the four new bulb-tee lines. 120 holes were field-drilled into the old caps for #4 dowels (8-inch minimum embedment). Pier 3 also carries a round pedestal for the mid-bridge light standard.',
      facts: [['Size', '46\'-2" x 3\'-0", stepped'], ['Seat elevations, Pier 2', '787.52 / 787.74 / 787.94 / 787.72'], ['Seat elevations, Pier 3', '787.77 / 787.99 / 788.18 / 787.96'], ['Seat elevations, Pier 4', '787.74 / 787.96 / 788.15 / 787.93'], ['Concrete, Class A', '6.6 + 7.9 + 7.8 = 22.3 CYS'], ['Field-drilled holes', '120 EA'], ['Designer of record (piers)', 'Kimley-Horn']], sheets: ['B37', 'B38'], pay: ['0080', '0081'] }, mesh(merge(g), M.concreteNew)));
  }

  // ---------- new end bents: bottom pour + wingwalls ----------
  {
    const g = []; const zA = zS - 21, zB = zS + 21; const stepZ = [zA, (P.beamZ[0] + P.beamZ[1]) / 2, (P.beamZ[1] + P.beamZ[2]) / 2, (P.beamZ[2] + P.beamZ[3]) / 2, zB];
    const wtop = { 0: { n: [790.61, 790.66], s: [791.47, 791.52] }, 4: { n: [790.91, 790.96], s: [791.77, 791.82] } };
    for (const [bi, dir] of [[0, 1], [4, -1]]) {
      const x = xs[bi]; const back = x - dir * FT(1, 8), front = x + dir * 1.5;
      for (let b = 0; b < 4; b++) g.push(boxG(Math.min(back, front), Math.max(back, front), BENT_Y0, seat(bi, b), stepZ[b], stepZ[b + 1]));
      // wingwalls: 1'-0" thick, 10'-0" long, 1'-6" ahead of CL bent to 8'-6" behind
      for (const [z0, z1, tp] of [[zA - 1, zA, wtop[bi].n], [zB, zB + 1, wtop[bi].s]]) {
        const xf = x + dir * 1.5, xb = x - dir * 8.5;
        g.push(prismZ([[xb, BENT_Y0], [xf, BENT_Y0], [xf, tp[1]], [xb, tp[0]]].sort(() => 0), z0, z1));
      }
    }
    add(comp('endBents', { name: 'End bent caps and wingwalls (new)', layer: 'Substructure (new)', phase: [3, 99],
      desc: 'Bents 1 and 5 were rebuilt as semi-integral end bents. A new 3\'-2" wide cap (bottom pour, bottom at El. 782.45) is cast over the 13 existing piles, with stepped beam seats and a 3" x 12" keyway. Four new wingwalls (A through D), each 10\'-0" long and 1\'-0" thick, retain the approach fill.',
      facts: [['Cap length', '42\'-0" between wingwalls, 44\'-0" overall'], ['Bottom of cap', 'El. 782.45'], ['Seat elevations, Bent 1', '787.24 / 787.46 / 787.66 / 787.44'], ['Seat elevations, Bent 5', '787.56 / 787.78 / 787.97 / 787.75'], ['Concrete, Class C (Bent 1)', '45.6 CYS'], ['Reinforcing (Bent 1)', '6,021 lb epoxy coated'], ['Backfill', 'Aggregate for end bent backfill on geotextile, 6" drain pipe']], sheets: ['B32', 'B33', 'B34', 'B35', 'B36'], pay: ['0084', '0030'] }, mesh(merge(g), M.concreteNew)));
  }

  // ---------- bearings ----------
  {
    const pads = [], plates = []; const b = P.bearing;
    for (const sp of SPANS) for (let k = 0; k < 4; k++) for (const [x, i] of [[sp.bl, sp.s], [sp.br, sp.s + 1]]) {
      const y = seat(i, k), z = P.beamZ[k];
      pads.push(boxG(x - b.l / 2, x + b.l / 2, y, y + b.pad, z - b.w / 2, z + b.w / 2));
      plates.push(boxG(x - b.plateL / 2, x + b.plateL / 2, y + b.pad, y + b.pad + b.plate, z - b.plateW / 2, z + b.plateW / 2));
    }
    add(comp('bearings', { name: 'Elastomeric bearing assemblies', layer: 'Superstructure', phase: [4, 99],
      desc: 'Every beam end sits on a steel-reinforced elastomeric pad, 11" x 3\'-0" in plan and 3-3/32" thick (four internal 1/2" elastomer layers with bonded steel shims), with a 1" x 12" x 3\'-6" top plate vulcanized to the pad and welded to the beam bearing plate with 5/16" fillets on both sides (clarified in the pre-bid Q&A).',
      facts: [['Quantity', '32 EA (4 beams x 4 spans x 2 ends)'], ['Pad', '11" x 36" x 3-3/32"'], ['Top plate', '1" x 12" x 3\'-6"'], ['Bid price', '$1,400 each']], sheets: ['B44', 'B39'], pay: ['0112'] }, mesh(merge(pads), M.elastomer), mesh(merge(plates), M.steel)));
  }

  // ---------- beams, strands ----------
  const beamOutline = btOutline([[20, 0], [20, 5.5], [6, 12.5], [4, 14.5], [4, 25], [7.5, 28], [30.5, 32], [30.5, 36]]);
  for (const sp of SPANS) {
    const g = [], st = [];
    for (let k = 0; k < 4; k++) {
      const z = P.beamZ[k]; const L = sp.er - sp.el; const bg = prismX(beamOutline, 0, L);
      const y0 = beamBot(sp.s, k, sp.el), y1 = beamBot(sp.s, k, sp.er); const slope = (y1 - y0) / L;
      const p = bg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setXYZ(i, sp.el + x, p.getY(i) + y0 + slope * x, p.getZ(i) + z); }
      g.push(bg);
      // strands (pattern simplified from sheet 42): bottom rows at 2" and 4", two top strands
      const n2 = sp.s === 0 || sp.s === 3 ? [2, 6, 10] : [2, 6, 10, 14, 18];
      const rows = [[2, [2, 6, 10, 14, 18]], [4, n2], [34, [2]]];
      for (const [h, offs] of rows) for (const o of offs) for (const sg of [-1, 1]) {
        const zz = z + sg * o / 12; st.push(cylG(new THREE.Vector3(sp.el + 0.05, y0 + h / 12, zz), new THREE.Vector3(sp.er - 0.05, y1 + h / 12, zz), 0.025, 5));
      }
    }
    const end = sp.s === 0 || sp.s === 3;
    const beamMeshes = g.map((geo, k) => { const cx = (sp.el + sp.er) / 2, cz = P.beamZ[k], cy = beamBot(sp.s, k, cx); const gg = merge([geo], 0.2); gg.translate(-cx, -cy, -cz); const bm = mesh(gg, M.beam); bm.position.set(cx, cy, cz); bm.userData.liftInfo = { span: sp.s, k, len: sp.er - sp.el }; return bm; });
    add(comp('beams' + sp.name, { name: `Span ${sp.name} beams: 4 x BT 36x61`, layer: 'Superstructure', phase: [4, 99], explode: [0, 0, 0],
      desc: `Four precast, prestressed concrete wide-flange bulb-tee beams (Indiana type BT 36x61: 36" deep, 61" top flange, 40" bottom flange, 8" web) at 11'-0" centers carry Span ${sp.name}. Beams are made continuous for live load by the concrete diaphragms cast over the piers. Beams were to be cast at least 90 days before the deck pour.`,
      facts: [['Beam length', end ? '46\'-3"' : '63\'-6"'], ['Bearing to bearing', end ? '45\'-0"' : '62\'-6"'], ['Strands', end ? '16 bottom + 2 top, 0.6" dia., 270 ksi low-relaxation' : '20 bottom + 2 top, 0.6" dia., 270 ksi low-relaxation'], ['Initial pull', '43.94 kips per strand'], ['Concrete', "f'ci = 7,000 psi, f'c = 8,000 psi"], ['Elastic shortening (est.)', end ? '0.088 in.' : '0.147 in.'], ['Bid price', '$675 per LFT (880 LFT total)']], sheets: ['B39', 'B40', 'B41', 'B42', 'B43'], pay: ['0097'] }, ...beamMeshes));
    add(comp('strands' + sp.name, { name: `Span ${sp.name} prestressing strands`, layer: 'Reinforcement', phase: [4, 99], hidden: true,
      desc: 'Seven-wire 0.6-inch low-relaxation strand, 270 ksi (ASTM A416). The strand pattern drawn here is simplified from the section on sheet 42; two bottom strands are debonded near the beam ends and the two top strands are debonded at mid-span.',
      facts: [['Strand', '0.6" dia., 270 ksi'], ['Per beam', end ? '16 + 2' : '20 + 2']], sheets: ['B42', 'B40'] }, mesh(merge(st), M.strand, { cast: false })));
  }

  // ---------- steel intermediate diaphragms ----------
  {
    const g = [], cl = [];
    for (const sp of SPANS) { const xm = (sp.a + sp.b) / 2; for (let k = 0; k < 3; k++) {
      const zA = P.beamZ[k] + FT(0, 4) + 0.05, zB = P.beamZ[k + 1] - FT(0, 4) - 0.05; const yA = beamBot(sp.s, k, xm) + 1.62, yB = beamBot(sp.s, k + 1, xm) + 1.62;
      // C10x30: 10" deep, 3" flange
      const web = boxG(xm - 0.03, xm + 0.03, -0.4167, 0.4167, zA + 0.3, zB - 0.3), f1 = boxG(xm - 0.03, xm + 0.25, 0.38, 0.4167, zA + 0.3, zB - 0.3), f2 = boxG(xm - 0.03, xm + 0.25, -0.4167, -0.38, zA + 0.3, zB - 0.3);
      for (const q of [web, f1, f2]) { const p = q.attributes.position; for (let i = 0; i < p.count; i++) { const t = (p.getZ(i) - zA) / (zB - zA); p.setY(i, p.getY(i) + yA + t * (yB - yA)); } g.push(q); }
      for (const [zc, yc] of [[zA, yA], [zB, yB]]) cl.push(boxG(xm - 0.34, xm + 0.04, yc - 0.44, yc + 0.44, zc, zc + (zc === zA ? 0.33 : -0.33)));
    } }
    add(comp('diaSteel', { name: 'Intermediate steel diaphragms', layer: 'Superstructure', phase: [5, 99],
      desc: 'At mid-span of every span, C10x30 channels bolt between adjacent beam webs through L6x4x1/2 clip angles with 7/8" high-strength bolts. They brace the beams during the deck pour.',
      facts: [['Members', '12 C10x30 channels'], ['Location', 'mid-span: 23\'-0" (end spans), 32\'-0" (interior spans)'], ['Connection', 'L6x4x1/2 clip angles, 7/8" HS bolts']], sheets: ['B48', 'B39'] }, mesh(merge(g), M.galv), mesh(merge(cl), M.galv)));
  }

  // ---------- concrete diaphragms over piers and end-bent top pours ----------
  {
    const gP = [], gE = [];
    for (const i of [1, 2, 3]) { const x = xs[i]; for (let k = 0; k < 4; k++) { const z0 = k === 0 ? P.beamZ[0] - 2.54 : (P.beamZ[k - 1] + P.beamZ[k]) / 2, z1 = k === 3 ? P.beamZ[3] + 2.54 : (P.beamZ[k] + P.beamZ[k + 1]) / 2; gP.push(boxG(x - 1.5, x + 1.5, seat(i, k) + 0.02, Math.min(slabBot(x, z0), slabBot(x, z1)) + 0.02, z0, z1)); } }
    for (const bi of [0, 4]) { const x = xs[bi]; for (let k = 0; k < 4; k++) { const z0 = k === 0 ? D.zN : (P.beamZ[k - 1] + P.beamZ[k]) / 2, z1 = k === 3 ? D.zS : (P.beamZ[k] + P.beamZ[k + 1]) / 2; gE.push(boxG(x - 1.5, x + 1.5, seat(bi, k) + 0.045, Math.min(slabBot(x, z0), slabBot(x, z1)) + 0.02, z0, z1)); } }
    add(comp('diaPier', { name: 'Continuity diaphragms over the piers', layer: 'Superstructure', phase: [6, 99],
      desc: 'A 3\'-0" wide cast-in-place diaphragm at each pier encases the beam ends, extended strands and #8 bars, making the four simple spans continuous for live load. The diaphragm concrete is placed with deck Pour 3, last, to keep slab dead load out of the negative-moment region. Bearings are "semi-fixed": the diaphragm keys into the pier cap over expanded polystyrene.',
      facts: [['Width', '3\'-0" (1\'-6" each side of pier CL)'], ['Bars through beams', '#6E through 1" holes in webs'], ['Continuity bars', '#8E x 4\'-0", 4 per pier per beam line'], ['Keyway', '3" x 12" x 7\'-0"']], sheets: ['B47', 'B45'], pay: ['0088'] }, mesh(merge(gP), M.concreteNew)));
    add(comp('diaEnd', { name: 'Semi-integral end diaphragms (top pour)', layer: 'Superstructure', phase: [6, 99],
      desc: 'At each end bent, a 3\'-0" wide top pour encases the beam ends and is cast with the deck, so the superstructure and end diaphragm move together on the elastomeric bearings above the fixed cap. A 1/2" preformed joint filler and polychloroprene membrane separate the two pours.',
      facts: [['Type', 'Semi-integral end bent'], ['Joint to cap', '1/2" preformed expansion joint filler, keyed'], ['Deck expansion length', '111\'-0" each way from Pier 3']], sheets: ['B35', 'B32'], pay: ['0084'] }, mesh(merge(gE), M.concreteNew)));
  }

  // ---------- deck: three pours (sheet 45 pour diagram) + haunches ----------
  {
    const zone = { 1: [[-111, -66.5], [66.5, 111]], 2: [[-61.5, -2.5], [2.5, 61.5]], 3: [[-66.5, -61.5], [-2.5, 2.5], [61.5, 66.5]] };
    const sec = (s) => { const x = s - S0; return [[D.zN, slabBot(x, D.zN)], [0, slabBot(x, 0)], [D.zS, slabBot(x, D.zS)], [D.zS, deckTop(x, D.zS)], [0, deckTop(x, 0)], [D.zN, deckTop(x, D.zN)]]; };
    const names = { 1: 'Deck pour 1: end spans A and D', 2: 'Deck pour 2: interior spans B and C', 3: 'Deck pour 3: over Piers 2, 3 and 4' };
    for (const n of [1, 2, 3]) {
      const g = [];
      for (const [a, b] of zone[n]) {
        g.push(sweep(stations(a + S0, b + S0, 6), sec));
        // haunch (fillet) between beam top flange and slab
        for (const sp of SPANS) for (let k = 0; k < 4; k++) { const xa = Math.max(a, sp.el), xb = Math.min(b, sp.er); if (xb - xa < 0.2) continue; const z = P.beamZ[k], hw = 2.54;
          g.push(sweep(stations(xa + S0, xb + S0, 8), (s) => { const x = s - S0; const yb = beamBot(sp.s, k, x) + 3.0 - 0.01; return [[z - hw, yb], [z + hw, yb], [z + hw, slabBot(x, z + hw) + 0.01], [z - hw, slabBot(x, z - hw) + 0.01]]; })); }
      }
      add(comp('deck' + n, { name: names[n], layer: 'Superstructure', phase: [6, 99], sub: n, explode: [0, 1, 0],
        desc: 'The 8-inch reinforced concrete deck is 41\'-10" out to out of coping and 222\'-0" long, on a 2% crown about Line "PR-A" and a 300-ft crest vertical curve. The plans set the placement order: Pour 1 (end spans), Pour 2 (interior spans), then Pour 3, a 5\'-0" strip over each pier together with the continuity diaphragm. As an alternate the contractor could place it continuously end to end at 40 CYS/hr or better.',
        facts: [['Thickness', '8"'], ['Width', '41\'-10" out to out'], ['Clear roadway', '30\'-0" (two 12\' lanes, 3\' shoulders)'], ['Sidewalk', '10\'-0", north side'], ['Concrete, Class C', '290.9 CYS (incl. interior diaphragms)'], ['Reinforcing', '84,656 lb epoxy coated'], ['Design', 'HL-93, AASHTO LRFD 9th Ed. (2020); 35 psf future wearing surface'], ['Cover', '2-1/2" top, 1" bottom']], sheets: ['B45', 'B46', 'B47', 'B30'], pay: ['0088', '0086'] }, mesh(merge(g, 0.1), M.deck)));
    }
  }

  // ---------- deck reinforcement (sheets 45-46) ----------
  {
    const bars = []; const rT = 0.375 / 12, rL = 0.3125 / 12; const yB = (x, z) => slabBot(x, z) + 1.0 / 12 + rT, yT = (x, z) => deckTop(x, z) - 2.5 / 12 - rT;
    // transverse bars @ 8": bottom #6E, top 651E / #4E
    for (let i = 0; i <= 330; i++) { const x = -110 + i * (8 / 12); for (const yf of [yB, yT]) for (const [za, zb] of [[D.zN + 0.25, 0], [0, D.zS - 0.25]]) bars.push(cylG(new THREE.Vector3(x, yf(x, za), za), new THREE.Vector3(x, yf(x, zb), zb), rT, 4)); }
    // longitudinal bars @ 8": 63 across, bottom #5E, top #5E / #7E over the piers
    const xsL = []; for (let x = -110.6; x <= 110.61; x += 13.825) xsL.push(x);
    for (let j = 0; j <= 62; j++) { const z = D.zN + 0.25 + j * (8 / 12); for (const [yf, dy] of [[yB, 2 * rT], [yT, -2 * rT]]) for (let i = 0; i < xsL.length - 1; i++) bars.push(cylG(new THREE.Vector3(xsL[i], yf(xsL[i], z) + dy, z), new THREE.Vector3(xsL[i + 1], yf(xsL[i + 1], z) + dy, z), rL, 4)); }
    add(comp('rebarDeck', { name: 'Deck reinforcing steel', layer: 'Reinforcement', phase: [5, 99], hidden: true,
      desc: 'Two mats of epoxy-coated bars at 8-inch centers each way. Bottom mat: #6 transverse, #5 longitudinal. Top mat: #6 (651E, hooked) and #4 transverse, #5 longitudinal with #7 bars over the piers for negative moment. Every bar in the bridge is epoxy coated.',
      facts: [['Spacing', '8" each way, both mats'], ['Transverse bars', '166 spaces each half: 668 #6E top + 668 #6E bottom'], ['Longitudinal', '63 bars across the 41\'-4" mat width'], ['Over piers', '#7E x 22\'-0" top bars'], ['Total deck steel', '84,656 lb'], ['Bid price', '$1.50 per lb (125,579 lb contract total)']], sheets: ['B45', 'B46', 'B47'], pay: ['0086'] }, mesh(merge(bars), M.rebar, { cast: false })));
  }
  return out;
}
export { SPANS, beamBot, slabBot };

// ---------- solid fills on a cross-section cut (drawn where the clipping plane slices the bridge) ----------
let capGroup = null, capKey = '', capFloor = null;
const hdr = (hex, k = 5, o = {}) => { const m = new THREE.MeshBasicMaterial({ color: hex, side: THREE.DoubleSide, ...o }); m.color.multiplyScalar(k); return m; };   // unlit colours are scene-linear; exposure is about 0.17
const capMat = hdr(0x59636c), capMatBeam = hdr(0x8a949c), dotMat = hdr(0xffc34d), earthMat = hdr(0x6b5a45, 4), waterCapMat = hdr(0x3f6f8f, 4, { transparent: true, opacity: 0.75 }), floorMat = hdr(0x2a3138, 3);
function capX(outline, x) { const g = new THREE.ShapeGeometry(new THREE.Shape(outline.map(([z, y]) => new THREE.Vector2(z, y)))); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const Z = p.getX(i), Y = p.getY(i); p.setXYZ(i, x, Y, Z); } return g; }
const CAP_BEAM = btOutline([[20, 0], [20, 5.5], [6, 12.5], [4, 14.5], [4, 25], [7.5, 28], [30.5, 32], [30.5, 36]]);
export function setSectionCaps(scene, x, t, explode) {
  if (!capGroup) { capGroup = new THREE.Group(); capGroup.name = 'sectionCaps'; scene.add(capGroup); capFloor = new THREE.Mesh(new THREE.CircleGeometry(2350, 48), floorMat); capFloor.rotation.x = -Math.PI / 2; capFloor.position.y = 737; capFloor.visible = false; scene.parent.add(capFloor); }
  const cut = x !== null && explode < 0.01; capFloor.visible = cut; const on = cut && x > -110.9 && x < 110.9; let key = 'off', sp = null, hasBeam = false, hasDeck = false; const wl = getWaterLevel();
  if (on) { sp = SPANS.find((q) => x >= q.a && x <= q.b); hasBeam = t >= [4.45, 4.9, 4.9, 4.45][sp.s] && x > sp.el && x < sp.er; const ax = Math.abs(x); const pour = ax > 66.5 ? 6.0 : (Math.abs(ax - 64) < 2.5 || ax < 2.5) ? 6.67 : 6.34; hasDeck = t >= pour + 0.2; }
  if (cut) key = `${x.toFixed(2)}|${hasBeam}|${hasDeck}|${t >= 7.55}|${t >= 7}|${wl.toFixed(1)}`;
  if (key === capKey) return; capKey = key; for (const c of [...capGroup.children]) { c.geometry.dispose(); capGroup.remove(c); } if (!cut) return;
  const xc = x + 0.03, xd = x + 0.012; const add = (g, m) => { const k = new THREE.Mesh(g, m); k.renderOrder = 3; capGroup.add(k); };
  // the ground and the reservoir, cut at the same plane
  { const which = t >= 7 ? 'proposed' : 'existing'; const top = []; for (let z = -448; z <= 448; z += 2) top.push([z, groundAt(x, z, which)]); add(capX([...top, [448, 738], [-448, 738]], x + 0.05), earthMat);
    let run = null; const flush = () => { if (run && run.length > 1) add(capX([...run, ...run.map(([z]) => [z, wl]).reverse()], x + 0.04), waterCapMat); run = null; }; for (const [z, y] of top) { if (y < wl - 0.05) (run ||= []).push([z, y]); else flush(); } flush(); }
  if (!on) return;
  if (hasDeck) add(capX([[D.zN, slabBot(x, D.zN)], [0, slabBot(x, 0)], [D.zS, slabBot(x, D.zS)], [D.zS, deckTop(x, D.zS)], [0, deckTop(x, 0)], [D.zN, deckTop(x, D.zN)]], xc), capMat);
  if (hasBeam) for (let k = 0; k < 4; k++) { const z = P.beamZ[k], yb = beamBot(sp.s, k, x); add(capX(CAP_BEAM.map(([w, h]) => [z + w, yb + h]), xc), capMatBeam);
    if (hasDeck) add(capX([[z - 2.54, yb + 3], [z + 2.54, yb + 3], [z + 2.54, slabBot(x, z + 2.54)], [z - 2.54, slabBot(x, z - 2.54)]], xc), capMat);
    const end = sp.s === 0 || sp.s === 3; for (const [h, offs] of [[2, [2, 6, 10, 14, 18]], [4, end ? [2, 6, 10] : [2, 6, 10, 14, 18]], [34, [2]]]) for (const o of offs) for (const sg of [-1, 1]) { const c = new THREE.CircleGeometry(0.045, 10); c.rotateY(Math.PI / 2); c.translate(xd, yb + h / 12, z + sg * o / 12); add(c, dotMat); } }
  if (t >= 7.55) for (const [z0, z1, f] of [[15, 15.83, 15], [-15.83, -15, -15]]) { const y = deckTop(x, f) - 0.02; add(capX([[z0, y], [z1, y], [z1, y + 2.02], [z0, y + 2.02]], xc), capMat); }
}
