/**
 * SplitText — GSAP char/word split entrance with optional ScrollTrigger.
 * Adapted from ReactBits (MIT) — compact TS port without the paid-era plugins.
 */
import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface Props {
  text: string;
  className?: string;
  by?: 'chars' | 'words';
  /** 'load' plays immediately; 'scroll' ties to entering the viewport */
  trigger?: 'load' | 'scroll';
  delay?: number;      // seconds base delay
  stagger?: number;    // seconds per piece
  from?: { y?: number; opacity?: number; rotateX?: number };
  ease?: gsap.TweenVars['ease'];
}

export function SplitText({
  text, className, by = 'chars', trigger = 'load', delay = 0, stagger = 0.028,
  from = { y: 46, opacity: 0, rotateX: -40 }, ease = 'back.out(1.6)',
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const fromRef = useRef(from);
  fromRef.current = from;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pieces = by === 'words' ? text.split(' ') : text.split('');
    el.setAttribute('aria-label', text);
    el.style.display = 'inline-block';
    el.style.perspective = '600px';
    const parts: string[] = [];
    const escaped = pieces.map(p => p === ' ' ? '&nbsp;' : p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    for (const p of escaped) {
      parts.push(`<span class="rb-split-clip" aria-hidden="true" style="display:inline-block;overflow:hidden;vertical-align:top"><span style="display:inline-block;will-change:transform,opacity;transform-origin:50% 100%">${p}</span></span>`);
    }
    el.innerHTML = parts.join(by === 'chars' ? '' : ' ');
    const targets = el.querySelectorAll('.rb-split-clip > span');
    gsap.fromTo(targets, fromRef.current, {
      y: 0, yPercent: 0, opacity: 1, rotateX: 0, duration: 0.75, ease, delay, stagger,
      scrollTrigger: trigger === 'scroll' ? { trigger: el, start: 'top 88%', once: true } : undefined,
    });
    return () => { ScrollTrigger.getAll().forEach(t => { if (t.trigger === el) t.kill(); }); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, by, trigger, delay, stagger, ease]);

  return <span ref={ref} className={className}>{text}</span>;
}
