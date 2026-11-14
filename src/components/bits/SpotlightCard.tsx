/**
 * SpotlightCard — cursor-following radial spotlight (ReactBits, MIT — compact TS port).
 * Tilt — pointer parallax tilt via GSAP quickTo. Magnet — magnetic hover wrapper.
 * ClickSpark — particle burst on click (canvas). StarBorder — animated beam border.
 */
import { useRef, useLayoutEffect, type HTMLAttributes, type ReactNode, type ButtonHTMLAttributes } from 'react';
import { gsap } from 'gsap';

/* ── SpotlightCard ───────────────────────────────────────────────────── */
export function SpotlightCard({ children, className = '', style, spotlightColor = 'rgba(90,162,255,.16)', ...rest }: HTMLAttributes<HTMLDivElement> & { spotlightColor?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: -400, y: -400 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const qx = gsap.quickTo(pos.current, 'x', { duration: 0.35, ease: 'power3.out' });
    const qy = gsap.quickTo(pos.current, 'y', { duration: 0.35, ease: 'power3.out' });
    const fadeObj = { v: 0 };
    const paint = () => {
      el.style.background = `radial-gradient(560px circle at ${pos.current.x}px ${pos.current.y}px, ${spotlightColor}, transparent 45%), var(--card-bg, var(--surface))`;
      el.style.borderColor = fadeObj.v > 0 ? 'color-mix(in srgb, var(--accent) 32%, var(--line))' : '';
    };
    const move = (e: MouseEvent) => { const r = el.getBoundingClientRect(); qx(e.clientX - r.left); qy(e.clientY - r.top); paint(); };
    const enter = () => { gsap.to(fadeObj, { v: 1, duration: 0.35, onUpdate: paint }); };
    const leave = () => { gsap.to(fadeObj, { v: 0, duration: 0.35, onUpdate: paint }); el.style.background = ''; el.style.borderColor = ''; };
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseenter', enter);
    el.addEventListener('mouseleave', leave);
    return () => { el.removeEventListener('mousemove', move); el.removeEventListener('mouseenter', enter); el.removeEventListener('mouseleave', leave); };
  }, [spotlightColor]);

  return <div ref={ref} className={`card ${className}`} style={{ position: 'relative', overflow: 'hidden', ...style }} {...rest}>{children}</div>;
}

/* ── Tilt ─────────────────────────────────────────────────────────────── */
export function Tilt({ children, className, intensity = 9, scale = 1.015, style }: { children: ReactNode; className?: string; intensity?: number; scale?: number; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rx = gsap.quickTo(el, 'rotateX', { duration: 0.4, ease: 'power3.out' });
    const ry = gsap.quickTo(el, 'rotateY', { duration: 0.4, ease: 'power3.out' });
    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      ry(((e.clientX - r.left) / r.width - 0.5) * intensity);
      rx(-((e.clientY - r.top) / r.height - 0.5) * intensity);
    };
    const leave = () => { rx(0); ry(0); gsap.to(el, { scale: 1, duration: 0.35 }); };
    const enter = () => gsap.to(el, { scale, duration: 0.35 });
    el.addEventListener('mousemove', move); el.addEventListener('mouseenter', enter); el.addEventListener('mouseleave', leave);
    return () => { el.removeEventListener('mousemove', move); el.removeEventListener('mouseenter', enter); el.removeEventListener('mouseleave', leave); };
  }, [intensity, scale]);
  return <div ref={ref} className={className} style={{ transformStyle: 'preserve-3d', willChange: 'transform', ...style }}>{children}</div>;
}

/* ── Magnet ──────────────────────────────────────────────────────────── */
export function Magnet({ children, strength = 26, className }: { children: ReactNode; strength?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const qx = gsap.quickTo(el, 'x', { duration: 0.35, ease: 'power3.out' });
    const qy = gsap.quickTo(el, 'y', { duration: 0.35, ease: 'power3.out' });
    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      qx(((e.clientX - r.left) / r.width - 0.5) * strength);
      qy(((e.clientY - r.top) / r.height - 0.5) * strength);
    };
    const leave = () => { qx(0); qy(0); };
    el.addEventListener('mousemove', move);
    el.addEventListener('mouseleave', leave);
    return () => { el.removeEventListener('mousemove', move); el.removeEventListener('mouseleave', leave); };
  }, [strength]);
  return <div ref={ref} className={className} style={{ display: 'inline-block', willChange: 'transform' }}>{children}</div>;
}

/* ── StarBorder ──────────────────────────────────────────────────────── */
export function StarBorder({ children, className = '', beamColor = '#5aa2ff', duration = 4.5, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { beamColor?: string; duration?: number }) {
  return (
    <span className={`rb-star-border ${className}`} style={{ position: 'relative', display: 'inline-block', borderRadius: 12, padding: 1.5, overflow: 'hidden' }}>
      <span aria-hidden style={{ position: 'absolute', inset: -80, background: `conic-gradient(from 0deg, transparent 0 70%, ${beamColor} 82%, transparent 96%)`, animation: `rb-starspin ${duration}s linear infinite`, pointerEvents: 'none' }} />
      <style>{`@keyframes rb-starspin{to{transform:rotate(1turn)}}`}</style>
      <button
        {...rest}
        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10.5, border: 0, cursor: 'pointer', background: 'rgba(15,26,48,.92)', color: '#eaf2ff', padding: '11px 22px', font: '600 13.5px var(--font)', ...(rest.style ?? {}) }}
      >
        {children}
      </button>
    </span>
  );
}

/* ── ClickSpark ─────────────────────────────────────────────────────── */
export function ClickSpark({ children, sparkColor = '#5aa2ff', sparkCount = 8, sparkRadius = 16 }: { children: ReactNode; sparkColor?: string; sparkCount?: number; sparkRadius?: number }) {
  const wrapRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5';
    wrap.appendChild(canvas);
    const ctx = canvas.getContext('2d')!;
    const sparks: { x: number; y: number; angle: number; start: number }[] = [];
    let raf = 0;

    const resize = () => {
      canvas.width = wrap.offsetWidth * devicePixelRatio;
      canvas.height = wrap.offsetHeight * devicePixelRatio;
      canvas.style.width = `${wrap.offsetWidth}px`; canvas.style.height = `${wrap.offsetHeight}px`;
      ctx.scale(devicePixelRatio, devicePixelRatio);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(wrap);

    const draw = (t: number) => {
      ctx.clearRect(0, 0, wrap.offsetWidth, wrap.offsetHeight);
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        const elapsed = t - s.start;
        if (elapsed > 420) { sparks.splice(i, 1); continue; }
        const d = (elapsed / 420) * sparkRadius;
        const alpha = 1 - elapsed / 420;
        ctx.strokeStyle = sparkColor; ctx.globalAlpha = alpha; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(s.x + Math.cos(s.angle) * d, s.y + Math.sin(s.angle) * d);
        ctx.lineTo(s.x + Math.cos(s.angle) * (d + 7), s.y + Math.sin(s.angle) * (d + 7));
        ctx.stroke();
      }
      if (sparks.length) raf = requestAnimationFrame(draw); else { ctx.clearRect(0, 0, wrap.offsetWidth, wrap.offsetHeight); raf = 0; }
    };
    const click = (e: MouseEvent) => {
      const r = wrap.getBoundingClientRect();
      const now = performance.now();
      for (let i = 0; i < sparkCount; i++) sparks.push({ x: e.clientX - r.left, y: e.clientY - r.top, angle: (Math.PI * 2 * i) / sparkCount, start: now });
      if (!raf) raf = requestAnimationFrame(draw);
    };
    wrap.addEventListener('click', click);
    return () => { wrap.removeEventListener('click', click); ro.disconnect(); cancelAnimationFrame(raf); canvas.remove(); };
  }, [sparkColor, sparkCount, sparkRadius]);

  return <span ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>{children}</span>;
}
