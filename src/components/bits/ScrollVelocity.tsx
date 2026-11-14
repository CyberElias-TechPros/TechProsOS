/**
 * ScrollVelocity marquee — speed reacts to page scroll velocity. ReactBits (MIT), compact TS port.
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';

interface Props {
  children: ReactNode;
  baseVelocity?: number;   // px/s equivalent progress
  className?: string;
  itemClassName?: string;
}

export function ScrollVelocity({ children, baseVelocity = 50, className, itemClassName }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const original = Array.from(track.children[0]?.children ?? []);
    // duplicate items until the row is ≥ 2.2× viewport for a seamless loop
    const cloneSet = () => {
      const set = document.createElement('div');
      set.style.cssText = 'display:flex;align-items:center;gap:inherit;flex:none';
      original.forEach(n => set.appendChild(n.cloneNode(true)));
      return set;
    };
    let width = track.children[0]?.scrollWidth ?? 0;
    while (width < window.innerWidth * 2.2 && track.children.length < 12) {
      track.appendChild(cloneSet());
      width = track.scrollWidth / 2;
    }
    // neutralise any per-set gap differences for an exact half-loop
    const sets = Array.from(track.children) as HTMLElement[];
    const half = () => { let s = 0; sets.slice(0, Math.ceil(sets.length / 2)).forEach(el => (s += el.offsetWidth)); return s || track.scrollWidth / 2; };

    const x = { v: 0 };
    const quick = gsap.quickTo(track, 'x', { duration: 0 });
    let last = performance.now(); let boost = 0;
    let onScroll: () => void;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      boost *= 0.94;
      x.v -= (baseVelocity + boost) * dt;
      const h = half();
      if (-x.v > h) x.v += h;
      quick(x.v);
    };
    gsap.ticker.add(tick);

    onScroll = () => { boost = Math.min(320, boost + Math.abs(window.scrollY - (window as any).__svPrev || 0) * 0.5); (window as any).__svPrev = window.scrollY; };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { gsap.ticker.remove(tick); window.removeEventListener('scroll', onScroll); };
  }, [baseVelocity]);

  return (
    <div className={className} style={{ overflow: 'hidden', whiteSpace: 'nowrap' }} aria-hidden>
      <div ref={trackRef} style={{ display: 'flex', alignItems: 'center', gap: 34, width: 'max-content', willChange: 'transform' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 34 }} className={itemClassName}>{children}</div>
      </div>
    </div>
  );
}
