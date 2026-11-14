/** Compliance — assessments, findings workflow, risk register with 5×5 heatmap. */
import { useMemo, useState } from 'react';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { addFinding, setFindingStatus, setRiskStatus, upsertRisk } from '../../platform/db';
import { riskScore as rscore } from '../../platform/metrics';
import type { Finding, Risk, RiskStatus } from '../../platform/types';
import { Badge, Bar, Empty, Modal, PageHead, StatusBadge, Table, Tabs, toast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { fmtDate, fmtTimeAgo } from '../../platform/util';
import { userName } from './lookups';

const RISK_STATUSES: RiskStatus[] = ['open', 'mitigating', 'accepted', 'closed'];

export default function Compliance() {
  const { ctx, tenant, can } = useSessionCtx();
  const data = useData(s => s.data);
  const [tab, setTab] = useState('assessments');
  const [riskComposer, setRiskComposer] = useState(false);
  const [findingComposerFor, setFindingComposerFor] = useState<string | null>(null);

  const assessments = data.assessments.filter(a => a.tenantId === ctx.tenantId);
  const findings = data.findings.filter(f => f.tenantId === ctx.tenantId);
  const risks = data.risks.filter(r => r.tenantId === ctx.tenantId);
  const manageable = can('compliance.item.manage');

  const openRisks = risks.filter(r => r.status !== 'closed');
  const criticalFindings = findings.filter(f => f.severity === 'critical' && f.status !== 'remediated');

  // 5×5 risk map: likelihood (y) × impact (x)
  const grid = useMemo(() => {
    const cells = new Map<string, Risk[]>();
    for (const r of openRisks) {
      const key = `${r.likelihood}x${r.impact}`;
      cells.set(key, [...(cells.get(key) ?? []), r]);
    }
    return cells;
  }, [openRisks]);

  return (
    <div className="stack">
      <PageHead crumbs={[tenant.name, 'Compliance']} title="Audit, risk & compliance"
        sub={`${assessments.length} assessments · ${findings.filter(f => f.status !== 'remediated').length} open findings · ${openRisks.length} live risks`}
        actions={manageable ? (
          <div className="row">
            <button className="btn secondary" onClick={() => setRiskComposer(true)}><Icon name="plus" size={14} /> Log risk</button>
          </div>
        ) : undefined} />

      {criticalFindings.length > 0 && <div className="note">{criticalFindings.length} critical finding{criticalFindings.length > 1 ? 's' : ''} awaiting remediation — auditors will ask about these.</div>}

      <div className="card pad-lg stack">
        <Tabs tabs={[['assessments', `Assessments (${assessments.length})`], ['findings', `Findings (${findings.length})`], ['risks', `Risk register (${openRisks.length})`]]} value={tab} onChange={setTab} />
      </div>

      {tab === 'assessments' && (
        assessments.length === 0 ? <Empty icon="compliance" title="No assessments yet" /> : (
          <div className="grid-3">
            {assessments.map(a => (
              <div key={a.id} className="card pad-lg stack">
                <div className="row between"><Badge tone="info">{a.framework}</Badge><StatusBadge s={a.status === 'in_progress' ? 'in_progress' : 'completed'} /></div>
                <b>{a.name}</b>
                <div className="stack" style={{ gap: 4 }}>
                  <div className="row between xs"><span className="muted">Control satisfaction (self-assessment)</span><b className="num">{a.score}%</b></div>
                  <Bar value={a.score} tone={a.score >= 70 ? 'var(--ok)' : a.score >= 40 ? 'var(--warn)' : 'var(--bad)'} />
                </div>
                <div className="row between sm">
                  <span className="muted">by {userName(data, a.conductedBy)}</span>
                  {manageable && a.status === 'in_progress' && (
                    <button className="btn sm secondary" onClick={() => setFindingComposerFor(a.id)}>+ Finding</button>
                  )}
                </div>
                <div className="xs faint">started {fmtTimeAgo(a.startedAt)}{a.completedAt ? ` · completed ${fmtTimeAgo(a.completedAt)}` : ''}</div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'findings' && (
        findings.length === 0 ? <Empty icon="search" title="No findings recorded" /> : (
          <Table head={['Finding', 'Severity', 'Owner', 'Status', 'Due', '']}>
            {findings.map(f => (
              <tr key={f.id}>
                <td style={{ minWidth: 260 }}><b className="sm">{f.title}</b><div className="xs muted clamp2">{f.detail}</div></td>
                <td><StatusBadge s={f.severity} /></td>
                <td className="sm">{userName(data, f.ownerId)}</td>
                <td><StatusBadge s={f.status} /></td>
                <td className="sm">{f.dueAt ? fmtDate(f.dueAt) : '—'}</td>
                <td>
                  {manageable && f.status !== 'remediated' && (
                    <select className="select sm" style={{ width: 130 }} value={f.status} aria-label="Finding status"
                      onChange={e => { setFindingStatus(ctx, f.id, e.target.value as Finding['status']); toast('Finding updated'); }}>
                      {(['open', 'in_progress', 'remediated'] as const).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )
      )}

      {tab === 'risks' && (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(280px,1fr)' }}>
          <div className="card pad-lg stack">
            <h3>Heat map — likelihood × impact</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '40px repeat(5, 1fr)', gap: 4, alignItems: 'stretch' }}>
              <div />
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="xs faint" style={{ textAlign: 'center' }}>Impact {i}</div>)}
              {[5, 4, 3, 2, 1].map(l => (
                <>
                  <div key={`l${l}`} className="xs faint" style={{ display: 'grid', placeItems: 'center', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>L{l}</div>
                  {[1, 2, 3, 4, 5].map(i => {
                    const key = `${l}x${i}`;
                    const cell = grid.get(key) ?? [];
                    const score = l * i;
                    const bg = score >= 15 ? 'var(--bad-soft)' : score >= 8 ? 'var(--warn-soft)' : 'var(--ok-soft)';
                    const fg = score >= 15 ? 'var(--bad)' : score >= 8 ? 'var(--warn)' : 'var(--ok)';
                    return (
                      <div key={i} style={{ background: bg, borderRadius: 9, minHeight: 52, padding: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {cell.map(r => <span key={r.id} className="xs b ellipsis" style={{ color: fg }} title={r.title}>{r.title}</span>)}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
            <div style={{ textAlign: 'center' }} className="xs faint">Impact →</div>
          </div>
          <div className="stack">
            {openRisks.map(r => (
              <div key={r.id} className="card flat card-tight">
                <div className="row between">
                  <b className="sm" style={{ minWidth: 0 }}>{r.title}</b>
                  <Badge tone={rscore(r) >= 15 ? 'bad' : rscore(r) >= 8 ? 'warn' : 'ok'}>{rscore(r)}</Badge>
                </div>
                <div className="xs muted">{r.category} · owner {userName(data, r.ownerId)}</div>
                <div className="xs clamp2" style={{ marginTop: 3 }}>{r.treatment}</div>
                {manageable && (
                  <select className="select sm" style={{ width: '100%', marginTop: 6 }} value={r.status} aria-label="Risk status"
                    onChange={e => setRiskStatus(ctx, r.id, e.target.value as RiskStatus)}>
                    {RISK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
            ))}
            {openRisks.length === 0 && <Empty icon="shield" title="No open risks" hint="Rare but welcome — log new risks as they arise." />}
          </div>
        </div>
      )}

      {riskComposer && <RiskComposer onClose={() => setRiskComposer(false)} />}
      {findingComposerFor && <FindingComposer assessmentId={findingComposerFor} onClose={() => setFindingComposerFor(null)} />}
    </div>
  );
}

function RiskComposer({ onClose }: { onClose: () => void }) {
  const { ctx } = useSessionCtx();
  const [f, setF] = useState({ title: '', category: 'Security', likelihood: 3, impact: 3, treatment: '' });
  return (
    <Modal open onClose={onClose} title="Log a risk">
      <div className="stack">
        <div className="field"><label>Risk title</label>
          <input className="input" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Ransomware via unpatched endpoints" autoFocus /></div>
        <div className="form-grid">
          <div className="field"><label>Category</label>
            <select className="select" value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>
              {['Security', 'Availability', 'Compliance', 'Financial', 'Operational', 'Reputational'].map(c => <option key={c}>{c}</option>)}
            </select></div>
          <div className="field"><label>Likelihood (1-5)</label>
            <input className="input" type="number" min={1} max={5} value={f.likelihood} onChange={e => setF({ ...f, likelihood: Math.max(1, Math.min(5, +e.target.value)) })} /></div>
          <div className="field"><label>Impact (1-5)</label>
            <input className="input" type="number" min={1} max={5} value={f.impact} onChange={e => setF({ ...f, impact: Math.max(1, Math.min(5, +e.target.value)) })} /></div>
        </div>
        <div className="field"><label>Treatment plan</label>
          <textarea className="textarea" value={f.treatment} onChange={e => setF({ ...f, treatment: e.target.value })} placeholder="Reduce: enforce EDR patching within 72h…" /></div>
        <button className="btn block" disabled={f.title.trim().length < 5}
          onClick={() => { upsertRisk(ctx, { title: f.title.trim(), category: f.category, likelihood: f.likelihood as 1 | 2 | 3 | 4 | 5, impact: f.impact as 1 | 2 | 3 | 4 | 5, treatment: f.treatment.trim() }); toast('Risk logged'); onClose(); }}>
          Add to register — score {f.likelihood * f.impact}
        </button>
      </div>
    </Modal>
  );
}

function FindingComposer({ assessmentId, onClose }: { assessmentId: string; onClose: () => void }) {
  const { ctx } = useSessionCtx();
  const [f, setF] = useState({ title: '', severity: 'medium' as Finding['severity'], detail: '' });
  return (
    <Modal open onClose={onClose} title="Record a finding">
      <div className="stack">
        <div className="field"><label>Finding</label>
          <input className="input" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="No offsite backup rotation for finance server" autoFocus /></div>
        <div className="form-grid">
          <div className="field"><label>Severity</label>
            <select className="select" value={f.severity} onChange={e => setF({ ...f, severity: e.target.value as Finding['severity'] })}>
              {(['critical', 'high', 'medium', 'low'] as const).map(s => <option key={s}>{s}</option>)}
            </select></div>
        </div>
        <div className="field"><label>Evidence & detail</label>
          <textarea className="textarea" value={f.detail} onChange={e => setF({ ...f, detail: e.target.value })} /></div>
        <button className="btn block" disabled={f.title.trim().length < 5}
          onClick={() => { addFinding(ctx, { assessmentId, title: f.title.trim(), severity: f.severity, detail: f.detail.trim() }); toast('Finding recorded'); onClose(); }}>
          Record finding
        </button>
      </div>
    </Modal>
  );
}
