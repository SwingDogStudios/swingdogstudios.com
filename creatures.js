// Glowing sea creatures in the same soft, see-through style as the jellyfish.
// Every model faces +x. Each builder returns { root, update(t, spread) }.
import * as THREE from './vendor/three.module.min.js';

// ---------- materials ----------
const GHOST_VS = /* glsl */ `
  varying vec3 vN; varying vec3 vV; varying vec3 vL;
  void main(){
    #ifdef USE_INSTANCING
      mat4 m = modelMatrix * instanceMatrix;
    #else
      mat4 m = modelMatrix;
    #endif
    vL = position;
    vec4 wp = m * vec4(position, 1.0);
    vN = normalize(mat3(m) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const GHOST_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uAlpha, uBase, uPow, uFade, uLines, uTime;
  varying vec3 vN; varying vec3 vV; varying vec3 vL;
  void main(){
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPow);
    float a = f * uAlpha + uBase;
    if (uLines > 0.5) {               // shell plates / throat grooves
      float l = smoothstep(0.86, 1.0, abs(sin(vL.x * 7.0 + sin(vL.z * 6.0) * 0.8))) + smoothstep(0.9, 1.0, abs(sin(vL.z * 8.0)));
      a += l * 0.25 * uAlpha;
    }
    gl_FragColor = vec4(uColor * (0.55 + f), a * uFade);
  }`;

export function ghost(U, color, { alpha = 0.9, base = 0.05, pow = 2.0, lines = 0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.uTime, uColor: { value: new THREE.Color(...color) }, uAlpha: { value: alpha }, uBase: { value: base },
      uPow: { value: pow }, uFade: { value: 1 }, uLines: { value: lines },
    },
    vertexShader: GHOST_VS, fragmentShader: GHOST_FS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  });
}

function glowSprite(U, color, size) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const p = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: { uPR: U.uPR, uScale: U.uScale, uTime: U.uTime, uColor: { value: new THREE.Color(...color) }, uSize: { value: size }, uFade: { value: 1 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uPR, uScale, uSize, uTime; varying float vP;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vP = 0.8 + 0.2 * sin(uTime * 2.3);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uScale * uPR / -mv.z;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uFade; varying float vP;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * 6.0) * 0.8 + exp(-d * d * 70.0);
        gl_FragColor = vec4(uColor * vP, a * vP * uFade);
      }`,
  }));
  p.frustumCulled = false;
  return p;
}

const ellipsoid = (sx, sy, sz, w = 24, h = 16) => { const g = new THREE.SphereGeometry(1, w, h); g.scale(sx, sy, sz); return g; };
const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.frustumCulled = false; return o; };

// a creature that glides across the view and wraps around, fading at the edges
function cruise(root, mats, { y, z, speed, span = 90, offset = 0, dir = 1, bob = 0.6 }) {
  return (t, spread, extra) => {
    const u = ((t * speed + offset) % span + span) % span;      // 0..span
    const x = (u - span / 2) * dir;
    const fade = Math.min(1, Math.min(u, span - u) / 12);
    mats.forEach(m => { m.uniforms.uFade.value = fade; });
    root.position.set(x * Math.max(0.6, spread), y + Math.sin(t * 0.4 + offset) * bob, z);
    root.rotation.y = dir > 0 ? 0 : Math.PI;
    if (extra) extra(t);
  };
}

// ---------- manta ray: a flat, flapping outline ----------
export function makeManta(U, opts) {
  const g = new THREE.PlaneGeometry(7, 5, 28, 12);
  g.rotateX(-Math.PI / 2); g.rotateY(-Math.PI / 2); // span along z, nose at +x
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uFade: { value: 1 }, uColor: { value: new THREE.Color(0.7, 0.95, 1.0) } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 p = position;
        float s = p.z / 3.5;
        p.y += sin(uTime * 1.3 - abs(s) * 1.6) * 0.9 * s * s;
        p.x -= abs(s) * abs(s) * 0.2 * sin(uTime * 1.3);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uFade, uTime; varying vec2 vUv;
      void main(){
        float s = vUv.x * 2.0 - 1.0, l = vUv.y * 2.0 - 1.0;
        float front = 0.5 - 0.95 * s * s;
        float back = -0.08 - 0.55 * abs(s) + 0.45 * s * s;
        float inside = min(l - back, front - l);
        float head = 0.62 - l; float lobes = step(abs(abs(s) - 0.12), 0.05) * step(0.45, l) * step(l, 0.66);
        float tail = step(abs(s), 0.012) * step(l, -0.05) * step(-0.98, l);
        if (inside < 0.0 && lobes < 0.5 && tail < 0.5) discard;
        float edge = exp(-max(inside, 0.0) * 28.0);
        float spots = smoothstep(0.75, 1.0, sin(s * 18.0) * sin(l * 14.0)) * step(0.0, inside);
        float a = 0.1 + edge * 0.85 + spots * 0.25 + (lobes + tail) * 0.7;
        gl_FragColor = vec4(uColor, a * uFade);
      }`,
  });
  const root = new THREE.Group();
  root.add(mesh(g, mat));
  const up = cruise(root, [mat], opts);
  return { root, update: (t, sp) => up(t, sp, () => { root.rotation.z = Math.sin(t * 0.4) * 0.08; root.rotation.x = 1.05 + Math.sin(t * 0.3) * 0.12; }) };
}

// ---------- sea turtle ----------
export function makeTurtle(U, opts) {
  const root = new THREE.Group();
  const shellM = ghost(U, [0.45, 1.0, 0.75], { alpha: 0.9, base: 0.06, lines: 1 });
  const skinM = ghost(U, [0.55, 1.0, 0.85], { alpha: 0.8, base: 0.05 });
  root.add(mesh(ellipsoid(1.1, 0.36, 0.85), shellM));
  const head = mesh(ellipsoid(0.34, 0.24, 0.26, 14, 10), skinM); head.position.set(1.3, 0.04, 0); root.add(head);
  const flippers = [];
  for (const [x, z, sx, sz, front] of [[0.45, 0.7, 0.32, 1.0, 1], [0.45, -0.7, 0.32, 1.0, 1], [-0.8, 0.5, 0.22, 0.4, 0], [-0.8, -0.5, 0.22, 0.4, 0]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, 0, z);
    const f = mesh(ellipsoid(sx, 0.05, sz, 14, 8), skinM);
    f.position.set(-sx * 0.6, 0, Math.sign(z) * sz * 0.85); f.rotation.y = Math.sign(z) * 0.5;
    pivot.add(f); root.add(pivot); flippers.push({ pivot, z, front });
  }
  root.scale.setScalar(1.5);
  const up = cruise(root, [shellM, skinM], opts);
  return {
    root,
    update: (t, sp) => up(t, sp, () => {
      flippers.forEach(({ pivot, z, front }) => { pivot.rotation.x = Math.sign(z) * Math.sin(t * 1.4 + (front ? 0 : 1.2)) * (front ? 0.6 : 0.3); });
      head.rotation.z = Math.sin(t * 0.7) * 0.1;
      root.rotation.z = Math.sin(t * 1.4) * 0.04;
    }),
  };
}

// ---------- humpback whale, far off and huge ----------
export function makeWhale(U, opts) {
  const root = new THREE.Group();
  const m = ghost(U, [0.55, 0.72, 1.0], { alpha: 0.55, base: 0.025, pow: 2.4, lines: 1 });
  const g = new THREE.SphereGeometry(1, 40, 18);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const taper = x < 0 ? Math.max(0.12, 1 + x * 0.88) : 1 - x * x * 0.25;
    y *= taper * 1.1; z *= taper * 1.15;
    if (y < 0 && x > 0) y *= 1.15; // round throat
    p.setXYZ(i, x * 7, y, z);
  }
  g.computeVertexNormals();
  root.add(mesh(g, m));
  for (const s of [-1, 1]) {
    const fin = mesh(ellipsoid(0.5, 0.06, 2.6, 16, 8), m);
    fin.position.set(2.6, -0.5, s * 2.4); fin.rotation.set(s * 0.35, s * 0.55, 0);
    root.add(fin);
  }
  const fluke = new THREE.Group(); fluke.position.set(-6.8, 0, 0);
  for (const s of [-1, 1]) {
    const lobe = mesh(ellipsoid(0.75, 0.05, 1.5, 16, 8), m);
    lobe.position.set(-0.5, 0, s * 1.3); lobe.rotation.y = s * -0.5;
    fluke.add(lobe);
  }
  root.add(fluke);
  root.scale.setScalar(1.7);
  const up = cruise(root, [m], { ...opts, bob: 1.2 });
  return { root, update: (t, sp) => up(t, sp, () => { fluke.rotation.z = Math.sin(t * 0.55) * 0.35; root.rotation.z = Math.sin(t * 0.55 - 1) * 0.04; }) };
}

// ---------- bait ball: a swirling school of tiny glowing fish ----------
export function makeSchool(U, { count = 70, center, color = [1.0, 0.85, 0.5] }) {
  const body = new THREE.SphereGeometry(1, 10, 6).toNonIndexed();
  body.scale(1, 0.32, 0.16);
  const a = Array.from(body.attributes.position.array).concat([-0.85, 0, 0, -1.45, 0.32, 0, -1.45, -0.32, 0]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
  g.computeVertexNormals();
  const mat = ghost(U, color, { alpha: 0.9, base: 0.12, pow: 1.5 });
  const inst = new THREE.InstancedMesh(g, mat, count);
  inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  inst.frustumCulled = false;
  const fish = Array.from({ length: count }, () => ({
    r: 1.8 + Math.random() * 2.8, sp: (0.5 + Math.random() * 0.5) * (Math.random() < 0.85 ? 1 : -1),
    ph: Math.random() * 6.28, tilt: (Math.random() - 0.5) * 0.9, h: (Math.random() - 0.5) * 2.6, s: 0.32 + Math.random() * 0.14,
  }));
  const root = new THREE.Group(); root.add(inst);
  const d = new THREE.Object3D();
  return {
    root,
    update(t, spread) {
      root.position.set(center.x * spread + Math.sin(t * 0.11) * 3, center.y + Math.sin(t * 0.23) * 1.2, center.z);
      fish.forEach((f, i) => {
        const ang = t * f.sp + f.ph;
        const x = Math.cos(ang) * f.r, z = Math.sin(ang) * f.r;
        const y = f.h + z * f.tilt * 0.4 + Math.sin(ang * 2 + f.ph) * 0.2;
        d.position.set(x, y, z);
        // face along the orbit tangent
        const vx = -Math.sin(ang) * f.sp, vz = Math.cos(ang) * f.sp;
        d.rotation.set(0, Math.atan2(-vz, vx), 0);
        d.scale.setScalar(f.s);
        d.updateMatrix();
        inst.setMatrixAt(i, d.matrix);
      });
      inst.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------- comb jelly: rainbow light running down its comb rows ----------
export function makeComb(U, base) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uPh: { value: Math.random() * 6.28 } },
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    vertexShader: GHOST_VS,
    fragmentShader: /* glsl */ `
      uniform float uTime, uPh; varying vec3 vN; varying vec3 vV; varying vec3 vL;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
        float ang = atan(vL.z, vL.x);
        float row = smoothstep(0.86, 1.0, cos(ang * 4.0 + uPh));
        float pulse = 0.5 + 0.5 * sin(vL.y * 18.0 - uTime * 7.0);
        vec3 rainbow = 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + vL.y * 0.9 - uTime * 0.6 + uPh));
        vec3 col = vec3(0.7, 0.85, 1.0) * f * 0.7 + rainbow * row * pulse * 1.3;
        gl_FragColor = vec4(col, f * 0.55 + 0.04 + row * pulse * 0.8);
      }`,
  });
  const root = new THREE.Group();
  root.add(mesh(ellipsoid(0.5, 0.95, 0.5, 28, 20), mat));
  const ph = Math.random() * 6.28;
  return {
    root,
    update(t, spread) {
      root.position.set(base.x * spread + Math.sin(t * 0.12 + ph) * 2.5, base.y + Math.sin(t * 0.35 + ph) * 1.5, base.z);
      root.rotation.set(Math.sin(t * 0.3 + ph) * 0.3, t * 0.2, Math.sin(t * 0.25 + ph) * 0.3);
    },
  };
}

// ---------- dumbo octopus: ear fins flapping ----------
export function makeDumbo(U, base, color = [1.0, 0.6, 0.62]) {
  const root = new THREE.Group();
  const m = ghost(U, color, { alpha: 0.95, base: 0.09, pow: 1.6 });
  const mantle = mesh(ellipsoid(0.95, 1.15, 0.95), m); mantle.position.y = 0.55; root.add(mantle);
  const prof = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(0.75 + t * 0.75 - t * t * 0.25, -t * 1.2)); }
  const sg = new THREE.LatheGeometry(prof, 48);
  const sp = sg.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
    sp.setY(i, y - Math.pow(Math.abs(Math.sin(Math.atan2(z, x) * 4)), 0.5) * 0.35 * Math.max(0, -y / 1.2));
  }
  sg.computeVertexNormals();
  const skirt = mesh(sg, m); skirt.position.y = 0.05; root.add(skirt);
  const ears = [-1, 1].map(s => {
    const pivot = new THREE.Group(); pivot.position.set(0, 1.0, s * 0.8);
    const ear = mesh(ellipsoid(0.32, 0.09, 0.7, 16, 10), m); ear.position.z = s * 0.62;
    pivot.add(ear); root.add(pivot); return { pivot, s };
  });
  const eyeM = ghost(U, [1, 1, 1], { alpha: 0.2, base: 0.5, pow: 1 });
  for (const s of [-1, 1]) { const e = mesh(ellipsoid(0.13, 0.13, 0.13, 10, 8), eyeM); e.position.set(0.82, 0.75, s * 0.4); root.add(e); }
  root.add(glowSprite(U, [1.0, 0.55, 0.6], 7));
  root.scale.setScalar(1.3);
  const ph = Math.random() * 6.28;
  return {
    root,
    update(t, spread) {
      const flap = Math.sin(t * 2.2 + ph);
      ears.forEach(({ pivot, s }) => { pivot.rotation.x = -s * (0.25 + flap * 0.45); });
      const pulse = Math.sin(t * 1.1 + ph);
      skirt.scale.set(1 + pulse * 0.12, 1 - pulse * 0.08, 1 + pulse * 0.12);
      root.position.set(base.x * spread + Math.sin(t * 0.13 + ph) * 3, base.y + Math.sin(t * 0.5 + ph) * 0.9 + flap * 0.12, base.z);
      root.rotation.set(Math.sin(t * 0.2 + ph) * 0.15, Math.sin(t * 0.17 + ph) * 0.8 - 0.6, Math.sin(t * 0.13 + ph + 1.5) * 0.2);
    },
  };
}

// ---------- anglerfish: a dark shape you only see by its lure ----------
export function makeAngler(U, base, flip = false) {
  const root = new THREE.Group();
  const lure = new THREE.Vector3();
  const dark = new THREE.ShaderMaterial({
    uniforms: { uLure: { value: lure } },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vW;
      void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLure; varying vec3 vN; varying vec3 vW;
      void main(){
        vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 toL = uLure - vW; float d = length(toL);
        float lit = max(dot(n, toL / d), 0.0) / (1.0 + d * d * 0.45);
        float rim = pow(1.0 - abs(dot(n, normalize(cameraPosition - vW))), 3.0);
        vec3 col = vec3(0.012, 0.016, 0.03) + vec3(0.35, 0.85, 0.95) * lit * 1.6 + vec3(0.08, 0.14, 0.25) * rim;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const bg = new THREE.SphereGeometry(1, 30, 22);
  const bp = bg.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    let x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    const back = Math.max(0, -x);
    y *= 1 - back * 0.55; z *= 1 - back * 0.5; x *= 1.25;
    if (y < -0.05 && x > 0) x += 0.25 * -y;
    bp.setXYZ(i, x, y, z * 0.9);
  }
  bg.computeVertexNormals();
  root.add(mesh(bg, dark));
  const tooth = new THREE.ConeGeometry(0.035, 0.24, 5);
  const toothM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.75, 0.8) });
  for (let i = 0; i < 16; i++) {
    const top = i < 8, a = ((i % 8) / 7 - 0.5) * 2.0;
    const tm = mesh(tooth, toothM);
    tm.position.set(1.32 + Math.cos(a) * 0.12 - Math.abs(a) * 0.25, top ? 0.04 : -0.2, Math.sin(a) * 0.55);
    tm.rotation.z = top ? Math.PI : 0;
    root.add(tm);
  }
  const tail = mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1.1, 0, 0), new THREE.Vector3(-1.9, 0.65, 0), new THREE.Vector3(-1.9, -0.65, 0)]), dark);
  tail.geometry.computeVertexNormals(); root.add(tail);
  const rodPts = [new THREE.Vector3(0.35, 0.85, 0), new THREE.Vector3(0.9, 1.75, 0), new THREE.Vector3(1.6, 1.9, 0), new THREE.Vector3(2.05, 1.45, 0)];
  root.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rodPts), 20, 0.03, 5), dark));
  const bulb = mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.8, 1.0, 1.0) }));
  root.add(bulb);
  const glow = glowSprite(U, [0.45, 0.95, 1.0], 6.5); root.add(glow);
  const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.5, 0.5) });
  for (const s of [-1, 1]) { const e = mesh(new THREE.SphereGeometry(0.08, 10, 8), eyeM); e.position.set(0.78, 0.4, s * 0.62); root.add(e); }
  root.scale.setScalar(1.6);
  const ph = Math.random() * 6.28;
  const v = new THREE.Vector3();
  return {
    root,
    update(t, spread) {
      root.position.set(base.x * spread + Math.sin(t * 0.08 + ph) * 3, base.y + Math.sin(t * 0.3 + ph) * 0.6, base.z);
      root.rotation.set(0, (flip ? Math.PI : 0) + Math.sin(t * 0.08 + ph) * 0.4, Math.sin(t * 0.3 + ph) * 0.05);
      const bob = Math.sin(t * 1.7 + ph) * 0.12;
      bulb.position.set(rodPts[3].x, rodPts[3].y + bob, 0);
      glow.position.copy(bulb.position);
      bulb.scale.setScalar(0.85 + 0.25 * Math.sin(t * 3.1 + ph));
      root.updateMatrixWorld();
      lure.copy(v.copy(bulb.position).applyMatrix4(root.matrixWorld));
    },
  };
}
