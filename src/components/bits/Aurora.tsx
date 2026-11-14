/**
 * Aurora — WebGL flowing-light background (OGL shader). ReactBits (MIT), compact TS port.
 * Falls back to a static CSS gradient if WebGL is unavailable or reduced motion is set.
 */
import { useEffect, useRef } from 'react';
import { Renderer, Program, Mesh, Triangle, Color } from 'ogl';

const VERT = `#version 300 es
in vec2 uv; void main() { gl_Position = vec4(uv.x, uv.y, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform float uTime; uniform vec2 uResolution;
uniform vec3 uColor1; uniform vec3 uColor2; uniform vec3 uColor3;
uniform float uIntensity; uniform float uSpeed;
out vec4 fragColor;

float noise(vec2 p, float t) {
  return sin(p.x * 3.1 + t * 0.9) * sin(p.y * 2.7 - t * 0.7) * 0.5 + 0.5;
}
void main() {
  vec2 uv = (gl_FragCoord.xy / uResolution);
  vec2 p = (uv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  float t = uTime * uSpeed;
  float n1 = noise(p * 1.6 + vec2(0.0, t * 0.12), t);
  float n2 = noise(p * 2.3 + vec2(t * 0.08, -t * 0.05), t * 1.2);
  float mask = smoothstep(0.15, 0.85, n1 * 0.65 + n2 * 0.45);
  vec3 c = mix(uColor1, uColor2, mask);
  c = mix(c, uColor3, smoothstep(0.55, 1.0, n2) * 0.55);
  float vign = 1.0 - smoothstep(0.4, 1.3, length(p));
  float a = mask * uIntensity * vign;
  fragColor = vec4(c * a, a);
}`;

const hex = (h: string): [number, number, number] => {
  const c = new Color(h);
  return [c.r, c.g, c.b];
};

interface Props {
  colors?: [string, string, string];
  intensity?: number;
  speed?: number;
  className?: string;
}

export function Aurora({ colors = ['#12244f', '#1d63ed', '#22d3ee'], intensity = 0.85, speed = 0.6, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let renderer: Renderer | undefined;
    try { renderer = new Renderer({ alpha: true, antialias: false, dpr: Math.min(2, window.devicePixelRatio) }); } catch { return; }
    const gl = renderer.gl;
    gl.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
    gl.clearColor(0, 0, 0, 0);
    el.appendChild(gl.canvas);

    const dpr = Math.min(2, window.devicePixelRatio);
    const program = new Program(gl, {
      vertex: VERT, fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: [el.offsetWidth * dpr, el.offsetHeight * dpr] },
        uColor1: { value: hex(colors[0]) },
        uColor2: { value: hex(colors[1]) },
        uColor3: { value: hex(colors[2]) },
        uIntensity: { value: intensity },
        uSpeed: { value: speed },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });
    const ro = new ResizeObserver(() => {
      renderer!.setSize(el.offsetWidth, el.offsetHeight);
      program.uniforms.uResolution.value = [el.offsetWidth * dpr, el.offsetHeight * dpr];
    });
    ro.observe(el);
    let raf = 0; const start = performance.now();
    const loop = () => {
      program.uniforms.uTime.value = (performance.now() - start) / 1000;
      renderer!.render({ scene: mesh });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); gl.canvas.remove(); gl.getExtension('WEBGL_lose_context')?.loseContext(); };
  }, [colors, intensity, speed]);

  return (
    <div ref={ref} className={className} aria-hidden
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', background: `radial-gradient(900px 420px at 70% -10%, ${colors[1]}33, transparent 60%), radial-gradient(700px 380px at 15% 10%, ${colors[2]}22, transparent 55%)` }} />
  );
}
