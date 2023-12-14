/*
Advect an array of particles through a velocity field, assuming built-in interpolation.
*/

precision highp float;
precision highp sampler2D;

varying vec2 vUv; // for particles, each texel is a separate particle.
uniform sampler2D uVelocity;
uniform float uSpeedMultiplier;
uniform float dt;
// texture where each texel color -> particle position.
uniform sampler2D particleData;

vec2 getVelocity (vec2 p) {
  return vec2(
    p.y,
    -p.x
  );
}

void main () {
  vec2 p = texture2D(particleData, vUv).xy; // particle position (clip space).
  vec2 p2 = p + dt * uSpeedMultiplier * getVelocity(p);

  gl_FragColor = vec4(p2, 0.0, 1.0);
}
