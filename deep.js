// Creatures of the deep: dumbo octopuses flapping their ear fins and anglerfish lit by their own lures.
import * as THREE from './vendor/three.module.min.js';
import { SHADE } from './glsl.js';

// soft, glowing creature skin: lit by a nearby light (a lure) plus its own faint glow
function skin(U, { color, glow = 0.25, rim = 0.6, light = null, lightColor = [0.5, 0.95, 1.0], pattern = 0 }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: U.uTime, uCamPos: U.uCamPos,
      uAlb: { value: new THREE.Color(...color) }, uGlow: { value: glow }, uRim: { value: rim },
      uLight: { value: light || new THREE.Vector3(0, -999, 0) }, uLightCol: { value: new THREE.Color(...lightColor) },
      uPattern: { value: pattern },
    },
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vWP; varying vec3 vL;
      void main(){
        vL = position;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWP = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      ${SHADE}
      uniform vec3 uAlb; uniform float uGlow; uniform float uRim; uniform vec3 uLight; uniform vec3 uLightCol; uniform float uPattern;
      varying vec3 vN; varying vec3 vWP; varying vec3 vL;
      void main(){
        vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 v = normalize(uCamPos - vWP);
        vec3 alb = uAlb;
        if (uPattern > 0.5) alb *= 0.8 + 0.4 * smoothstep(0.4, 0.9, sin(vL.x * 13.0) * sin(vL.y * 11.0 + 1.0) * sin(vL.z * 9.0));
        vec3 toL = uLight - vWP; float d = length(toL);
        float lit = max(dot(n, toL / d), 0.0) / (1.0 + d * d * 0.2);
        float rim = pow(1.0 - max(dot(n, v), 0.0), 2.5);
        vec3 col = alb * (uGlow + uLightCol * lit * 3.2) + alb * rim * uRim;
        float dist = length(vWP - uCamPos);
        col = mix(col, seaFog(vWP.y), (1.0 - exp(-dist * 0.012)) * 0.6);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

function glowSprite(U, color, size) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const m = new THREE.ShaderMaterial({
    uniforms: { uPR: U.uPR, uScale: U.uScale, uTime: U.uTime, uColor: { value: new THREE.Color(...color) }, uSize: { value: size } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      uniform float uPR, uScale, uSize, uTime;
      varying float vP;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vP = 0.8 + 0.2 * sin(uTime * 2.3);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uScale * uPR / -mv.z;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; varying float vP;
      void main(){
        float d = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-d * d * 5.0) * 0.9 + exp(-d * d * 60.0);
        gl_FragColor = vec4(uColor * vP, a * vP);
      }`,
  });
  const p = new THREE.Points(g, m);
  p.frustumCulled = false;
  return p;
}

export function makeDumbo(U, { color = [1.0, 0.62, 0.55] } = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const mat = skin(U, { color, glow: 0.42, rim: 0.9, pattern: 1 });
  // mantle
  const mantle = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), mat);
  mantle.scale.set(0.95, 1.15, 0.95); mantle.position.y = 0.55;
  body.add(mantle);
  // webbed arm skirt: a lathe with a scalloped hem
  const prof = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(0.75 + t * 0.75 - t * t * 0.25, -t * 1.2)); }
  const skirtGeo = new THREE.LatheGeometry(prof, 48);
  const sp = skirtGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
    const a = Math.atan2(z, x);
    const hem = Math.max(0, -y / 1.2);
    sp.setY(i, y - Math.pow(Math.abs(Math.sin(a * 4)), 0.5) * 0.35 * hem);
  }
  skirtGeo.computeVertexNormals();
  const skirt = new THREE.Mesh(skirtGeo, mat);
  skirt.position.y = 0.05;
  body.add(skirt);
  // ear fins on pivots so they can flap
  const earGeo = new THREE.SphereGeometry(1, 18, 12);
  const ears = [-1, 1].map(s => {
    const pivot = new THREE.Group();
    pivot.position.set(s * 0.78, 0.95, 0);
    const ear = new THREE.Mesh(earGeo, mat);
    ear.scale.set(0.7, 0.32, 0.09);
    ear.position.x = s * 0.62;
    pivot.add(ear);
    body.add(pivot);
    return { pivot, s };
  });
  // eyes
  const eyeMat = skin(U, { color: [0.02, 0.02, 0.04], glow: 0.0, rim: 0.4 });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), eyeMat);
    eye.position.set(s * 0.42, 0.75, 0.78);
    body.add(eye);
  }
  root.add(glowSprite(U, [1.0, 0.55, 0.5], 9));
  const ph = Math.random() * 6.28;
  return {
    root,
    update(t, base) {
      const flap = Math.sin(t * 2.2 + ph);
      ears.forEach(({ pivot, s }) => { pivot.rotation.z = s * (0.25 + flap * 0.45); });
      const pulse = Math.sin(t * 1.1 + ph);
      skirt.scale.set(1 + pulse * 0.12, 1 - pulse * 0.08, 1 + pulse * 0.12);
      root.position.set(base.x + Math.sin(t * 0.13 + ph) * 3.5, base.y + Math.sin(t * 0.5 + ph) * 0.9 + flap * 0.12, base.z + Math.sin(t * 0.09 + ph) * 2);
      root.rotation.z = Math.sin(t * 0.13 + ph + 1.5) * 0.2;
      root.rotation.y = Math.sin(t * 0.2 + ph) * 0.6;
    },
  };
}

export function makeAngler(U) {
  const root = new THREE.Group();
  const lurePos = new THREE.Vector3();
  const mat = skin(U, { color: [0.38, 0.32, 0.36], glow: 0.1, rim: 0.55, light: lurePos, lightColor: [0.45, 0.95, 1.0], pattern: 1 });
  // body: a fat, round head-heavy fish facing +x
  const bodyGeo = new THREE.SphereGeometry(1, 30, 22);
  const bp = bodyGeo.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    let x = bp.getX(i), y = bp.getY(i), z = bp.getZ(i);
    // taper the back half into a tail stalk
    const back = Math.max(0, -x);
    y *= 1 - back * 0.55; z *= 1 - back * 0.5;
    x *= 1.25;
    // underbite: the lower front pushes forward
    if (y < -0.05 && x > 0) x += 0.25 * (-y);
    // mouth gap
    if (x > 0.6 && Math.abs(y + 0.05) < 0.12) { y += (y + 0.05 > 0 ? 0.08 : -0.08); }
    bp.setXYZ(i, x, y, z * 0.9);
  }
  bodyGeo.computeVertexNormals();
  const body = new THREE.Mesh(bodyGeo, mat);
  root.add(body);
  // dark mouth interior
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.62, 18, 12), skin(U, { color: [0.12, 0.02, 0.04], glow: 0.0, rim: 0.0, light: lurePos }));
  mouth.scale.set(0.55, 0.16, 0.8); mouth.position.set(1.05, -0.05, 0);
  root.add(mouth);
  // needle teeth along the jaws
  const toothMat = skin(U, { color: [0.95, 0.95, 0.9], glow: 0.2, rim: 0.4, light: lurePos });
  const toothGeo = new THREE.ConeGeometry(0.035, 0.22, 5);
  for (let i = 0; i < 18; i++) {
    const t = (i % 9) / 8, top = i < 9;
    const a = (t - 0.5) * 2.1;
    const tooth = new THREE.Mesh(toothGeo, toothMat);
    tooth.position.set(1.05 + Math.cos(a) * 0.32 - 0.2, top ? 0.05 : -0.18, Math.sin(a) * 0.5);
    tooth.rotation.z = top ? Math.PI : 0;
    tooth.rotation.x = (Math.random() - 0.5) * 0.4;
    root.add(tooth);
  }
  // pale eye
  const eyeMat = skin(U, { color: [0.75, 0.85, 0.8], glow: 0.35, rim: 0.2, light: lurePos });
  for (const s of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), eyeMat);
    eye.position.set(0.75, 0.38, s * 0.62);
    root.add(eye);
  }
  // fins
  const finMat = skin(U, { color: [0.28, 0.24, 0.3], glow: 0.04, rim: 0.4, light: lurePos });
  const tail = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1.1, 0, 0), new THREE.Vector3(-1.9, 0.6, 0), new THREE.Vector3(-1.9, -0.6, 0)]), finMat);
  tail.geometry.computeVertexNormals();
  root.add(tail);
  // the illicium (fishing rod) and its glowing lure
  const rodPts = [new THREE.Vector3(0.35, 0.85, 0), new THREE.Vector3(0.9, 1.7, 0), new THREE.Vector3(1.6, 1.85, 0), new THREE.Vector3(2.0, 1.45, 0)];
  const rodCurve = new THREE.CatmullRomCurve3(rodPts);
  const rod = new THREE.Mesh(new THREE.TubeGeometry(rodCurve, 20, 0.025, 5), finMat);
  root.add(rod);
  const lureMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 1.0, 1.0) });
  const lure = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), lureMat);
  lure.position.copy(rodPts[3]);
  root.add(lure);
  const glow = glowSprite(U, [0.45, 0.95, 1.0], 6);
  glow.position.copy(rodPts[3]);
  root.add(glow);
  const ph = Math.random() * 6.28;
  const local = new THREE.Vector3();
  return {
    root,
    update(t, base) {
      root.position.set(base.x + Math.sin(t * 0.08 + ph) * 4, base.y + Math.sin(t * 0.3 + ph) * 0.6, base.z + Math.cos(t * 0.08 + ph) * 2);
      root.rotation.y = Math.cos(t * 0.08 + ph) * 0.5 + (base.x > 0 ? Math.PI : 0);
      root.rotation.z = Math.sin(t * 0.3 + ph) * 0.05;
      const bob = Math.sin(t * 1.7 + ph) * 0.12;
      lure.position.set(rodPts[3].x, rodPts[3].y + bob, 0);
      glow.position.copy(lure.position);
      lure.scale.setScalar(0.85 + 0.25 * Math.sin(t * 3.1 + ph));
      root.updateMatrixWorld();
      lurePos.copy(local.copy(lure.position).applyMatrix4(root.matrixWorld));
    },
  };
}
