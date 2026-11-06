// SwingDog Studios: a dive from a starry night sky into the deep sea.
// One fullscreen sky/sea shader plus a few point clouds and jellyfish. No textures, no models.
import * as THREE from './vendor/three.module.min.js';

const canvas = document.getElementById('world');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const small = Math.min(innerWidth, innerHeight) < 700;
const Q = small ? 0.55 : 1; // particle budget

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
} catch (e) {
  console.warn('WebGL unavailable, keeping the CSS background.', e);
}

if (renderer) start();

function start() {
  renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1.5 : 1.75));
  const scene = new THREE.Scene();
  const FOV = 50;
  const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.1, 1200);
  camera.position.set(0, 0, 30);

  const TOP = 17, BOTTOM = -80; // camera y at top and bottom of the page
  const SKY = 60, DEEP = -110;  // world extents for particles
  const BG_DIST = 40;

  const U = {
    uTime: { value: 0 },
    uCamY: { value: TOP },
    uCamX: { value: 0 },
    uHalfH: { value: Math.tan(THREE.MathUtils.degToRad(FOV / 2)) * BG_DIST },
    uAspect: { value: innerWidth / innerHeight },
    uPR: { value: renderer.getPixelRatio() },
    uScale: { value: innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2)) },
    uTanHalf: { value: Math.tan(THREE.MathUtils.degToRad(FOV / 2)) },
    uCamRot: { value: new THREE.Matrix3() },
    uRes: { value: new THREE.Vector2(1, 1) },
  };

  // ---------- shared sky (used by the backdrop and by the sea's reflections) ----------
  const SKY_GLSL = /* glsl */ `
    uniform float uAspect;
    vec3 moonDir(){ return normalize(vec3(min(0.42, 0.3 * uAspect), 0.3, -1.0)); }
    vec3 skyCol(vec3 d){
      float e = d.y;
      vec3 col = mix(vec3(0.30, 0.19, 0.46), vec3(0.11, 0.10, 0.30), smoothstep(0.0, 0.14, e));
      col = mix(col, vec3(0.025, 0.035, 0.12), smoothstep(0.12, 0.75, e));
      float ang = acos(clamp(dot(d, moonDir()), -1.0, 1.0));
      col += vec3(1.0, 0.95, 0.85) * smoothstep(0.036, 0.032, ang) * 0.85;
      col += vec3(0.55, 0.55, 0.9) * exp(-ang * 9.0) * 0.32;
      return col;
    }`;

  // ---------- sky + sea backdrop: a per-pixel view ray, so it lines up with the 3D sea ----------
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: U,
      depthWrite: false,
      depthTest: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime, uCamY, uCamX, uTanHalf;
        uniform mat3 uCamRot;
        ${SKY_GLSL}
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main(){
          float t = uTime;
          vec2 ndc = vUv * 2.0 - 1.0;
          vec3 d = normalize(uCamRot * vec3(ndc.x * uTanHalf * uAspect, ndc.y * uTanHalf, -1.0));
          float lxz = max(length(d.xz), 1e-3);
          float ax = d.x / lxz * 40.0, ay = d.y / lxz * 40.0;   // the sky as a flat screen 40 units away
          vec3 col;
          if (uCamY > 0.0) {
            if (d.y > 0.0) {
              col = skyCol(d);
              // aurora ribbon
              float a = sin(ax*0.12 + sin(ax*0.05 + t*0.15)*2.0 + t*0.1);
              float band = exp(-pow((ay - 13.0 - a*3.5) / 3.2, 2.0));
              col += vec3(0.15, 0.55, 0.5) * band * 0.2 * (0.6 + 0.4*sin(ax*0.3 + t*0.4));
              // a shooting star every few seconds
              float cyc = floor(t / 6.5); float k = fract(t / 6.5);
              vec2 s0 = vec2((hash(vec2(cyc, 1.0)) - 0.5) * 60.0, 12.0 + hash(vec2(cyc, 2.0)) * 16.0);
              vec2 sd = normalize(vec2(-1.0, -0.45));
              vec2 rel = vec2(ax, ay) - (s0 + sd * k * 70.0);
              float along = dot(rel, -sd); float across = abs(dot(rel, vec2(-sd.y, sd.x)));
              float streak = step(0.0, along) * smoothstep(9.0, 0.0, along) * smoothstep(0.18, 0.0, across);
              col += vec3(1.0, 0.95, 0.8) * streak * smoothstep(0.32, 0.0, k) * 1.2 * step(1.0, ay);
            } else {
              // far sea beyond the waves: the horizon fading into dark water
              col = skyCol(normalize(vec3(d.x, 0.0, d.z))) * (1.0 - smoothstep(0.0, 0.25, -d.y) * 0.6);
            }
          } else {
            // under the sea
            float wy = uCamY + ay, wx = uCamX + ax;
            float depth = max(0.0, -wy);
            col = mix(vec3(0.07, 0.36, 0.43), vec3(0.02, 0.13, 0.22), smoothstep(0.0, 35.0, depth));
            col = mix(col, vec3(0.006, 0.02, 0.045), smoothstep(30.0, 95.0, depth));
            float r = sin(wx*0.42 + wy*0.18 + t*0.25) * sin(wx*0.23 - wy*0.07 - t*0.17 + 1.7);
            col += vec3(0.45, 0.85, 0.85) * smoothstep(0.25, 1.0, r) * exp(-depth * 0.045) * 0.28;
            vec2 p = vec2(wx, wy) * 0.9;
            float c = sin(p.x + sin(p.y*1.3 + t)) * sin(p.y*0.8 + sin(p.x*1.1 - t*0.8));
            col += vec3(0.4, 0.9, 0.9) * pow(abs(c), 6.0) * 0.35 * exp(-depth * 0.18);
            col += vec3(0.5, 0.9, 1.0) * exp(-depth * 1.8) * 0.5;
            col += vec3(0.05, 0.12, 0.16) * smoothstep(85.0, 110.0, depth) * (0.5 + 0.5*sin(wx*0.2 + t*0.2));
          }
          vec2 q = vUv - 0.5;
          col *= 1.0 - dot(q, q) * 0.9;
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  bg.frustumCulled = false;
  bg.renderOrder = -10;
  scene.add(bg);

  // ---------- the sea surface: Gerstner swell on a grid that is dense near the viewer ----------
  const ocean = (() => {
    const COLS = small ? 120 : 200, ROWS = small ? 110 : 180;
    const pos = new Float32Array(COLS * ROWS * 3);
    for (let j = 0; j < ROWS; j++) {
      const z = 44 - 760 * Math.pow(j / (ROWS - 1), 2.4);
      for (let i = 0; i < COLS; i++) {
        const u = (i / (COLS - 1)) * 2 - 1;
        const k = (j * COLS + i) * 3;
        pos[k] = Math.sign(u) * 520 * Math.pow(Math.abs(u), 1.9); pos[k + 1] = 0; pos[k + 2] = z;
      }
    }
    const idx = [];
    for (let j = 0; j < ROWS - 1; j++) for (let i = 0; i < COLS - 1; i++) {
      const a = j * COLS + i, b = a + 1, c = a + COLS, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      uniforms: U,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vW; varying vec3 vN; varying float vH;
        vec3 wave(vec2 dir, float L, float A, vec2 p, float fade, inout vec3 n){
          float k = 6.2832 / L, w = sqrt(9.8 * k) * 0.75, Q = 0.9;
          vec2 D = normalize(dir);
          float f = k * dot(D, p) - w * uTime;
          float c = cos(f), s = sin(f);
          A *= fade;
          n.x -= D.x * k * A * c; n.z -= D.y * k * A * c; n.y -= Q * k * A * s;
          return vec3(Q * A * D.x * c, A * s, Q * A * D.y * c);
        }
        void main(){
          vec3 p0 = (modelMatrix * vec4(position, 1.0)).xyz;
          float dist = length(p0.xz - cameraPosition.xz);
          float fade = 1.0 / (1.0 + dist * 0.012);
          vec3 n = vec3(0.0, 1.0, 0.0), o = vec3(0.0);
          o += wave(vec2(0.35, 1.0), 38.0, 0.75, p0.xz, fade, n);
          o += wave(vec2(-0.8, 1.0), 21.0, 0.42, p0.xz, fade, n);
          o += wave(vec2(1.0, 0.45), 12.0, 0.22, p0.xz, fade, n);
          o += wave(vec2(-1.0, 0.3), 8.5, 0.13, p0.xz, fade, n);
          o += wave(vec2(-0.2, 1.0), 6.5, 0.09, p0.xz, fade * fade, n);
          vec3 wp = p0 + o;
          vW = wp; vN = n; vH = o.y / max(fade, 0.2);
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec2 uRes;
        varying vec3 vW; varying vec3 vN; varying float vH;
        ${SKY_GLSL}
        void main(){
          vec3 V = cameraPosition - vW; float dist = length(V); V /= dist;
          // fine ripples in the normal only
          vec2 q = vW.xz; float t = uTime;
          float det = 1.0 / (1.0 + dist * 0.015);
          vec2 g = vec2(0.0);
          // ripples from many off-axis directions, so no grid shows
          const vec2 D1 = vec2(0.82, 0.57), D2 = vec2(-0.37, 0.93), D3 = vec2(0.97, -0.24),
                     D4 = vec2(-0.71, -0.70), D5 = vec2(0.13, 0.99), D6 = vec2(-0.92, 0.39);
          g += D1 * cos(dot(D1, q) * 1.9 + t * 1.6);
          g += D2 * cos(dot(D2, q) * 2.6 - t * 1.9 + 1.3) * 0.8;
          g += D3 * cos(dot(D3, q) * 3.7 + t * 2.4 + 2.1) * 0.6;
          g += D4 * cos(dot(D4, q) * 5.3 - t * 2.9 + 0.4) * 0.45;
          g += D5 * cos(dot(D5, q) * 7.9 + t * 3.5 + 4.2) * 0.3;
          g += D6 * cos(dot(D6, q) * 11.3 - t * 4.1 + 5.7) * 0.2;
          vec3 N = normalize(vN + det * 0.09 * vec3(g.x, 0.0, g.y));
          vec3 col;
          if (cameraPosition.y > 0.0) {
            float ndv = max(dot(N, V), 0.0);
            float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
            vec3 R = reflect(-V, N); R.y = abs(R.y);
            vec3 md = moonDir();
            float rm = max(dot(R, md), 0.0);
            vec3 deep = vec3(0.006, 0.03, 0.055) + vec3(0.02, 0.1, 0.12) * clamp(vH * 0.9 + 0.35, 0.0, 1.0) * 0.45;
            col = mix(deep, skyCol(R), fres);
            col += vec3(1.0, 0.95, 0.85) * (pow(rm, 900.0) * 2.6 + pow(rm, 160.0) * 0.08);  // moon glitter path
            col += vec3(0.45, 0.5, 0.7) * smoothstep(0.5, 0.95, vH) * 0.12;                  // faint crests
            col = mix(col, skyCol(normalize(vec3(-V.x, 0.0, -V.z))), 1.0 - exp(-dist * 0.0032));
          } else {
            // seen from below: a bright window straight up, silvery reflection at a slant
            float c = abs(dot(N, V));
            float win = smoothstep(0.62, 0.74, c);
            col = mix(vec3(0.05, 0.25, 0.31), vec3(0.42, 0.72, 0.85), win);
            col += vec3(0.6, 0.95, 1.0) * pow(c, 24.0) * 0.35;
            vec3 fogc = mix(vec3(0.09, 0.4, 0.47), vec3(0.02, 0.13, 0.22), smoothstep(0.0, 35.0, -cameraPosition.y));
            col = mix(col, fogc, 1.0 - exp(-dist * 0.03));
          }
          vec2 vq = gl_FragCoord.xy / uRes - 0.5;   // same vignette as the backdrop
          col *= 1.0 - dot(vq, vq) * 0.9;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  })();

  // ---------- particles ----------
  // kind 0 stars, 1 fireflies, 2 bubbles, 3 marine snow
  const particleVS = `
    attribute vec4 aRand;
    uniform float uTime, uPR, uScale, uKind;
    varying float vAlpha; varying float vTw;
    void main(){
      vec3 p = position; float t = uTime;
      float size = 1.0; vAlpha = 1.0; vTw = aRand.w;
      if (uKind < 0.5) {             // stars
        size = (0.18 + aRand.x * 0.35) * 2.8;
        vAlpha = 0.55 + 0.45 * sin(t * (0.6 + aRand.y * 2.5) + aRand.z * 6.28);
      } else if (uKind < 1.5) {      // fireflies wander
        p += vec3(sin(t*0.31*(0.6+aRand.x) + aRand.z*6.28) * 3.0,
                  sin(t*0.43*(0.6+aRand.y) + aRand.w*6.28) * 1.6,
                  cos(t*0.27*(0.6+aRand.x) + aRand.y*6.28) * 2.5);
        size = 0.45 + aRand.y * 0.35;
        vAlpha = smoothstep(-0.2, 0.9, sin(t * (0.7 + aRand.x) + aRand.w * 6.28));
        vAlpha *= smoothstep(0.5, 2.5, p.y);
      } else if (uKind < 2.5) {      // bubbles rise and wobble
        float span = ${-DEEP}.0;
        p.y = mod(p.y - ${DEEP}.0 + t * (1.2 + aRand.x * 2.4), span) + ${DEEP}.0;
        p.x += sin(t * (1.5 + aRand.y) + aRand.z * 6.28) * 0.35;
        size = 0.18 + aRand.w * 0.32;
        vAlpha = smoothstep(0.0, -2.0, p.y) * 0.85;
      } else {                       // marine snow drifts down
        float span = ${-DEEP}.0;
        p.y = mod(p.y - ${DEEP}.0 - t * (0.15 + aRand.x * 0.3), span) + ${DEEP}.0;
        p.x += sin(t * 0.2 + aRand.z * 6.28) * 0.8;
        size = 0.08 + aRand.w * 0.12;
        vAlpha = smoothstep(0.0, -4.0, p.y) * 0.6;
      }
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = max(1.0, size * uScale * uPR / -mv.z);
    }`;
  const particleFS = `
    
    uniform float uKind; uniform vec3 uColor;
    varying float vAlpha; varying float vTw;
    void main(){
      vec2 c = gl_PointCoord - 0.5; float d = length(c);
      float a;
      if (uKind > 1.5 && uKind < 2.5) {
        a = smoothstep(0.5, 0.42, d) * (0.25 + 0.75 * smoothstep(0.2, 0.45, d));
        a += smoothstep(0.16, 0.0, length(c - vec2(-0.14, 0.14))) * 0.8; // glint
      } else {
        a = exp(-d * d * 22.0) + smoothstep(0.5, 0.0, d) * 0.15;
      }
      gl_FragColor = vec4(uColor, a * vAlpha);
    }`;

  function cloud(kind, count, color, place) {
    const n = Math.round(count * Q);
    const pos = new Float32Array(n * 3), rnd = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const v = place();
      pos.set(v, i * 3);
      for (let j = 0; j < 4; j++) rnd[i * 4 + j] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(rnd, 4));
    const m = new THREE.ShaderMaterial({
      uniforms: { ...U, uKind: { value: kind }, uColor: { value: new THREE.Color(color) } },
      vertexShader: particleVS, fragmentShader: particleFS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false;
    scene.add(pts);
    return pts;
  }
  const R = (a, b) => a + Math.random() * (b - a);
  cloud(0, 900, '#e8ecff', () => {   // a dome of stars far away, all above the horizon
    const el = Math.asin(R(0.04, 0.95)), az = R(-1.4, 1.4), r = 200;
    return [Math.sin(az) * Math.cos(el) * r, TOP + Math.sin(el) * r, 30 - Math.cos(az) * Math.cos(el) * r];
  });
  cloud(1, 70, '#ffd27a', () => [R(-34, 34), R(6, 42), R(-12, 12)]);
  cloud(2, 260, '#bff6ff', () => [R(-40, 40), R(DEEP, 0), R(-20, 12)]);
  cloud(3, 700, '#9fd8e0', () => [R(-60, 60), R(DEEP, 0), R(-30, 15)]);

  // ---------- jellyfish ----------
  const jellyVS = `
    uniform float uTime; uniform float uPhase;
    varying vec3 vN; varying vec3 vV; varying float vY;
    void main(){
      vec3 p = position;
      float pulse = sin(uTime * 1.6 + uPhase);
      p.xz *= 1.0 + 0.12 * pulse * (1.0 - p.y);
      p.y *= 1.0 - 0.1 * pulse;
      vY = position.y;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`;
  const jellyFS = `
    
    uniform vec3 uColor; varying vec3 vN; varying vec3 vV; varying float vY;
    void main(){
      float f = pow(1.0 - abs(dot(vN, vV)), 2.0);
      float a = f * 0.9 + 0.08 + smoothstep(0.15, 0.0, vY) * 0.25;
      gl_FragColor = vec4(uColor * (0.6 + f), a);
    }`;
  const tentVS = `
    attribute float aT; uniform float uTime; uniform float uPhase; varying float vT;
    void main(){
      vec3 p = position; vT = aT;
      p.x += sin(aT * 5.0 - uTime * 2.0 + uPhase) * 0.35 * aT;
      p.z += cos(aT * 4.0 - uTime * 1.7 + uPhase) * 0.25 * aT;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`;
  const tentFS = ` uniform vec3 uColor; varying float vT;
    void main(){ gl_FragColor = vec4(uColor, (1.0 - vT) * 0.55); }`;

  const bellGeo = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const jellies = [];
  const jellyColors = ['#ff9ad5', '#9ad7ff', '#c8a2ff', '#8affd8', '#ffb38a'];
  const jellyCount = small ? 4 : 6;
  for (let i = 0; i < jellyCount; i++) {
    const color = new THREE.Color(jellyColors[i % jellyColors.length]);
    const shared = { uTime: U.uTime, uPhase: { value: Math.random() * 6.28 }, uColor: { value: color } };
    const group = new THREE.Group();
    const bell = new THREE.Mesh(bellGeo, new THREE.ShaderMaterial({
      uniforms: shared, vertexShader: jellyVS, fragmentShader: jellyFS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    group.add(bell);
    const tentMat = new THREE.ShaderMaterial({ uniforms: shared, vertexShader: tentVS, fragmentShader: tentFS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let k = 0; k < 7; k++) {
      const ang = (k / 7) * Math.PI * 2, rr = 0.6, segs = 18, len = R(2.5, 4.5);
      const pts = new Float32Array(segs * 3), ts = new Float32Array(segs);
      for (let s = 0; s < segs; s++) {
        const t = s / (segs - 1);
        pts.set([Math.cos(ang) * rr * (1 - t * 0.5), -t * len, Math.sin(ang) * rr * (1 - t * 0.5)], s * 3);
        ts[s] = t;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      g.setAttribute('aT', new THREE.BufferAttribute(ts, 1));
      const line = new THREE.Line(g, tentMat);
      line.frustumCulled = false;
      group.add(line);
    }
    const s = R(0.9, 1.7);
    group.scale.setScalar(s);
    group.userData = { x: R(-18, 18) * (small ? 0.6 : 1), y: R(-70, -12), z: R(-14, 6), ph: Math.random() * 6.28, sp: R(0.15, 0.3) };
    scene.add(group);
    jellies.push(group);
  }

  // ---------- tap for magic: sparks in the sky, bubbles in the sea ----------
  const BURST = 160;
  const bPos = new Float32Array(BURST * 3), bDir = new Float32Array(BURST * 3), bT0 = new Float32Array(BURST).fill(-99);
  const bGeo = new THREE.BufferGeometry();
  bGeo.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  bGeo.setAttribute('aDir', new THREE.BufferAttribute(bDir, 3));
  bGeo.setAttribute('aT0', new THREE.BufferAttribute(bT0, 1));
  const burst = new THREE.Points(bGeo, new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute vec3 aDir; attribute float aT0;
      uniform float uTime, uPR, uScale;
      varying float vA; varying float vWater;
      void main(){
        float age = uTime - aT0;
        vWater = step(position.y, 0.0);
        vec3 p = position;
        if (vWater > 0.5) {
          p += aDir * 1.2 * (1.0 - exp(-age * 3.0));
          p.y += age * age * 1.6 + age * 1.5;
          p.x += sin(age * 6.0 + aDir.x * 9.0) * 0.25;
        } else {
          p += aDir * 4.0 * (1.0 - exp(-age * 2.5));
          p.y -= age * age * 0.6;
        }
        float life = vWater > 0.5 ? 3.2 : 2.2;
        vA = (age < 0.0 || age > life) ? 0.0 : (1.0 - age / life);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = vA <= 0.0 ? 0.0 : max(1.0, (vWater > 0.5 ? 0.45 : 0.35) * uScale * uPR / -mv.z);
      }`,
    fragmentShader: `
       varying float vA; varying float vWater;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float d = length(c);
        float a; vec3 col;
        if (vWater > 0.5) {
          a = smoothstep(0.5, 0.42, d) * (0.25 + 0.75 * smoothstep(0.2, 0.45, d)) + smoothstep(0.16, 0.0, length(c - vec2(-0.14, 0.14))) * 0.8;
          col = vec3(0.75, 0.97, 1.0);
        } else {
          float star = max(0.0, 1.0 - abs(c.x) * 9.0 - abs(c.y) * 1.6) + max(0.0, 1.0 - abs(c.y) * 9.0 - abs(c.x) * 1.6);
          a = exp(-d * d * 30.0) + star * 0.8;
          col = vec3(1.0, 0.86, 0.55);
        }
        gl_FragColor = vec4(col, a * vA);
      }`,
  }));
  burst.frustumCulled = false;
  scene.add(burst);
  let bNext = 0;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  addEventListener('pointerdown', e => {
    if (e.target.closest('a, button')) return;
    ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return;
    const n = 16;
    for (let i = 0; i < n; i++) {
      const k = bNext; bNext = (bNext + 1) % BURST;
      bPos.set([hit.x, hit.y, hit.z], k * 3);
      const a = Math.random() * Math.PI * 2, z = R(-1, 1), r = Math.sqrt(1 - z * z) * R(0.4, 1);
      bDir.set([Math.cos(a) * r, Math.sin(a) * r, z * 0.4], k * 3);
      bT0[k] = clock + R(0, 0.12);
    }
    bGeo.attributes.position.needsUpdate = bGeo.attributes.aDir.needsUpdate = bGeo.attributes.aT0.needsUpdate = true;
    hint.classList.remove('show');
  }, { passive: true });
  const hint = document.getElementById('hint');
  setTimeout(() => hint.classList.add('show'), 4000);
  setTimeout(() => hint.classList.remove('show'), 11000);

  // ---------- loop ----------
  let clock = 0, last = performance.now();
  let camY = TOP, mx = 0, my = 0, tmx = 0, tmy = 0;
  addEventListener('pointermove', e => { tmx = e.clientX / innerWidth - 0.5; tmy = e.clientY / innerHeight - 0.5; }, { passive: true });

  function progress() {
    const max = document.documentElement.scrollHeight - innerHeight;
    return max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
  }
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    U.uAspect.value = camera.aspect;
    renderer.getDrawingBufferSize(U.uRes.value);
    U.uScale.value = innerHeight / 2 / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  }
  addEventListener('resize', resize);
  resize();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!reduced) clock += dt;
    U.uTime.value = clock;
    // ease the camera toward the scroll position; dip through the surface a bit faster
    const p = progress();
    const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    const target = TOP + (BOTTOM - TOP) * (0.35 * p + 0.65 * eased);
    camY += (target - camY) * (reduced ? 1 : Math.min(1, dt * 4));
    mx += (tmx - mx) * Math.min(1, dt * 2); my += (tmy - my) * Math.min(1, dt * 2);
    camera.position.set(mx * 4, camY - my * 2, 30);
    // look up a little while high above the sea so the horizon sits low, level out near the water
    const pitch = Math.max(0, Math.min(1, camY / TOP)) * 0.2;
    camera.lookAt(mx * 1.5, camY + Math.tan(pitch) * 30, 0);
    camera.updateMatrixWorld();
    U.uCamRot.value.setFromMatrix4(camera.matrixWorld);
    U.uCamY.value = camY; U.uCamX.value = mx * 4;
    ocean.visible = camY > -48;
    for (const j of jellies) {
      const d = j.userData;
      j.position.set(d.x + Math.sin(clock * 0.1 + d.ph) * 3, d.y + Math.sin(clock * d.sp + d.ph) * 2.2, d.z);
      j.rotation.z = Math.sin(clock * 0.3 + d.ph) * 0.18;
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(t => { last = t; frame(t); canvas.classList.add('on'); });
}
