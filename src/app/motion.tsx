/** Motion plumbing: Lenis smooth scroll (GSAP-ticker driven) + reveal primitives. */
import { useEffect } from 'react';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

gsap.registerPlugin(ScrollTrigger);

/** Mount once at the root. window-only smooth scroll; nested panels stay native. */
export function useLenis() {
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 0.95, touchMultiplier: 1.2 });
    const loop = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(loop);
    gsap.ticker.lagSmoothing(0);
    lenis.on('scroll', ScrollTrigger.update);
    return () => { gsap.ticker.remove(loop); lenis.destroy(); };
  }, []);
}

/** Scroll-into-view rise reveal — the workhorse across marketing + workspace cards. */
export function Reveal({ children, delay = 0, y = 22, className, as = 'div' }: {
  children: ReactNode; delay?: number; y?: number; className?: string; as?: 'div' | 'section';
}) {
  const Tag = motion[as] as typeof motion.div;
  return (
    <Tag
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.55, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{ willChange: 'transform, opacity' }}
    >
      {children}
    </Tag>
  );
}

/** Container that staggers its <Reveal> children automatically. */
export function StaggerGroup({ children, step = 0.07, className }: { children: ReactNode[]; step?: number; className?: string }) {
  return (
    <div className={className}>
      {children.map((c, i) => <Reveal key={i} delay={i * step}>{c}</Reveal>)}
    </div>
  );
}
