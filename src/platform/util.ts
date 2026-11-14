/** Small, dependency-free utilities shared by the platform core and UI. */

export const uid = (): string =>
  (globalThis.crypto?.randomUUID?.() ??
    'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36));

/** Deterministic PRNG for seed data — same dataset every fresh install. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const nowIso = (): string => new Date().toISOString();

export const DAYS = 86_400_000;
export const HOURS = 3_600_000;
export const MINUTES = 60_000;

export const addDays = (iso: string, days: number): string => new Date(new Date(iso).getTime() + days * DAYS).toISOString();
export const addHours = (iso: string, hours: number): string => new Date(new Date(iso).getTime() + hours * HOURS).toISOString();
export const addMonths = (iso: string, months: number): string => {
  const d = new Date(iso); d.setMonth(d.getMonth() + months); return d.toISOString();
};
export const daysUntil = (iso: string, from = new Date()): number =>
  Math.ceil((new Date(iso).getTime() - from.getTime()) / DAYS);
export const hoursBetween = (a: string, b: string): number =>
  Math.abs(new Date(b).getTime() - new Date(a).getTime()) / HOURS;

export const NIGERIAN_CITIES = ['Lagos', 'Abuja', 'Port Harcourt', 'Ibadan', 'Kano', 'Enugu', 'Benin City', 'Kaduna', 'Onitsha', 'Jos'] as const;

export interface NairaParts { amount: string; }
/** Format naira: ₦1,250,000 or compact ₦1.25m for axis labels. */
export function ngn(amount: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && Math.abs(amount) >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(amount % 1_000_000 === 0 ? 0 : 1)}m`;
  if (opts.compact && Math.abs(amount) >= 100_000) return `₦${Math.round(amount / 1_000)}k`;
  return '₦' + Math.round(amount).toLocaleString('en-NG');
}

export function fmtDate(iso?: string, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-NG', opts ?? { day: 'numeric', month: 'short', year: 'numeric' });
}
export function fmtDateTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
export function fmtTimeAgo(iso: string, from = Date.now()): string {
  const s = Math.max(1, Math.round((from - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24); if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30); if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}
export function fmtDuration(ms: number): string {
  if (ms < 0) return 'overdue';
  const mins = Math.round(ms / MINUTES);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ${mins % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

export const initials = (name: string): string =>
  name.split(/\s+/).map(p => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

/** Deterministic pastel colour for avatars/labels. */
export function hueFor(text: string): string {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 62% 42%)`;
}

export const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));
export const pct = (a: number, b: number): number => (b === 0 ? 0 : Math.round((a / b) * 100));

export function downloadText(filename: string, text: string, mime = 'text/plain'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

export function toCsv(rows: (string | number | undefined | null)[][]): string {
  const esc = (v: string | number | undefined | null) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return rows.map(r => r.map(esc).join(',')).join('\n');
}

/** Copy text to the clipboard with a legacy fallback for non-secure contexts. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}
