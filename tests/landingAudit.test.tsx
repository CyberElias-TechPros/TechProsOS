/** Landing structural audit — dump hero DOM + catch render errors in the showpiece markup. */
import { describe, expect, it, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useSession } from '../src/platform/session';
import LandingPage from '../src/pages/marketing/Landing';

beforeEach(() => {
  cleanup();
  useSession.setState({ userId: null, tenantId: null });
});

describe('landing showpiece integrity', () => {
  it('renders the full hero without errors', async () => {
    render(<MemoryRouter><LandingPage /></MemoryRouter>);
    // allow motion/gsap effects to tick
    await new Promise(r => setTimeout(r, 700));
    const html = document.body.innerHTML;
    expect(html).toContain('Your technology');
    expect(html).toContain('under control');
    expect(html).toContain('hero-mock');
  });

  it('hero uses masked-line structure exactly once per line', async () => {
    render(<MemoryRouter><LandingPage /></MemoryRouter>);
    await new Promise(r => setTimeout(r, 300));
    const lines = document.querySelectorAll('.hero-h1 .clip-line');
    expect(lines.length).toBe(2); // eyebrow uses its own clip-line outside h1
    expect(document.querySelectorAll('.hero-h1 .clip-inner').length).toBe(2);
    // after animation, lines must be fully visible (gsap ran)
    const inner = document.querySelector('.hero-h1 .clip-inner') as HTMLElement;
    const finished = inner.style.transform === '' || !inner.style.transform.includes('112');
    expect(finished).toBe(true);
  });

  it('velocity marquee duplicated content for a seamless loop', async () => {
    render(<MemoryRouter><LandingPage /></MemoryRouter>);
    await new Promise(r => setTimeout(r, 700));
    const items = document.querySelectorAll('.loop-item');
    expect(items.length).toBeGreaterThan(12); // cloned at least once
  });

  it('all six module spotlight cards render', async () => {
    render(<MemoryRouter><LandingPage /></MemoryRouter>);
    await new Promise(r => setTimeout(r, 700));
    expect(document.querySelectorAll('.module-card').length).toBe(6);
  });
});
