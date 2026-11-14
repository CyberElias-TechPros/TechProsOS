/**
 * ScrollVelocity marquee — speed reacts to page scroll velocity. ReactBits (MIT), compact TS port.
 * Widths are measured once per resize, never per frame (no layout thrash).
 */
import { useEffect, useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';

interface Props {
  children: ReactNode;
  baseVelocity?: number;   // px/s base speed
  className?: string;
  itemClassName?: string;
}

export function ScrollVelocity({ children, baseVelocity = 50, className, itemClassName }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const firstSet = track.children[0] as HTMLElement | undefined;
    if (!firstSet) return;
    const original = Array.from(firstSet.children) as HTMLElement[];

    // Build identical sets until the visible half is ≥ 2× viewport wide
    const makeSet = () => {
      const set = document.createElement('div');
      set.style.cssText = `display:flex;align-items:center;gap:${getComputedStyle(track).gap || '34px'};flex:none`;
      original.forEach(n => set.appendChild(n.cloneNode(true)));
      return set;
    };
    let guard = 0;
    while (track.scrollWidth < window.innerWidth * 2 && guard++ < 10) track.appendChild(makeSet());

    let halfWidth = 0;
    const measure = () => {
      // With identical sets, the loop tile = width of one set including its gap
      const sets = track.children.length;
      const gap = parseFloat(getComputedStyle(track).gap) || 0;
      halfWidth = track.scrollWidth / sets + gap;
      const target = Math.floor(sets / 2) * halfWidth;
      halfWidth = target || track.scrollWidth / 2;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(track);

    let x = 0;
    let boost = 0;
    let lastY = window.scrollY;
    let last = performance.now();
    const onScroll = () => {
      const y = window.scrollY;
      boost = Math.min(340, boost + Math.abs(y - lastY) * 0.6);
      lastY = y;
    };
    const tick = (now: number) => {
      const dt = Math.min(0.06, (now - last) / 1000);
      last = now;
      boost *= 0.92;
      x -= (baseVelocity + boost) * dt;
      if (halfWidth > 0 && -x >= halfWidth) x += halfWidth;
      track.style.transform = `translate3d(${x}px,0,0)`;
    };
    gsap.ticker.add(tick);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { gsap.ticker.remove(tick); window.removeEventListener('scroll', onScroll); ro.disconnect(); };
  }, [baseVelocity]);

  return (
    <div className={className} style={{ overflow: 'hidden' }} aria-hidden>
      <div ref={trackRef} style={{ display: 'flex', alignItems: 'center', gap: 34, width: 'max-content', willChange: 'transform' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 34, flex: 'none' }} className={itemClassName}>{children}</div>
      </div>
    </div>
  );
}
