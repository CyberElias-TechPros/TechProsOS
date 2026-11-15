/** Command palette — keyboard-first navigation across modules + records. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useSessionInfo } from '../platform/session';
import { useData } from '../platform/store';
import { ALL_NAV } from './nav';
import { Icon, type IconName } from '../components/icons';
import { buildSearchIndex, searchRecords } from '../platform/search';

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
    const cmd: Cmd[] = ALL_NAV.filter(i => info.can(i.requires)).map(i => ({
      id: `nav:${i.path}`, title: `Go to ${i.label}`, icon: i.icon,
      run: () => navigate(i.path),
    }));
    cmd.push({ id: 'act:new-ticket', title: 'Create ticket', sub: 'Action', icon: 'plus', run: () => navigate('/app/service-desk/new') });
    cmd.push({ id: 'act:assistant', title: 'Ask the assistant', sub: 'AI', icon: 'ai', run: () => navigate('/app/assistant') });
    return cmd;
  }, [data, info, navigate]);

  // Records are indexed through the permission-scoped search module, so search can never
  // surface something the list screens would hide (previously it read data.tickets directly).
  const records = useMemo(() => info ? buildSearchIndex(data, info.ctx) : [], [data, info]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const matchedCommands = needle
      ? commands.filter(c => `${c.title} ${c.sub ?? ''}`.toLowerCase().includes(needle))
      : commands;
    if (!needle) return matchedCommands.slice(0, 9);
    const hits = searchRecords(records, needle, 12).map<Cmd>(r => ({
      id: `rec:${r.kind}:${r.id}`, title: r.subtitle ? `${r.title} · ${r.subtitle}` : r.title,
      sub: r.kind, icon: r.icon, run: () => navigate(r.to),
    }));
    // Commands first when they match directly, then records, capped for a scannable list.
    return [...matchedCommands.slice(0, 4), ...hits].slice(0, 14);
  }, [commands, records, q, navigate]);

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
          {filtered.length === 0 && <div className="empty" style={{ padding: 22 }}>No matches — try a ticket code, asset tag, client or document title</div>}
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
