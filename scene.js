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
  const camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.1, 200);
  camera.position.set(0, 0, 30);

  const TOP = 22, BOTTOM = -80; // camera y at top and bottom of the page
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
  };

  // ---------- sky + sea backdrop ----------
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: U,
      depthWrite: false,
      depthTest: false,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        
        varying vec2 vUv;
        uniform float uTime, uCamY, uCamX, uHalfH, uAspect;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float waterline(float x, float t){
          return 0.55*sin(x*0.35 + t*0.8) + 0.25*sin(x*0.9 - t*1.3) + 0.12*sin(x*2.1 + t*2.0);
        }
        void main(){
          float t = uTime;
          float wy = uCamY + (vUv.y - 0.5) * 2.0 * uHalfH;
          float wx = uCamX + (vUv.x - 0.5) * 2.0 * uHalfH * uAspect;
          float surf = waterline(wx, t);
          vec3 col;
          if (wy > surf) {
            // night sky: dusk violet at the horizon to deep indigo overhead
            float h = clamp((wy - surf) / 55.0, 0.0, 1.0);
            col = mix(vec3(0.26, 0.17, 0.42), vec3(0.11, 0.10, 0.30), smoothstep(0.0, 0.25, h));
            col = mix(col, vec3(0.025, 0.035, 0.12), smoothstep(0.2, 1.0, h));
            // a soft moon
            vec2 m = vec2(wx - min(22.0, uHalfH * uAspect * 0.55), wy - 35.0);
            float d = length(m);
            col += vec3(1.0, 0.95, 0.85) * smoothstep(1.55, 1.4, d) * 0.85;
            col += vec3(0.55, 0.55, 0.9) * exp(-d * 0.22) * 0.3;
            // aurora ribbon
            float a = sin(wx*0.12 + sin(wx*0.05 + t*0.15)*2.0 + t*0.1);
            float band = exp(-pow((wy - 26.0 - a*4.0) / 3.5, 2.0));
            col += vec3(0.15, 0.55, 0.5) * band * 0.22 * (0.6 + 0.4*sin(wx*0.3 + t*0.4));
            // a shooting star every few seconds
            float cyc = floor(t / 6.5); float k = fract(t / 6.5);
            vec2 s0 = vec2((hash(vec2(cyc, 1.0)) - 0.5) * 60.0, 30.0 + hash(vec2(cyc, 2.0)) * 20.0);
            vec2 dir = normalize(vec2(-1.0, -0.45));
            vec2 head = s0 + dir * k * 70.0;
            vec2 rel = vec2(wx, wy) - head;
            float along = dot(rel, -dir); float across = abs(dot(rel, vec2(-dir.y, dir.x)));
            float streak = step(0.0, along) * smoothstep(9.0, 0.0, along) * smoothstep(0.18, 0.0, across);
            col += vec3(1.0, 0.95, 0.8) * streak * smoothstep(0.32, 0.0, k) * 1.2;
            // shimmer on the water's top
            col += vec3(0.6, 0.6, 0.9) * exp(-(wy - surf) * 2.5) * 0.25;
          } else {
            // under the sea
            float depth = surf - wy;
            col = mix(vec3(0.07, 0.36, 0.43), vec3(0.02, 0.13, 0.22), smoothstep(0.0, 35.0, depth));
            col = mix(col, vec3(0.006, 0.02, 0.045), smoothstep(30.0, 95.0, depth));
            // god rays
            float r = sin(wx*0.42 + wy*0.18 + t*0.25) * sin(wx*0.23 - wy*0.07 - t*0.17 + 1.7);
            float rays = smoothstep(0.25, 1.0, r) * exp(-depth * 0.045);
            col += vec3(0.45, 0.85, 0.85) * rays * 0.28;
            // caustics near the surface
            vec2 p = vec2(wx, wy) * 0.9;
            float c = sin(p.x + sin(p.y*1.3 + t)) * sin(p.y*0.8 + sin(p.x*1.1 - t*0.8));
            col += vec3(0.4, 0.9, 0.9) * pow(abs(c), 6.0) * 0.35 * exp(-depth * 0.18);
            // bright underside of the surface
            col += vec3(0.5, 0.9, 1.0) * exp(-depth * 1.8) * 0.5;
            // faint glow of the sea floor
            col += vec3(0.05, 0.12, 0.16) * smoothstep(85.0, 110.0, depth) * (0.5 + 0.5*sin(wx*0.2 + t*0.2));
          }
          // vignette
          vec2 q = vUv - 0.5;
          col *= 1.0 - dot(q, q) * 0.9;
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  bg.frustumCulled = false;
  bg.renderOrder = -10;
  scene.add(bg);

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
        size = 0.18 + aRand.x * 0.35;
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
  cloud(0, 900, '#e8ecff', () => [R(-110, 110), R(4, SKY + 30), R(-60, -25)]);
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
    camera.lookAt(mx * 1.5, camY, 0);
    U.uCamY.value = camY; U.uCamX.value = mx * 4;
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
