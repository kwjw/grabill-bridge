// Project data for Grabill Road over St. Joseph River (Allen County Bridge No. 29)
// INDOT Contract B-42165-A, Des. 1901712 (lead) & 2200137.
// Every number here was read from the contract plans; `src` fields give the plan sheet.
// Units: feet. Local frame: origin on Line "PR-A" at Pier 3 (Sta. 19+44.85),
// +X up-station (S69°03'54"E), +Y elevation (NAVD 88 ft), +Z right of line (south).

export const FT = (ft, inch = 0) => ft + inch / 12;

export const P = {
  name: 'Grabill Road over St. Joseph River',
  bridgeNo: 'Allen County Bridge No. 29 · Structure 02-00029',
  contract: 'B-42165-A', des: ['1901712', '2200137'],
  staPier3: 1944.85,
  // ---- horizontal alignment, Line "PR-A" (sheets 11-13)
  align: {
    begin: 1119.85, end: 2500.0,
    PC: 1337.11, PT: 1734.43, R: 1000.0, delta: (22 + 45 / 60 + 54 / 3600) * Math.PI / 180,
    PI2: 2085.73, defl2: (15 / 60 + 50 / 3600) * Math.PI / 180, // S69°03'54"E -> S69°19'44"E
  },
  // ---- profile grade, Line "PR-A" (sheets 11-13)
  profile: {
    pts: [ // sta, elev, vertical-curve length at this PVI
      [1119.85, 793.60, 0], [1139.85, 793.564, 0], [1600.0, 790.42, 200], [2025.0, 793.00, 300], [2275.0, 789.71, 100], [2500.0, 785.20, 0],
    ],
  },
  crown: 0.02,
  // ---- bridge (sheet 30)
  bents: [
    { id: 'Bent 1', sta: 1834.85, pg: 791.84, type: 'bent' },
    { id: 'Pier 2', sta: 1880.85, pg: 792.12, type: 'pier' },
    { id: 'Pier 3', sta: 1944.85, pg: 792.34, type: 'pier' },
    { id: 'Pier 4', sta: 2008.85, pg: 792.29, type: 'pier' },
    { id: 'Bent 5', sta: 2054.85, pg: 792.08, type: 'bent' },
  ],
  spans: [46, 64, 64, 46],
  deck: { zN: -FT(25, 10), zS: 16.0, t: FT(0, 8), endOver: 1.0 },   // 41'-10" out-to-out coping
  zStruct: -FT(4, 11),            // CL structure is 4'-11" left (north) of PR-A
  zExist: -FT(4, 4),              // existing CL (Line "A"/"PR-1") = CL of piers, 7" south of new CL structure
  beamSpacing: 11.0,
  beamZ: [-FT(4, 11) - 16.5, -FT(4, 11) - 5.5, -FT(4, 11) + 5.5, -FT(4, 11) + 16.5], // Beam 1 (north) .. Beam 4
  // beam seat elevations, beams 1..4 (sheets 33, 34, 37)
  seats: {
    'Bent 1': [787.24, 787.46, 787.66, 787.44],
    'Pier 2': [787.52, 787.74, 787.94, 787.72],
    'Pier 3': [787.77, 787.99, 788.18, 787.96],
    'Pier 4': [787.74, 787.96, 788.15, 787.93],
    'Bent 5': [787.56, 787.78, 787.97, 787.75],
  },
  existCapTop: { 'Pier 2': 786.34, 'Pier 3': 786.345, 'Pier 4': 786.325 },
  bearing: { pad: FT(0, 3 + 3 / 32), plate: FT(0, 1), w: 3.0, l: FT(0, 11), plateW: 3.5, plateL: 1.0 },
  // BT 36x61 section (sheet 42): half-outline from bottom, [halfWidth, height] in inches
  bt: { h: 36, top: 61, bot: 40, web: 8,
    half: [[20, 0], [20, 5.5], [4, 12.5], [4, 23], [7, 25], [30.5, 32], [30.5, 36]] },
  water: { normal: 777.7, q100: 780.31, low: 764.2, flowline: 762.66, lowStruct: 787.55 },
  // lighting standards (sheet 24): sta, offset (+right), on bridge?
  lights: [
    [1160.0, -27.0], [1304.0, -27.0], [1465.0, 21.0], [1626.0, -27.5], [1787.0, -27.5], [1944.85, 17.3], [2099.0, -19.0],
  ],
  existing: { len: FT(220, 10), w: FT(40, 10), deckT: FT(0, 6.75), deckEl: 791.0, beamSp: 6.0, nBeams: 7 },
};

const A = P.align;
const thPC = -A.delta;                       // heading at/before PC relative to bridge tangent
const xPT = A.PT - P.staPier3;               // local x of PT (tangent through bridge)
const C = { x: xPT, z: A.R };                // center of the R=1000' curve (to the right)
const pPC = { x: C.x + A.R * Math.sin(thPC), z: C.z - A.R * Math.cos(thPC) };
const xPI2 = A.PI2 - P.staPier3;

/** Line "PR-A": station -> {x, z, th} (th = heading, radians, + toward +Z) */
export function alignAt(sta) {
  if (sta <= A.PC) { const d = sta - A.PC; return { x: pPC.x + d * Math.cos(thPC), z: pPC.z + d * Math.sin(thPC), th: thPC }; }
  if (sta < A.PT) { const th = -(A.PT - sta) / A.R; return { x: C.x + A.R * Math.sin(th), z: C.z - A.R * Math.cos(th), th }; }
  if (sta <= A.PI2) return { x: sta - P.staPier3, z: 0, th: 0 };
  const d = sta - A.PI2; return { x: xPI2 + d * Math.cos(A.defl2), z: d * Math.sin(A.defl2), th: A.defl2 };
}
/** station/offset (offset + = right/south) -> local x,z */
export function so(sta, off) { const a = alignAt(sta); return { x: a.x - off * Math.sin(a.th), z: a.z + off * Math.cos(a.th) }; }
/** inverse: local x,z -> {sta, off} */
export function toSO(x, z) {
  // tangent through bridge
  if (x >= xPT && x <= xPI2) return { sta: x + P.staPier3, off: z };
  if (x > xPI2) {
    const dx = x - xPI2, c = Math.cos(A.defl2), s = Math.sin(A.defl2);
    const d = dx * c + z * s; if (d >= 0) return { sta: A.PI2 + d, off: -dx * s + z * c };
    return { sta: x + P.staPier3, off: z };
  }
  // curve region?
  const vx = x - C.x, vz = z - C.z; const r = Math.hypot(vx, vz);
  const th = Math.atan2(vx, -vz);             // heading at radial foot (0 at PT)
  if (th <= 0 && th >= thPC) return { sta: A.PT + th * A.R, off: A.R - r };
  const dx = x - pPC.x, dz = z - pPC.z, c = Math.cos(thPC), s = Math.sin(thPC);
  return { sta: A.PC + dx * c + dz * s, off: -dx * s + dz * c };
}
/** profile grade elevation at station */
export function pgAt(sta) {
  const pts = P.profile.pts;
  if (sta <= pts[0][0]) return pts[0][1];
  if (sta >= pts[pts.length - 1][0]) return pts[pts.length - 1][1];
  let i = 0; while (i < pts.length - 2 && sta > pts[i + 1][0]) i++;
  const [s0, e0] = pts[i], [s1, e1] = pts[i + 1];
  const g = (e1 - e0) / (s1 - s0);
  let el = e0 + g * (sta - s0);
  // vertical curve corrections at either end PVI
  for (const k of [i, i + 1]) {
    const L = pts[k][2]; if (!L || k === 0 || k === pts.length - 1) continue;
    const sv = pts[k][0], ev = pts[k][1];
    const g1 = (ev - pts[k - 1][1]) / (sv - pts[k - 1][0]), g2 = (pts[k + 1][1] - ev) / (pts[k + 1][0] - sv);
    const b = sv - L / 2, e = sv + L / 2;
    if (sta >= b && sta <= e) { const xx = sta - b; el = (ev - g1 * L / 2) + g1 * xx + (g2 - g1) / (2 * L) * xx * xx; }
  }
  return el;
}
export const staOfX = (x) => x + P.staPier3;              // valid on the bridge tangent
export const pgX = (x) => pgAt(x + P.staPier3);
/** top-of-deck elevation on the bridge at local (x,z) — 2% crown about PR-A */
export const deckTop = (x, z) => pgX(x) - P.crown * Math.abs(z);
export const bentX = (i) => P.bents[i].sta - P.staPier3;
export const fmtSta = (s) => { const a = Math.floor(s / 100), b = s - a * 100; return `${a}+${b.toFixed(2).padStart(5, '0')}`; };
export const fmtFtIn = (ft) => { const s = ft < 0 ? '-' : ''; ft = Math.abs(ft); let f = Math.floor(ft + 1e-6); let i = Math.round((ft - f) * 12 * 8) / 8; if (i >= 12) { f += 1; i = 0; } const w = Math.floor(i), fr = i - w; const frs = fr ? ` ${Math.round(fr * 8)}/8`.replace('2/8', '1/4').replace('4/8', '1/2').replace('6/8', '3/4') : ''; return `${s}${f}'-${w}${frs}"`; };
