/**
 * CountUp — number ticker animating to `to` on scroll into view.
 * Adapted from ReactBits (MIT) — compact TS port (GSAP-powered).
 */
import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

interface Props {
  to: number;
  from?: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  format?: (v: number) => string;
  /** animate again when `to` changes (default true) */
  reactive?: boolean;
  triggerOnScroll?: boolean;
}

export function CountUp({
  to, from = 0, duration = 1.6, prefix = '', suffix = '', decimals = 0, className, format, reactive = true, triggerOnScroll = true,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const cur = useRef(from);
  const played = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const render = (v: number) => { el.textContent = prefix + (format ? format(v) : v.toLocaleString('en-NG', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })) + suffix; };
    if (triggerOnScroll && played.current) { if (!reactive) return; }
    render(cur.current);
    const ctx = gsap.context(() => {
      gsap.fromTo(el, { opacity: 0.4 }, { opacity: 1, duration: 0.4 });
      gsap.to(cur, {
        current: to,
        duration: cur.current === to ? 0 : duration,
        ease: 'power3.out',
        onUpdate: () => render(cur.current),
        scrollTrigger: triggerOnScroll ? { trigger: el, start: 'top 90%', once: false } : undefined,
        onStart: () => { played.current = true; },
      });
    });
    return () => ctx.revert();
  }, [to, from, duration, prefix, suffix, decimals, reactive, triggerOnScroll]);

  return <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums' }} />;
}
