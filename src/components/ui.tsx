/** Shared UI primitives — Badge, Modal, Drawer, Empty, Toast bus, KV, Stepper, Bar. */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { useUiPrefs } from '../platform/session';

/* ── Badge ─────────────────────────────────────────────────────────────── */
export type BadgeTone = 'ok' | 'warn' | 'bad' | 'critical' | 'accent' | 'info' | 'violet' | 'high' | 'medium' | 'low' | 'outline' | '';
export function Badge({ tone = '', children, pulse }: { tone?: BadgeTone | string; children: ReactNode; pulse?: boolean }) {
  return <span className={`badge ${tone} ${pulse ? 'pulse' : ''}`}><span className="dot" />{children}</span>;
}

/* ── Status colour helpers (module-agnostic) ───────────────────────────── */
export const TONE_MAP: Record<string, BadgeTone> = {
  // generic statuses
  open: 'info', in_progress: 'accent', on_hold: 'medium', resolved: 'ok', closed: '', pending: 'warn',
  completed: 'ok', cancelled: '', active: 'ok', draft: 'medium', sent: 'info', partial: 'warn', overdue: 'bad',
  received: 'ok', approved: 'ok', rejected: 'bad', staff: '', degraded: 'warn', down: 'bad', up: 'ok',
  triage: 'warn', scheduled: 'info', live: 'ok', done: 'ok', blocked: 'bad', review: 'violet',
  backlog: '', todo: 'medium', requested: 'warn', offline: '', online: 'ok', expired: 'bad',
  paused: 'medium', high: 'high', medium: 'medium', low: 'low', critical: 'critical',
  breach: 'bad', breached: 'bad', met: 'ok', in_risk: 'warn', new: 'accent',
};
export const toneOf = (status: string) => TONE_MAP[status] ?? '';
export const pretty = (s: string) => s.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

export function StatusBadge({ s, pulse }: { s: string; pulse?: boolean }) {
  return <Badge tone={toneOf(s)} pulse={pulse}>{pretty(s)}</Badge>;
}

/* ── KV definition list ────────────────────────────────────────────────── */
export function KV({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="kv">
      {items.map(([k, v], i) => (<div key={i} style={{ display: 'contents' }}><dt>{k}</dt><dd>{v}</dd></div>))}
    </dl>
  );
}

/* ── Modal / Drawer ────────────────────────────────────────────────────── */
export function Modal({ open, onClose, title, wide, children }: { open: boolean; onClose: () => void; title: string; wide?: boolean; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="overlay" role="dialog" aria-modal="true" aria-label={title} onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={`dialog ${wide ? 'wide' : ''}`}>
        <div className="row between" style={{ padding: '15px 18px', borderBottom: '1px solid var(--line)' }}>
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 13 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, children, width }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <>
      <div className="overlay" style={{ padding: 0, display: 'block' }} onMouseDown={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" style={width ? { width } : undefined}>
        <div className="row between" style={{ padding: '14px 18px', borderBottom: '1px solid var(--line)', flex: 'none' }}>
          <div style={{ minWidth: 0 }}>{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button>
        </div>
        <div style={{ overflow: 'auto', flex: 1, padding: 18 }}>{children}</div>
      </aside>
    </>,
    document.body,
  );
}

/* ── Empty state ───────────────────────────────────────────────────────── */
export function Empty({ icon = 'inbox', title, hint, action }: { icon?: Parameters<typeof Icon>[0]['name']; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="glyph"><Icon name={icon} size={20} /></span>
      <div className="b">{title}</div>
      {hint && <div className="sm" style={{ maxWidth: '46ch' }}>{hint}</div>}
      {action}
    </div>
  );
}

/* ── Progress bar ──────────────────────────────────────────────────────── */
export function Bar({ value, tone = 'var(--accent)', thin }: { value: number; tone?: string; thin?: boolean }) {
  const v = Math.max(0, Math.min(100, value));
  return <div className={`bar ${thin ? 'thin' : ''}`} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${v}%`, background: tone }} /></div>;
}

/* ── Tabs ──────────────────────────────────────────────────────────────── */
export function Tabs({ tabs, value, onChange }: { tabs: [string, string][]; value: string; onChange: (id: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([id, label]) => (
        <button key={id} role="tab" aria-selected={value === id} onClick={() => onChange(id)}>{label}</button>
      ))}
    </div>
  );
}

/* ── Toast bus (tiny pub/sub hook) ─────────────────────────────────────── */
type Toast = { id: number; msg: string; tone: 'ok' | 'bad' | 'info' };
let toastPush: ((t: Omit<Toast, 'id'>) => void) | null = null;
export function toast(msg: string, tone: Toast['tone'] = 'ok') { toastPush?.({ msg, tone }); }

export function ToastRegion() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    toastPush = t => {
      const id = Date.now() + Math.random();
      setItems(xs => [...xs.slice(-3), { ...t, id }]);
      setTimeout(() => setItems(xs => xs.filter(x => x.id !== id)), 3400);
    };
    return () => { toastPush = null; };
  }, []);
  return (
    <div className="toast-region" aria-live="polite">
      {items.map(t => (
        <div className="toast" key={t.id}>
          <Icon name={t.tone === 'ok' ? 'check' : t.tone === 'bad' ? 'incident' : 'bell'} size={15} />
          {t.msg}
        </div>
      ))}
    </div>
  );
}

/* ── Avatar by user record ─────────────────────────────────────────────── */
export function UserAvatar({ name, email, size }: { name: string; email?: string; size?: 'sm' | 'lg' }) {
  const hue = [...(name + email)].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('');
  return (
    <span className={`avatar ${size ?? ''}`} style={{ background: `linear-gradient(135deg, hsl(${hue} 55% 42%), hsl(${(hue + 40) % 360} 65% 50%))` }} aria-label={name}>
      {initials}
    </span>
  );
}

/* ── Table scaffold with sticky header ─────────────────────────────────── */
export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table className="tbl">
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/* ── Page head ─────────────────────────────────────────────────────────── */
export function PageHead({ crumbs, title, sub, actions }: { crumbs: string[]; title: string; sub?: string; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <div className="crumbs">{crumbs.join(' · ')}</div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

/* ── Theme toggle ──────────────────────────────────────────────────────── */
export function ThemeToggle() {
  const { prefs, setPrefs } = useUiPrefs();
  const next = prefs.theme === 'dark' ? 'light' : 'dark';
  return (
    <button className="icon-btn" aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}
      onClick={() => setPrefs({ theme: next })}>
      <Icon name={prefs.theme === 'dark' ? 'sun' : 'moon'} size={17} />
    </button>
  );
}
