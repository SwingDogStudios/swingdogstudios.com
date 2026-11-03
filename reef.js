// The two sides of the cove: a moonlit beach with palms that drops into a reef wall,
// covered in coral, sea fans and anemones, with anthias, clownfish and tangs.
// Built in a local frame where the wall faces -x (toward the middle) and the side
// group is mirrored for the left. Everything is procedural.
import * as THREE from './vendor/three.module.min.js';
import { SHADE } from './glsl.js';

// ---------- tiny seeded noise ----------
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
function noise3(seed) {
  const h = (x, y, z) => {
    const v = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453;
    return v - Math.floor(v);
  };
  const sm = t => t * t * (3 - 2 * t);
  const n = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = sm(x - xi), yf = sm(y - yi), zf = sm(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(h(xi, yi, zi), h(xi + 1, yi, zi), xf), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), xf), yf),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), xf), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), xf), yf),
      zf);
  };
  return (x, y, z, oct = 3) => {
    let a = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { a += amp * n(x * f, y * f, z * f); f *= 2.03; amp *= 0.5; }
    return a / (1 - Math.pow(0.5, oct)); // 0..1
  };
}

const Z1 = 9; // wall extent along z (front)

// cross-section from the island top, over the beach, down the wall into the deep
const PROFILE = [
  [44, 2.6], [16, 2.4], [8, 2.1], [4.2, 1.4], [1.6, 0.35], [-0.6, -0.5], [-2.2, -1.2], [-2.6, -2.2],
  [-1.2, -4.5], [-0.4, -10], [-1.4, -16], [-0.6, -22], [-0.2, -30], [0.2, -40], [1.2, -50],
  [4, -62], [12, -76], [18, -92], [26, -112],
];

export const WALL_VS = /* glsl */ `
  attribute vec3 aCol;
  varying vec3 vCol; varying vec3 vN; varying vec3 vWP;
  void main(){
    vCol = aCol;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWP = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const WALL_FS = /* glsl */ `
  ${SHADE}
  varying vec3 vCol; varying vec3 vN; varying vec3 vWP;
  float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
  void main(){
    vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
    vec3 alb = vCol;
    float wy = waterY(vWP);
    // wet sand darkens just above the water
    alb *= mix(1.0, 0.72, smoothstep(0.9, 0.1, vWP.y - wy) * step(wy, vWP.y + 0.9));
    // sand sparkle in the moonlight
    float sp = step(0.985, h21(floor(vWP.xz * 14.0))) * step(wy + 0.2, vWP.y) * step(0.7, n.y);
    // reef texture: polyp dots and ridges so the wall reads up close
    float reef = smoothstep(-2.0, -5.0, vWP.y);
    vec3 q = vWP * 3.2;
    float polyp = smoothstep(0.35, 0.85, sin(q.x + sin(q.y * 1.3)) * sin(q.y * 1.1 + sin(q.z)) * sin(q.z * 0.9 + q.x * 0.3) + 0.5);
    float ridge = smoothstep(0.6, 1.0, abs(sin(vWP.y * 2.3 + sin(vWP.z * 1.4) * 1.5 + vWP.x)));
    alb *= mix(1.0, 0.72 + 0.45 * polyp - 0.18 * ridge, reef);
    vec3 col = shade(alb, n, vWP, 0.13 * reef, 0.6);
    col += vec3(0.8, 0.85, 1.0) * sp * 0.6 * (0.5 + 0.5 * sin(uTime * 3.0 + vWP.x * 9.0));
    // foam where the sea meets the sand and rock
    float f = smoothstep(0.32, 0.0, abs(vWP.y - wy));
    f *= 0.55 + 0.45 * sin(vWP.z * 3.1 + uTime * 1.7) * sin(vWP.x * 2.3 - uTime);
    col += vec3(0.8, 0.9, 1.0) * f * 0.55;
    gl_FragColor = vec4(col, 1.0);
  }`;

// generic lit, instanced, vertex-colored object (coral heads, plates, sponges, palms)
export function litInstancedMaterial(U, { glow = 0.06, pattern = 0, sway = 0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uCamPos: U.uCamPos, uPattern: { value: pattern }, uGlow: { value: glow }, uSway: { value: sway } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uSway;
      varying vec3 vN; varying vec3 vWP; varying vec3 vL; varying vec3 vC;
      void main(){
        vec3 p = position; vL = position;
        vec4 o = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        float k = max(position.y, 0.0);
        wp.xz += vec2(sin(uTime * 1.1 + o.x * 2.1 + o.y), cos(uTime * 0.9 + o.z * 1.7)) * uSway * k * k;
        vWP = wp.xyz;
        vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vC = instanceColor;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      ${SHADE}
      uniform float uPattern; uniform float uGlow;
      varying vec3 vN; varying vec3 vWP; varying vec3 vL; varying vec3 vC;
      void main(){
        vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 alb = vC;
        if (uPattern < 0.5) {          // brain coral grooves
          float g = sin(vL.x * 11.0 + sin(vL.y * 9.0) * 1.8 + vL.z * 7.0);
          alb *= 0.72 + 0.28 * smoothstep(-0.3, 0.6, g);
        } else if (uPattern < 1.5) {   // plate coral rings
          alb *= 0.75 + 0.25 * sin(length(vL.xz) * 26.0);
        } else if (uPattern < 2.5) {   // tube sponge: darker inside
          alb *= gl_FrontFacing ? 1.0 : 0.35;
          alb *= 0.85 + 0.15 * sin(vL.y * 30.0);
        } else if (uPattern < 3.5) {   // palm trunk rings
          alb *= 0.7 + 0.3 * smoothstep(-0.2, 0.8, sin(vL.y * 22.0));
        }
        gl_FragColor = vec4(shade(alb, n, vWP, uGlow, 1.0), 1.0);
      }`,
  });
}

// ---------- fish ----------
export function fishGeometry(tall = false) {
  const body = new THREE.SphereGeometry(1, 14, 10).toNonIndexed();
  body.scale(1, tall ? 0.72 : 0.42, tall ? 0.16 : 0.2);
  const b = Array.from(body.attributes.position.array);
  const fins = tall
    ? [ // tail, dorsal, anal
        -0.85, 0, 0, -1.5, 0.5, 0, -1.5, -0.5, 0,
        0.4, 0.6, 0, -0.75, 0.45, 0, -0.2, 0.95, 0,
        0.2, -0.6, 0, -0.75, -0.45, 0, -0.25, -0.9, 0]
    : [
        -0.85, 0, 0, -1.55, 0.36, 0, -1.55, -0.36, 0,
        0.35, 0.36, 0, -0.55, 0.3, 0, -0.1, 0.62, 0];
  const pos = new Float32Array(b.concat(fins));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export function fishMaterial(U) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uCamPos: U.uCamPos },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uTime;
      attribute float aPhase; attribute float aPattern;
      varying vec3 vN; varying vec3 vWP; varying vec3 vL; varying vec3 vC; varying float vPat;
      void main(){
        vec3 p = position; vL = position; vC = instanceColor; vPat = aPattern;
        float sw = sin(uTime * (7.0 + aPhase * 3.0) + aPhase * 20.0 - p.x * 2.4);
        p.z += sw * 0.2 * smoothstep(0.7, -1.6, p.x);
        vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
        vWP = wp.xyz;
        vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      ${SHADE}
      varying vec3 vN; varying vec3 vWP; varying vec3 vL; varying vec3 vC; varying float vPat;
      void main(){
        vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 alb = vC;
        alb = mix(alb, min(alb * 1.35 + 0.12, vec3(1.0)), smoothstep(0.05, -0.3, vL.y));   // pale belly
        if (vPat > 0.5 && vPat < 1.5) {          // clownfish bands
          float b = min(min(abs(vL.x - 0.42), abs(vL.x + 0.22)), abs(vL.x + 0.92));
          alb = mix(alb, vec3(0.03), smoothstep(0.17, 0.14, b));
          alb = mix(alb, vec3(0.97), smoothstep(0.13, 0.1, b));
        } else if (vPat > 1.5) {                 // tang: yellow tail spot / blue: dark sweep
          alb = mix(alb, vec3(0.06, 0.05, 0.2), smoothstep(0.2, 0.5, vL.y) * step(vL.x, 0.2) * step(-0.85, vL.x) * (vPat > 2.5 ? 1.0 : 0.0));
          alb = mix(alb, vec3(1.0, 0.85, 0.1), step(vL.x, -0.9) * (vPat > 2.5 ? 1.0 : 0.0));
        }
        float e = length(vec2(vL.x - 0.62, vL.y - 0.08));
        if (abs(vL.z) > 0.05 && e < 0.11) alb = mix(vec3(0.01), vec3(1.0), smoothstep(0.035, 0.0, length(vec2(vL.x - 0.6, vL.y - 0.11))));
        gl_FragColor = vec4(shade(alb, n, vWP, 0.16, 1.0), 1.0);
      }`,
  });
}

// ---------- the side ----------
export function buildSide(U, seed, small) {
  const Z0 = small ? -16 : -36; // phones see less depth, so keep the walls short
  const R = rng(seed * 7919 + 13);
  const rand = (a, b) => a + R() * (b - a);
  const nz = noise3(seed);
  const group = new THREE.Group();
  const updaters = [];

  // profile resampled
  const curve = new THREE.CatmullRomCurve3(PROFILE.map(([x, y]) => new THREE.Vector3(x, y, 0)), false, 'centripetal');
  const NP = small ? 120 : 170, NZ = small ? 44 : 64;
  const prof = curve.getSpacedPoints(NP - 1);
  const pos = new Float32Array(NP * (NZ + 1) * 3), col = new Float32Array(NP * (NZ + 1) * 3), nrm = new Float32Array(NP * (NZ + 1) * 3);
  const spots = []; // candidate placement points: {p, n, y}
  const c = new THREE.Color();
  const palette = [
    [0.62, 0.26, 0.66], [0.95, 0.46, 0.25], [0.95, 0.42, 0.6], [0.28, 0.66, 0.55], [0.9, 0.78, 0.32], [0.45, 0.4, 0.85],
  ];
  for (let i = 0; i < NP; i++) {
    const a = prof[Math.max(0, i - 1)], b = prof[Math.min(NP - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const nx = ty, ny = -tx; // open-side normal
    for (let j = 0; j <= NZ; j++) {
      const z = Z0 + (Z1 - Z0) * (j / NZ);
      const p = prof[i];
      const y0 = p.y;
      const coast = (nz(z * 0.05, 3.3, 7.1, 2) - 0.5) * (small ? 2.5 : 7.0);  // the coastline wanders in and out
      const wall = y0 < -1.5 ? 1 : 0;
      const amp = y0 > 0.4 ? 0.35 : (y0 > -2 ? 0.25 : 1.6 * Math.min(1, (-y0 - 1.5) / 4));
      let d = (nz(p.x * 0.18, y0 * 0.18, z * 0.18, 4) - 0.5) * 2 * amp;
      d += wall * Math.pow(nz(p.x * 0.6 + 9, y0 * 0.6, z * 0.6, 2), 3) * 1.4; // coral heads
      const x = p.x + nx * d + coast;
      const y = y0 + ny * d;
      const k = (i * (NZ + 1) + j) * 3;
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      nrm[k] = nx; nrm[k + 1] = ny; nrm[k + 2] = 0;
      // color
      const pn = nz(x * 0.22 + 40, y * 0.22, z * 0.22, 3);
      if (y0 > 1.9 && p.x > 7) {                  // island top: dark scrub
        c.setRGB(0.1, 0.13, 0.1).lerp(new THREE.Color(0.18, 0.2, 0.12), pn);
      } else if (y0 > -2.4) {                     // sand
        c.setRGB(0.93, 0.84, 0.66).multiplyScalar(0.85 + pn * 0.25);
      } else {
        const rock = new THREE.Color(0.5, 0.44, 0.46).multiplyScalar(0.75 + pn * 0.5);
        const pick = palette[Math.floor(nz(x * 0.12 + 3, y * 0.12, z * 0.12, 2) * 5.99)];
        const coral = new THREE.Color(pick[0], pick[1], pick[2]);
        const cover = Math.max(0, Math.min(1, (pn - 0.36) * 4)) * Math.max(0.25, Math.min(1, (y0 + 62) / 30));
        c.copy(rock).lerp(coral, cover);
        const deep = Math.max(0, Math.min(1, (-y0 - 45) / 35));
        c.lerp(new THREE.Color(0.25, 0.24, 0.26), deep);
      }
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
      if (i % 2 === 0 && j % 2 === 0 && z > Math.max(Z0 + 4, -24) && z < 5) spots.push({ p: new THREE.Vector3(x, y, z), n: new THREE.Vector3(nx, ny, 0), y: y0 });
    }
  }
  const idx = [];
  for (let i = 0; i < NP - 1; i++) for (let j = 0; j < NZ; j++) {
    const a = i * (NZ + 1) + j, b = a + 1, c2 = a + NZ + 1, d2 = c2 + 1;
    idx.push(a, c2, b, b, c2, d2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // keep the computed normals pointing to the open side
  const cn = geo.attributes.normal.array;
  for (let k = 0; k < cn.length; k += 3) {
    if (cn[k] * nrm[k] + cn[k + 1] * nrm[k + 1] < 0) { cn[k] *= -1; cn[k + 1] *= -1; cn[k + 2] *= -1; }
  }
  const wall = new THREE.Mesh(geo, new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uCamPos: U.uCamPos }, vertexShader: WALL_VS, fragmentShader: WALL_FS, side: THREE.DoubleSide,
  }));
  wall.frustumCulled = false;
  group.add(wall);

  const pick = (ymin, ymax, minOut = 0.3) => {
    for (let tries = 0; tries < 200; tries++) {
      const s = spots[Math.floor(R() * spots.length)];
      if (s.y < ymax && s.y > ymin && -s.n.x + s.n.y > minOut) return s;
    }
    return spots[Math.floor(R() * spots.length)];
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3();
  const place = (mesh, i, s, scale, tiltUp = 0.6, spin = true, sink = 0.15) => {
    const dir = s.n.clone().lerp(up, tiltUp).normalize();
    q.setFromUnitVectors(up, dir);
    if (spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(up, R() * 6.28));
    m4.compose(s.p.clone().addScaledVector(s.n, -sink), q, sc.set(scale[0], scale[1], scale[2]));
    mesh.setMatrixAt(i, m4);
  };
  const S = small ? 0.6 : 1;

  // coral heads
  {
    const n = Math.round(70 * S);
    const g = new THREE.IcosahedronGeometry(1, 2);
    const mesh = new THREE.InstancedMesh(g, litInstancedMaterial(U, { glow: 0.1, pattern: 0 }), n);
    for (let i = 0; i < n; i++) {
      const s = pick(-46, -3);
      const r = rand(0.5, 1.4);
      place(mesh, i, s, [r, r * rand(0.55, 0.8), r], 0.6, true, r * 0.45);
      const p = palette[Math.floor(R() * palette.length)];
      mesh.setColorAt(i, c.setRGB(p[0], p[1], p[2]).multiplyScalar(rand(0.75, 1.05)));
    }
    mesh.frustumCulled = false; group.add(mesh);
  }
  // plate corals jutting from the wall
  {
    const n = Math.round(22 * S);
    const g = new THREE.CylinderGeometry(1, 0.85, 0.12, 18);
    const mesh = new THREE.InstancedMesh(g, litInstancedMaterial(U, { glow: 0.08, pattern: 1 }), n);
    for (let i = 0; i < n; i++) {
      const s = pick(-40, -8);
      const r = rand(0.9, 2.0);
      m4.compose(s.p.clone().add(new THREE.Vector3(-r * 0.6, 0, 0)), q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rand(-0.25, 0.1)), sc.set(r, 1, r * 0.8));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, c.setRGB(...[[0.55, 0.62, 0.4], [0.75, 0.55, 0.35], [0.5, 0.45, 0.7]][i % 3]));
    }
    mesh.frustumCulled = false; group.add(mesh);
  }
  // tube sponges
  {
    const clusters = Math.round(9 * S), per = 4, n = clusters * per;
    const g = new THREE.CylinderGeometry(0.2, 0.26, 1, 9, 1, true); g.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(g, litInstancedMaterial(U, { glow: 0.12, pattern: 2, sway: 0.02 }), n);
    let k = 0;
    for (let i = 0; i < clusters; i++) {
      const s = pick(-42, -6);
      const tint = [[0.6, 0.3, 0.85], [0.95, 0.75, 0.2], [0.95, 0.45, 0.3]][i % 3];
      for (let j = 0; j < per; j++) {
        const off = new THREE.Vector3(rand(-0.4, 0.4), 0, rand(-0.4, 0.4));
        const h = rand(0.8, 1.8);
        const dir = s.n.clone().lerp(up, 0.75).add(new THREE.Vector3(rand(-0.2, 0.2), 0, rand(-0.2, 0.2))).normalize();
        q.setFromUnitVectors(up, dir);
        m4.compose(s.p.clone().add(off), q, sc.set(1, h, 1));
        mesh.setMatrixAt(k, m4);
        mesh.setColorAt(k++, c.setRGB(tint[0], tint[1], tint[2]));
      }
    }
    mesh.frustumCulled = false; group.add(mesh);
  }

  // sea fans: a procedural lattice on a quad
  {
    const n = Math.round(16 * S);
    const g = new THREE.PlaneGeometry(1, 1, 4, 6); g.translate(0, 0.5, 0);
    const seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) seeds[i] = R() * 10;
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uCamPos: U.uCamPos },
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform float uTime; attribute float aSeed;
        varying vec2 vUv; varying vec3 vWP; varying vec3 vN; varying vec3 vC; varying float vS;
        void main(){
          vUv = uv; vS = aSeed; vC = instanceColor;
          vec3 p = position;
          p.z += sin(uTime * 0.9 + aSeed) * 0.12 * uv.y * uv.y;
          vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.0);
          vWP = wp.xyz; vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        ${SHADE}
        varying vec2 vUv; varying vec3 vWP; varying vec3 vN; varying vec3 vC; varying float vS;
        void main(){
          vec2 q = (vUv - vec2(0.5, 0.0)) * vec2(2.1, 1.0);
          float r = length(q); float a = atan(q.x, q.y);
          float edge = 0.95 - 0.12 * sin(a * 3.0 + vS) - 0.05 * sin(a * 7.0 + vS * 2.0);
          if (r > edge || abs(a) > 1.3) discard;
          float br = abs(sin(a * 16.0 + sin(r * 7.0 + vS) * 0.7));
          float net = abs(sin(r * 34.0 + a * 5.0));
          float stem = smoothstep(0.07, 0.0, abs(q.x)) * step(r, 0.35);
          float m = max(max(smoothstep(0.16, 0.0, br), smoothstep(0.14, 0.0, net) * 0.8), stem);
          if (m < 0.35) discard;
          vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
          gl_FragColor = vec4(shade(vC * (0.8 + 0.2 * r), n, vWP, 0.2, 1.0), 1.0);
        }`,
    });
    const mesh = new THREE.InstancedMesh(g, mat, n);
    const fanCols = [[0.9, 0.2, 0.28], [0.7, 0.32, 0.88], [0.98, 0.55, 0.2], [0.95, 0.8, 0.25]];
    for (let i = 0; i < n; i++) {
      const s = pick(-38, -5);
      const h = rand(2.6, 5.0);
      // face the camera (+z), lean out from the wall
      q.setFromEuler(new THREE.Euler(rand(-0.25, 0.05), rand(-0.5, 0.5), rand(0.15, 0.55)));
      m4.compose(s.p.clone().add(new THREE.Vector3(-0.2, 0, 0)), q, sc.set(h * rand(0.9, 1.2), h, 1));
      mesh.setMatrixAt(i, m4);
      const fc = fanCols[i % fanCols.length];
      mesh.setColorAt(i, c.setRGB(fc[0], fc[1], fc[2]));
    }
    mesh.frustumCulled = false; group.add(mesh);
  }

  // anemones with swaying, glowing-tipped tentacles
  const anemones = [];
  {
    const count = small ? 3 : 5, per = 46, n = count * per;
    const g = new THREE.CylinderGeometry(0.045, 0.075, 1, 6, 5); g.translate(0, 0.5, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: U.uTime, uCamPos: U.uCamPos },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vN; varying vec3 vWP; varying float vY; varying vec3 vC;
        void main(){
          vY = position.y; vC = instanceColor;
          vec4 o = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          float k = position.y * position.y;
          wp.x += sin(uTime * 1.4 + o.y * 2.0 + o.z * 3.0) * 0.28 * k;
          wp.z += cos(uTime * 1.1 + o.x * 2.0) * 0.22 * k;
          wp.y += (position.y > 0.97 ? 0.05 : 0.0);
          vWP = wp.xyz; vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        ${SHADE}
        varying vec3 vN; varying vec3 vWP; varying float vY; varying vec3 vC;
        void main(){
          vec3 n = normalize(vN);
          vec3 alb = mix(vC * 0.7, vC * 1.25 + 0.15, smoothstep(0.55, 1.0, vY));
          float tip = smoothstep(0.82, 1.0, vY);
          gl_FragColor = vec4(shade(alb, n, vWP, 0.25 + tip * 0.6, 0.85), 1.0);
        }`,
    });
    const mesh = new THREE.InstancedMesh(g, mat, n);
    const aCols = [[0.95, 0.4, 0.75], [0.55, 0.9, 0.55], [0.75, 0.5, 0.95], [0.95, 0.65, 0.4]];
    let k = 0;
    for (let a = 0; a < count; a++) {
      const s = pick(-11, -1.4, 0.5);
      const center = s.p.clone().addScaledVector(s.n, 0.1);
      const nrmA = s.n.clone().lerp(up, 0.6).normalize();
      anemones.push({ c: center.clone().addScaledVector(nrmA, 0.9), n: nrmA });
      const ac = aCols[a % aCols.length];
      for (let j = 0; j < per; j++) {
        const ang = R() * Math.PI * 2, rr = Math.sqrt(R()) * 0.55;
        const tq = new THREE.Quaternion().setFromUnitVectors(up, nrmA);
        const off = new THREE.Vector3(Math.cos(ang) * rr, 0, Math.sin(ang) * rr).applyQuaternion(tq);
        const dir = nrmA.clone().add(off.clone().multiplyScalar(1.6)).normalize();
        q.setFromUnitVectors(up, dir);
        m4.compose(center.clone().add(off), q, sc.set(1, rand(0.7, 1.15), 1));
        mesh.setMatrixAt(k, m4);
        mesh.setColorAt(k++, c.setRGB(ac[0], ac[1], ac[2]).multiplyScalar(rand(0.85, 1.1)));
      }
    }
    mesh.frustumCulled = false; group.add(mesh);
  }

  // palms on the island
  {
    const palms = small ? 1 : 2;
    for (let i = 0; i < palms; i++) {
      const base = new THREE.Vector3(rand(5.5, 9), 2.0, rand(-14, 2));
      // find the ground height near the base
      let best = null, bd = 1e9;
      for (const s of spots) { const d = Math.hypot(s.p.x - base.x, s.p.z - base.z); if (s.y > 1 && d < bd) { bd = d; best = s; } }
      if (best) base.y = best.p.y - 0.1;
      const h = rand(6, 9), lean = rand(1.5, 3.2);
      const pts = [];
      for (let t = 0; t <= 1.0001; t += 0.1) pts.push(new THREE.Vector3(base.x - lean * t * t, base.y + h * t, base.z + Math.sin(t * 2) * 0.3));
      const trunk = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.2, 7), null);
      const crown = pts[pts.length - 1];
      // fronds as one geometry, with a "distance from crown" attribute for sway
      const fp = [], fd = [], fi = [];
      const leaves = 9;
      for (let l = 0; l < leaves; l++) {
        const ang = (l / leaves) * Math.PI * 2 + R() * 0.3;
        const L = rand(3.2, 4.4), droop = rand(0.18, 0.3), rise = rand(0.4, 0.9);
        const start = fp.length / 3;
        const segs = 10;
        for (let s = 0; s <= segs; s++) {
          const t = s / segs, x = t * L;
          const w = 0.55 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.6) + 0.02;
          const y = rise * x - droop * x * x;
          for (const side of [-1, 1]) {
            const lx = x, lz = side * w;
            const ry = y - Math.abs(lz) * 0.35;
            fp.push(crown.x + Math.cos(ang) * lx - Math.sin(ang) * lz, crown.y + ry, crown.z + Math.sin(ang) * lx + Math.cos(ang) * lz);
            fd.push(t);
          }
          if (s < segs) { const a0 = start + s * 2; fi.push(a0, a0 + 1, a0 + 2, a0 + 1, a0 + 3, a0 + 2); }
        }
      }
      const fg = new THREE.BufferGeometry();
      fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
      fg.setAttribute('aD', new THREE.Float32BufferAttribute(fd, 1));
      fg.setIndex(fi); fg.computeVertexNormals();
      const palmMat = (alb, isLeaf) => new THREE.ShaderMaterial({
        uniforms: { uTime: U.uTime, uCamPos: U.uCamPos, uAlb: { value: new THREE.Color(...alb) }, uCrown: { value: crown } },
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          uniform float uTime; uniform vec3 uCrown;
          ${isLeaf ? 'attribute float aD;' : ''}
          varying vec3 vN; varying vec3 vWP; varying float vD;
          void main(){
            vec3 p = position;
            float d = ${isLeaf ? 'aD' : '0.0'}; vD = d;
            float sway = sin(uTime * 1.3 + uCrown.z) * 0.12 + sin(uTime * 2.7 + p.x) * 0.04;
            p.y += sway * d * d * 3.0;
            p.x += sway * d * 1.2;
            ${isLeaf ? '' : 'float tt = clamp((p.y - uCrown.y + 9.0) / 9.0, 0.0, 1.0); p.x += sin(uTime * 1.3 + uCrown.z) * 0.12 * tt * tt;'}
            vec4 wp = modelMatrix * vec4(p, 1.0);
            vWP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }`,
        fragmentShader: /* glsl */ `
          ${SHADE}
          uniform vec3 uAlb;
          varying vec3 vN; varying vec3 vWP; varying float vD;
          void main(){
            vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
            vec3 alb = uAlb ${isLeaf ? '* (0.8 + 0.3 * vD) * (0.85 + 0.15 * sin(vD * 60.0))' : '* (0.75 + 0.25 * sin(vWP.y * 9.0))'};
            gl_FragColor = vec4(shade(alb, n, vWP, 0.0, 1.0), 1.0);
          }`,
      });
      trunk.material = palmMat([0.42, 0.32, 0.24], false);
      const fronds = new THREE.Mesh(fg, palmMat([0.16, 0.36, 0.2], true));
      trunk.frustumCulled = fronds.frustumCulled = false;
      group.add(trunk, fronds);
    }
  }

  // ---------- fish ----------
  const fish = [];
  const slim = fishGeometry(false), tall = fishGeometry(true);
  function school(geo, list) {
    const n = list.length;
    const phase = new Float32Array(n), pat = new Float32Array(n);
    list.forEach((f, i) => { phase[i] = R(); pat[i] = f.pattern; });
    const g = geo.clone();
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    g.setAttribute('aPattern', new THREE.InstancedBufferAttribute(pat, 1));
    const mesh = new THREE.InstancedMesh(g, fishMaterial(U), n);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    list.forEach((f, i) => mesh.setColorAt(i, f.color));
    mesh.frustumCulled = false;
    group.add(mesh);
    fish.push({ mesh, list });
  }
  // anthias: clouds of orange, pink and purple hovering off the upper wall
  {
    const list = [];
    const schools = small ? 2 : 3, per = small ? 16 : 26;
    const ac = [new THREE.Color(1.0, 0.48, 0.25), new THREE.Color(0.98, 0.38, 0.62), new THREE.Color(0.66, 0.38, 0.95)];
    for (let s = 0; s < schools; s++) {
      const home = pick(-24, -4).p.clone().add(new THREE.Vector3(rand(-4.5, -2.2), rand(0, 1.5), 0));
      for (let i = 0; i < per; i++) list.push({
        kind: 'hover', home, off: new THREE.Vector3(rand(-2.2, 1.2), rand(-1.4, 1.4), rand(-2.2, 2.2)),
        sp: rand(0.5, 1.1), ph: R() * 6.28, r: rand(0.4, 1.0), size: rand(0.26, 0.36), pattern: 0,
        color: ac[Math.floor(R() * 3)].clone().multiplyScalar(rand(0.9, 1.1)),
      });
    }
    school(slim, list);
  }
  // clownfish, a pair per anemone
  {
    const list = [];
    anemones.forEach(a => { for (let i = 0; i < 2; i++) list.push({
      kind: 'orbit', home: a.c, n: a.n, sp: rand(0.6, 0.9) * (i ? -1 : 1), ph: R() * 6.28, r: rand(0.6, 0.95), size: rand(0.24, 0.3), pattern: 1,
      color: new THREE.Color(1.0, 0.42, 0.06),
    }); });
    school(slim, list);
  }
  // tangs cruising along the wall
  {
    const list = [];
    const n = small ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const yellow = i % 2 === 0;
      list.push({
        kind: 'cruise', home: pick(-30, -5).p.clone().add(new THREE.Vector3(rand(-3, -1.5), 0, 0)), sp: rand(0.12, 0.22), ph: R() * 6.28,
        r: rand(5, 9), size: rand(0.45, 0.6), pattern: yellow ? 2 : 3,
        color: yellow ? new THREE.Color(1.0, 0.86, 0.12) : new THREE.Color(0.12, 0.36, 1.0),
      });
    }
    school(tall, list);
  }

  const dummy = new THREE.Object3D(), tmp = new THREE.Vector3(), vel = new THREE.Vector3();
  function update(t) {
    for (const { mesh, list } of fish) {
      list.forEach((f, i) => {
        if (f.kind === 'hover') {
          const a = t * f.sp + f.ph;
          tmp.set(Math.sin(a) * f.r, Math.sin(a * 0.7 + f.ph) * 0.35, Math.cos(a) * f.r * 0.8).add(f.off).add(f.home);
          vel.set(Math.cos(a) * f.r, Math.cos(a * 0.7 + f.ph) * 0.25, -Math.sin(a) * f.r * 0.8);
        } else if (f.kind === 'orbit') {
          const a = t * f.sp + f.ph;
          tmp.set(Math.cos(a) * f.r * 0.8, Math.sin(a * 2.0) * 0.15, Math.sin(a) * f.r).add(f.home);
          vel.set(-Math.sin(a) * f.sp, Math.cos(a * 2.0) * 0.3 * f.sp, Math.cos(a) * f.sp);
        } else {
          const a = t * f.sp + f.ph;
          tmp.set(Math.sin(a * 0.5) * 0.8, Math.sin(a * 1.3) * 0.6, Math.sin(a) * f.r).add(f.home);
          vel.set(Math.cos(a * 0.5) * 0.4, Math.cos(a * 1.3) * 0.8, Math.cos(a) * f.r);
        }
        dummy.position.copy(tmp);
        dummy.rotation.set(0, Math.atan2(-vel.z, vel.x), Math.atan2(vel.y, Math.hypot(vel.x, vel.z)) * 0.6, 'YZX');
        dummy.scale.setScalar(f.size);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  updaters.push(update);
  return { group, update: t => updaters.forEach(u => u(t)) };
}
