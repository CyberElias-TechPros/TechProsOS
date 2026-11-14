/** Audit trail — immutable activity ledger for the workspace, filterable & exportable. */
import { useMemo, useState } from 'react';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { Empty, PageHead, Table } from '../../components/ui';
import { Icon } from '../../components/icons';
import { downloadText, fmtDateTime, toCsv } from '../../platform/util';
import { toast } from '../../components/ui';

export default function AuditTrail() {
  const { ctx, tenant } = useSessionCtx();
  const data = useData(s => s.data);
  const [q, setQ] = useState('');
  const [entityFilter, setEntityFilter] = useState('');

  const entries = data.auditLogs.filter(a => a.tenantId === ctx.tenantId);
  const entities = useMemo(() => [...new Set(entries.map(e => e.entity))].sort(), [entries]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter(e => {
      if (entityFilter && e.entity !== entityFilter) return false;
      if (needle && !`${e.summary} ${e.actorName} ${e.action}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [entries, q, entityFilter]);

  return (
    <div className="stack">
      <PageHead crumbs={[tenant.name, 'Administration', 'Audit trail']} title="Audit trail"
        sub={`${entries.length} immutable entries. Every mutation anywhere in this workspace lands here — NDPA-grade accountability.`}
        actions={
          <button className="btn secondary" onClick={() => {
            downloadText(`audit-${tenant.slug}.csv`, toCsv([
              ['When (UTC)', 'Actor', 'Action', 'Entity', 'Summary', 'Changes'],
              ...shown.map(e => [e.at, e.actorName, e.action, `${e.entity}:${e.entityId}`, e.summary, (e.diff ?? []).map(d => `${d.field}: ${d.from} → ${d.to}`).join('; ')]),
            ]), 'text/csv');
            toast(`Exported ${shown.length} audit entries`);
          }}><Icon name="download" size={14} /> Export CSV</button>
        } />

      <div className="row" style={{ gap: 8 }}>
        <div style={{ position: 'relative', flex: '0 1 320px' }}>
          <Icon name="search" size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--faint)' }} />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Search actor, action, summary…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search audit" />
        </div>
        <select className="select" style={{ maxWidth: 180 }} value={entityFilter} onChange={e => setEntityFilter(e.target.value)} aria-label="Entity filter">
          <option value="">All entities</option>
          {entities.map(e => <option key={e}>{e}</option>)}
        </select>
      </div>

      {shown.length === 0 ? <Empty icon="history" title="No matching entries" /> : (
        <Table head={['When (UTC)', 'Actor', 'Action', 'Summary', 'Change details']}>
          {shown.slice(0, 200).map(e => (
            <tr key={e.id}>
              <td className="mono xs" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(e.at)}</td>
              <td className="sm b">{e.actorName}</td>
              <td><span className="mono xs badge outline">{e.action}</span></td>
              <td className="sm">{e.summary}</td>
              <td className="xs muted">{e.diff?.map(d => `${d.field}: ${d.from} → ${d.to}`).join(' · ') ?? '—'}</td>
            </tr>
          ))}
        </Table>
      )}
      <p className="xs faint">Showing {Math.min(200, shown.length)} of {shown.length} · Entries are appended, never rewritten.</p>
    </div>
  );
}
