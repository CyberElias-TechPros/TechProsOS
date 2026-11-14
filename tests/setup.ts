/** jsdom browser API stubs for component tests. */
import '@testing-library/jest-dom/vitest';

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = globalThis.ResizeObserver ?? RO;
if (typeof Element !== 'undefined') {
  (Element.prototype as any).scrollTo = (Element.prototype as any).scrollTo ?? (() => {});
}

// matchMedia for libraries that gate on it (jsdom ships a non-functional stub)
const mql = (q: string) => ({
  matches: false, media: q, addListener: () => {}, removeListener: () => {},
  addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false, onchange: null,
});
(Object.getOwnPropertyNames(globalThis).includes('matchMedia') || true);
(globalThis as any).matchMedia = mql;
if (typeof window !== 'undefined') (window as any).matchMedia = mql;

// IntersectionObserver stub — framer-motion's whileInView & gsap ScrollTrigger need it
class IO {
  readonly root = null; readonly rootMargin = ''; readonly thresholds = [0];
  constructor(private cb: IntersectionObserverCallback) {}
  observe(el: Element) { this.cb([{ target: el, isIntersecting: true, intersectionRatio: 1 } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return []; }
}
(globalThis as any).IntersectionObserver = globalThis.IntersectionObserver ?? IO;

// WebGL is unavailable in jsdom; Aurora silently falls back to its CSS gradient.
