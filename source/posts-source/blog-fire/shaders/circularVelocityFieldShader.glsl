/*
Write vectors comprising a circular velocity field to a vector field texture.
*/

precision highp float;
precision mediump sampler2D;

uniform float uSpeedMultiplier;
varying vec2 vUv;

void main () {
  vec2 coord = vUv.xy * 2.0 - 1.0;
  gl_FragColor.x = coord.y * uSpeedMultiplier;
  gl_FragColor.y = -coord.x * uSpeedMultiplier;
  gl_FragColor.a = 1.0;
}
