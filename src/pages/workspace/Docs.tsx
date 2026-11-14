/** Docs & knowledge — searchable KB + controlled documents with review dates. */
import { useMemo, useState } from 'react';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { saveArticle, saveDocumentRecord } from '../../platform/actions';
import { Badge, Empty, Modal, PageHead, Table, Tabs, toast } from '../../components/ui';
import { Icon } from '../../components/icons';
import { daysUntil, fmtDate, fmtTimeAgo } from '../../platform/util';
import { userName } from './lookups';

export default function Docs() {
  const { ctx, tenant, can } = useSessionCtx();
  const data = useData(s => s.data);
  const [tab, setTab] = useState('kb');
  const [q, setQ] = useState('');
  const [openArticle, setOpenArticle] = useState<string | null>(null);
  const [composer, setComposer] = useState<'article' | 'document' | null>(null);

  const articles = data.articles.filter(a => a.tenantId === ctx.tenantId);
  const docs = data.documents.filter(d => d.tenantId === ctx.tenantId);

  const shownArticles = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const xs = articles.filter(a => a.status === 'published' || can('docs.content.manage'));
    return needle ? xs.filter(a => `${a.title} ${a.tags.join(' ')} ${a.category} ${a.body}`.toLowerCase().includes(needle)) : xs;
  }, [articles, q, can]);
  const shownDocs = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? docs.filter(d => `${d.title} ${d.kind} ${d.summary}`.toLowerCase().includes(needle)) : docs;
  }, [docs, q]);

  const expiring = docs.filter(d => d.expiresAt && daysUntil(d.expiresAt) <= 45 && daysUntil(d.expiresAt) > 0);

  return (
    <div className="stack">
      <PageHead crumbs={[tenant.name, 'Docs']} title="Documentation & knowledge"
        sub="Institutional memory: how-tos for users, runbooks for staff, policies for auditors."
        actions={can('docs.content.manage') ? (
          <div className="row">
            <button className="btn secondary" onClick={() => setComposer('article')}><Icon name="plus" size={14} /> New article</button>
            <button className="btn secondary" onClick={() => setComposer('document')}><Icon name="file" size={14} /> New document</button>
          </div>
        ) : undefined} />

      {expiring.length > 0 && <div className="note">{expiring.length} document{expiring.length > 1 ? 's' : ''} up for review within 45 days.</div>}

      <div className="row" style={{ gap: 8 }}>
        <div style={{ position: 'relative', flex: '0 1 320px' }}>
          <Icon name="search" size={14} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: 'var(--faint)' }} />
          <input className="input" style={{ paddingLeft: 32 }} placeholder="Search articles & documents…" value={q} onChange={e => setQ(e.target.value)} aria-label="Search knowledge" />
        </div>
        <Tabs tabs={[['kb', `Knowledge base (${articles.length})`], ['docs', `Documents (${docs.length})`]]} value={tab} onChange={setTab} />
      </div>

      {tab === 'kb' && (
        shownArticles.length === 0 ? <Empty icon="book" title="No articles found" /> : (
          <div className="stack">
            {shownArticles.map(a => (
              <div key={a.id} id={a.id} className="card pad-lg stack">
                <button style={{ all: 'unset', cursor: 'pointer' }} onClick={() => setOpenArticle(openArticle === a.id ? null : a.id)} aria-expanded={openArticle === a.id}>
                  <div className="row between">
                    <div style={{ minWidth: 0 }}>
                      <b>{a.title}</b>
                      <div className="xs muted" style={{ marginTop: 2 }}>{a.category} · updated {fmtTimeAgo(a.updatedAt)} · {a.helpful} found helpful</div>
                    </div>
                    <span className="row">
                      {a.status === 'draft' && <Badge tone="medium">draft</Badge>}
                      {a.tags.slice(0, 3).map(t => <Badge key={t} tone="outline">{t}</Badge>)}
                      <Icon name="chevronDown" size={15} style={{ color: 'var(--faint)' }} />
                    </span>
                  </div>
                </button>
                {openArticle === a.id && (
                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                    <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>{a.body}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'docs' && (
        shownDocs.length === 0 ? <Empty icon="file" title="No documents found" /> : (
          <Table head={['Document', 'Kind', 'Version', 'Owner', 'Next review', '']}>
            {shownDocs.map(d => {
              const left = d.expiresAt ? daysUntil(d.expiresAt) : null;
              return (
                <tr key={d.id}>
                  <td><div className="b sm">{d.title}</div><div className="xs muted clamp2">{d.summary}</div></td>
                  <td><Badge tone="outline">{d.kind}</Badge></td>
                  <td className="mono sm">v{d.version}</td>
                  <td className="sm">{userName(data, d.ownerId)}</td>
                  <td>{left == null ? <span className="faint sm">—</span> : left < 0 ? <Badge tone="bad">expired</Badge> : left <= 45 ? <Badge tone="warn">{left}d</Badge> : <span className="sm">{fmtDate(d.expiresAt!)}</span>}</td>
                  <td className="xs faint">{fmtTimeAgo(d.updatedAt)}</td>
                </tr>
              );
            })}
          </Table>
        )
      )}

      {composer === 'article' && <ArticleComposer onClose={() => setComposer(null)} />}
      {composer === 'document' && <DocumentComposer onClose={() => setComposer(null)} />}
    </div>
  );
}

function ArticleComposer({ onClose }: { onClose: () => void }) {
  const { ctx } = useSessionCtx();
  const [f, setF] = useState({ title: '', category: 'How-to', tags: '', body: '', publish: true });
  const submit = async () => {
    await saveArticle(ctx, {
      title: f.title.trim(), body: f.body.trim(), category: f.category,
      tags: f.tags.split(',').map(s => s.trim()).filter(Boolean),
      publish: f.publish,
    });
    toast(f.publish ? 'Article published' : 'Draft saved');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="New knowledge article" wide>
      <div className="form-grid">
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Title</label>
          <input className="input" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="How to connect to the Staff Wi‑Fi" autoFocus /></div>
        <div className="field"><label>Category</label>
          <select className="select" value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>
            {['How-to', 'Troubleshooting', 'Security awareness', 'Onboarding', 'Policy explainer'].map(c => <option key={c}>{c}</option>)}
          </select></div>
        <div className="field"><label>Tags (comma-separated)</label>
          <input className="input" value={f.tags} onChange={e => setF({ ...f, tags: e.target.value })} placeholder="wifi, onboarding" /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Body</label>
          <textarea className="textarea" style={{ minHeight: 160 }} value={f.body} onChange={e => setF({ ...f, body: e.target.value })}
            placeholder="Step 1: …" /></div>
      </div>
      <label className="check-row"><input type="checkbox" checked={f.publish} onChange={e => setF({ ...f, publish: e.target.checked })} /> Publish immediately</label>
      <button className="btn block" disabled={f.title.trim().length < 6 || f.body.trim().length < 20} onClick={submit}>Save article</button>
    </Modal>
  );
}

function DocumentComposer({ onClose }: { onClose: () => void }) {
  const { ctx } = useSessionCtx();
  const [f, setF] = useState({ title: '', kind: 'sop' as 'policy' | 'sop' | 'diagram' | 'manual' | 'report' | 'handover', summary: '', reviewInDays: 365 });
  const submit = async () => {
    await saveDocumentRecord(ctx, {
      title: f.title.trim(), kind: f.kind, summary: f.summary.trim(),
      expiresAt: f.reviewInDays > 0 ? new Date(Date.now() + f.reviewInDays * 86_400_000).toISOString() : undefined,
    });
    toast('Document registered as v1.0');
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Register a document">
      <div className="form-grid">
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Title</label>
          <input className="input" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Acceptable Use Policy" autoFocus /></div>
        <div className="field"><label>Type</label>
          <select className="select" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as typeof f.kind })}>
            {['policy', 'sop', 'diagram', 'manual', 'report', 'handover'].map(k => <option key={k}>{k.toUpperCase()}</option>)}
          </select></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Summary</label>
          <textarea className="textarea" style={{ minHeight: 90 }} value={f.summary} onChange={e => setF({ ...f, summary: e.target.value })} /></div>
        <div className="field"><label>Review cycle</label>
          <select className="select" value={f.reviewInDays} onChange={e => setF({ ...f, reviewInDays: +e.target.value })}>
            <option value={90}>Quarterly</option><option value={180}>Bi-annually</option><option value={365}>Annually</option><option value={0}>No scheduled review</option>
          </select></div>
      </div>
      <button className="btn block" disabled={f.title.trim().length < 4} onClick={submit}>Register document</button>
    </Modal>
  );
}
