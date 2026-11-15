/** AI Assistant — grounded Q&A over the current workspace. States its basis, always. */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSessionCtx } from '../../platform/session';
import { useData } from '../../platform/store';
import { askAssistant, type AssistantReply } from '../../platform/ai';
import { PageHead, toast } from '../../components/ui';
import { consumeAssistantCredit } from '../../platform/actions';
import { creditUsage } from '../../platform/entitlements';
import { Icon } from '../../components/icons';
import { UserAvatar } from '../../components/ui';

interface Msg { role: 'user' | 'bot'; text?: string; reply?: AssistantReply; at: string }

const STARTERS = [
  'Which tickets are at risk of breaching SLA?',
  'What are the most common problems?',
  'How is our monitored fleet doing?',
  'Any assets nearing warranty expiry?',
  'Summarise invoices overdue',
  'How do I onboard a new staff member?',
];

export default function Assistant() {
  const { ctx, tenant, user } = useSessionCtx();
  const data = useData(s => s.data);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const scRef = useRef<HTMLDivElement>(null);
  const { remaining: credits, exhausted } = creditUsage(data, ctx.tenantId);

  useEffect(() => { scRef.current?.scrollTo({ top: scRef.current.scrollHeight }); }, [msgs, busy]);

  const ask = async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    if (exhausted) { toast('Assistant credits for this cycle are used up. Ask an administrator to raise the allowance.', 'bad'); return; }
    setMsgs(m => [...m, { role: 'user', text: question, at: new Date().toISOString() }]);
    setQ('');
    setBusy(true);
    try {
      // Metered before answering so the quota is a real boundary, not a decorative counter.
      await consumeAssistantCredit(ctx);
      const reply = askAssistant(data, ctx, question);
      setMsgs(m => [...m, { role: 'bot', reply, at: new Date().toISOString() }]);
    } catch (error) {
      setMsgs(m => [...m, { role: 'bot', reply: { text: (error as Error).message, basis: 'No records were read; the request was refused.' }, at: new Date().toISOString() }]);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }} className="stack">
      <PageHead crumbs={[tenant.name, 'AI assistant']} title="Ask about your IT operation"
        sub={exhausted ? 'Assistant credits for this cycle are used up. Contact an administrator to raise the allowance.' : `Answers come from live records in this workspace — ${credits} assistant credits remaining this cycle.`} />

      <div className="card pad-lg" style={{ display: 'flex', flexDirection: 'column', height: '62dvh', minHeight: 420 }}>
        <div className="chat-scroll" ref={scRef} style={{ flex: 1 }}>
          {msgs.length === 0 && (
            <div className="empty" style={{ margin: 'auto' }}>
              <span className="glyph"><Icon name="ai" size={20} /></span>
              <div className="b">I know your tickets, assets, devices, invoices and risks.</div>
              <div className="sm muted" style={{ maxWidth: '52ch' }}>Ask a question about any of them. I’ll show my “basis” — exactly which records informed each answer — so you can verify instead of trust blindly.</div>
              <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                {STARTERS.slice(0, 4).map(s => (
                  <button key={s} className="chip" onClick={() => ask(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}>
              {m.role === 'user' ? (
                <div className="row nowrap" style={{ alignItems: 'flex-start', gap: 8 }}>
                  <span style={{ flex: 1 }}>{m.text}</span>
                  <UserAvatar name={user.name} size="sm" />
                </div>
              ) : (
                <>
                  <p style={{ whiteSpace: 'pre-wrap', marginBottom: m.reply?.rows || m.reply?.links ? 8 : 0 }}>{m.reply!.text}</p>
                  {m.reply!.rows && (
                    <div className="stack" style={{ gap: 4 }}>
                      {m.reply!.rows.map((r, k) => (
                        <div key={k} className="row between sm" style={{ borderBottom: '1px dashed var(--line)', paddingBottom: 3 }}>
                          <span className="muted">{r.label}</span>
                          <span className="b row" style={{ gap: 6 }} title={r.hint}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {m.reply!.links && (
                    <div className="row" style={{ marginTop: 6, gap: 6 }}>
                      {m.reply!.links.map(l => (
                        <Link key={l.to} to={l.to} className="chip" style={{ textDecoration: 'none' }}>{l.label}<Icon name="chevronR" size={11} /></Link>
                      ))}
                    </div>
                  )}
                  <div className="chat-basis"><Icon name="check" size={11} /> Basis: {m.reply!.basis}</div>
                </>
              )}
            </div>
          ))}
          {busy && (
            <div className="chat-msg bot">
              <div className="row" style={{ gap: 5 }}>
                {[0, 1, 2].map(i => <span key={i} className="skeleton" style={{ width: 7, height: 7, borderRadius: 99, animationDelay: `${i * 0.15}s` }} />)}
              </div>
            </div>
          )}
        </div>
        <div className="row nowrap" style={{ borderTop: '1px solid var(--line)', paddingTop: 12, marginTop: 4 }}>
          <input className="input" value={q} disabled={exhausted}
            placeholder={exhausted ? 'No assistant credits remaining this cycle' : 'e.g. Which sites breached SLA last month?'} aria-label="Ask the assistant"
            onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && void ask(q)} />
          <button className="btn" onClick={() => void ask(q)} disabled={!q.trim() || busy || exhausted} aria-label="Send">
            <Icon name="send" size={15} />
          </button>
        </div>
      </div>
      <p className="xs faint" style={{ textAlign: 'center' }}>Answers are computed from this workspace’s records — nothing is sent to an external model. Every answer cites the records it used.</p>
    </div>
  );
}
