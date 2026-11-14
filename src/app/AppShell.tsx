/** AppShell — sidebar navigation, topbar, command palette, notification centre. */
import { useMemo, useRef, useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useSessionInfo, useUiPrefs, useSession } from '../platform/session';
import { useData } from '../platform/store';
import { visibleTickets } from '../platform/metrics';
import { markNotificationRead } from '../platform/db';
import { Icon } from '../components/icons';
import { pretty, StatusBadge, ThemeToggle, toast, UserAvatar } from '../components/ui';
import { navFor } from './nav';
import { fmtTimeAgo } from '../platform/util';
import { CommandPalette } from './CommandPalette';

function useBadges() {
  const info = useSessionInfo();
  const data = useData(s => s.data);
  return useMemo(() => {
    if (!info) return {};
    const t = info.tenant.id;
    const openTickets = visibleTickets(data, info.ctx).filter(x => x.status !== 'closed' && x.status !== 'resolved').length;
    const alerts = data.alerts.filter(a => a.tenantId === t && a.status === 'active').length;
    const overdueInvoices = data.invoices.filter(i => i.tenantId === t && (i.status === 'overdue' || (i.status === 'sent' && new Date(i.dueAt) < new Date()))).length;
    const lowStock = data.stockItems.filter(s => s.tenantId === t && s.qty <= s.reorderLevel).length;
    return { openTickets, alerts, overdueInvoices, lowStock } as Record<string, number>;
  }, [data, info]);
}

function WorkspaceSwitch() {
  const info = useSessionInfo();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  if (!info) return null;
  return (
    <div className="ws-switch" ref={ref} style={{ position: 'relative' }}>
      <button className="cur" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="brand-mark" style={{ width: 26, height: 26, fontSize: 10 }}>{info.tenant.name.slice(0, 2).toUpperCase()}</span>
        <span className="txt" style={{ minWidth: 0 }}>
          <div className="ellipsis" style={{ fontWeight: 600 }}>{info.tenant.name}</div>
          <div className="xs" style={{ color: 'var(--ink-muted)', fontWeight: 400 }}>{info.tenant.type === 'service_provider' ? 'Provider workspace' : info.tenant.industry}</div>
        </span>
        {info.tenants.length > 1 && <Icon name="chevronDown" size={13} style={{ marginLeft: 'auto', flex: 'none' }} />}
      </button>
      {open && info.tenants.length > 1 && (
        <div className="ws-menu" role="menu">
          <div style={{ padding: '10px 13px 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.07em', color: 'var(--faint)' }}>Switch workspace</div>
          {info.tenants.map(t => (
            <button key={t.id} role="menuitem" onClick={() => { info.switchTenant(t.id); setOpen(false); toast(`Now viewing ${t.name}`); }}>
              <span className="avatar sm" style={{ background: 'var(--surface-3)', color: 'var(--muted)' }}>{t.name.slice(0, 2).toUpperCase()}</span>
              <span style={{ minWidth: 0 }}>
                <div className="ellipsis b sm">{t.name}</div>
                <div className="xs faint">{t.type === 'service_provider' ? 'Provider' : t.industry}</div>
              </span>
              {t.id === info.tenant.id && <Icon name="check" size={13} style={{ marginLeft: 'auto', color: 'var(--accent)' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationsBell() {
  const info = useSessionInfo();
  const data = useData(s => s.data);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const notifs = useMemo(() => {
    if (!info) return [];
    return data.notifications
      .filter(n => n.userId === info.user.id && n.tenantId === info.tenant.id)
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [data, info]);
  const unread = notifs.filter(n => !n.read).length;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="icon-btn" aria-label={`Notifications (${unread} unread)`} onClick={() => setOpen(o => !o)}>
        <Icon name="bell" size={17} />
        {unread > 0 && (
          <span style={{ position: 'absolute', top: 3, right: 3, background: 'var(--crit)', color: '#fff', fontSize: 9.5, fontWeight: 700, borderRadius: 99, padding: '0 4px', lineHeight: '14px' }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>
      {open && info && (
        <div className="notif-pop">
          <div className="row between" style={{ padding: '11px 14px', borderBottom: '1px solid var(--line)' }}>
            <b className="sm">Notifications</b>
            {unread > 0 && <button className="btn ghost sm" onClick={() => markNotificationRead(info.tenant.id, info.user.id)}>Mark all read</button>}
          </div>
          <div style={{ overflow: 'auto' }}>
            {notifs.length === 0 && <div className="empty" style={{ padding: 24 }}>No notifications yet</div>}
            {notifs.slice(0, 30).map(n => (
              <button key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`}
                onClick={() => { markNotificationRead(info.tenant.id, info.user.id, n.id); if (n.link) { navigate(n.link); setOpen(false); } }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div className="b sm">{n.title}</div>
                  <div className="sm muted clamp2">{n.body}</div>
                  <div className="xs faint" style={{ marginTop: 2 }}>{fmtTimeAgo(n.at)}</div>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const info = useSessionInfo();
  const navigate = useNavigate();
  const signOut = useSession(s => s.signOut);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  if (!info) return null;
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="user-chip" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ background: 'var(--surface)', border: '1px solid var(--line)', color: 'var(--fg)', padding: '5px 10px 5px 5px', boxShadow: 'var(--shadow-1)' }}>
        <UserAvatar name={info.user.name} email={info.user.email} />
        <span style={{ textAlign: 'left', minWidth: 0 }} className="txt">
          <div className="b sm ellipsis" style={{ maxWidth: 130 }}>{info.user.name.split(' ')[0]}</div>
          <div className="xs muted">{pretty(info.role)}</div>
        </span>
        <Icon name="chevronDown" size={13} />
      </button>
      {open && (
        <div className="ws-menu" style={{ left: 'auto', right: 0, minWidth: 220 }}>
          <div style={{ padding: '11px 13px', borderBottom: '1px solid var(--line)' }}>
            <div className="b sm">{info.user.name}</div>
            <div className="xs muted">{info.user.email}</div>
            <div className="xs" style={{ marginTop: 3 }}><StatusBadge s={info.role} /></div>
          </div>
          <button onClick={() => { navigate('/app/notifications'); setOpen(false); }}><Icon name="bell" size={14} /> My notifications</button>
          <button onClick={() => { signOut(); navigate('/login'); toast('Signed out'); }}><Icon name="logout" size={14} /> Sign out</button>
        </div>
      )}
    </div>
  );
}

export function AppShell() {
  const info = useSessionInfo();
  const { prefs, setPrefs } = useUiPrefs();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const badges = useBadges();
  const location = useLocation();
  const navigate = useNavigate();

  // ⌘K / Ctrl+K opens the command palette — keyboard-first navigation.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen(o => !o); }
      if (e.key === 'g' && !paletteOpen) {
        // "g then x" shortcuts — minimal vim-pattern for power users
        const once = (e2: KeyboardEvent) => {
          const map: Record<string, string> = { t: '/app/service-desk', a: '/app/assets', o: '/app/overview', r: '/app/reports' };
          if (map[e2.key]) navigate(map[e2.key]);
          window.removeEventListener('keydown', once, true);
        };
        if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) window.addEventListener('keydown', once, true);
        setTimeout(() => window.removeEventListener('keydown', once, true), 900);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [paletteOpen, navigate]);

  // close drawer nav on route change (mobile)
  useEffect(() => { setMobileNav(false); }, [location.pathname]);
  // scroll to top on route change
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  if (!info) return <Outlet />; // route guards redirect signed-out users to /login
  const groups = navFor(info.tenant.type === 'service_provider' ? 'provider' : 'org')
    .map(g => ({ ...g, items: g.items.filter(i => info.can(i.requires)) }))
    .filter(g => g.items.length > 0);

  return (
    <div className={`app-frame ${prefs.sidebarCollapsed ? 'collapsed' : ''}`}>
      {mobileNav && <div className="sidebar-scrim" onClick={() => setMobileNav(false)} />}
      <aside className={`sidebar ${mobileNav ? 'open' : ''}`} aria-label="Primary">
        <div className="brand">
          <span className="brand-mark">TP</span>
          <span className="brand-copy">
            <div className="brand-name">TechPros One</div>
            <div className="brand-sub">{info.tenant.type === 'service_provider' ? 'Provider Console' : 'Organisation'}</div>
          </span>
        </div>
        <WorkspaceSwitch />
        <nav className="nav-scroll">
          {groups.map(g => (
            <div className="nav-group" key={g.group}>
              <div className="g">{g.group}</div>
              {g.items.map(item => {
                const count = item.badge ? badges[item.badge] : 0;
                return (
                  <NavLink key={item.path} to={item.path}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} title={item.label}>
                    <Icon name={item.icon} size={16} className="ico" />
                    <span className="txt">{item.label}</span>
                    {count ? <span className={`count ${item.badge === 'alerts' ? 'hot' : ''}`}>{count}</span> : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="row" style={{ justifyContent: prefs.sidebarCollapsed ? 'center' : 'space-between' }}>
            <ThemeToggle />
            <button className="icon-btn" style={{ color: 'var(--ink-muted)' }} aria-label="Toggle sidebar"
              onClick={() => setPrefs({ sidebarCollapsed: !prefs.sidebarCollapsed })}>
              <Icon name={prefs.sidebarCollapsed ? 'chevrons' : 'chevrons'} size={15} style={prefs.sidebarCollapsed ? { transform: 'scaleX(-1)' } : undefined} />
            </button>
          </div>
        </div>
      </aside>

      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
        <div className="topbar no-print">
          <button className="icon-btn mobile-burger" aria-label="Menu" onClick={() => setMobileNav(true)}>
            <svg width="17" height="17" viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={1.8} strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <button className="search-trigger" onClick={() => setPaletteOpen(true)} aria-label="Search or run a command">
            <Icon name="search" size={15} />
            <span>Search or jump to…</span>
            <span style={{ marginLeft: 'auto' }} className="kbd">⌘K</span>
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn secondary sm" onClick={() => navigate('/app/service-desk/new')}>
            <Icon name="plus" size={14} /> New ticket
          </button>
          <NotificationsBell />
          <UserMenu />
        </div>
        <main className="main-content">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
