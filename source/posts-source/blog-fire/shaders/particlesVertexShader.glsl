/*
Transform a particle array texture into an array of vertices to render.
*/

precision highp float;
precision mediump sampler2D;

uniform sampler2D particleData;
uniform float size;
attribute vec2 particleUV;
varying vec2 vUv; // each texel maps to its own particle.

void main () {
  // Scale the coordinates by some factor so that the user doesn't see the
  // boundaries of the box inside which we originally seeded particles.
  vec2 p = texture2D(particleData, particleUV).xy * 1.5;
  vUv = particleUV;
  gl_PointSize = size;
  gl_Position = vec4(p, 0.0, 1.0);
}
