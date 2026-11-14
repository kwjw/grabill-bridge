// Sky, sun, cascaded shadows, image-based lighting and the post-processing pipeline (three.js WebGPURenderer + TSL).
// The sky is a photographed HDR panorama (Poly Haven, CC0): it is both the visible background and the source of ambient light,
// and the directional sun is aligned to the sun in the photograph.
import * as THREE from 'three';
import { pass, mrt, output, normalView, diffuseColor, velocity, add, vec3, vec4, packNormalToRGB, unpackRGBToNormal, sample, mix, float, smoothstep, texture, positionLocal, normalize, atan, asin, vec2, uniform, min } from 'three/tsl';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

export const ENV = { q: {}, sunDir: new THREE.Vector3(0, 1, 0), sunColor: new THREE.Color(1, 1, 1), low: 0 };
const SKIES = { day: 'kloofendal_48d_partly_cloudy_puresky', eve: 'industrial_sunset_puresky' };
let A, pmrem, envRT, sun, csm, pipe, lastProj = '', skyMesh, envMesh, envScene, cur = null; const sk = {};
const QS = new URLSearchParams(location.search);
ENV.exposure = +(QS.get('exp') || 0.17); ENV.sunBase = +(QS.get('sun') || 14); ENV.envInt = +(QS.get('env') || 1.5); ENV.skyGain = +(QS.get('sky') || 1.5);

const equirect = () => { const d = normalize(positionLocal); return vec2(atan(d.z, d.x).div(Math.PI * 2).add(0.5), asin(d.y.clamp(-1, 1)).div(Math.PI).add(0.5)); };
function skySphere(tex, gain, cap) { const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false }); const t = texture(tex, equirect()); m.userData.tex = t;
  let c = t.rgb; if (cap) c = min(c, vec3(cap)); m.colorNode = c.mul(gain); const s = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), m); s.frustumCulled = false; return s; }

export async function initEnv(app, qs) {
  A = app; const { renderer, scene, camera } = A; const soft = qs.has('soft');
  const Q = ENV.q = { gi: qs.get('gi') || (soft ? 'none' : 'ssgi'), traa: !qs.has('notraa'), bloom: !qs.has('nobloom'), sm: +(qs.get('sm') || (soft ? 2048 : 8192)), cascades: +(qs.get('csm') || 4), reflect: !qs.has('noreflect'), soft };
  const info = await fetch('sky/sky.json').then((r) => r.json()); const ld = new HDRLoader(); const res = qs.get('skyres') || (soft ? '2k' : '8k');
  const tryLoad = async (k, r) => { try { return await ld.loadAsync(`sky/${SKIES[k]}_${r}.hdr`); } catch (e) { return ld.loadAsync(`sky/${SKIES[k]}_4k.hdr`); } };   // the published site omits the 8K skies
  for (const k in SKIES) { const [hi, lo] = await Promise.all([tryLoad(k, res), res === '2k' ? null : ld.loadAsync(`sky/${SKIES[k]}_2k.hdr`)]); for (const t of [hi, lo]) if (t) { t.wrapS = THREE.RepeatWrapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; t.needsUpdate = true; } sk[k] = { hi, lo: lo || hi, ...info[SKIES[k]] }; }
  skyMesh = skySphere(sk.day.hi, ENV.skyGain); skyMesh.scale.setScalar(50000); skyMesh.renderOrder = -10; scene.add(skyMesh);
  // lighting copy: low-res, sun disc clamped out (the directional light supplies the sun), plus a ground colour below the horizon
  envScene = new THREE.Scene(); envMesh = skySphere(sk.day.lo, 1, 24); envMesh.scale.setScalar(50); envScene.add(envMesh);   // inside PMREM's default far plane (100)
  const gnd = new THREE.Mesh(new THREE.CircleGeometry(49, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.16, 0.17, 0.11) })); gnd.rotation.x = -Math.PI / 2; gnd.position.y = -0.15; envScene.add(gnd);
  pmrem = new THREE.PMREMGenerator(renderer);
  // land beyond the far terrain so the horizon is ground fading into haze
  const far = new THREE.Mesh(new THREE.RingGeometry(13800, 49000, 96, 1), new THREE.MeshLambertMaterial({ color: 0x55633a })); far.rotation.x = -Math.PI / 2; far.position.y = 770; scene.add(far);
  // ---- sun with cascaded shadow maps
  sun = new THREE.DirectionalLight(0xffffff, 10); sun.castShadow = true; sun.shadow.mapSize.set(Q.sm, Q.sm); const sc = sun.shadow.camera; sc.near = 1; sc.far = 6000; sc.left = sc.bottom = -1500; sc.right = sc.top = 1500; sun.shadow.bias = -0.00025; sun.shadow.normalBias = 0.35;
  csm = new CSMShadowNode(sun, { cascades: Q.cascades, maxFar: 2600, mode: 'practical', lightMargin: 600 }); csm.fade = true; sun.shadow.shadowNode = csm; scene.add(sun); scene.add(sun.target);
  scene.fog = new THREE.Fog(0xbdd0e0, 1200, 36000);
  // ---- post-processing
  pipe = new THREE.RenderPipeline(renderer); const sp = pass(scene, camera);
  sp.setMRT(mrt({ output, diffuseColor, normal: packNormalToRGB(normalView), velocity }));
  const color = sp.getTextureNode('output'), depth = sp.getTextureNode('depth'), nrm = sp.getTextureNode('normal'), vel = sp.getTextureNode('velocity'), diff = sp.getTextureNode('diffuseColor');
  sp.getTexture('diffuseColor').type = THREE.UnsignedByteType; sp.getTexture('normal').type = THREE.UnsignedByteType;
  const sceneNormal = sample((uv) => unpackRGBToNormal(nrm.sample(uv)));
  let node = color;
  if (Q.gi === 'ssgi') { const g = ssgi(color, depth, sceneNormal, camera); g.sliceCount.value = +(qs.get('gis') || (soft ? 2 : 3)); g.stepCount.value = +(qs.get('gist') || (soft ? 8 : 14)); g.radius.value = +(qs.get('gir') || 9); g.giIntensity.value = +(qs.get('gii') || 5); ENV.gi = g;
    // only real surfaces receive occlusion and bounce light: the sky has no depth and must be left alone
    const surf = smoothstep(0.995, 0.9, sp.getLinearDepthNode()); const ao = mix(float(1), g.getAONode(), surf.mul(+(qs.get('aos') || 0.7)));
    node = vec4(add(color.rgb.mul(ao), diff.rgb.mul(g.getGINode().rgb).mul(surf)), color.a); }
  if (Q.bloom) { const b = bloom(node, 0.1, 0.5, 2.2); node = node.add(b); }
  if (Q.traa) node = traa(node, depth, vel, camera);
  pipe.outputNode = node; ENV.pipe = pipe; ENV.csm = csm; ENV.sun = sun;
}

/** h = local solar time (hours). Afternoon uses the day sky; from 17:30 the evening sky. The sun's height is the one in the photograph;
 *  its compass direction follows the time of day (azimuths are in the model frame: the bridge axis is 110.53 deg grid azimuth). */
export function setSunDir(h) {
  const key = h >= 17.5 || h < 7 ? 'eve' : 'day'; const S = sk[key];
  if (key !== cur) { cur = key; skyMesh.material.userData.tex.value = S.hi; envMesh.material.userData.tex.value = S.lo; }
  const el = Math.max(6.5, S.sunEl) * Math.PI / 180, az = (88 + (h - 6) / 14 * 184) * Math.PI / 180;
  const e = Math.sin(az), n = Math.cos(az); const x = e * 0.9365 + n * -0.3506, z = e * -0.3506 + n * -0.9365; const d = ENV.sunDir.set(x * Math.cos(el), Math.sin(el), z * Math.cos(el)).normalize();
  // turn the panorama so its sun sits at that azimuth
  const rot = (S.sunU - 0.5) * 2 * Math.PI - Math.atan2(d.z, d.x); skyMesh.rotation.y = rot; envMesh.rotation.y = rot;
  sun.position.copy(d).multiplyScalar(2500); sun.target.position.set(0, 0, 0); sun.target.updateMatrixWorld();
  const low = ENV.low = 1 - Math.min(1, Math.sin(el) / 0.5); ENV.sunColor.setHSL(0.095 - 0.035 * low, 0.25 + 0.6 * low, 0.93 - 0.18 * low); sun.color.copy(ENV.sunColor);
  sun.intensity = ENV.sunBase * (0.3 + 0.7 * Math.min(1, Math.sin(el) / 0.42)); A.renderer.toneMappingExposure = ENV.exposure * (1 + 0.45 * low);
  if (envRT) envRT.dispose(); envRT = pmrem.fromScene(envScene, 0.01); A.scene.environment = envRT.texture; A.scene.environmentIntensity = ENV.envInt;
  const hz = S.horizon; A.scene.fog.color.setRGB(hz[0] * ENV.skyGain * 1.25, hz[1] * ENV.skyGain * 1.25, hz[2] * ENV.skyGain * 1.25);
}

export function renderFrame() {
  const c = A.camera; const key = c.fov.toFixed(3) + '|' + c.aspect.toFixed(4); if (key !== lastProj && csm.camera) { lastProj = key; csm.updateFrustums(); }
  skyMesh.position.copy(c.position);
  pipe.render();
}
