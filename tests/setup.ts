/** jsdom browser API stubs for component tests. */
import '@testing-library/jest-dom/vitest';

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = globalThis.ResizeObserver ?? RO;
if (!('scrollTo' in Element.prototype)) (Element.prototype as any).scrollTo = () => {};
else (Element.prototype as any).scrollTo = (Element.prototype as any).scrollTo ?? (() => {});
// jsdom defines scrollTo only on Window; ensure element instances always respond
(Element.prototype as any).scrollTo = () => {};

// matchMedia for libraries that gate on it
if (!('matchMedia' in globalThis)) {
  (globalThis as any).matchMedia = (q: string) => ({
    matches: false, media: q, addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false, onchange: null,
  });
}
