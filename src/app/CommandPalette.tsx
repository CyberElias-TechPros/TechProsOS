/** Command palette — keyboard-first navigation across modules + records. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useSessionInfo } from '../platform/session';
import { useData } from '../platform/store';
import { ALL_NAV } from './nav';
import { Icon, type IconName } from '../components/icons';

interface Cmd {
  id: string;
  title: string;
  sub?: string;
  icon: IconName;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const info = useSessionInfo();
  const data = useData(s => s.data);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setQ(''); setSel(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  const commands = useMemo<Cmd[]>(() => {
    if (!info) return [];
    const t = info.tenant.id;
    const cmd: Cmd[] = ALL_NAV.filter(i => info.can(i.requires)).map(i => ({
      id: `nav:${i.path}`, title: `Go to ${i.label}`, icon: i.icon,
      run: () => navigate(i.path),
    }));
    // searchable tickets + assets scoped to this tenant
    for (const tk of data.tickets.filter(x => x.tenantId === t).slice(-60)) {
      cmd.push({ id: `t:${tk.id}`, title: `${tk.number} — ${tk.title}`, sub: 'Ticket', icon: 'tickets', run: () => navigate(`/app/service-desk/${tk.id}`) });
    }
    for (const a of data.assets.filter(x => x.tenantId === t).slice(-40)) {
      cmd.push({ id: `a:${a.id}`, title: `${a.tag} — ${a.name}`, sub: 'Asset', icon: 'assets', run: () => navigate(`/app/assets/${a.id}`) });
    }
    for (const d of data.devices.filter(x => x.tenantId === t).slice(-20)) {
      cmd.push({ id: `d:${d.id}`, title: d.name, sub: 'Device', icon: 'infra', run: () => navigate(`/app/monitoring?device=${d.id}`) });
    }
    cmd.push({ id: 'act:new-ticket', title: 'Create ticket', sub: 'Action', icon: 'plus', run: () => navigate('/app/service-desk/new') });
    cmd.push({ id: 'act:assistant', title: 'Ask the assistant', sub: 'AI', icon: 'ai', run: () => navigate('/app/assistant') });
    return cmd;
  }, [data, info, navigate]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return commands.slice(0, 9);
    return commands.filter(c => `${c.title} ${c.sub ?? ''}`.toLowerCase().includes(needle)).slice(0, 9);
  }, [commands, q]);

  useEffect(() => setSel(0), [q]);

  if (!open) return null;
  return createPortal(
    <div className="overlay palette-wrap" onMouseDown={e => e.target === e.currentTarget && onClose()}
      onKeyDown={e => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(filtered.length - 1, s + 1)); }
        if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(0, s - 1)); }
        if (e.key === 'Enter' && filtered[sel]) { onClose(); filtered[sel].run(); }
      }}>
      <div className="palette" role="dialog" aria-label="Command palette">
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Type a command or search…" aria-label="Command search" />
        <div className="palette-list" role="listbox">
          {filtered.length === 0 && <div className="empty" style={{ padding: 22 }}>No matches — try a ticket code like TKT-1003</div>}
          {filtered.map((c, i) => (
            <button key={c.id} className="palette-item" role="option" aria-selected={i === sel}
              onMouseEnter={() => setSel(i)}
              onClick={() => { onClose(); c.run(); }}>
              <Icon name={c.icon} size={16} style={{ color: 'var(--muted)' }} />
              <span className="ellipsis" style={{ minWidth: 0, flex: 1 }}>{c.title}</span>
              {c.sub && <span className="where">{c.sub}</span>}
            </button>
          ))}
        </div>
        <div className="row" style={{ padding: '8px 14px', borderTop: '1px solid var(--line)', gap: 14 }}>
          <span className="xs faint"><span className="kbd">↑↓</span> navigate</span>
          <span className="xs faint"><span className="kbd">↵</span> select</span>
          <span className="xs faint"><span className="kbd">esc</span> close</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
