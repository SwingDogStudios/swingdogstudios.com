// Shared lighting so every object sits in the same sky and sea as the backdrop.
// Needs uniforms: uTime (float), uCamPos (vec3).
export const SHADE = /* glsl */ `
uniform float uTime;
uniform vec3 uCamPos;

vec3 skyFog(float y){
  return mix(vec3(0.26, 0.17, 0.42), vec3(0.11, 0.10, 0.30), smoothstep(0.0, 14.0, y));
}
vec3 seaFog(float y){
  float d = max(0.0, -y);
  vec3 c = mix(vec3(0.07, 0.36, 0.43), vec3(0.02, 0.13, 0.22), smoothstep(0.0, 35.0, d));
  return mix(c, vec3(0.006, 0.02, 0.045), smoothstep(30.0, 95.0, d));
}
float waterY(vec3 p){
  return 0.14 * sin(p.x * 0.5 + uTime * 0.9) + 0.1 * sin(p.z * 0.7 - uTime * 1.1);
}
float caustic(vec2 p){
  vec2 q = p;
  for (int i = 0; i < 3; i++) {
    q += vec2(sin(q.y * 1.7 + uTime * 0.6), sin(q.x * 1.3 - uTime * 0.5)) * 0.6;
  }
  return pow(abs(sin(q.x) * sin(q.y)), 3.0);
}
// albedo, normal, world position, self-glow, fog strength multiplier
vec3 shade(vec3 alb, vec3 n, vec3 wp, float glow, float fogK){
  float y = wp.y;
  float dist = length(wp - uCamPos);
  vec3 col;
  if (y > waterY(wp)) {
    vec3 L = normalize(vec3(0.55, 0.65, 0.5));
    float dif = max(dot(n, L), 0.0);
    float rim = pow(1.0 - max(dot(n, normalize(uCamPos - wp)), 0.0), 3.0);
    col = alb * (vec3(0.13, 0.12, 0.26) + vec3(0.62, 0.66, 0.95) * dif * 0.85) + vec3(0.35, 0.35, 0.6) * rim * 0.25;
    col = mix(col, skyFog(y), (1.0 - exp(-dist * 0.012)) * fogK);
  } else {
    vec3 L = normalize(vec3(0.15, 1.0, 0.35));
    float dif = max(dot(n, L), 0.0) * 0.8 + 0.2;
    float light = exp(y * 0.036);
    vec3 absorb = exp(vec3(0.022, 0.008, 0.006) * y);
    float c = caustic(wp.xz * 0.7 + vec2(wp.y * 0.15)) * max(n.y, 0.0) * exp(y * 0.09);
    col = alb * absorb * (vec3(0.10, 0.20, 0.25) * (0.35 + 0.65 * light) + vec3(0.85, 0.97, 1.0) * dif * light);
    col *= mix(vec3(0.62, 0.86, 0.88), vec3(1.0), smoothstep(-0.5, -6.0, y));
    col += vec3(0.55, 0.95, 1.0) * c * 0.35;
    col = mix(col, seaFog(y), (1.0 - exp(-dist * 0.016)) * fogK);
  }
  return col + alb * glow;
}
`;
