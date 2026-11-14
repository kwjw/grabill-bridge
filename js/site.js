// Roadway, approach slabs, moment slab, railings, lighting, staircase, culvert and
// construction staging (temporary causeway, closure) — sheets 3-29, 49-63.
import * as THREE from 'three';
import { P, FT, pgAt, so, alignAt } from './project.js';
import { M, boxG, prismX, prismZ, cylG, merge, mesh, comp, sweep, stations, loft, rng } from './kit.js';
import { groundAt, corridor } from './terrain.js';

const S0 = P.staPier3; const D = P.deck;
const top = (s, o) => pgAt(s) - P.crown * Math.abs(o);
const B0 = 1833.85, B1 = 2055.85;                 // ends of bridge floor
const RW = B0 - 20.5, RE = B1 + 20.5;             // outer ends of the RCBAs (18+13.35, 20+76.35)
const PT = 1734.43;
/** box placed by station/offset, long axis along the alignment */
function boxAt(sta, off, along, across, y0, y1) { const a = alignAt(sta), p = so(sta, off); const g = new THREE.BoxGeometry(along, y1 - y0, across); g.rotateY(-a.th); g.translate(p.x, (y0 + y1) / 2, p.z); return g; }
const V = (sta, off, y) => { const p = so(sta, off); return new THREE.Vector3(p.x, y, p.z); };
const curveSt = (a, b, step = 10) => stations(a, b, step, [1337.11, PT, 2085.73]);
const polyOff = (m, f = -2) => { const c = m.clone(); c.polygonOffset = true; c.polygonOffsetFactor = f; c.polygonOffsetUnits = f; return c; };

// PF-1 concrete railing + steel rail (sheets 49-52). side: +1 south (traffic face toward -off), -1 north
function pf1(a, b, faceOff, side, modified) {
  const o0 = side > 0 ? faceOff : faceOff - FT(0, 10), o1 = o0 + FT(0, 10); const conc = [], steel = [];
  conc.push(sweep(curveSt(a, b, 8), (s) => { const y = top(s, faceOff) - 0.02; return [[o0, y], [o1, y], [o1, y + 2.02], [o0, y + 2.02]]; }));
  const oc = (o0 + o1) / 2;
  for (let s = a + 2.4; s < b - 0.5; s += FT(6, 8)) { const y = top(s, faceOff) + 2.0; steel.push(boxAt(s, oc, 0.33, 0.33, y, y + 1.3)); steel.push(boxAt(s, oc, 0.7, 0.6, y, y + 0.06)); }
  const railSec = (dy, w, h, doff) => (s) => { const y = top(s, faceOff) + dy; const c = oc + doff; return [[c - w / 2, y], [c + w / 2, y], [c + w / 2, y + h], [c - w / 2, y + h]]; };
  steel.push(sweep(curveSt(a + 0.6, b - 0.6, 8), railSec(3.17, 0.33, 0.3, -side * 0.1)));           // TS 4x3 top rail, top at 3'-6"
  steel.push(sweep(curveSt(a + 0.6, b - 0.6, 8), railSec(2.5, 0.3, 0.26, -side * 0.1)));             // TS 2x2 lower rail (kept per Q&A)
  return { conc: merge(conc, 0.2), steel: merge(steel) };
}

export function buildSite(scene) {
  const out = []; const add = (c) => { scene.add(c); out.push(c); return c; };

  // ---------------- reinforced concrete bridge approaches ----------------
  {
    const g = []; for (const [a, b] of [[RW, B0], [B1, RE]]) g.push(sweep(stations(a, b, 5), (s) => [[D.zN, top(s, D.zN) - 1], [0, top(s, 0) - 1], [D.zS, top(s, D.zS) - 1], [D.zS, top(s, D.zS)], [0, top(s, 0)], [D.zN, top(s, D.zN)]]));
    add(comp('rcba', { name: 'Reinforced concrete bridge approaches', layer: 'Approaches', phase: [7, 99],
      desc: 'A 20\'-6" long, 12-inch reinforced concrete approach slab at each end spans the backfill behind the semi-integral end bent and rests on the bent\'s 6-inch pavement ledge. A Type HMA terminal joint with 111 feet of expansion length sits at its outer end.',
      facts: [['Length', '20\'-6" each end'], ['Thickness', '12"'], ['Quantity', '192 SYS'], ['Terminal joint', 'Type HMA, 41.67 LFT each end'], ['Bid price', '$175 per SYS']], sheets: ['B57', 'B58', 'B30'], pay: ['0069', '0054'] }, mesh(merge(g, 0.1), M.deck)));
  }
  // ---------------- moment slab (west causeway sidewalk + barrier) ----------------
  {
    const g = []; const n = (s) => corridor(s)[0];
    g.push(sweep(curveSt(1400, 1450, 6), (s) => { const a = n(s), b = a + 10; return [[a, top(s, a) - 1], [b, top(s, b) - 1], [b, top(s, b)], [a, top(s, a)]]; }));
    g.push(sweep(curveSt(1450, RW, 8), (s) => { const a = n(s), b = -13.5; return [[a, top(s, a) - 1], [b, top(s, b) - 1], [b, top(s, b)], [a, top(s, a)]]; }));
    add(comp('momentSlab', { name: 'Reinforced concrete moment slab', layer: 'Approaches', phase: [7, 99],
      desc: 'West of the bridge the road runs on a causeway across the reservoir. A 12-inch reinforced concrete moment slab, cast in ten segments (A through J) with doweled relief joints, carries the 10-foot walk and anchors the PF-1 barrier and the pedestrian railing against overturning without widening the embankment.',
      facts: [['Limits', 'Sta. 14+00 to 18+13.35, Line "PR-A"'], ['Width', '12\'-4" (10\' walk + 10" railing + 1\'-6")'], ['Thickness', '12" on 9" subbase for PCCP'], ['Quantity', '566 SYS'], ['Reinforcing', '15,858 lb epoxy coated'], ['Relief joints', '1-1/4" x 18" dowels, 125 EA'], ['Bid price', '$220 per SYS']], sheets: ['B60', 'B61', 'B62', 'B63', 'B03'], pay: ['0093'] }, mesh(merge(g, 0.1), M.walk)));
  }
  // ---------------- HMA pavement ----------------
  {
    const g = [];
    const nW = (s) => (s < 1359 ? -13.0 : s < 1450 ? -13.0 - 0.5 * (s - 1359) / 91 : -13.5), sW = (s) => (s < 1359 ? 13.6 : s < 1400 ? 13.6 + 1.07 * (s - 1359) / 41 : 14.67);
    g.push(sweep(curveSt(1119.85, RW, 8), (s) => { const a = nW(s), b = sW(s); return [[a, top(s, a) - 1], [0, top(s, 0) - 1], [b, top(s, b) - 1], [b, top(s, b)], [0, top(s, 0)], [a, top(s, a)]]; }));
    const sE = (s) => (s < 2300 ? 15.0 : 15.0 - 1.4 * (s - 2300) / 200);
    g.push(sweep(curveSt(RE, 2500, 8), (s) => { const a = -15.0, b = sE(s); return [[a, top(s, a) - 1], [0, top(s, 0) - 1], [b, top(s, b) - 1], [b, top(s, b)], [0, top(s, 0)], [a, top(s, a)]]; }));
    add(comp('pavement', { name: 'HMA pavement', layer: 'Approaches', phase: [8, 99],
      desc: 'Approach pavement is hot-mix asphalt: 165 lb/SYS of 9.5 mm surface over 330 lb/SYS of 19 mm intermediate on 6 inches of compacted aggregate No. 53 and an 8-inch aggregate drainage layer. Beyond the full-depth limits the existing pavement is milled 1-1/2 inches and resurfaced. The profile rises about 1.4 feet at mid-bridge on a 300-foot crest curve to fit the new superstructure.',
      facts: [['Project limits', 'Sta. 11+19.85 to 25+00.00 (0.261 mi)'], ['Lanes', 'two 12\'-0" lanes'], ['Surface', 'QC/QA-HMA, 2, 64, 9.5 mm: 496 TON'], ['Intermediate', 'QC/QA-HMA, 2, 64, 19.0 mm: 263 TON'], ['Milling, 1-1/2"', '3,991 SYS'], ['Design speed', '35 mph'], ['AADT', '7,540 (2025), 8,990 (2045)']], sheets: ['B03', 'B04', 'B11', 'B12', 'B13'], pay: ['0045', '0046', '0043', '0041'] }, mesh(merge(g, 0.08), M.asphalt)));
    // markings
    const mk = []; const line = (a, b, o, w, st = 12) => mk.push(sweep(curveSt(a, b, st), (s) => [[o - w / 2, top(s, o) + 0.01], [o + w / 2, top(s, o) + 0.01], [o + w / 2, top(s, o) + 0.035], [o - w / 2, top(s, o) + 0.035]], false));
    const y = [], w = []; for (const [a, b] of [[1119.85, RW], [RE, 2500]]) { line(a, b, -0.42, 0.33); line(a, b, 0.42, 0.33); } y.push(...mk.splice(0)); for (const [a, b] of [[1119.85, RW], [RE, 2500]]) { line(a, b, -12, 0.33); line(a, b, 12, 0.33); } w.push(...mk.splice(0)); line(RW, RE, -0.42, 0.33, 8); line(RW, RE, 0.42, 0.33, 8); const fd = mk.splice(0);
    add(comp('markings', { name: 'Pavement markings', layer: 'Approaches', phase: [8, 99], pick: false, desc: 'Double yellow centerline and white edge lines on the asphalt approaches. On the concrete deck and approach slabs the July 2026 street-level photos show only a faint yellow centerline and no edge lines, so that is what is drawn.', facts: [], sheets: ['B27', 'B28'] }, mesh(merge(y), polyOff(M.paintY), { cast: false }), mesh(merge(w), polyOff(M.paintW), { cast: false }), mesh(merge(fd), polyOff(M.paintFade), { cast: false })));
  }
  // ---------------- sidewalks, curb ----------------
  {
    const g = [], cb = []; const sw = (s, o, base) => base + 0.5 + 0.015 * (Math.abs(o) - Math.abs(base ? 0 : 0));
    const walk = (a, b, oIn, oOutFn) => g.push(sweep(curveSt(a, b, 8), (s) => { const o1 = oIn, o0 = oOutFn(s); const y = top(s, o1) + 0.5; return [[o0, y - 0.5 + 0.015 * (o1 - o0)], [o1, y - 0.5], [o1, y], [o0, y + 0.015 * (o1 - o0)]]; }));
    walk(1119.85, 1400, -15.6, (s) => corridor(s)[0]); walk(RE + 16, 2302, -19.0, () => -29.0);
    g.push(sweep(stations(RE, RE + 16, 4), (s) => { const t = (s - RE) / 16; const o1 = -15.83 - 3.17 * t, o0 = -25.83 - 3.17 * t; const y = top(s, o1) + 0.5 * t; return [[o0, y - 0.5], [o1, y - 0.5], [o1, y], [o0, y + 0.1]]; }));
    const curb = (a, b, o) => cb.push(sweep(curveSt(a, b, 8), (s) => { const y = top(s, o); return [[o - 2.08, y - 0.6], [o, y - 0.6], [o, y], [o - 1.58, y + 0.04], [o - 1.5, y + 0.5], [o - 2.08, y + 0.5]]; }));
    curb(1160.15, 1400, -13.0); curb(RE + 16, 2302, -15.0);
    add(comp('sidewalk', { name: 'Sidewalks, curb and gutter', layer: 'Approaches', phase: [8, 99],
      desc: 'A continuous 10-foot walk now runs along the north side from SR 1 in Leo to the park east of the river, tying the town to the St. Joseph River trail system. Off the bridge it is 4-inch concrete on compacted aggregate behind concrete curb and gutter; the first block has a brick-banded curb face to match the existing downtown streetscape.',
      facts: [['Width', '10\'-0"'], ['Sidewalk, 4"', '428 SYS'], ['Curb and gutter', '435 LFT'], ['Brick banding', 'Sta. 11+19.85 to 11+60.15']], sheets: ['B03', 'B17', 'B18'], pay: ['0062', '0067'] }, mesh(merge(g, 0.1), M.walk), mesh(merge(cb, 0.1), M.concreteNew)));
  }
  // ---------------- railings ----------------
  {
    const s1 = pf1(B0 - FT(15, 8), B1 + 20.5, 15.0, 1, false), n1 = pf1(B0 - FT(372, 7) - FT(15, 8), B1 + 20.5, -15.0, -1, true);
    add(comp('railS', { name: 'South bridge railing, Type PF-1', layer: 'Railings', phase: [7, 99],
      desc: 'Indiana Type PF-1 railing: a 10-inch wide, 2\'-0" high reinforced concrete parapet topped with a steel tube rail to 3\'-6" overall, on posts at 6\'-8". It runs the 222-foot bridge floor with concrete transitions (Type TPF-1) to the MGS guardrail at each end.',
      facts: [['Height', '3\'-6" overall (2\'-0" concrete + 1\'-6" steel)'], ['Concrete width', '10"'], ['Posts', '6\'-8" centers'], ['Concrete railing PF-1', '817 LFT (both sides)'], ['Bid price', '$148 per LFT']], sheets: ['B50', 'B51', 'B52'], pay: ['0094', '0095'] }, mesh(s1.conc, M.concreteNew), mesh(s1.steel, M.galv)));
    add(comp('railN', { name: 'North barrier railing, Type PF-1 Modified', layer: 'Railings', phase: [7, 99],
      desc: 'Between the traffic lanes and the 10-foot walk, a PF-1 "Modified" railing separates vehicles from pedestrians for about 600 feet: across the bridge and 372\'-7" west along the causeway on the moment slab. The modification adds a 2-inch pipe handrail on the walk side; the pre-bid Q&A confirmed the 2-inch square tube stays.',
      facts: [['Steel railing, PF-1 Modified', '603\'-2" (604 LFT)'], ['Concrete on moment slab', '372\'-7"'], ['Concrete on bridge', '222\'-0"'], ['Joints', 'full joints matched to moment-slab relief joints']], sheets: ['B49', 'B50', 'B60'], pay: ['0096', '0094', '0092'] }, mesh(n1.conc, M.concreteNew), mesh(n1.steel, M.galv)));
  }
  // pedestrian railing: curved picket panels, posts at 6'-0" (sheets 53-54)
  {
    const a = 1400, b = B1 + 1.2; const off = (s) => corridor(Math.max(s, 1400))[0] + 0.02; const y0 = (s) => top(s, off(s)) - 0.15;
    const bulge = (t) => -0.55 * Math.sin(Math.PI * Math.min(1, t * 1.05));
    const mk = (w, d, seg = 7) => { const pts = []; for (let i = 0; i <= seg; i++) { const t = i / seg; pts.push(new THREE.Vector3(0, 0.83 + 3.83 * t, bulge(t))); } const rows = pts.map((p) => [new THREE.Vector3(-w / 2, p.y, p.z - d / 2), new THREE.Vector3(w / 2, p.y, p.z - d / 2), new THREE.Vector3(w / 2, p.y, p.z + d / 2), new THREE.Vector3(-w / 2, p.y, p.z + d / 2), new THREE.Vector3(-w / 2, p.y, p.z - d / 2)]); return loft(rows); };
    const pick = mk(0.0625, 0.0625, 6), post = mk(0.0625, 0.29, 7); const len = []; let acc = 0, prev = null; const sts = stations(a, b, 2);
    for (const s of sts) { const p = so(s, off(s)); if (prev) acc += Math.hypot(p.x - prev.x, p.z - prev.z); len.push(acc); prev = p; }
    const at = (d) => { let i = 0; while (i < len.length - 2 && len[i + 1] < d) i++; const t = (d - len[i]) / (len[i + 1] - len[i]); return sts[i] + t * (sts[i + 1] - sts[i]); };
    const nP = Math.floor(acc / (4.75 / 12)), nPost = Math.floor(acc / 6) + 1; const im = new THREE.InstancedMesh(pick, M.galv, nP), ip = new THREE.InstancedMesh(post, M.galv, nPost); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    const place = (inst, i, d) => { const s = at(d), al = alignAt(s), p = so(s, off(s)); e.set(0, -al.th, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(p.x, y0(s), p.z), q, new THREE.Vector3(1, 1, 1)); inst.setMatrixAt(i, m4); };
    for (let i = 0; i < nP; i++) place(im, i, (i + 0.5) * acc / nP); for (let i = 0; i < nPost; i++) place(ip, i, Math.min(acc - 0.05, i * 6));
    im.castShadow = ip.castShadow = true;
    const pipes = []; for (const [h, t] of [[0.83, 0], [4.66, 1]]) pipes.push(sweep(curveSt(a, b, 6), (s) => { const o = off(s) + bulge(t), y = y0(s) + h; return [[o - 0.1, y - 0.1], [o + 0.1, y - 0.1], [o + 0.1, y + 0.1], [o - 0.1, y + 0.1]]; }));
    add(comp('pedRail', { name: 'Pedestrian railing (steel, curved pickets)', layer: 'Railings', phase: [7, 99],
      desc: 'The outside edge of the walk carries a custom hot-dip galvanized railing 4\'-8" high: 3/4" square pickets at 4" maximum clear spacing between 2" pipe rails, bowed outward on a 5\'-6" radius, on curved 3/4" plate posts every 6\'-0" bolted to plates embedded in the slab edge. At $348 a foot it is the sixth-largest item in the bid.',
      facts: [['Length', '675 LFT (bridge, approach slab and moment slab)'], ['Height', '4\'-8"'], ['Pickets', '3/4" square bar, 4" max. clear'], ['Posts', '3/4" plate at 6\'-0" centers, 3 A325 bolts each'], ['Finish', 'hot-dip galvanized'], ['Bid price', '$348 per LFT = $234,900']], sheets: ['B53', 'B54', 'B47'], pay: ['0089'] }, im, ip, mesh(merge(pipes), M.galv)));
  }
  // guardrail (MGS W-beam) — runs and end markers checked against July 2026 street-level photos
  {
    const g = [], blk = [], mk = []; const W = [[0, 0], [0.27, 0.17], [0.27, 0.36], [0.06, 0.51], [0.27, 0.66], [0.27, 0.85], [0, 1.02]];
    const run = (a, b, o, face, yellow) => { const sec = (s) => { const y = top(s, o) + 1.55; const f = W.map(([d, h]) => [o + face * (d + 0.42), y + h]), bk = W.map(([d, h]) => [o + face * (d + 0.39), y + h]).reverse(); return face > 0 ? [...bk, ...f] : [...f, ...bk]; };
        g.push(sweep(curveSt(a, b, 6.25), sec)); for (let s = a; s <= b + 0.01; s += 6.25) { const y = top(s, o); g.push(boxAt(s, o, 0.33, 0.5, y - 0.6, y + 2.45)); blk.push(boxAt(s, o + face * 0.3, 0.5, 0.36, y + 1.45, y + 2.6)); } };
    run(B0 - FT(15, 8) - 356.25, B0 - FT(15, 8), 16.1, -1); run(RE, RE + 92, 16.1, -1); run(RE + 16, RE + 92, -16.1, 1); run(1362, 1446, -14.6, 1);
    const stripe = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#f2c200'; x.fillRect(0, 0, 64, 128); x.fillStyle = '#111'; for (let i = -4; i < 8; i++) { x.beginPath(); x.moveTo(0, i * 32); x.lineTo(64, i * 32 + 48); x.lineTo(64, i * 32 + 64); x.lineTo(0, i * 32 + 16); x.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    for (const [s, o] of [[1360.5, -14.6], [B0 - FT(15, 8) - 357, 16.1]]) { const y = top(s, o); const q = boxAt(s, o, 0.08, 1.5, y + 1.3, y + 4.3); mk.push(q); g.push(boxAt(s, o, 0.2, 0.2, y - 0.5, y + 1.4)); }
    add(comp('guardrail', { name: 'MGS W-beam guardrail', layer: 'Railings', phase: [8, 99], desc: 'Midwest Guardrail System W-beam protects the south side of the causeway (356.25 feet), a short run between the road and the walk west of the barrier, and the east approach. It ties to the bridge railing through TPF-1 concrete transitions and ends in Type OS end treatments with object markers.', facts: [['West run, right side', '356.25 LFT'], ['Transitions', 'MGS with and without curb'], ['End treatments', 'Type OS']], sheets: ['B11', 'B12', 'B16'] }, mesh(merge(g), M.galv), mesh(merge(blk), M.black), mesh(merge(mk), new THREE.MeshStandardNodeMaterial({ map: stripe, roughness: 0.6 }))));
  }
  // ---------------- lighting ----------------
  {
    const poles = [], heads = [], banners = []; const H = 25;
    P.lights.forEach(([s, o], i) => {
      const p = so(s, o), al = alignAt(s); const base = i === 5 ? P.seats['Pier 3'][3] + 2.5 : top(s, Math.sign(o) * 15) + (o < 0 ? 0.55 : 0.15); const dir = -Math.sign(o);
      const L = (dx, dy) => { const q = so(s, o + dir * dx); return new THREE.Vector3(q.x, base + dy, q.z); };
      const pole = new THREE.CylinderGeometry(0.19, 0.3, H, 12); pole.translate(p.x, base + H / 2, p.z); poles.push(pole);
      const b1 = new THREE.CylinderGeometry(0.42, 0.55, 2.6, 12); b1.translate(p.x, base + 1.3, p.z); const b2 = new THREE.CylinderGeometry(0.3, 0.42, 0.9, 12); b2.translate(p.x, base + 3.05, p.z); poles.push(b1, b2);
      // shepherd's-crook arm with a scroll brace, bell-shaped pendant luminaire
      const arm = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([L(0, H - 0.2), L(0.5, H + 1.7), L(2.3, H + 2.9), L(4.4, H + 2.5), L(5.6, H + 1.2), L(5.9, H + 0.2)]), 24, 0.1, 8); poles.push(arm);
      const brace = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([L(0, H - 4.2), L(1.2, H - 2.4), L(2.4, H + 0.4), L(2.6, H + 2.6)]), 14, 0.055, 6); poles.push(brace);
      const tip = L(5.9, H + 0.2); const bell = new THREE.LatheGeometry([[0.12, 0], [0.2, -0.12], [0.34, -0.5], [0.8, -0.95], [1.0, -1.25], [1.02, -1.4]].map(([x, y]) => new THREE.Vector2(x, y)), 20); bell.translate(tip.x, tip.y, tip.z); poles.push(bell);
      const lens = new THREE.CircleGeometry(0.85, 20); lens.rotateX(Math.PI / 2); lens.translate(tip.x, tip.y - 1.36, tip.z); heads.push(lens);
      const med = new THREE.CylinderGeometry(0.75, 0.75, 0.08, 20); med.rotateX(Math.PI / 2); med.rotateY(-al.th); const mp = L(1.15, H - 1.6); med.translate(mp.x, mp.y, mp.z); poles.push(med);
      const bn = new THREE.PlaneGeometry(1.9, 4.2); bn.rotateY(-al.th + Math.PI / 2); const bp = L(-1.25, H - 9.5); bn.translate(bp.x, bp.y, bp.z); banners.push(bn); poles.push(cylG(L(-0.2, H - 7.3), L(-2.3, H - 7.3), 0.04, 5), cylG(L(-0.2, H - 11.7), L(-2.3, H - 11.7), 0.04, 5));
    });
    const bnMat = new THREE.MeshStandardNodeMaterial({ color: 0x9c2230, roughness: 0.8, side: THREE.DoubleSide });
    add(comp('lights', { name: 'Ornamental street lighting', layer: 'Lighting', phase: [7, 99],
      desc: 'Seven black decorative light standards with scroll arms and pendant LED luminaires line the project, six on the approaches and one at mid-bridge on a pedestal cast onto the south end of Pier 3 (the 1964 piers were built with anchor bolts for "future light poles" that were never installed). Conduit runs through the south railing. The arm and luminaire shape follow July 2026 street-level photos; the banners are as seen then.',
      facts: [['Standards on Grabill Rd', '7 (Poles #1 to #7)'], ['Pole', '30\' decorative, 6\' mast arm, black'], ['Luminaire', 'Sternberg 1531LED, Type 3 distribution'], ['Circuits', 'A-1, A-2, B-1 from Control Panel No. 1 at Sta. 13+75'], ['Bid price', '$6,500 per pole + $6,500 per luminaire']], sheets: ['B24', 'B25', 'B26', 'B38'], pay: ['0156', '0157', '0159'] }, mesh(merge(poles), M.black), mesh(merge(heads), M.glass, { cast: false }), mesh(merge(banners), bnMat)));
  }
  // ---------------- overhead utility line (context, from street-level photos; positions approximate) ----------------
  {
    const wood = [], steelp = [], wires = []; const PL = [[1215, 31], [1440, 28], [1650, 27.5], [1822, 23.5], [2072, 23.5], [2290, 30], [2490, 33]]; const tops = [];
    for (const [s, o] of PL) { const p = so(s, o), al = alignAt(s); const g0 = groundAt(p.x, p.z, 'proposed'); const yT = Math.max(g0 + 34, top(s, 15) + 30); const c = new THREE.CylinderGeometry(0.38, 0.62, yT - g0 + 4, 10); c.translate(p.x, (yT + g0 - 4) / 2, p.z); wood.push(c);
      const arm = boxAt(s, o, 0.3, 8, yT - 2.2, yT - 1.85); wood.push(arm); const pts = [-3.6, 0, 3.6].map((d) => { const q = so(s, o + d); return new THREE.Vector3(q.x, yT - (d === 0 ? -0.6 : 1.3), q.z); }); for (const q of pts) { const ins = new THREE.CylinderGeometry(0.12, 0.16, 0.55, 8); ins.translate(q.x, q.y - 0.3, q.z); steelp.push(ins); }
      const n = so(s, o - 0.5); tops.push([...pts, new THREE.Vector3(n.x, yT - 8, n.z), new THREE.Vector3(n.x, yT - 13, n.z)]); }
    for (let i = 0; i < tops.length - 1; i++) for (let k = 0; k < 5; k++) { const a = tops[i][k], b = tops[i + 1][k]; const sag = a.distanceTo(b) * (k < 3 ? 0.022 : 0.03); const pts = []; for (let j = 0; j <= 14; j++) { const t = j / 14; const q = a.clone().lerp(b, t); q.y -= sag * 4 * t * (1 - t); pts.push(q); } wires.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, k === 4 ? 0.075 : 0.035, 5)); }
    const woodMat = new THREE.MeshStandardNodeMaterial({ color: 0x6b5a48, roughness: 0.95 });
    add(comp('utility', { name: 'Overhead power line (existing utility)', layer: 'Site', phase: [0, 99], desc: 'A wood-pole distribution line follows the south side of the causeway and crosses the river beside the bridge. Pole positions and heights here are estimated from July 2026 street-level photos, not from the plans.', facts: [['Status', 'context, positions approximate'], ['Utility', 'Indiana Michigan Power (per the plan index sheet)']], sheets: ['B02'] }, mesh(merge(wood), woodMat), mesh(merge(steelp), M.galv), mesh(merge(wires), M.cable, { cast: false })));
  }
  // ---------------- staircase at the north-east corner (sheets 18-19) ----------------
  {
    const g = [], hr = []; const X = (s) => s - S0; const xa = X(2065.19), xb = X(2072.52);
    const tr = 11 / 12, ri = 7 / 12;
    // upper landing 6'-0", flight 1 (7 treads north), landing 786.75
    g.push(boxG(xa - 0.67, xb + 0.67, 790.3, 791.48, -31.83, -25.83));
    // simpler explicit stair profile
    const prof1 = []; let z = -31.83, y = 791.40; prof1.push([z, y]); for (let i = 0; i < 7; i++) { y -= ri; prof1.push([z, y]); z -= tr; prof1.push([z, y]); } y -= ri; prof1.push([z, y]); prof1.push([z, y - 0.9]); prof1.push([-31.83, 791.40 - 1.6]);
    g.push(prismX(prof1, xa, xb));
    g.push(boxG(xa - 0.67, xb + 0.67, 785.6, 786.75, -46.5, z));                                // landing (to 46.50' Lt)
    for (const xx of [xa - 0.67, xb]) g.push(prismX([[-25.83, 790.6], [-25.83, 792.2], [z, 787.5], [z, 785.6]], xx, xx + 0.67)); // cheek walls
    // flight 2 (12 treads west), from landing at 786.73 down to 779.15
    const zf0 = -45.83, zf1 = -39.83; let x = xa, yy = 786.73; const prof2 = [[x, yy]]; for (let i = 0; i < 12; i++) { yy -= ri; prof2.push([x, yy]); x -= tr; prof2.push([x, yy]); } yy -= ri; prof2.push([x, yy]); prof2.push([x, yy - 0.9]); prof2.push([xa, 786.73 - 1.6]);
    g.push(prismZ(prof2, zf0, zf1));
    for (const zz of [zf0 - 0.67, zf1]) g.push(prismZ([[xa, 785.6], [xa, 787.5], [x, 780.0], [x - 2.9, 780.0], [x - 2.9, 778.2], [x, 778.2]], zz, zz + 0.67));
    g.push(boxG(x - 9, x, 778.3, 779.15, zf0, zf1));                                             // lower landing / tie to existing walk
    // handrails: 1-1/2" galvanized pipe
    for (const xx of [xa - 0.33, xb + 0.33]) { hr.push(cylG(new THREE.Vector3(xx, 794.4, -25.9), new THREE.Vector3(xx, 794.4, -31.83), 0.065, 6)); hr.push(cylG(new THREE.Vector3(xx, 794.4, -31.83), new THREE.Vector3(xx, 789.73, z), 0.065, 6)); for (const zz of [-26.2, -31.83, (z - 31.83) / 2, z]) { const yb = zz > -31.83 ? 791.48 : 791.4 + (zz + 31.83) * (ri / tr); hr.push(cylG(new THREE.Vector3(xx, yb, zz), new THREE.Vector3(xx, yb + 3, zz), 0.05, 5)); } }
    for (const zz of [zf0 - 0.33, zf1 + 0.33]) { hr.push(cylG(new THREE.Vector3(xa, 789.73, zz), new THREE.Vector3(x, 782.15, zz), 0.065, 6)); for (let k = 0; k <= 4; k++) { const xx = xa + (x - xa) * k / 4, yb = 786.73 + (779.15 - 786.73) * k / 4; hr.push(cylG(new THREE.Vector3(xx, yb, zz), new THREE.Vector3(xx, yb + 3, zz), 0.05, 5)); } }
    add(comp('stairs', { name: 'Staircase to the river trail', layer: 'Approaches', phase: [8, 99],
      desc: 'At the north-east corner a new concrete staircase drops 12.3 feet from the bridge walk to the existing trail that passes under Span D: a flight of 8 risers north to a landing, then 13 risers west down to El. 779.15. Cheek walls on spread footings carry 1-1/2" galvanized pipe handrails. The City of Fort Wayne granted right of entry for it.',
      facts: [['Top of stairs', 'El. 791.40 at Sta. 20+65.19, 25.83\' Lt.'], ['Upper flight', '7 treads at 11", 8 risers at 7"'], ['Landing', 'El. 786.75'], ['Lower flight', '12 treads at 11", 13 risers at 7"'], ['Bottom of stairs', 'El. 779.15'], ['Width', '6\'-0" between walls'], ['Stair railing', '70 LFT at $295']], sheets: ['B18', 'B19', 'B20'], pay: ['0090'] }, mesh(merge(g, 0.15), M.concreteNew), mesh(merge(hr), M.galv)));
  }
  // ---------------- existing trail under Span D ----------------
  {
    const pts = [[104, 150], [99, 95], [93, 45], [89, 12], [88.5, -14], [90, -28], [93.5, -37], [98, -42], [101, -43]]; const rows = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); const nx = -dz / l * 4, nz = dx / l * 4; const [px, pz] = pts[i]; const under = Math.abs(pz) < 40; const y = (under ? 779.1 : Math.max(778.9, groundAt(px, pz, 'existing'))) + 0.12; rows.push([new THREE.Vector3(px + nx, y, pz + nz), new THREE.Vector3(px - nx, y, pz - nz)]); }
    const tg = loft(rows); add(comp('trail', { name: 'Existing river trail (under Span D)', layer: 'Site', phase: [0, 99], desc: 'An existing concrete path follows the east bank and passes under the last span at about El. 779. The plans keep it, repair the void beneath it with flowable fill, protect it with 18-inch revetment riprap, and connect it to the new walk with the staircase. Its alignment here is traced from the aerial photo.', facts: [['Path elevation under bridge', '≈ El. 779'], ['Clearance to low structure', '≈ 8.5 ft']], sheets: ['B17', 'B18', 'B30'] }, mesh(tg, polyOff(new THREE.MeshStandardMaterial({ color: 0xcfcbc2, roughness: 0.95, side: THREE.DoubleSide }), -1), { cast: false })));
  }
  // ---------------- Structure No. 17: 8-ft CSP with centrifugally cast concrete liner ----------------
  {
    const a = V(1430, -72, 774.17 + 4), b = V(1430, 77, 773.99 + 4); const pipe = cylG(a, b, 4.0, 28); const inner = cylG(a.clone().lerp(b, -0.002), b.clone().lerp(a, -0.002), 3.75, 24);
    add(comp('culvert', { name: 'Structure No. 17: 8-ft pipe with cast liner', layer: 'Drainage', phase: [0, 99],
      desc: 'An existing 8-foot corrugated steel pipe passes through the causeway near Sta. 14+30, equalizing the reservoir on either side. Instead of excavating it, the contract rehabilitates it in place with a centrifugally cast concrete pipe liner along its full 149-foot length.',
      facts: [['Location', 'Sta. 14+30, Line "PR-A"'], ['Existing pipe', '8\' diameter CSP, 149 ft'], ['Inverts', '774.17 upstream, 773.99 downstream'], ['Liner', 'centrifugally cast concrete, 44.2 SFT per ft'], ['Bid price', '$900 per LFT = $134,100']], sheets: ['B11', 'B16'], pay: ['0111'] }, mesh(pipe, M.galv), mesh(inner, new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.9, side: THREE.BackSide }))));
  }
  // ---------------- temporary causeways (sheets 14-15) ----------------
  const cause = (id, name, pts, phase, desc, pad) => {
    const rows = [], rowsL = [], rowsR = [];
    for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); const nx = -dz / l, nz = dx / l; const [px, pz, el] = pts[i]; const hb = 10 + 1.5 * (el - 760);
      const T0 = new THREE.Vector3(px + nx * 10, el, pz + nz * 10), T1 = new THREE.Vector3(px - nx * 10, el, pz - nz * 10), Bl = new THREE.Vector3(px + nx * hb, 760, pz + nz * hb), Br = new THREE.Vector3(px - nx * hb, 760, pz - nz * hb);
      rows.push([T1, T0]); rowsL.push([T0, Bl]); rowsR.push([Br, T1]); }
    const last = pts.length - 1; const e = [rows[last][1], rows[last][0], rowsR[last][0], rowsL[last][1]];
    const cap = new THREE.BufferGeometry(); cap.setAttribute('position', new THREE.Float32BufferAttribute([e[0], e[1], e[2], e[0], e[2], e[3]].flatMap((v) => [v.x, v.y, v.z]), 3)); cap.computeVertexNormals();
    const m = M.causeway; const padG = []; if (pad) { const [px, pz, hx, hz] = pad; const ring = (e, y) => [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, -1]].map(([a, b]) => new THREE.Vector3(px + a * (hx + e), y, pz + b * (hz + e))); const tp = ring(0, 772.02), bt = ring(18, 760); padG.push(loft([bt, tp]), loft([[tp[0], tp[1]], [tp[3], tp[2]]])); }
    return add(comp(id, { name, layer: 'Construction staging', phase, desc, facts: [['Top of causeway', 'El. 772.0'], ['Top width', '20\'-0"'], ['Side slopes', '1.5 : 1'], ['Material', 'revetment riprap'], ['Clear of pier riprap', '6\'-0"'], ['Low pool during work', 'El. 764.2 ±'], ['Bid price', '$75,000 lump sum (both phases)']], sheets: ['B14', 'B15'], pay: ['0100', '0026'] }, mesh(merge([loft(rows), loft(rowsL), loft(rowsR), cap, ...padG], 0.07), m)));
  };
  const L = (s, o, el) => { const p = so(s, o); return [p.x, p.z, el]; };
  cause('causeway1', 'Temporary causeway, Phase 1 (from the west)', [L(1462, -34, 789.0), L(1500, -50, 783.5), L(1545, -68, 777), L(1590, -80, 772), L(1700, -88, 772), L(1790, -88, 772), L(1836, -86, 772), [-80, -78, 772], [-55, -70, 772], [-37, -57, 772], [-27, -40, 772], [-23.25, -20, 772], [-23.25, 14, 772]], [1, 8],
    'With the reservoir lowered, a rock causeway built from the west embankment reaches under Span B between Piers 2 and 3. It gave cranes and crews a working platform for removing the old beams and setting new ones. Its top (El. 772.0) is 5.7 feet below normal pool, which is why the schedule depended on Fort Wayne City Utilities holding the pool down. The route is traced from sheet 14; the widened crane pad is assumed.', [-50, -70, 21, 20]);
  cause('causeway2', 'Temporary causeway, Phase 2 (from the east)', [L(2140, -40, 786.5), L(2112, -52, 780.5), L(2085, -62, 775), [112, -68, 772], [70, -68, 772], [48, -60, 772], [33, -45, 772], [25, -28, 772], [23.25, -10, 772], [23.25, 14, 772]], [1.35, 8],
    'Phase 2 comes in from the east bank and reaches under Span C between Piers 3 and 4, so the two phases never block the whole waterway at once. Waterway traffic control (signs and buoys) was required while either was in place. The widened crane pad is assumed.', [50, -70, 21, 20]);

  // ---------------- construction equipment and closure (illustrative) ----------------
  {
    const bg = [], bo = []; for (const [s, o0, o1] of [[1128, -13, 13], [2492, -13, 13]]) for (let k = 0; k < 3; k++) { const yb = top(s, 0); const mid = (o0 + o1) / 2; bo.push(boxAt(s, mid, 0.12, o1 - o0, yb + 1.2 + k * 1.25, yb + 1.9 + k * 1.25)); if (k === 0) for (const o of [o0 + 1, mid, o1 - 1]) bg.push(boxAt(s, o, 0.3, 0.3, yb, yb + 4.6)); }
    add(comp('closure', { name: 'Road closure barricades', layer: 'Construction staging', phase: [1, 9], desc: 'Grabill Road was closed to through traffic between SR 1 (Leo Road) and Schwartz Road for the work, with Type III barricades and a signed detour around the reservoir: SR 1, Clay Street / Halter Road, St. Joe Road and Schwartz Road. The companion project (Des. 2200137) signalized SR 1 at Clay Street on that route. Barricade positions here are schematic.',
      facts: [['Closure time allowed', '200 calendar days (Revision 1)'], ['Liquidated damages', '$3,000 per day'], ['Detour', 'SR 1, Clay St / Halter Rd, St. Joe Rd, Schwartz Rd'], ['Maintaining traffic', '$120,000 lump sum']], sheets: ['B10'], pay: ['0120'] }, mesh(merge(bo), M.orange), mesh(merge(bg), M.galv)));
  }
  return out;
}
