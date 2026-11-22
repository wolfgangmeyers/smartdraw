# SmartDraw Android Specification

Complete technical and behavioral architecture specification for the native Android (Kotlin) implementation of SmartDraw.

---

## 1. Executive Summary & Purpose

SmartDraw Android is a high-performance native Android painting application designed for assisted and reference-guided painting. It faithfully reproduces the WebGL shader rendering model of the original SmartDraw web application while adding first-class mobile capabilities:

- **Hardware-Accelerated GLES 3.0 Pipeline**: Offscreen Framebuffer Objects (FBOs) and custom GLSL fragment shaders reproducing circle brush stamping, directional color smudging, reference image overlay blending, and composite output.
- **Stylus & Touch Pressure Dynamics**: Real-time continuous sampling of `MotionEvent.getPressure()`, historical batch events, and customizable pressure response curves (linear, sigmoid, power) mapped to brush radius and opacity.
- **Bezier Curve Stroke Smoothing**: Multi-point quadratic and cubic Bezier curve fitting with arc-length parameterization to guarantee uniform stamp spacing independent of touch sampling frequency or drawing speed.
- **Dynamic Reference Color Auto-Picker**: Coordinate-translated continuous sampling of the reference image along the stroke path, automatically adjusting the brush color in real time.
- **Steady Improvement Algorithmic Painting Loop**: Automated candidate stroke evaluation against the reference image using mean squared error (MSE) difference metrics and acceptance criteria.
- **Pragmatic Bezier Test Harness**: Codegen test runner exercising 30–200 varied Bezier strokes (S-curves, loops, arcs, pressure ramps) with headless and on-device rendering verification.

---

## 2. Architecture & Technology Stack

- **Platform**: Android SDK 34 (minSdk 26+, targetSdk 34)
- **Language**: Kotlin 1.9+
- **Graphics API**: OpenGL ES 3.0 via EGL (offscreen Pbuffer / FBO rendering) + Android `SurfaceView` / `TextureView` for UI presentation
- **Threading Model**: 
  - Main UI Thread: Touch event capture, gestures, Compose/View state
  - Render Thread: Dedicated EGL context, GL draw calls, texture swapping
  - Background Worker: Kotlin Coroutines (`Dispatchers.Default`) for the steady improvement loop
- **License**: UNLICENSE (Public Domain)

---

## 3. Graphics & Shader Pipeline (OpenGL ES 3.0)

### 3.1 Layer Architecture & Framebuffers

SmartDraw uses a multi-layer composition pipeline:

1. **Background Layer**: Generates or uploads a checkered transparency pattern or solid background color.
2. **Reference Image Layer**: GPU texture (`GL_TEXTURE_2D`) containing the target painting image, with uniform opacity (`u_referenceOpacity`) and toggleable visibility (`u_renderReference`).
3. **Drawing Layer (Base Layer)**: Main user painting canvas stored in an FBO texture target (`GL_RGBA8`).
4. **Compositing Pass**: Fullscreen quad shader combining background, drawing layer, reference layer, and UI overlay with alpha blending.

### 3.2 Circle Brush Shader (`CircleBrushShader.kt`)

Renders antialiased circular brush stamps with pressure-dependent radius and flow:

#### Vertex Shader (GLSL ES 3.0)
```glsl
#version 300 es
layout(location = 0) in vec2 a_position; // Quad [-1, 1]
layout(location = 1) in vec2 a_texCoord; // [0, 1]

uniform vec2 u_resolution;
uniform vec2 u_brushCenter;
uniform float u_brushRadius;

out vec2 v_pixelCoord;
out vec2 v_brushCenter;
out float v_brushRadius;

void main() {
    vec2 worldPos = u_brushCenter + (a_position * u_brushRadius);
    vec2 clipSpace = (worldPos / u_resolution) * 2.0 - 1.0;
    clipSpace.y = -clipSpace.y; // Match screen coordinates
    gl_Position = vec4(clipSpace, 0.0, 1.0);
    
    v_pixelCoord = worldPos;
    v_brushCenter = u_brushCenter;
    v_brushRadius = u_brushRadius;
}
```

#### Fragment Shader (GLSL ES 3.0)
```glsl
#version 300 es
precision highp float;

in vec2 v_pixelCoord;
in vec2 v_brushCenter;
in float v_brushRadius;

uniform vec4 u_brushColor;
uniform float u_brushOpacity;
uniform float u_pressure;
uniform float u_antiAlias;

out vec4 fragColor;

void main() {
    float dist = length(v_pixelCoord - v_brushCenter);
    float effectiveRadius = v_brushRadius * clamp(u_pressure, 0.1, 1.0);
    
    float alpha = 1.0 - smoothstep(effectiveRadius - u_antiAlias, effectiveRadius + u_antiAlias, dist);
    if (alpha <= 0.001) {
        discard;
    }
    
    float finalAlpha = alpha * u_brushColor.a * u_brushOpacity * u_pressure;
    fragColor = vec4(u_brushColor.rgb, finalAlpha);
}
```

### 3.3 Smudge Shader (`SmudgeShader.kt`)

Recreates physical paint dragging by sampling colors along the motion vector and blending:

```glsl
#version 300 es
precision highp float;

in vec2 v_pixelCoord;
in vec2 v_brushCenter;
in float v_brushRadius;

uniform sampler2D u_canvasTexture;
uniform vec2 u_resolution;
uniform vec2 u_smudgeDelta;   // Direction and magnitude of motion
uniform float u_smudgeStrength; // [0.0, 1.0]

out vec4 fragColor;

void main() {
    float dist = length(v_pixelCoord - v_brushCenter);
    if (dist > v_brushRadius) {
        discard;
    }
    
    vec2 currentUv = v_pixelCoord / u_resolution;
    vec2 sampleUv = (v_pixelCoord - u_smudgeDelta * u_smudgeStrength) / u_resolution;
    
    vec4 currentColor = texture(u_canvasTexture, currentUv);
    vec4 draggedColor = texture(u_canvasTexture, sampleUv);
    
    float falloff = 1.0 - smoothstep(0.0, v_brushRadius, dist);
    float blendFactor = falloff * u_smudgeStrength;
    
    fragColor = mix(currentColor, draggedColor, blendFactor);
}
```

---

## 4. Input & Pressure Dynamics

### 4.1 Native MotionEvent Handling (`TouchInputHandler.kt`)

Supports fingers, active styluses (S-Pen, Apple Pencil over bridge, USI styluses), and passive styluses:

1. **Pressure Extraction**:
   - `event.getPressure(pointerIndex)` reports normalized pressure `[0.0, 1.0]`.
   - Historical points: `event.getHistoricalPressure(pointerIndex, pos)` prevents loss of fast pressure transients between VSYNC pulses.
2. **Tool Type Discrimination**:
   - `TOOL_TYPE_STYLUS` / `TOOL_TYPE_ERASER` vs `TOOL_TYPE_FINGER`.
   - Rejection of accidental palm touches when stylus is detected.
3. **Pressure Response Curves**:
   - **Linear**: `r = baseRadius * pressure`
   - **Power (Gamma)**: `r = baseRadius * pow(pressure, gamma)` (gamma = 1.5–2.0 for finer light-touch control)
   - **Sigmoid**: Smooth S-curve dampening micro-tremors at near-zero and near-maximum pressure.

---

## 5. Bezier Curve Stroke Smoothing (`BezierCurve.kt`, `StrokeSmoother.kt`)

Raw touch coordinates arrive as discrete polygons. SmartDraw applies real-time cubic Bezier spline fitting:

1. **Control Point Fitting**:
   - For consecutive touch samples $P_0, P_1, P_2, P_3$, midpoints are calculated as spline knots.
   - Tangents are computed to guarantee $C^1$ continuity (no sharp kinks).
2. **Arc-Length Parameterization**:
   - The curve length $L$ is approximated via Gaussian quadrature or subdivison.
   - Number of stamps $N = \lceil L / \text{stepSize} \rceil$ where $\text{stepSize} = \max(1.0, \text{radius} \times 0.25)$.
   - Equal arc-length parameter $s \in [0, 1]$ prevents stamps from clumping during slow drawing or spreading apart during rapid strokes.
3. **Pressure Interpolation**:
   - Pressure values are linearly interpolated along $s$: $p(s) = (1-s)p_{\text{start}} + s \cdot p_{\text{end}}$.

---

## 6. Reference Color Auto-Picker (`ReferenceColorSampler.kt`)

Enables guided painting where the brush automatically matches colors from an underlying photograph or artwork:

1. **Coordinate Mapping**:
   - Maps canvas coordinates $(x_c, y_c)$ to reference image coordinates $(x_r, y_r)$ considering aspect ratio scaling and letterboxing.
2. **Sampling Logic**:
   - Bilinear interpolation or $3 \times 3$ box kernel averaging over reference pixels to eliminate high-frequency camera noise.
3. **Dynamic Stroke Modulation**:
   - As the Bezier curve advances, the auto-picker updates `u_brushColor` at each stamp step, producing gradient-matched transitions that follow the contours of the reference image.

---

## 7. Steady Improvement Algorithmic Painting Loop (`SteadyImprovementLoop.kt`)

Autonomous painting engine that iterates toward the reference image:

1. **Candidate Generation**:
   - Randomly selects starting coordinates $(x, y)$ in regions with high difference error.
   - Generates candidate Bezier curves following local image gradient tensors (edge-aligned strokes).
   - Samples stroke color via `ReferenceColorSampler`.
2. **Difference Evaluation (MSE)**:
   - Evaluates Mean Squared Error (MSE) between canvas and reference in the stroke's bounding box:
     $$E = \frac{1}{|A|} \sum_{(x,y) \in A} \| C(x,y) - R(x,y) \|^2$$
3. **Acceptance Criterion**:
   - If candidate stroke reduces error ($\Delta E < 0$), the stroke is committed to the drawing FBO.
   - Otherwise, the stroke is discarded, and parameters (radius, length, opacity) are perturbed.
4. **Coarse-to-Fine Progression**:
   - Begins with large brush radii (blocking in forms) and automatically decreases radius as MSE drops, adding fine detail.

---

## 8. Pragmatic Bezier Test Harness (`BezierTestHarness.kt`)

Built for automated verification and regression testing:

- **Codegen Stroke Patterns**:
  - Parametric Archimedean spirals, S-curves, figure-eights, loops, and straight lines.
  - Dynamically modulated pressure ramps from 0.1 to 1.0.
  - Batch execution of 30 to 200 strokes per test painting.
- **Test Suites**:
  - `test_bezier_curves_showcase`: 50 multi-curvature Bezier paths.
  - `test_stylus_pressure_dynamics`: Pressure taper, light-to-heavy ramps, flow test.
  - `test_smudge_shader_blend`: Multi-directional smudge blending across colors.
  - `test_steady_improvement_painting`: 200-stroke automated iterative convergence.
- **Export**: Direct offscreen rendering to 1024×1024 PNG files in `test-output/`.
