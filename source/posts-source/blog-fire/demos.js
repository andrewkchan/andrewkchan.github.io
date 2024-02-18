import addNoiseShaderSource from "./shaders/addNoiseShader.glsl";
import advectionManualFilteringShaderSource from "./shaders/advectionManualFilteringShader.glsl";
import advectionShaderSource from "./shaders/advectionShader.glsl";
import baseVertexShaderSource from "./shaders/baseVertexShader.glsl";
import buoyancyShaderSource from "./shaders/buoyancyShader.glsl";
import circularVelocityFieldShaderSource from "./shaders/circularVelocityFieldShader.glsl"
import clearShaderSource from "./shaders/clearShader.glsl";
import combustionShaderSource from "./shaders/combustionShader.glsl";
import curlShaderSource from "./shaders/curlShader.glsl";
import debugFireShaderSource from "./shaders/debugFireShader.glsl";
import debugFloatShaderSource from "./shaders/debugFloatShader.glsl";
import displayShaderSource from "./shaders/displayShader.glsl";
import displayFireShaderSource from "./shaders/displayFireShader.glsl";
import divergenceShaderSource from "./shaders/divergenceShader.glsl";
import particlesAdvectionShaderSource from "./shaders/particlesAdvectionShader.glsl";
import particlesRenderShaderSource from "./shaders/particlesRenderShader.glsl";
import particlesResetDataShaderSource from "./shaders/particlesResetData.glsl";
import particlesResetLifespanShaderSource from "./shaders/particlesResetLifespan.glsl";
import particlesStepLifespanShaderSource from "./shaders/particlesStepLifespan.glsl";
import particlesVertexShaderSource from "./shaders/particlesVertexShader.glsl";
import pressureIterationShaderSource from "./shaders/pressureIterationShader.glsl";
import projectionShaderSource from "./shaders/projectionShader.glsl";
import rowShaderSource from "./shaders/rowShader.glsl";
import splatShaderSource from "./shaders/splatShader.glsl";
import vorticityConfinementShaderSource from "./shaders/vorticityConfinementShader.glsl";

// Ref: http://stackoverflow.com/questions/32633585/how-do-you-convert-to-half-floats-in-javascript
var numberToFloat16 = (function() {

  var floatView = new Float32Array(1);
  var int32View = new Int32Array(floatView.buffer);

  /* This method is faster than the OpenEXR implementation (very often
   * used, eg. in Ogre), with the additional benefit of rounding, inspired
   * by James Tursa?s half-precision code. */
  return (val) => {

    floatView[0] = val;
    var x = int32View[0];

    var bits = (x >> 16) & 0x8000; /* Get the sign */
    var m = (x >> 12) & 0x07ff; /* Keep one extra bit for rounding */
    var e = (x >> 23) & 0xff; /* Using int is faster here */

    /* If zero, or denormal, or exponent underflows too much for a denormal
     * half, return signed zero. */
    if (e < 103) {
      return bits;
    }

    /* If NaN, return NaN. If Inf or exponent overflow, return Inf. */
    if (e > 142) {
      bits |= 0x7c00;
      /* If exponent was 0xff and one mantissa bit was set, it means NaN,
       * not Inf, so make sure we set one mantissa bit too. */
      bits |= ((e == 255) ? 0 : 1) && (x & 0x007fffff);
      return bits;
    }

    /* If exponent underflows but not too much, return a denormal */
    if (e < 113) {
      m |= 0x0800;
      /* Extra rounding may overflow and set mantissa to 0 and exponent
       * to 1, which is OK. */
      bits |= (m >> (114 - e)) + ((m >> (113 - e)) & 1);
      return bits;
    }

    bits |= ((e - 112) << 10) | (m >> 1);
    /* Extra rounding. An overflow will set mantissa to 0 and increment
     * the exponent, which is OK. */
    bits += m & 1;
    return bits;
  };

}());

// Ref: https://gist.github.com/mfirmin/456e1c6dcf7b0e1bda6e940add32adad
// This function converts a Float16 stored as the bits of a Uint16 into a Javascript Number.
// Adapted from: https://gist.github.com/martinkallman/5049614
// input is a Uint16 (eg, new Uint16Array([value])[0])
function float16ToNumber(input) {
  // Create a 32 bit DataView to store the input
  const arr = new ArrayBuffer(4);
  const dv = new DataView(arr);

  // Set the Float16 into the last 16 bits of the dataview
  // So our dataView is [00xx]
  dv.setUint16(2, input, false);

  // Get all 32 bits as a 32 bit integer
  // (JS bitwise operations are performed on 32 bit signed integers)
  const asInt32 = dv.getInt32(0, false);

  // All bits aside from the sign
  let rest = asInt32 & 0x7fff;
  // Sign bit
  let sign = asInt32 & 0x8000;
  // Exponent bits
  const exponent = asInt32 & 0x7c00;

  // Shift the non-sign bits into place for a 32 bit Float
  rest <<= 13;
  // Shift the sign bit into place for a 32 bit Float
  sign <<= 16;

  // Adjust bias
  // https://en.wikipedia.org/wiki/Half-precision_floating-point_format#Exponent_encoding
  rest += 0x38000000;
  // Denormals-as-zero
  rest = (exponent === 0 ? 0 : rest);
  // Re-insert sign bit
  rest |= sign;

  // Set the adjusted float32 (stored as int32) back into the dataview
  dv.setInt32(0, rest, false);

  // Get it back out as a float32 (which js will convert to a Number)
  const asFloat32 = dv.getFloat32(0, false);

  return asFloat32;
}

function getWebGLContext (canvas) {
  const params = {
    alpha: false,
    depth: false,
    stencil: false,
    antialias: false,
  };

  let gl = canvas.getContext('webgl2', params);
  const isWebGL2 = !!gl;
  if (!isWebGL2) {
    gl = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
  }

  let halfFloat;
  let supportLinearFiltering;
  if (isWebGL2) {
    gl.getExtension('EXT_color_buffer_float');
    supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
  } else {
    halfFloat = gl.getExtension('OES_texture_half_float');
    supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
  }

  gl.clearColor(0.0, 0.0, 0.0, 1.0);

  const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;
  const floatTexType = gl.FLOAT;
  let formatRGBA16F;
  let formatRGBA32F;
  let formatRG16F;
  let formatRG32F;
  let formatR16F;
  let formatR32F;

  if (isWebGL2) {
    formatRGBA16F = getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, halfFloatTexType);
    formatRGBA32F = getSupportedFormat(gl, gl.RGBA32F, gl.RGBA, floatTexType);
    formatRG16F = getSupportedFormat(gl, gl.RG16F, gl.RG, halfFloatTexType);
    formatRG32F = getSupportedFormat(gl, gl.RG32F, gl.RG, floatTexType);
    formatR16F = getSupportedFormat(gl, gl.R16F, gl.RED, halfFloatTexType);
    formatR32F = getSupportedFormat(gl, gl.R32F, gl.RED, floatTexType);
  } else {
    formatRGBA16F = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    formatRGBA32F = getSupportedFormat(gl, gl.RGBA, gl.RGBA, floatTexType);
    formatRG16F = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    formatRG32F = getSupportedFormat(gl, gl.RGBA, gl.RGBA, floatTexType);
    formatR16F = getSupportedFormat(gl, gl.RGBA, gl.RGBA, halfFloatTexType);
    formatR32F = getSupportedFormat(gl, gl.RGBA, gl.RGBA, floatTexType);
  }

  if (formatRGBA16F == null) {
    console.log(isWebGL2 ? 'webgl2' : 'webgl', 'not supported');
  } else {
    console.log(isWebGL2 ? 'webgl2' : 'webgl', 'supported');
  }

  return {
    gl,
    ext: {
      formatRGBA16F,
      formatRGBA32F,
      formatRG16F,
      formatRG32F,
      formatR16F,
      formatR32F,
      floatTexType,
      halfFloatTexType,
      supportLinearFiltering,
    },
  };
}

function getSupportedFormat (gl, internalFormat, format, type) {
  if (!supportRenderTextureFormat(gl, internalFormat, format, type)) {
    switch (internalFormat) {
      case gl.R16F:
        return getSupportedFormat(gl, gl.RG16F, gl.RG, type);
      case gl.RG16F:
        return getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, type);
      default:
        return null;
    }
  }

  return {
    internalFormat,
    format,
  };
}

function supportRenderTextureFormat (gl, internalFormat, format, type) {
  let texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

  let fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status != gl.FRAMEBUFFER_COMPLETE) {
    return false;
  }
  return true;
}

/*
Compiles a shader of the given type (either gl.VERTEX_SHADER or gl.FRAGMENT_SHADER) and source code (string).
Returns the WebGL shader handler.
*/
function compileShader (gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw gl.getShaderInfoLog(shader);
  }

  return shader;
}

function pointerPrototype () {
  this.id = -1;
  this.x = 0;
  this.y = 0;
  this.dx = 0;
  this.dy = 0;
  this.down = false;
  this.moved = false;
  this.color = {
    r: 0.10,
    g: 0.04,
    b: 0.12,
  };
}

// Make an SVG diagram illustrating the vector field u(x, y) = (y, -x) via a grid where
// each cell contains an arrow indicating the velocity of the cell coordinate.
export function makeVectorFieldGridDiagram(svg) {
  const width = svg.width.baseVal.value;
  const height = svg.height.baseVal.value;
  const N = 16;
  let res = "";

  const cellWidth = width / N;
  const cellHeight = height / N;
  const dotRadius = 1.5;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const cx = cellWidth * (j + 0.5);
      const cy = cellHeight * (i + 0.5);
      // clip space coords
      const clipX = ((j + 0.5) / N) * 2.0 - 1.0;
      const clipY = ((i + 0.5) / N) * -2.0 + 1.0;
      // velocity
      const uClipX = clipY;
      const uClipY = -clipX;
      const arrowScale = 16;
      // arrow end coords
      const tipX = cx + uClipX*arrowScale;
      const tipY = cy - uClipY*arrowScale; // subtract since pixel coords increase downwards
      const triangleScale = 2.5;
      // normalize velocity direction
      const uLen = Math.sqrt(uClipX * uClipX + uClipY * uClipY);
      const uNormX = uClipX / uLen;
      const uNormY = uClipY / uLen;
      // get triangle vertices by moving down arrow, then move along tangent
      const aX = tipX - uNormX * triangleScale + uNormY * triangleScale;
      const aY = tipY - (-uNormY) * triangleScale - (-uNormX) * triangleScale;
      const bX = tipX - uNormX * triangleScale - uNormY * triangleScale;
      const bY = tipY - (-uNormY) * triangleScale + (-uNormX) * triangleScale;

      // grid dot
      res += `<circle cx="${cx}" cy="${cy}" r="${dotRadius}" fill="black" stroke="none" />`;
      // velocity arrow
      res += `<line x1="${cx}" y1="${cy}" x2="${tipX}" y2="${tipY}" stroke="rgba(195, 75, 232.5, 255)" stroke-width="0.75" />`;
      res += `<polygon points="${tipX},${tipY} ${aX},${aY} ${bX},${bY}" fill="rgba(195, 75, 232.5, 255)" stroke="none" />`
    }
  }

  svg.innerHTML = res;
}

export function makeVelocityFieldSimulation(canvas) {
  /*
  class GLProgram

  Encapsulates a WebGL program with vertex and fragment shader.
  */
  class GLProgram {
    constructor (vertexShader, fragmentShader) {
      this.uniforms = {}; // contains location of uniforms indexed by variable name.
      this.program = gl.createProgram(); // the WebGL program.

      gl.attachShader(this.program, vertexShader);
      gl.attachShader(this.program, fragmentShader);
      gl.linkProgram(this.program);

      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        throw gl.getProgramInfoLog(this.program);
      }

      const uniformCount = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < uniformCount; i++) {
        const uniformName = gl.getActiveUniform(this.program, i).name;
        this.uniforms[uniformName] = gl.getUniformLocation(this.program, uniformName);
      }
    }

    bind () {
      gl.useProgram(this.program);
    }
  }
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  const { gl, ext } = getWebGLContext(canvas);
  let config = {
    DYE_RESOLUTION: 1024,
    DENSITY_DISSIPATION: 0.999,
    PARTICLE_RESOLUTION: 32,
    SIM_RESOLUTION: 1024,
    SPLAT_RADIUS: 0.3,
  };
  let LAST_TEX_ID = 0;
  let pointers = [new pointerPrototype()];

  let simRes = getResolution(config.SIM_RESOLUTION);
  let dyeRes = getResolution(config.DYE_RESOLUTION);
  let particleRes = { width: config.PARTICLE_RESOLUTION, height: config.PARTICLE_RESOLUTION };

  let simWidth = simRes.width;
  let simHeight = simRes.height;
  let dyeWidth = dyeRes.width;
  let dyeHeight = dyeRes.height;
  let particleResWidth = particleRes.width;
  let particleResHeight = particleRes.height;

  let density;
  let velocity;
  let particleData;

  const shaders = {
    advectionManualFilteringShader: compileShader(gl, gl.FRAGMENT_SHADER, advectionManualFilteringShaderSource),
    advectionShader: compileShader(gl, gl.FRAGMENT_SHADER, advectionShaderSource),
    baseVertexShader: compileShader(gl, gl.VERTEX_SHADER, baseVertexShaderSource),
    circularVelocityFieldShader: compileShader(gl, gl.FRAGMENT_SHADER, circularVelocityFieldShaderSource),
    displayShader: compileShader(gl, gl.FRAGMENT_SHADER, displayShaderSource),
    particlesAdvectionShader: compileShader(gl, gl.FRAGMENT_SHADER, particlesAdvectionShaderSource),
    particlesRenderShader: compileShader(gl, gl.FRAGMENT_SHADER, particlesRenderShaderSource),
    particlesVertexShader: compileShader(gl, gl.VERTEX_SHADER, particlesVertexShaderSource),
    splatShader: compileShader(gl, gl.FRAGMENT_SHADER, splatShaderSource),
  };

  let advectionProgram =
    new GLProgram(
      shaders.baseVertexShader,
      ext.supportLinearFiltering ? shaders.advectionShader : shaders.advectionManualFilteringShader
    );
  let displayProgram            = new GLProgram(shaders.baseVertexShader, shaders.displayShader);
  let splatProgram              = new GLProgram(shaders.baseVertexShader, shaders.splatShader);
  let velocityFieldProgram      = new GLProgram(shaders.baseVertexShader, shaders.circularVelocityFieldShader);

  let particlesAdvectionProgram = new GLProgram(shaders.baseVertexShader, shaders.particlesAdvectionShader);
  let particlesRenderProgram    = new GLProgram(shaders.particlesVertexShader, shaders.particlesRenderShader);

  /*
  Render quad to a specified framebuffer `destination`. If null, render to the default framebuffer.
  */
  const blit = (() => {
    const quadVertexBuffer = gl.createBuffer();
    const quadElementBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadElementBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

    return (destination) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexBuffer);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };
  })();
  const blitParticles = (() => {
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    // Each particle is a vertex, the vertex attributes (2 floats)
    // are the UV coords which point to texel containing particle data
    // in the particleData texture
    const particles = new Float32Array(particleResWidth * particleResHeight * 2);
    for (let i = 0; i < particleResHeight; i++) {
      for (let j = 0; j < particleResWidth; j++) {
        particles[(i * particleResWidth + j) * 2] = (i + 0.5) / particleResHeight;
        particles[(i * particleResWidth + j) * 2 + 1] = (j + 0.5) / particleResWidth;
      }
    }
    gl.bufferData(gl.ARRAY_BUFFER, particles, gl.STATIC_DRAW);

    return (destination) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      const particleUVLocation = gl.getAttribLocation(particlesRenderProgram.program, "particleUV");
      gl.vertexAttribPointer(particleUVLocation, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(particleUVLocation);
      gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
      gl.drawArrays(gl.POINTS, 0, particleResWidth * particleResHeight);
    };
  })();
  // For debugging
  const readParticle16 = (x, y, source) => {
    const texType = ext.halfFloatTexType;
    const rg = ext.formatRG16F;
    // each particleData texel is 2 half floats (16 bits each)
    const dest = new Uint16Array(2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, source);
    gl.readPixels(x, y, 1, 1, rg.format, texType, dest);
    const particleX = float16ToNumber(new Uint16Array(dest.buffer, 0, 1));
    const particleY = float16ToNumber(new Uint16Array(dest.buffer, 2, 1));
    return {
      x: particleX,
      y: particleY
    };
  };
  const readParticle32 = (x, y, source) => {
    const texType = ext.floatTexType;
    const rg = ext.formatRG16F;
    // each particleData texel is 2 floats (32 bits each)
    const dest = new Float32Array(2);
    gl.bindFramebuffer(gl.FRAMEBUFFER, source);
    gl.readPixels(x, y, 1, 1, rg.format, texType, dest);
    const particleX = dest[0];
    const particleY = dest[1];
    return {
      x: particleX,
      y: particleY
    };
  };

  function getResolution (resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) {
      aspectRatio = 1.0 / aspectRatio;
    }

    let max = resolution * aspectRatio;
    let min = resolution;

    if (gl.drawingBufferWidth > gl.drawingBufferHeight) {
      return { width: max, height: min };
    } else {
      return { width: min, height: max };
    }
  }

  function initFramebuffers() {
    const texType = ext.halfFloatTexType;

    density = createDoubleFBO(
      dyeWidth,
      dyeHeight,
      ext.formatRGBA16F.internalFormat,
      ext.formatRGBA16F.format,
      texType,
      ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST,
    );
    velocity = createFBO(
      simWidth,
      simHeight,
      ext.formatRG16F.internalFormat,
      ext.formatRG16F.format,
      texType,
      ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST,
    );
    particleData = createDoubleFBO(
      particleResWidth,
      particleResHeight,
      ext.formatRG32F.internalFormat,
      ext.formatRG32F.format,
      ext.floatTexType,
      gl.NEAREST
    );

    // Initialize particle data with random positions.
    const particleDataInit = new Float32Array(particleResWidth * particleResHeight * 2);
    for (let i = 0; i < particleResHeight; i++) {
      for (let j = 0; j < particleResWidth; j++) {
        particleDataInit[(i*particleResWidth + j)*2] = Math.random() * 2 - 1.0;
        particleDataInit[(i*particleResWidth + j)*2 + 1] = Math.random() * 2 - 1.0;
      }
    }
    gl.activeTexture(gl.TEXTURE0 + particleData.write.texId);
    gl.texImage2D(gl.TEXTURE_2D, 0, ext.formatRG32F.internalFormat, particleResWidth, particleResHeight, 0, ext.formatRG32F.format, ext.floatTexType, particleDataInit);
    particleData.swap();

    // Initialize the fixed velocity field.
    gl.viewport(0, 0, simWidth, simHeight);
    velocityFieldProgram.bind();
    gl.uniform1f(velocityFieldProgram.uniforms.uSpeedMultiplier, 0.05);
    blit(velocity.fbo);
  }

  function createFBO (w, h, internalFormat, format, type, filter) {
    const texId = LAST_TEX_ID++;
    gl.activeTexture(gl.TEXTURE0 + texId);
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      texture,
      fbo,
      texId,
    };
  }

  function createDoubleFBO (w, h, internalFormat, format, type, filter) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, filter);
    let fbo2 = createFBO(w, h, internalFormat, format, type, filter);

    return {
      get read () {
        return fbo1;
      },
      get write () {
        return fbo2;
      },
      swap () {
        let temp = fbo1;
        fbo1 = fbo2;
        fbo2 = temp;
      },
    };
  }

  function update () {
    resizeCanvas();
    input();
    step(0.016);
    render();
    requestAnimationFrame(update);
  }

  function input () {
    for (let i = 0; i < pointers.length; i++) {
      const pointer = pointers[i];
      if (pointer.moved) {
        splat(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
        pointer.moved = false;
      }
    }
  }

  function resizeCanvas () {
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      initFramebuffers();
    }
  }

  function render () {
    let width = gl.drawingBufferWidth;
    let height = gl.drawingBufferHeight;

    gl.viewport(0, 0, width, height);

    displayProgram.bind();
    gl.uniform1i(displayProgram.uniforms.uTexture, density.read.texId);
    blit(null);

    particlesRenderProgram.bind();
    gl.uniform1i(particlesRenderProgram.uniforms.particleData, particleData.read.texId);
    gl.uniform1f(particlesRenderProgram.uniforms.size, 2.0);
    gl.uniform2f(particlesRenderProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform3f(particlesRenderProgram.uniforms.color, 1.0, 1.0, 1.0);
    blitParticles(null);
  }

  function splat (x, y, dx, dy, color) {
    gl.viewport(0, 0, simWidth, simHeight);
    splatProgram.bind();

    gl.viewport(0, 0, dyeWidth, dyeHeight);
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
    gl.uniform1i(splatProgram.uniforms.uTarget, density.read.texId);
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
    gl.uniform1f(splatProgram.uniforms.radius, config.SPLAT_RADIUS / 100.0);
    gl.uniform1f(splatProgram.uniforms.useMax, false);
    blit(density.write.fbo);
    density.swap();
  }

  /*
  Update the programs by delta time.
  */
 let stepNumber = 0;
  function step (dt) {
    stepNumber++;
    gl.viewport(0, 0, simWidth, simHeight);

    // Advect density (color) through the velocity field.
    advectionProgram.bind();
    gl.viewport(0, 0, dyeWidth, dyeHeight);
    // Unlike the fire demo program, don't scale velocity field by texel size.
    // Instead, scale by 0.5 so that velocity is in clip space units per sec,
    // not UV-space units per sec
    gl.uniform2f(advectionProgram.uniforms.texelSize, 0.5, 0.5);
    if (!ext.supportLinearFiltering) {
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, 0.5, 0.5);
    }
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.texId);
    gl.uniform1i(advectionProgram.uniforms.uSource, density.read.texId);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
    blit(density.write.fbo);
    density.swap();

    // Advect particles through the velocity field.
    particlesAdvectionProgram.bind();
    gl.viewport(0, 0, particleResWidth, particleResHeight);
    gl.uniform1i(particlesAdvectionProgram.uniforms.uVelocity, velocity.texId);
    // Not sure why, but particle velocity multiplier needs to be 2x dye velocity
    gl.uniform1f(particlesAdvectionProgram.uniforms.uSpeedMultiplier, 0.05);
    gl.uniform1f(particlesAdvectionProgram.uniforms.dt, dt);
    gl.uniform1i(particlesAdvectionProgram.uniforms.particleData, particleData.read.texId);
    blit(particleData.write.fbo);
    particleData.swap();
  }

  canvas.addEventListener('mousemove', (e) => {
    pointers[0].moved = pointers[0].down;
    pointers[0].dx = (e.offsetX - pointers[0].x) * 5.0;
    pointers[0].dy = (e.offsetY - pointers[0].y) * 5.0;
    pointers[0].x = e.offsetX;
    pointers[0].y = e.offsetY;
  });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
      let pointer = pointers[i];
      pointer.moved = pointer.down;
      const offsetX = touches[i].clientX - canvas.getBoundingClientRect().x;
      const offsetY = touches[i].clientY - canvas.getBoundingClientRect().y;
      pointer.dx = (offsetX - pointer.x) * 8.0;
      pointer.dy = (offsetY - pointer.y) * 8.0;
      pointer.x = offsetX;
      pointer.y = offsetY;
    }
  }, false);

  canvas.addEventListener('mousedown', (e) => {
    pointers[0].down = true;
    e.preventDefault();
  });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
      if (i >= pointers.length) {
        pointers.push(new pointerPrototype());
      }

      pointers[i].id = touches[i].identifier;
      pointers[i].down = true;
      const offsetX = touches[i].clientX - canvas.getBoundingClientRect().x;
      const offsetY = touches[i].clientY - canvas.getBoundingClientRect().y;
      pointers[i].x = offsetX;
      pointers[i].y = offsetY;
    }
  });

  window.addEventListener('mouseup', () => {
    pointers[0].down = false;
  });

  window.addEventListener('touchend', (e) => {
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++)
      for (let j = 0; j < pointers.length; j++)
        if (touches[i].identifier == pointers[j].id)
          pointers[j].down = false;
  });

  initFramebuffers();

  update();
}

export function makeVorticitySimulation(canvas) {
  /*
  class GLProgram

  Encapsulates a WebGL program with vertex and fragment shader.
  */
  class GLProgram {
    constructor (vertexShader, fragmentShader) {
      this.uniforms = {}; // contains location of uniforms indexed by variable name.
      this.program = gl.createProgram(); // the WebGL program.

      gl.attachShader(this.program, vertexShader);
      gl.attachShader(this.program, fragmentShader);
      gl.linkProgram(this.program);

      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        throw gl.getProgramInfoLog(this.program);
      }

      const uniformCount = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < uniformCount; i++) {
        const uniformName = gl.getActiveUniform(this.program, i).name;
        this.uniforms[uniformName] = gl.getUniformLocation(this.program, uniformName);
      }
    }

    bind () {
      gl.useProgram(this.program);
    }
  }
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  let config = {
    BURN_TEMPERATURE: 1700,
    CONFINEMENT: 15,
    DISPLAY_MODE: 0,
    DYE_RESOLUTION: 512,
    DENSITY_DISSIPATION: 0.99,
    NOISE_BLENDING: 0.01,
    NOISE_VOLATILITY: 0.001,
    PRESSURE_DISSIPATION: 0.8,
    PRESSURE_ITERATIONS: 20,
    SIM_RESOLUTION: 256,
    SPLAT_RADIUS: 1.0,
    VELOCITY_DISSIPATION: 0.98,
  };
  let LAST_TEX_ID = 0;
  let pointers = [new pointerPrototype()];

  let simWidth;
  let simHeight;
  let dyeWidth;
  let dyeHeight;

  let curl;
  let density;
  let divergence;
  let noise;
  let pressure;
  let velocity;

  let addNoiseProgram;
  let advectionProgram;
  let clearProgram;
  let curlProgram;
  let displayProgram;
  let divergenceProgram;
  let pressureIterationProgram;
  let projectionProgram;
  let splatProgram;
  let vorticityConfinementProgram;

  const { gl, ext } = getWebGLContext(canvas);

  const shaders = {
    addNoiseShader: compileShader(gl, gl.FRAGMENT_SHADER, addNoiseShaderSource),
    advectionManualFilteringShader: compileShader(gl, gl.FRAGMENT_SHADER, advectionManualFilteringShaderSource),
    advectionShader: compileShader(gl, gl.FRAGMENT_SHADER, advectionShaderSource),
    baseVertexShader: compileShader(gl, gl.VERTEX_SHADER, baseVertexShaderSource),
    clearShader: compileShader(gl, gl.FRAGMENT_SHADER, clearShaderSource),
    curlShader: compileShader(gl, gl.FRAGMENT_SHADER, curlShaderSource),
    displayShader: compileShader(gl, gl.FRAGMENT_SHADER, displayShaderSource),
    divergenceShader: compileShader(gl, gl.FRAGMENT_SHADER, divergenceShaderSource),
    pressureIterationShader: compileShader(gl, gl.FRAGMENT_SHADER, pressureIterationShaderSource),
    projectionShader: compileShader(gl, gl.FRAGMENT_SHADER, projectionShaderSource),
    splatShader: compileShader(gl, gl.FRAGMENT_SHADER, splatShaderSource),
    vorticityConfinementShader: compileShader(gl, gl.FRAGMENT_SHADER, vorticityConfinementShaderSource),
  };

  /*
  Render quad to a specified framebuffer `destination`. If null, render to the default framebuffer.
  */
  const blit = (() => {
    const quadVertexBuffer = gl.createBuffer();
    const quadElementBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadElementBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

    return (destination) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexBuffer);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };
  })();

  function getResolution (resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) {
      aspectRatio = 1.0 / aspectRatio;
    }

    let max = resolution * aspectRatio;
    let min = resolution;

    if (gl.drawingBufferWidth > gl.drawingBufferHeight) {
      return { width: max, height: min };
    } else {
      return { width: min, height: max };
    }
  }

  function initFramebuffers() {
    let simRes = getResolution(config.SIM_RESOLUTION);
    let dyeRes = getResolution(config.DYE_RESOLUTION);

    simWidth = simRes.width;
    simHeight = simRes.height;
    dyeWidth = dyeRes.width;
    dyeHeight = dyeRes.height;

    const texType = ext.halfFloatTexType;
    const rgba = ext.formatRGBA16F;
    const rg = ext.formatRG16F;
    const r = ext.formatR16F;

    curl = createFBO(
      simWidth,
      simHeight,
      r.internalFormat,
      r.format,
      texType,
      gl.NEAREST,
    );
    density = createDoubleFBO(
      dyeWidth,
      dyeHeight,
      rgba.internalFormat,
      rgba.format,
      texType,
      ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST,
    );
    divergence = createFBO(
      simWidth,
      simHeight,
      r.internalFormat,
      r.format,
      texType,
      gl.NEAREST,
    );
    noise = createDoubleFBO(
      simWidth,
      simHeight,
      r.internalFormat,
      r.format,
      texType,
      ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST,
    );
    pressure = createDoubleFBO(
      simWidth,
      simHeight,
      r.internalFormat,
      r.format,
      texType,
      gl.NEAREST,
    );
    velocity = createDoubleFBO(
      simWidth,
      simHeight,
      rg.internalFormat,
      rg.format,
      texType,
      ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST,
    );
  }

  function createFBO (w, h, internalFormat, format, type, filter) {
    const texId = LAST_TEX_ID++;
    gl.activeTexture(gl.TEXTURE0 + texId);
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      texture,
      fbo,
      texId,
    };
  }

  function createDoubleFBO (w, h, internalFormat, format, type, filter) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, filter);
    let fbo2 = createFBO(w, h, internalFormat, format, type, filter);

    return {
      get read () {
        return fbo1;
      },
      get write () {
        return fbo2;
      },
      swap () {
        let temp = fbo1;
        fbo1 = fbo2;
        fbo2 = temp;
      },
    };
  }

  function update () {
    resizeCanvas();
    input();
    step(0.016);
    render();
    requestAnimationFrame(update);
  }

  function input () {
    for (let i = 0; i < pointers.length; i++) {
      const pointer = pointers[i];
      if (pointer.moved) {
        splat(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
        pointer.moved = false;
      }
    }
  }

  function resizeCanvas () {
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      initFramebuffers();
    }
  }

  function render () {
    let width = gl.drawingBufferWidth;
    let height = gl.drawingBufferHeight;

    gl.viewport(0, 0, width, height);

    displayProgram.bind();
    gl.uniform1i(displayProgram.uniforms.uTexture, density.read.texId);
    blit(null);
  }

  function splat (x, y, dx, dy, color) {
    gl.viewport(0, 0, simWidth, simHeight);
    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.texId);
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
    gl.uniform3f(splatProgram.uniforms.color, dx, -dy, 1.0);
    gl.uniform1f(splatProgram.uniforms.radius, config.SPLAT_RADIUS / 100.0);
    gl.uniform1f(splatProgram.uniforms.useMax, false);
    blit(velocity.write.fbo);
    velocity.swap();

    gl.viewport(0, 0, dyeWidth, dyeHeight);
    gl.uniform1i(splatProgram.uniforms.uTarget, density.read.texId);
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
    gl.uniform1f(splatProgram.uniforms.radius, config.SPLAT_RADIUS / 100.0);
    gl.uniform1f(splatProgram.uniforms.useMax, false);
    blit(density.write.fbo);
    density.swap();
  }

  /*
  Update the programs by delta time.
  */
  function step (dt) {
    gl.viewport(0, 0, simWidth, simHeight);

    // Advection step.
    // Advect velocity through the velocity field.
    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    if (!ext.supportLinearFiltering) {
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, 1.0 / simWidth, 1.0 / simHeight);
    }
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.texId);
    gl.uniform1i(advectionProgram.uniforms.uSource, velocity.read.texId);
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
    blit(velocity.write.fbo);
    velocity.swap();

    // Do vorticity confinement on the velocity field.
    // First, compute curl of the velocity.
    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.texId);
    gl.uniform1i(curlProgram.uniforms.uNoise, noise.read.texId);
    gl.uniform1f(curlProgram.uniforms.blendLevel, config.NOISE_BLENDING);
    blit(curl.fbo);
    // Confine vortices.
    vorticityConfinementProgram.bind();
    gl.uniform2f(vorticityConfinementProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(vorticityConfinementProgram.uniforms.uVelocity, velocity.read.texId);
    gl.uniform1i(vorticityConfinementProgram.uniforms.uCurl, curl.texId);
    gl.uniform1f(vorticityConfinementProgram.uniforms.confinement, config.CONFINEMENT);
    gl.uniform1f(vorticityConfinementProgram.uniforms.dt, dt);
    blit(velocity.write.fbo);
    velocity.swap();

    // Dissipate some pressure to give the illusion of an open box.
    clearProgram.bind();
    let pressureTexId = pressure.read.texId;
    gl.activeTexture(gl.TEXTURE0 + pressureTexId);
    gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
    gl.uniform1i(clearProgram.uniforms.uTexture, pressureTexId);
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE_DISSIPATION);
    blit(pressure.write.fbo);
    pressure.swap();

    // Projection step.
    gl.viewport(0, 0, simWidth, simHeight);
    // Compute velocity divergence field.
    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.texId);
    blit(divergence.fbo);
    // Solve for pressure field with Jacobi iteration.
    pressureIterationProgram.bind();
    gl.uniform1i(pressureIterationProgram.uniforms.uPressure, pressureTexId);
    gl.uniform2f(pressureIterationProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(pressureIterationProgram.uniforms.uDivergence, divergence.texId);

    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
      blit(pressure.write.fbo);
      pressure.swap();
    }
    // Subtract pressure gradient from velocity field to project.
    projectionProgram.bind();
    gl.uniform2f(projectionProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(projectionProgram.uniforms.uPressure, pressure.read.texId);
    gl.uniform1i(projectionProgram.uniforms.uVelocity, velocity.read.texId);
    blit(velocity.write.fbo);
    velocity.swap();

    // Advect density (color) through the velocity field.
    advectionProgram.bind();
    gl.viewport(0, 0, dyeWidth, dyeHeight);
    if (!ext.supportLinearFiltering) {
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, 1.0 / dyeWidth, 1.0 / dyeHeight);
    }
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.texId);
    gl.uniform1i(advectionProgram.uniforms.uSource, density.read.texId);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
    blit(density.write.fbo);
    density.swap();
    // Advect noise.
    gl.uniform1i(advectionProgram.uniforms.uSource, noise.read.texId);
    gl.uniform1f(advectionProgram.uniforms.dissipation, 1.0);
    blit(noise.write.fbo);
    noise.swap();

    // Blend in some noise to the noise channel.
    addNoiseProgram.bind();
    gl.uniform2f(addNoiseProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1f(addNoiseProgram.uniforms.time, (new Date()).getTime() / 1.e4 % 1);
    gl.uniform1i(addNoiseProgram.uniforms.uTarget, noise.read.texId);
    gl.uniform1f(addNoiseProgram.uniforms.blendLevel, config.NOISE_VOLATILITY);
    blit(noise.write.fbo);
    noise.swap();
  }

  canvas.addEventListener('mousemove', (e) => {
    pointers[0].moved = pointers[0].down;
    pointers[0].dx = (e.offsetX - pointers[0].x) * 5.0;
    pointers[0].dy = (e.offsetY - pointers[0].y) * 5.0;
    pointers[0].x = e.offsetX;
    pointers[0].y = e.offsetY;
  });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
      let pointer = pointers[i];
      pointer.moved = pointer.down;
      const offsetX = touches[i].clientX - canvas.getBoundingClientRect().x;
      const offsetY = touches[i].clientY - canvas.getBoundingClientRect().y;
      pointer.dx = (offsetX - pointer.x) * 8.0;
      pointer.dy = (offsetY - pointer.y) * 8.0;
      pointer.x = offsetX;
      pointer.y = offsetY;
    }
  }, false);

  canvas.addEventListener('mousedown', (e) => {
    pointers[0].down = true;
    e.preventDefault();
  });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
      if (i >= pointers.length) {
        pointers.push(new pointerPrototype());
      }

      pointers[i].id = touches[i].identifier;
      pointers[i].down = true;
      const offsetX = touches[i].clientX - canvas.getBoundingClientRect().x;
      const offsetY = touches[i].clientY - canvas.getBoundingClientRect().y;
      pointers[i].x = offsetX;
      pointers[i].y = offsetY;
    }
  });

  window.addEventListener('mouseup', () => {
    pointers[0].down = false;
  });

  window.addEventListener('touchend', (e) => {
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++)
      for (let j = 0; j < pointers.length; j++)
        if (touches[i].identifier == pointers[j].id)
          pointers[j].down = false;
  });

  advectionProgram =
    new GLProgram(
      shaders.baseVertexShader,
      ext.supportLinearFiltering ? shaders.advectionShader : shaders.advectionManualFilteringShader
    );
  addNoiseProgram           = new GLProgram(shaders.baseVertexShader, shaders.addNoiseShader);
  clearProgram              = new GLProgram(shaders.baseVertexShader, shaders.clearShader);
  curlProgram               = new GLProgram(shaders.baseVertexShader, shaders.curlShader);
  displayProgram            = new GLProgram(shaders.baseVertexShader, shaders.displayShader);
  divergenceProgram         = new GLProgram(shaders.baseVertexShader, shaders.divergenceShader);
  pressureIterationProgram  = new GLProgram(shaders.baseVertexShader, shaders.pressureIterationShader);
  projectionProgram         = new GLProgram(shaders.baseVertexShader, shaders.projectionShader);
  splatProgram              = new GLProgram(shaders.baseVertexShader, shaders.splatShader);
  vorticityConfinementProgram = new GLProgram(shaders.baseVertexShader, shaders.vorticityConfinementShader);

  initFramebuffers();

  // Initialize the noise channel.
  addNoiseProgram.bind();
  gl.uniform2f(addNoiseProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
  gl.uniform1f(addNoiseProgram.uniforms.time, (new Date()).getTime() / 1.e6 % 1);
  gl.uniform1i(addNoiseProgram.uniforms.uTarget, noise.read.texId);
  gl.uniform1f(addNoiseProgram.uniforms.blendLevel, 1.0);
  blit(noise.write.fbo);
  noise.swap();

  update();
}

export function makeSmokeSimulation(canvas) {
  /*
  class GLProgram

  Encapsulates a WebGL program with vertex and fragment shader.
  */
  class GLProgram {
    constructor (vertexShader, fragmentShader) {
      this.uniforms = {}; // contains location of uniforms indexed by variable name.
      this.program = gl.createProgram(); // the WebGL program.

      gl.attachShader(this.program, vertexShader);
      gl.attachShader(this.program, fragmentShader);
      gl.linkProgram(this.program);

      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        throw gl.getProgramInfoLog(this.program);
      }

      const uniformCount = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < uniformCount; i++) {
        const uniformName = gl.getActiveUniform(this.program, i).name;
        this.uniforms[uniformName] = gl.getUniformLocation(this.program, uniformName);
      }
    }

    bind () {
      gl.useProgram(this.program);
    }
  }
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  let config = {
    BUOYANCY: 0.2,
    BURN_TEMPERATURE: 1700,
    CONFINEMENT: 5,
    COOLING: 3000,
    DISPLAY_MODE: 0,
    DYE_RESOLUTION: 512,
    FUEL_DISSIPATION: 0.92,
    DENSITY_DISSIPATION: 0.999,
    NOISE_BLENDING: 0.5,
    NOISE_VOLATILITY: 0.1,
    PRESSURE_DISSIPATION: 0.8,
    PRESSURE_ITERATIONS: 20,
    SIM_RESOLUTION: 256,
    SPLAT_RADIUS: 0.7,
    VELOCITY_DISSIPATION: 0.98,
  };
  let LAST_TEX_ID = 0;
  let pointers = [new pointerPrototype()];
  let fireSources = [];

  let simWidth;
  let simHeight;
  let dyeWidth;
  let dyeHeight;

  let curl;
  let density;
  let divergence;
  let fuel;
  let noise;
  let pressure;
  let temperature;
  let velocity;

  let addNoiseProgram;
  let advectionProgram;
  let buoyancyProgram;
  let clearProgram;
  let combustionProgram;
  let curlProgram;
  let displayProgram;
  let divergenceProgram;
  let pressureIterationProgram;
  let projectionProgram;
  let splatProgram;
  let vorticityConfinementProgram;

  const { gl, ext } = getWebGLContext(canvas);

  const shaders = {
    addNoiseShader: compileShader(gl, gl.FRAGMENT_SHADER, addNoiseShaderSource),
    advectionManualFilteringShader: compileShader(gl, gl.FRAGMENT_SHADER, advectionManualFilteringShaderSource),
    advectionShader: compileShader(gl, gl.FRAGMENT_SHADER, advectionShaderSource),
    baseVertexShader: compileShader(gl, gl.VERTEX_SHADER, baseVertexShaderSource),
    buoyancyShader: compileShader(gl, gl.FRAGMENT_SHADER, buoyancyShaderSource),
    clearShader: compileShader(gl, gl.FRAGMENT_SHADER, clearShaderSource),
    combustionShader: compileShader(gl, gl.FRAGMENT_SHADER, combustionShaderSource),
    curlShader: compileShader(gl, gl.FRAGMENT_SHADER, curlShaderSource),
    displayShader: compileShader(gl, gl.FRAGMENT_SHADER, displayShaderSource),
    displayFireShader: compileShader(gl, gl.FRAGMENT_SHADER, displayFireShaderSource),
    divergenceShader: compileShader(gl, gl.FRAGMENT_SHADER, divergenceShaderSource),
    pressureIterationShader: compileShader(gl, gl.FRAGMENT_SHADER, pressureIterationShaderSource),
    projectionShader: compileShader(gl, gl.FRAGMENT_SHADER, projectionShaderSource),
    splatShader: compileShader(gl, gl.FRAGMENT_SHADER, splatShaderSource),
    vorticityConfinementShader: compileShader(gl, gl.FRAGMENT_SHADER, vorticityConfinementShaderSource),
  };

  /*
  Render quad to a specified framebuffer `destination`. If null, render to the default framebuffer.
  */
  const blit = (() => {
    const quadVertexBuffer = gl.createBuffer();
    const quadElementBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadElementBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

    return (destination) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexBuffer);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };
  })();

  function getResolution (resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) {
      aspectRatio = 1.0 / aspectRatio;
    }

    let max = resolution * aspectRatio;
    let min = resolution;

    if (gl.drawingBufferWidth > gl.drawingBufferHeight) {
      return { width: max, height: min };
    } else {
      return { width: min, height: max };
    }
  }

  function initFramebuffers() {
    let simRes = getResolution(config.SIM_RESOLUTION);
    let dyeRes = getResolution(config.DYE_RESOLUTION);

    simWidth = simRes.width;
    simHeight = simRes.height;
    dyeWidth = dyeRes.width;
    dyeHeight = dyeRes.height;

    const texType = ext.halfFloatTexType;
    const rgba = ext.formatRGBA16F;
    const rg = ext.formatRG16F;
    const r = ext.formatR16F;

    curl = createFBO(
      simWidth,
      simHeight,
      r.internalFormat,
      r.format,
      texType,
      gl.NEAREST,
    );
    density = createDoubleFBO(
      dyeWidth,
      dyeHeight,
      rgba.internalFormat,
      rgba.format,
      texType,
      ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST,
    );
    divergence = createFBO(
      simWidth,
      simHeight,
      r.internalFormat,
      r.format,
      texType,
      gl.NEAREST,
    );
    fuel = createDoubleFBO(
      simWidth,
      simHeight,
      r.internalFormat,
      r.format,
      texType,
      ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST,
    );
    noise = createDoubleFBO(
      simWidth,
      simHeight,
      r.internalFormat,
      r.format,
      texType,
      ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST,
    );
    pressure = createDoubleFBO(
      simWidth,
      simHeight,
      r.internalFormat,
      r.format,
      texType,
      gl.NEAREST,
    );
    temperature = createDoubleFBO(
      simWidth,
      simHeight,
      r.internalFormat,
      r.format,
      texType,
      ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST,
    );
    velocity = createDoubleFBO(
      simWidth,
      simHeight,
      rg.internalFormat,
      rg.format,
      texType,
      ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST,
    );
  }

  function createFBO (w, h, internalFormat, format, type, filter) {
    const texId = LAST_TEX_ID++;
    gl.activeTexture(gl.TEXTURE0 + texId);
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      texture,
      fbo,
      texId,
    };
  }

  function createDoubleFBO (w, h, internalFormat, format, type, filter) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, filter);
    let fbo2 = createFBO(w, h, internalFormat, format, type, filter);

    return {
      get read () {
        return fbo1;
      },
      get write () {
        return fbo2;
      },
      swap () {
        let temp = fbo1;
        fbo1 = fbo2;
        fbo2 = temp;
      },
    };
  }

  function update () {
    resizeCanvas();
    input();
    step(0.016);
    render();
    requestAnimationFrame(update);
  }

  function input () {
    for (let i = 0; i < pointers.length; i++) {
      const pointer = pointers[i];
      if (pointer.moved) {
        splat(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
        pointer.moved = false;
      }
    }
  }

  function resizeCanvas () {
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      initFramebuffers();
    }
  }

  function render () {
    let width = gl.drawingBufferWidth;
    let height = gl.drawingBufferHeight;

    gl.viewport(0, 0, width, height);

    displayProgram.bind();
    gl.uniform1i(displayProgram.uniforms.uTexture, density.read.texId);
    blit(null);
  }

  function splat (x, y, dx, dy, color) {
    gl.viewport(0, 0, simWidth, simHeight);
    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.texId);
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
    gl.uniform3f(splatProgram.uniforms.color, dx, -dy, 1.0);
    gl.uniform1f(splatProgram.uniforms.radius, config.SPLAT_RADIUS / 100.0);
    gl.uniform1f(splatProgram.uniforms.useMax, false);
    blit(velocity.write.fbo);
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.uTarget, fuel.read.texId);
    gl.uniform3f(splatProgram.uniforms.color, 1.0, 0.0, 0.0);
    gl.uniform1f(splatProgram.uniforms.radius, config.SPLAT_RADIUS / 100.0);
    gl.uniform1f(splatProgram.uniforms.useMax, true);
    blit(fuel.write.fbo);
    fuel.swap();

    gl.viewport(0, 0, dyeWidth, dyeHeight);
    gl.uniform1i(splatProgram.uniforms.uTarget, density.read.texId);
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
    gl.uniform1f(splatProgram.uniforms.radius, config.SPLAT_RADIUS / 100.0);
    gl.uniform1f(splatProgram.uniforms.useMax, false);
    blit(density.write.fbo);
    density.swap();
  }

  /*
  Update the programs by delta time.
  */
  function step (dt) {
    gl.viewport(0, 0, simWidth, simHeight);

    // Add fuel from particles to the *read* buffer.
    fireSources.forEach(fireSource => {
      fireSource.renderParticles(simWidth, simHeight, fuel.read.fbo, { r: 1.0, g: 0., b: 0. });
    });

    // Combustion step.
    // Burn fuel and cool temperature.
    combustionProgram.bind();
    gl.uniform2f(combustionProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(combustionProgram.uniforms.uFuel, fuel.read.texId);
    gl.uniform1i(combustionProgram.uniforms.uTemperature, temperature.read.texId);
    gl.uniform1i(combustionProgram.uniforms.uNoise, noise.read.texId);
    gl.uniform1f(combustionProgram.uniforms.noiseBlending, config.NOISE_BLENDING);
    gl.uniform1f(combustionProgram.uniforms.burnTemperature, config.BURN_TEMPERATURE);
    gl.uniform1f(combustionProgram.uniforms.cooling, config.COOLING);
    gl.uniform1f(combustionProgram.uniforms.dt, dt);
    blit(temperature.write.fbo);
    temperature.swap();

    // Advection step.
    // Advect velocity through the velocity field.
    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    if (!ext.supportLinearFiltering) {
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, 1.0 / simWidth, 1.0 / simHeight);
    }
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.texId);
    gl.uniform1i(advectionProgram.uniforms.uSource, velocity.read.texId);
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
    blit(velocity.write.fbo);
    velocity.swap();

    // Do vorticity confinement on the velocity field.
    // First, compute curl of the velocity.
    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.texId);
    gl.uniform1i(curlProgram.uniforms.uNoise, noise.read.texId);
    gl.uniform1f(curlProgram.uniforms.blendLevel, config.NOISE_BLENDING);
    blit(curl.fbo);
    // Confine vortices.
    vorticityConfinementProgram.bind();
    gl.uniform2f(vorticityConfinementProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(vorticityConfinementProgram.uniforms.uVelocity, velocity.read.texId);
    gl.uniform1i(vorticityConfinementProgram.uniforms.uCurl, curl.texId);
    gl.uniform1f(vorticityConfinementProgram.uniforms.confinement, config.CONFINEMENT);
    gl.uniform1f(vorticityConfinementProgram.uniforms.dt, dt);
    blit(velocity.write.fbo);
    velocity.swap();

    // Add thermal buoyancy to velocity.
    buoyancyProgram.bind();
    gl.uniform2f(buoyancyProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(buoyancyProgram.uniforms.uVelocity, velocity.read.texId);
    gl.uniform1i(buoyancyProgram.uniforms.uTemperature, temperature.read.texId);
    gl.uniform1f(buoyancyProgram.uniforms.buoyancy, config.BUOYANCY);
    gl.uniform1f(buoyancyProgram.uniforms.dt, dt);
    blit(velocity.write.fbo);
    velocity.swap();

    // Dissipate some pressure to give the illusion of an open box.
    clearProgram.bind();
    let pressureTexId = pressure.read.texId;
    gl.activeTexture(gl.TEXTURE0 + pressureTexId);
    gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
    gl.uniform1i(clearProgram.uniforms.uTexture, pressureTexId);
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE_DISSIPATION);
    blit(pressure.write.fbo);
    pressure.swap();

    // Projection step.
    gl.viewport(0, 0, simWidth, simHeight);
    // Compute velocity divergence field.
    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.texId);
    blit(divergence.fbo);
    // Solve for pressure field with Jacobi iteration.
    pressureIterationProgram.bind();
    gl.uniform1i(pressureIterationProgram.uniforms.uPressure, pressureTexId);
    gl.uniform2f(pressureIterationProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(pressureIterationProgram.uniforms.uDivergence, divergence.texId);

    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
      blit(pressure.write.fbo);
      pressure.swap();
    }
    // Subtract pressure gradient from velocity field to project.
    projectionProgram.bind();
    gl.uniform2f(projectionProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(projectionProgram.uniforms.uPressure, pressure.read.texId);
    gl.uniform1i(projectionProgram.uniforms.uVelocity, velocity.read.texId);
    blit(velocity.write.fbo);
    velocity.swap();

    // Advect density (color) through the velocity field.
    advectionProgram.bind();
    gl.viewport(0, 0, dyeWidth, dyeHeight);
    if (!ext.supportLinearFiltering) {
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, 1.0 / dyeWidth, 1.0 / dyeHeight);
    }
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.texId);
    gl.uniform1i(advectionProgram.uniforms.uSource, density.read.texId);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
    blit(density.write.fbo);
    density.swap();
    // Advect temperature.
    gl.viewport(0, 0, simWidth, simHeight);
    if (!ext.supportLinearFiltering) {
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, 1.0 / simWidth, 1.0 / simHeight);
    }
    gl.uniform1i(advectionProgram.uniforms.uSource, temperature.read.texId);
    gl.uniform1f(advectionProgram.uniforms.dissipation, 1.0);
    blit(temperature.write.fbo);
    temperature.swap();
    // Advect fuel.
    gl.uniform1i(advectionProgram.uniforms.uSource, fuel.read.texId);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.FUEL_DISSIPATION);
    blit(fuel.write.fbo);
    fuel.swap();
    // Advect noise.
    gl.uniform1i(advectionProgram.uniforms.uSource, noise.read.texId);
    gl.uniform1f(advectionProgram.uniforms.dissipation, 1.0);
    blit(noise.write.fbo);
    noise.swap();

    // Blend in some noise to the noise channel.
    addNoiseProgram.bind();
    gl.uniform2f(addNoiseProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1f(addNoiseProgram.uniforms.time, (new Date()).getTime() / 1.e4 % 1);
    gl.uniform1i(addNoiseProgram.uniforms.uTarget, noise.read.texId);
    gl.uniform1f(addNoiseProgram.uniforms.blendLevel, config.NOISE_VOLATILITY);
    blit(noise.write.fbo);
    noise.swap();

    fireSources.forEach(fireSource => fireSource.step(dt));
  }

  canvas.addEventListener('mousemove', (e) => {
    pointers[0].moved = pointers[0].down;
    pointers[0].dx = (e.offsetX - pointers[0].x) * 5.0;
    pointers[0].dy = (e.offsetY - pointers[0].y) * 5.0;
    pointers[0].x = e.offsetX;
    pointers[0].y = e.offsetY;
  });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
      let pointer = pointers[i];
      pointer.moved = pointer.down;
      const offsetX = touches[i].clientX - canvas.getBoundingClientRect().x;
      const offsetY = touches[i].clientY - canvas.getBoundingClientRect().y;
      pointer.dx = (offsetX - pointer.x) * 8.0;
      pointer.dy = (offsetY - pointer.y) * 8.0;
      pointer.x = offsetX;
      pointer.y = offsetY;
    }
  }, false);

  canvas.addEventListener('mousedown', (e) => {
    pointers[0].down = true;
    pointers[0].color = {
      r: 0.5,
      g: 0.5,
      b: 0.5
    };
    e.preventDefault();
  });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
      if (i >= pointers.length) {
        pointers.push(new pointerPrototype());
      }

      pointers[i].id = touches[i].identifier;
      pointers[i].down = true;
      const offsetX = touches[i].clientX - canvas.getBoundingClientRect().x;
      const offsetY = touches[i].clientY - canvas.getBoundingClientRect().y;
      pointers[i].x = offsetX;
      pointers[i].y = offsetY;
      pointers[i].color = {
        r: 0.5,
        g: 0.5,
        b: 0.5
      };
    }
  });

  window.addEventListener('mouseup', () => {
    pointers[0].down = false;
  });

  window.addEventListener('touchend', (e) => {
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++)
      for (let j = 0; j < pointers.length; j++)
        if (touches[i].identifier == pointers[j].id)
          pointers[j].down = false;
  });

  advectionProgram =
    new GLProgram(
      shaders.baseVertexShader,
      ext.supportLinearFiltering ? shaders.advectionShader : shaders.advectionManualFilteringShader
    );
  addNoiseProgram           = new GLProgram(shaders.baseVertexShader, shaders.addNoiseShader);
  buoyancyProgram           = new GLProgram(shaders.baseVertexShader, shaders.buoyancyShader);
  clearProgram              = new GLProgram(shaders.baseVertexShader, shaders.clearShader);
  combustionProgram         = new GLProgram(shaders.baseVertexShader, shaders.combustionShader);
  curlProgram               = new GLProgram(shaders.baseVertexShader, shaders.curlShader);
  displayProgram            = new GLProgram(shaders.baseVertexShader, shaders.displayShader);
  divergenceProgram         = new GLProgram(shaders.baseVertexShader, shaders.divergenceShader);
  pressureIterationProgram  = new GLProgram(shaders.baseVertexShader, shaders.pressureIterationShader);
  projectionProgram         = new GLProgram(shaders.baseVertexShader, shaders.projectionShader);
  splatProgram              = new GLProgram(shaders.baseVertexShader, shaders.splatShader);
  vorticityConfinementProgram = new GLProgram(shaders.baseVertexShader, shaders.vorticityConfinementShader);

  initFramebuffers();

  // Initialize the noise channel.
  addNoiseProgram.bind();
  gl.uniform2f(addNoiseProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
  gl.uniform1f(addNoiseProgram.uniforms.time, (new Date()).getTime() / 1.e6 % 1);
  gl.uniform1i(addNoiseProgram.uniforms.uTarget, noise.read.texId);
  gl.uniform1f(addNoiseProgram.uniforms.blendLevel, 1.0);
  blit(noise.write.fbo);
  noise.swap();

  update();
}

export function makeFireSimulation(canvas) {
  /*
  class GLProgram

  Encapsulates a WebGL program with vertex and fragment shader.
  */
  class GLProgram {
    constructor (vertexShader, fragmentShader) {
      this.uniforms = {}; // contains location of uniforms indexed by variable name.
      this.program = gl.createProgram(); // the WebGL program.

      gl.attachShader(this.program, vertexShader);
      gl.attachShader(this.program, fragmentShader);
      gl.linkProgram(this.program);

      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        throw gl.getProgramInfoLog(this.program);
      }

      const uniformCount = gl.getProgramParameter(this.program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < uniformCount; i++) {
        const uniformName = gl.getActiveUniform(this.program, i).name;
        this.uniforms[uniformName] = gl.getUniformLocation(this.program, uniformName);
      }
    }

    bind () {
      gl.useProgram(this.program);
    }
  }
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  let config = {
    BUOYANCY: 0.2,
    BURN_TEMPERATURE: 1700,
    CONFINEMENT: 15,
    COOLING: 3000,
    DISPLAY_MODE: 0,
    DYE_RESOLUTION: 512,
    FUEL_DISSIPATION: 0.92,
    DENSITY_DISSIPATION: 0.99,
    NOISE_BLENDING: 0.5,
    NOISE_VOLATILITY: 0.1,
    PRESSURE_DISSIPATION: 0.8,
    PRESSURE_ITERATIONS: 20,
    SIM_RESOLUTION: 256,
    SPLAT_RADIUS: 1.5,
    VELOCITY_DISSIPATION: 0.98,
  };
  let DISPLAY_MODES = ["Normal", "DebugFire", "DebugTemperature", "DebugFuel", "DebugPressure", "DebugDensity", "DebugNoise"];
  let LAST_TEX_ID = 0;
  let pointers = [new pointerPrototype()];
  let fireSources = [];

  let simWidth;
  let simHeight;
  let dyeWidth;
  let dyeHeight;

  let curl;
  let density;
  let divergence;
  let fuel;
  let noise;
  let pressure;
  let temperature;
  let velocity;

  let addNoiseProgram;
  let advectionProgram;
  let buoyancyProgram;
  let clearProgram;
  let combustionProgram;
  let curlProgram;
  let debugFireProgram;
  let debugFloatProgram;
  let displayProgram;
  let displayFireProgram;
  let divergenceProgram;
  let particlesAdvectionProgram;
  let particlesRenderProgram;
  let particlesResetDataProgram;
  let particlesResetLifespanProgram;
  let particlesStepLifespanProgram;
  let pressureIterationProgram;
  let projectionProgram;
  let rowProgram;
  let splatProgram;
  let vorticityConfinementProgram;

  const { gl, ext } = getWebGLContext(canvas);

  const shaders = {
    addNoiseShader: compileShader(gl, gl.FRAGMENT_SHADER, addNoiseShaderSource),
    advectionManualFilteringShader: compileShader(gl, gl.FRAGMENT_SHADER, advectionManualFilteringShaderSource),
    advectionShader: compileShader(gl, gl.FRAGMENT_SHADER, advectionShaderSource),
    baseVertexShader: compileShader(gl, gl.VERTEX_SHADER, baseVertexShaderSource),
    buoyancyShader: compileShader(gl, gl.FRAGMENT_SHADER, buoyancyShaderSource),
    clearShader: compileShader(gl, gl.FRAGMENT_SHADER, clearShaderSource),
    combustionShader: compileShader(gl, gl.FRAGMENT_SHADER, combustionShaderSource),
    curlShader: compileShader(gl, gl.FRAGMENT_SHADER, curlShaderSource),
    debugFireShader: compileShader(gl, gl.FRAGMENT_SHADER, debugFireShaderSource),
    debugFloatShader: compileShader(gl, gl.FRAGMENT_SHADER, debugFloatShaderSource),
    displayShader: compileShader(gl, gl.FRAGMENT_SHADER, displayShaderSource),
    displayFireShader: compileShader(gl, gl.FRAGMENT_SHADER, displayFireShaderSource),
    divergenceShader: compileShader(gl, gl.FRAGMENT_SHADER, divergenceShaderSource),
    particlesAdvectionShader: compileShader(gl, gl.FRAGMENT_SHADER, particlesAdvectionShaderSource),
    particlesRenderShader: compileShader(gl, gl.FRAGMENT_SHADER, particlesRenderShaderSource),
    particlesResetDataShader: compileShader(gl, gl.FRAGMENT_SHADER, particlesResetDataShaderSource),
    particlesResetLifespanShader: compileShader(gl, gl.FRAGMENT_SHADER, particlesResetLifespanShaderSource),
    particlesStepLifespanShader: compileShader(gl, gl.FRAGMENT_SHADER, particlesStepLifespanShaderSource),
    particlesVertexShader: compileShader(gl, gl.VERTEX_SHADER, particlesVertexShaderSource),
    pressureIterationShader: compileShader(gl, gl.FRAGMENT_SHADER, pressureIterationShaderSource),
    projectionShader: compileShader(gl, gl.FRAGMENT_SHADER, projectionShaderSource),
    rowShader: compileShader(gl, gl.FRAGMENT_SHADER, rowShaderSource),
    splatShader: compileShader(gl, gl.FRAGMENT_SHADER, splatShaderSource),
    vorticityConfinementShader: compileShader(gl, gl.FRAGMENT_SHADER, vorticityConfinementShaderSource),
  };

  /*
  Render quad to a specified framebuffer `destination`. If null, render to the default framebuffer.
  */
  const blit = (() => {
    const quadVertexBuffer = gl.createBuffer();
    const quadElementBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadElementBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

    return (destination) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, quadVertexBuffer);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.enableVertexAttribArray(0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, destination);
      gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
    };
  })();

  function getResolution (resolution) {
    let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
    if (aspectRatio < 1) {
      aspectRatio = 1.0 / aspectRatio;
    }

    let max = resolution * aspectRatio;
    let min = resolution;

    if (gl.drawingBufferWidth > gl.drawingBufferHeight) {
      return { width: max, height: min };
    } else {
      return { width: min, height: max };
    }
  }

  function initFramebuffers() {
    let simRes = getResolution(config.SIM_RESOLUTION);
    let dyeRes = getResolution(config.DYE_RESOLUTION);

    simWidth = simRes.width;
    simHeight = simRes.height;
    dyeWidth = dyeRes.width;
    dyeHeight = dyeRes.height;

    const texType = ext.halfFloatTexType;
    const rgba = ext.formatRGBA16F;
    const rg = ext.formatRG16F;
    const r = ext.formatR16F;

    curl = createFBO(
      simWidth,
      simHeight,
      r.internalFormat,
      r.format,
      texType,
      gl.NEAREST,
    );
    density = createDoubleFBO(
      dyeWidth,
      dyeHeight,
      rgba.internalFormat,
      rgba.format,
      texType,
      ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST,
    );
    divergence = createFBO(
      simWidth,
      simHeight,
      r.internalFormat,
      r.format,
      texType,
      gl.NEAREST,
    );
    fuel = createDoubleFBO(
      simWidth,
      simHeight,
      r.internalFormat,
      r.format,
      texType,
      ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST,
    );
    noise = createDoubleFBO(
      simWidth,
      simHeight,
      r.internalFormat,
      r.format,
      texType,
      ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST,
    );
    pressure = createDoubleFBO(
      simWidth,
      simHeight,
      r.internalFormat,
      r.format,
      texType,
      gl.NEAREST,
    );
    temperature = createDoubleFBO(
      simWidth,
      simHeight,
      r.internalFormat,
      r.format,
      texType,
      ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST,
    );
    velocity = createDoubleFBO(
      simWidth,
      simHeight,
      rg.internalFormat,
      rg.format,
      texType,
      ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST,
    );
  }

  function createFBO (w, h, internalFormat, format, type, filter) {
    const texId = LAST_TEX_ID++;
    gl.activeTexture(gl.TEXTURE0 + texId);
    let texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);

    let fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.viewport(0, 0, w, h);
    gl.clear(gl.COLOR_BUFFER_BIT);

    return {
      texture,
      fbo,
      texId,
    };
  }

  function createDoubleFBO (w, h, internalFormat, format, type, filter) {
    let fbo1 = createFBO(w, h, internalFormat, format, type, filter);
    let fbo2 = createFBO(w, h, internalFormat, format, type, filter);

    return {
      get read () {
        return fbo1;
      },
      get write () {
        return fbo2;
      },
      swap () {
        let temp = fbo1;
        fbo1 = fbo2;
        fbo2 = temp;
      },
    };
  }

  function update () {
    resizeCanvas();
    input();
    step(0.016);
    render();
    requestAnimationFrame(update);
  }

  function input () {
    // bottom row fire
    gl.viewport(0, 0, simWidth, simHeight);
    rowProgram.bind();
    gl.uniform2f(rowProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1f(rowProgram.uniforms.y, 10.0);
    gl.uniform1i(rowProgram.uniforms.uTarget, fuel.read.texId);
    gl.uniform1f(rowProgram.uniforms.useMax, true);
    blit(fuel.write.fbo);
    fuel.swap();

    for (let i = 0; i < pointers.length; i++) {
      const pointer = pointers[i];
      if (pointer.down) {
        splat(pointer.x, pointer.y, pointer.dx, pointer.dy, pointer.color);
      }
      if (pointer.moved) {
        pointer.moved = false;
        pointer.dx = 0;
        pointer.dy = 0;
      }
    }
  }

  function resizeCanvas () {
    if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      initFramebuffers();
    }
  }

  function render () {
    let width = gl.drawingBufferWidth;
    let height = gl.drawingBufferHeight;

    gl.viewport(0, 0, width, height);

    switch(DISPLAY_MODES[config.DISPLAY_MODE]) {
      case "Normal": {
        displayFireProgram.bind();
        gl.uniform1i(displayFireProgram.uniforms.uDensity, density.read.texId);
        gl.uniform1i(displayFireProgram.uniforms.uTemperature, temperature.read.texId);
        gl.uniform1i(displayFireProgram.uniforms.uFuel, fuel.read.texId);
        gl.uniform1f(displayFireProgram.uniforms.burnTemperature, config.BURN_TEMPERATURE);
        blit(null);

        // render particles from each emitter
        fireSources.forEach(fireSource => {
          fireSource.renderParticles(width, height, null, { r: 1.0, g: 1.0, b: 1.0 });
        });
        break;
      }
      case "DebugFire": {
        debugFireProgram.bind();
        gl.uniform1i(debugFireProgram.uniforms.uFuel, fuel.read.texId);
        gl.uniform1i(debugFireProgram.uniforms.uTemperature, temperature.read.texId);
        gl.uniform1f(debugFireProgram.uniforms.temperatureScalar, 0.001);
        gl.uniform1f(debugFireProgram.uniforms.fuelScalar, 1.0);
        blit(null);
        break;
      }
      case "DebugTemperature": {
        debugFloatProgram.bind();
        gl.uniform1i(debugFloatProgram.uniforms.uTexture, temperature.read.texId);
        gl.uniform1f(debugFloatProgram.uniforms.scalar, 0.001);
        blit(null);
        break;
      }
      case "DebugFuel": {
        debugFloatProgram.bind();
        gl.uniform1i(debugFloatProgram.uniforms.uTexture, fuel.read.texId);
        gl.uniform1f(debugFloatProgram.uniforms.scalar, 1.0);
        blit(null);
        break;
      }
      case "DebugPressure": {
        debugFloatProgram.bind();
        gl.uniform1i(debugFloatProgram.uniforms.uTexture, pressure.read.texId);
        gl.uniform1f(debugFloatProgram.uniforms.scalar, 1.0);
        blit(null);
        break;
      }
      case "DebugNoise": {
        debugFloatProgram.bind();
        gl.uniform1i(debugFloatProgram.uniforms.uTexture, noise.read.texId);
        gl.uniform1f(debugFloatProgram.uniforms.scalar, 1.0);
        blit(null);
        break;
      }
      default: /* DebugDensity */ {
        displayProgram.bind();
        gl.uniform1i(displayProgram.uniforms.uTexture, density.read.texId);
        blit(null);
        break;
      }
    }
  }

  function splat (x, y, dx, dy, color) {
    gl.viewport(0, 0, simWidth, simHeight);
    splatProgram.bind();
    gl.uniform1i(splatProgram.uniforms.uTarget, velocity.read.texId);
    gl.uniform1f(splatProgram.uniforms.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(splatProgram.uniforms.point, x / canvas.width, 1.0 - y / canvas.height);
    gl.uniform3f(splatProgram.uniforms.color, dx, -dy, 1.0);
    gl.uniform1f(splatProgram.uniforms.radius, config.SPLAT_RADIUS / 100.0);
    gl.uniform1f(splatProgram.uniforms.useMax, false);
    blit(velocity.write.fbo);
    velocity.swap();

    gl.uniform1i(splatProgram.uniforms.uTarget, fuel.read.texId);
    gl.uniform3f(splatProgram.uniforms.color, 1.0, 0.0, 0.0);
    gl.uniform1f(splatProgram.uniforms.radius, config.SPLAT_RADIUS / 100.0);
    gl.uniform1f(splatProgram.uniforms.useMax, true);
    blit(fuel.write.fbo);
    fuel.swap();

    gl.viewport(0, 0, dyeWidth, dyeHeight);
    gl.uniform1i(splatProgram.uniforms.uTarget, density.read.texId);
    gl.uniform3f(splatProgram.uniforms.color, color.r, color.g, color.b);
    gl.uniform1f(splatProgram.uniforms.radius, config.SPLAT_RADIUS / 100.0);
    gl.uniform1f(splatProgram.uniforms.useMax, false);
    blit(density.write.fbo);
    density.swap();
  }

  /*
  Update the programs by delta time.
  */
  function step (dt) {
    gl.viewport(0, 0, simWidth, simHeight);

    // Add fuel from particles to the *read* buffer.
    fireSources.forEach(fireSource => {
      fireSource.renderParticles(simWidth, simHeight, fuel.read.fbo, { r: 1.0, g: 0., b: 0. });
    });

    // Combustion step.
    // Burn fuel and cool temperature.
    combustionProgram.bind();
    gl.uniform2f(combustionProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(combustionProgram.uniforms.uFuel, fuel.read.texId);
    gl.uniform1i(combustionProgram.uniforms.uTemperature, temperature.read.texId);
    gl.uniform1i(combustionProgram.uniforms.uNoise, noise.read.texId);
    gl.uniform1f(combustionProgram.uniforms.noiseBlending, config.NOISE_BLENDING);
    gl.uniform1f(combustionProgram.uniforms.burnTemperature, config.BURN_TEMPERATURE);
    gl.uniform1f(combustionProgram.uniforms.cooling, config.COOLING);
    gl.uniform1f(combustionProgram.uniforms.dt, dt);
    blit(temperature.write.fbo);
    temperature.swap();

    // Advection step.
    // Advect velocity through the velocity field.
    advectionProgram.bind();
    gl.uniform2f(advectionProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    if (!ext.supportLinearFiltering) {
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, 1.0 / simWidth, 1.0 / simHeight);
    }
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.texId);
    gl.uniform1i(advectionProgram.uniforms.uSource, velocity.read.texId);
    gl.uniform1f(advectionProgram.uniforms.dt, dt);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.VELOCITY_DISSIPATION);
    blit(velocity.write.fbo);
    velocity.swap();

    // Do vorticity confinement on the velocity field.
    // First, compute curl of the velocity.
    curlProgram.bind();
    gl.uniform2f(curlProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(curlProgram.uniforms.uVelocity, velocity.read.texId);
    gl.uniform1i(curlProgram.uniforms.uNoise, noise.read.texId);
    gl.uniform1f(curlProgram.uniforms.blendLevel, config.NOISE_BLENDING);
    blit(curl.fbo);
    // Confine vortices.
    vorticityConfinementProgram.bind();
    gl.uniform2f(vorticityConfinementProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(vorticityConfinementProgram.uniforms.uVelocity, velocity.read.texId);
    gl.uniform1i(vorticityConfinementProgram.uniforms.uCurl, curl.texId);
    gl.uniform1f(vorticityConfinementProgram.uniforms.confinement, config.CONFINEMENT);
    gl.uniform1f(vorticityConfinementProgram.uniforms.dt, dt);
    blit(velocity.write.fbo);
    velocity.swap();

    // Add thermal buoyancy to velocity.
    buoyancyProgram.bind();
    gl.uniform2f(buoyancyProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(buoyancyProgram.uniforms.uVelocity, velocity.read.texId);
    gl.uniform1i(buoyancyProgram.uniforms.uTemperature, temperature.read.texId);
    gl.uniform1f(buoyancyProgram.uniforms.buoyancy, config.BUOYANCY);
    gl.uniform1f(buoyancyProgram.uniforms.dt, dt);
    blit(velocity.write.fbo);
    velocity.swap();

    // Dissipate some pressure to give the illusion of an open box.
    clearProgram.bind();
    let pressureTexId = pressure.read.texId;
    gl.activeTexture(gl.TEXTURE0 + pressureTexId);
    gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
    gl.uniform1i(clearProgram.uniforms.uTexture, pressureTexId);
    gl.uniform1f(clearProgram.uniforms.value, config.PRESSURE_DISSIPATION);
    blit(pressure.write.fbo);
    pressure.swap();

    // Projection step.
    gl.viewport(0, 0, simWidth, simHeight);
    // Compute velocity divergence field.
    divergenceProgram.bind();
    gl.uniform2f(divergenceProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(divergenceProgram.uniforms.uVelocity, velocity.read.texId);
    blit(divergence.fbo);
    // Solve for pressure field with Jacobi iteration.
    pressureIterationProgram.bind();
    gl.uniform1i(pressureIterationProgram.uniforms.uPressure, pressureTexId);
    gl.uniform2f(pressureIterationProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(pressureIterationProgram.uniforms.uDivergence, divergence.texId);

    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      gl.bindTexture(gl.TEXTURE_2D, pressure.read.texture);
      blit(pressure.write.fbo);
      pressure.swap();
    }
    // Subtract pressure gradient from velocity field to project.
    projectionProgram.bind();
    gl.uniform2f(projectionProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1i(projectionProgram.uniforms.uPressure, pressure.read.texId);
    gl.uniform1i(projectionProgram.uniforms.uVelocity, velocity.read.texId);
    blit(velocity.write.fbo);
    velocity.swap();

    // Advect density (color) through the velocity field.
    advectionProgram.bind();
    gl.viewport(0, 0, dyeWidth, dyeHeight);
    if (!ext.supportLinearFiltering) {
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, 1.0 / dyeWidth, 1.0 / dyeHeight);
    }
    gl.uniform1i(advectionProgram.uniforms.uVelocity, velocity.read.texId);
    gl.uniform1i(advectionProgram.uniforms.uSource, density.read.texId);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.DENSITY_DISSIPATION);
    blit(density.write.fbo);
    density.swap();
    // Advect temperature.
    gl.viewport(0, 0, simWidth, simHeight);
    if (!ext.supportLinearFiltering) {
      gl.uniform2f(advectionProgram.uniforms.dyeTexelSize, 1.0 / simWidth, 1.0 / simHeight);
    }
    gl.uniform1i(advectionProgram.uniforms.uSource, temperature.read.texId);
    gl.uniform1f(advectionProgram.uniforms.dissipation, 1.0);
    blit(temperature.write.fbo);
    temperature.swap();
    // Advect fuel.
    gl.uniform1i(advectionProgram.uniforms.uSource, fuel.read.texId);
    gl.uniform1f(advectionProgram.uniforms.dissipation, config.FUEL_DISSIPATION);
    blit(fuel.write.fbo);
    fuel.swap();
    // Advect noise.
    gl.uniform1i(advectionProgram.uniforms.uSource, noise.read.texId);
    gl.uniform1f(advectionProgram.uniforms.dissipation, 1.0);
    blit(noise.write.fbo);
    noise.swap();

    // Blend in some noise to the noise channel.
    addNoiseProgram.bind();
    gl.uniform2f(addNoiseProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
    gl.uniform1f(addNoiseProgram.uniforms.time, (new Date()).getTime() / 1.e4 % 1);
    gl.uniform1i(addNoiseProgram.uniforms.uTarget, noise.read.texId);
    gl.uniform1f(addNoiseProgram.uniforms.blendLevel, config.NOISE_VOLATILITY);
    blit(noise.write.fbo);
    noise.swap();

    fireSources.forEach(fireSource => fireSource.step(dt));
  }

  canvas.addEventListener('mousemove', (e) => {
    pointers[0].moved = pointers[0].down;
    pointers[0].dx = (e.offsetX - pointers[0].x) * 5.0;
    pointers[0].dy = (e.offsetY - pointers[0].y) * 5.0;
    pointers[0].x = e.offsetX;
    pointers[0].y = e.offsetY;
  });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
      let pointer = pointers[i];
      pointer.moved = pointer.down;
      const offsetX = touches[i].clientX - canvas.getBoundingClientRect().x;
      const offsetY = touches[i].clientY - canvas.getBoundingClientRect().y;
      pointer.dx = (offsetX - pointer.x) * 8.0;
      pointer.dy = (offsetY - pointer.y) * 8.0;
      pointer.x = offsetX;
      pointer.y = offsetY;
    }
  }, false);

  canvas.addEventListener('mousedown', (e) => {
    pointers[0].down = true;
    pointers[0].color = {
      r: 1.0,
      g: 1.0,
      b: 1.0
    };
    e.preventDefault();
  });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touches = e.targetTouches;
    for (let i = 0; i < touches.length; i++) {
      if (i >= pointers.length) {
        pointers.push(new pointerPrototype());
      }

      pointers[i].id = touches[i].identifier;
      pointers[i].down = true;
      const offsetX = touches[i].clientX - canvas.getBoundingClientRect().x;
      const offsetY = touches[i].clientY - canvas.getBoundingClientRect().y;
      pointers[i].x = offsetX;
      pointers[i].y = offsetY;
      pointers[i].color = {
        r: 0.5,
        g: 0.5,
        b: 0.5
      };
    }
  });

  window.addEventListener('mouseup', () => {
    pointers[0].down = false;
  });

  window.addEventListener('touchend', (e) => {
    const touches = e.changedTouches;
    for (let i = 0; i < touches.length; i++)
      for (let j = 0; j < pointers.length; j++)
        if (touches[i].identifier == pointers[j].id)
          pointers[j].down = false;
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === " ") {
      config.DISPLAY_MODE = (config.DISPLAY_MODE + 1) % DISPLAY_MODES.length;
    }
  });

  advectionProgram =
    new GLProgram(
      shaders.baseVertexShader,
      ext.supportLinearFiltering ? shaders.advectionShader : shaders.advectionManualFilteringShader
    );
  addNoiseProgram           = new GLProgram(shaders.baseVertexShader, shaders.addNoiseShader);
  buoyancyProgram           = new GLProgram(shaders.baseVertexShader, shaders.buoyancyShader);
  clearProgram              = new GLProgram(shaders.baseVertexShader, shaders.clearShader);
  combustionProgram         = new GLProgram(shaders.baseVertexShader, shaders.combustionShader);
  curlProgram               = new GLProgram(shaders.baseVertexShader, shaders.curlShader);
  debugFireProgram          = new GLProgram(shaders.baseVertexShader, shaders.debugFireShader);
  debugFloatProgram         = new GLProgram(shaders.baseVertexShader, shaders.debugFloatShader);
  displayProgram            = new GLProgram(shaders.baseVertexShader, shaders.displayShader);
  displayFireProgram        = new GLProgram(shaders.baseVertexShader, shaders.displayFireShader);
  divergenceProgram         = new GLProgram(shaders.baseVertexShader, shaders.divergenceShader);
  particlesAdvectionProgram = new GLProgram(shaders.baseVertexShader, shaders.particlesAdvectionShader);
  particlesRenderProgram    = new GLProgram(shaders.particlesVertexShader, shaders.particlesRenderShader);
  particlesResetDataProgram = new GLProgram(shaders.baseVertexShader, shaders.particlesResetDataShader);
  particlesResetLifespanProgram = new GLProgram(shaders.baseVertexShader, shaders.particlesResetLifespanShader);
  particlesStepLifespanProgram = new GLProgram(shaders.baseVertexShader, shaders.particlesStepLifespanShader);
  pressureIterationProgram  = new GLProgram(shaders.baseVertexShader, shaders.pressureIterationShader);
  projectionProgram         = new GLProgram(shaders.baseVertexShader, shaders.projectionShader);
  rowProgram                = new GLProgram(shaders.baseVertexShader, shaders.rowShader);
  splatProgram              = new GLProgram(shaders.baseVertexShader, shaders.splatShader);
  vorticityConfinementProgram = new GLProgram(shaders.baseVertexShader, shaders.vorticityConfinementShader);

  initFramebuffers();

  // Initialize the noise channel.
  addNoiseProgram.bind();
  gl.uniform2f(addNoiseProgram.uniforms.texelSize, 1.0 / simWidth, 1.0 / simHeight);
  gl.uniform1f(addNoiseProgram.uniforms.time, (new Date()).getTime() / 1.e6 % 1);
  gl.uniform1i(addNoiseProgram.uniforms.uTarget, noise.read.texId);
  gl.uniform1f(addNoiseProgram.uniforms.blendLevel, 1.0);
  blit(noise.write.fbo);
  noise.swap();

  update();
}